// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// Applies a sparse patch to a timeline's stored index without loading the whole timeline:
// moment rows, the moment tree, the duration and arc interval trees, relationships and
// search rows change only where the patch reaches. The result matches rebuilding the index
// from applyPatch(current, patch); test/incremental-postgres.mjs checks this.
import { beginIndexWrite, indexReader, removeRows } from './index-versions.mjs';
import {
  validateDocument,
  validateDuration,
  resolveDuration,
  relationshipKey,
  refKey,
  searchRows,
  parseTime,
  withinEntryLimit,
  entryLimitText,
} from '../dist/core.mjs';
import { HttpError } from './store.mjs';
import { PersistentTree, MOMENT_TREE, INTERVAL_TREE, intervalPayload, upsertRows } from './avl.mjs';

const bytes = (value) => Buffer.byteLength(JSON.stringify(value));
/** JSON with sorted keys, for comparing stored and submitted settings. */
export function canonical(value) {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object')
    return (
      '{' +
      Object.keys(value)
        .filter((k) => value[k] !== undefined)
        .sort()
        .map((k) => JSON.stringify(k) + ':' + canonical(value[k]))
        .join(',') +
      '}'
    );
  return JSON.stringify(value ?? null);
}
/** The document-level fields stored on the timeline row. */
export function timelineSettings(t) {
  return validateDocument({
    format: 'openchronology',
    version: 1,
    title: t.title,
    description: t.description,
    ...(t.presentation ? { presentation: t.presentation } : {}),
    ...(t.plugins ? { plugins: t.plugins } : {}),
    ...(t.tags == null ? {} : { tags: t.tags }),
    ...(t.assets ? { assets: t.assets } : {}),
    ...(t.comparison ? { comparison: t.comparison } : {}),
    events: [],
  });
}
const settingsOnly = ({ events, durations, relationships, ...settings }) => settings;
const kindOf = (ref) => ('moment' in ref ? 'moment' : 'duration');
const refId = (ref) => ref.moment ?? ref.duration;

/**
 * Up to how many moments a timeline is rebuilt from a document for a patch changing most of
 * it (more than REBUILD_SHARE): beyond it, building a whole document in memory is not worth
 * it, and a patch is applied in place however large, a slice at a time (saveIncrementally in
 * store.mjs). In place costs about 1 ms per change and a rebuild about 0.5 ms per moment.
 */
export const REBUILD_UNDER = 200000;
const REBUILD_SHARE = 0.5;
/**
 * Whether a patch can be applied in place: unless it changes most of a small timeline, which
 * rebuilds the index instead. Changing the plugins is a change of settings like any other:
 * each plugin reads its own metadata, so no moment is revalidated (#157).
 */
export function incremental(t, patch) {
  if (t.index_version < 2 || t.comparison || patch.settings.comparison) return false;
  const size =
    patch.changes.length +
    (patch.durationChanges?.length ?? 0) +
    (patch.relationshipChanges?.length ?? 0);
  const count = Number(t.event_count);
  return count >= REBUILD_UNDER || size <= Math.max(64, count * REBUILD_SHARE);
}

/** How many changes one slice of a patch applied in place carries (see slicePatch). */
export const PATCH_SLICE = 5000;
/**
 * `patch` in slices of at most `size` changes, each with its settings: moments, then
 * durations (which may name them), then relationships (which may link them), in order.
 */
export function slicePatch(patch, size = PATCH_SLICE) {
  const items = [
    ...patch.changes.map((change) => ['changes', change]),
    ...(patch.durationChanges ?? []).map((change) => ['durationChanges', change]),
    ...(patch.relationshipChanges ?? []).map((change) => ['relationshipChanges', change]),
  ];
  const slices = [];
  for (let start = 0; start < items.length || !slices.length; start += size) {
    const slice = {
      settings: patch.settings,
      changes: [],
      durationChanges: [],
      relationshipChanges: [],
    };
    for (const [kind, change] of items.slice(start, start + size)) slice[kind].push(change);
    slices.push(slice);
  }
  return slices;
}

/*
 * Rows are looked up by key in lateral subqueries ending in OFFSET 0, which keeps each a
 * lookup per key: right after a timeline is written in one go (a fork, an import) the
 * planner's statistics can still count its rows as none, and a join would read all of them.
 * A fork's rows are read through to what it forked (indexReader); what it changes becomes
 * its own, and what it removes from there is hidden (removeRows).
 */

/**
 * Applies `patch` to timeline `t` (locked by the caller). Returns the normalized patch to
 * record as the revision and the timeline row's new values, or throws an HttpError.
 */
export async function applyIncrementally(c, t, patch) {
  const id = t.id;
  // Index writes record the clock of this transaction (index-versions.mjs).
  await beginIndexWrite(c, id);
  const index = await indexReader(c, t);
  const fail = (message) => {
    throw new HttpError(400, message);
  };
  let settings;
  try {
    settings = settingsOnly(validateDocument({ ...patch.settings, events: [] }));
  } catch (error) {
    fail(error.message);
  }
  const previousSettings = settingsOnly(timelineSettings(t));
  // Moments: normalize exactly as a full save would.
  const momentChanges = new Map();
  for (const change of patch.changes) {
    if (!change.event) momentChanges.set(change.id, null);
    else {
      let event;
      try {
        event = validateDocument({ ...settings, events: [change.event] }, true).events[0];
      } catch (error) {
        fail(error.message);
      }
      if (event.id !== change.id) fail('Changed moment ID mismatch.');
      momentChanges.set(change.id, event);
    }
  }
  const durationChanges = new Map();
  for (const change of patch.durationChanges ?? []) {
    if (!change.duration) durationChanges.set(change.id, null);
    else {
      let duration;
      try {
        duration = validateDuration(change.duration, parseTime);
      } catch (error) {
        fail(error.message);
      }
      if (duration.id !== change.id) fail('Changed duration ID mismatch.');
      durationChanges.set(change.id, duration);
    }
  }
  // Like applyPatch, the last change to each link wins.
  const relationshipChanges = [
    ...new Map((patch.relationshipChanges ?? []).map((r) => [relationshipKey(r), r])).values(),
  ];

  // Saved state of the changed moments.
  const saved = new Map(
    (
      await c.query(
        `SELECT m.id,oc_qtext(m.time) AS time,m.event FROM unnest($2::text[]) k(id)
        CROSS JOIN LATERAL ${index.lookup('oc_moments', ['k.id'])} m`,
        [id, [...momentChanges.keys()]],
      )
    ).rows.map((r) => [r.id, r.event]),
  );
  // Changes identical to what is stored (a resent batch, a log imported again) are neither
  // applied nor recorded.
  for (const [momentId, event] of momentChanges) {
    const before = saved.get(momentId);
    if (event && before && canonical(before) === canonical(event)) momentChanges.delete(momentId);
  }
  if (durationChanges.size) {
    const { rows } = await c.query(
      `SELECT k.id,n.definition FROM unnest($2::text[]) k(id) CROSS JOIN LATERAL
        (SELECT definition FROM ${index('oc_duration_nodes')} x WHERE x.band->>'id'=k.id OFFSET 0) n`,
      [id, [...durationChanges].filter(([, d]) => d).map(([k]) => k)],
    );
    for (const row of rows)
      if (row.definition && canonical(row.definition) === canonical(durationChanges.get(row.id)))
        durationChanges.delete(row.id);
  }
  let storage = Number(t.storage_bytes) - bytes(previousSettings) + bytes(settings);
  let added = false;
  const moved = new Set(); // moments whose time changed or that were deleted
  const moments = new PersistentTree(c, MOMENT_TREE, 'oc_nodes', t, t.root, index);
  const removals = [],
    insertions = [],
    edited = []; // moments changed in place, whose nodes a fork makes its own

  for (const [momentId, event] of momentChanges) {
    const before = saved.get(momentId);
    if (!before && !event) continue;
    if (!before) added = true;
    storage += (event ? bytes(event) + 1 : 0) - (before ? bytes(before) + 1 : 0);
    if (before && (!event || event.time !== before.time)) {
      removals.push({ time: before.time, id: momentId });
      moved.add(momentId);
    }
    if (event && (!before || event.time !== before.time))
      insertions.push({ time: event.time, id: momentId });
    else if (event && index.depth) edited.push({ time: event.time, id: momentId });
  }
  await moments.prefetch([...removals, ...insertions, ...edited]);
  for (const r of removals)
    await moments.remove(r, (n) => {
      n.ids = n.ids.filter((x) => x !== r.id);
      return n.ids.length > 0;
    });
  for (const i of insertions) await moments.insert(i, i);
  for (const e of edited) await moments.own(e);
  const momentCount = await moments.size;
  if (!withinEntryLimit(momentCount)) fail(`A timeline holds at most ${entryLimitText()} moments.`);
  const upserted = [...momentChanges].filter(([, e]) => e);
  const deleted = [...momentChanges].filter(([k, e]) => !e && saved.has(k)).map(([k]) => k);
  if (deleted.length) await removeRows(c, t, index, 'oc_moments', ['text'], [deleted]);
  await upsertRows(
    c,
    'oc_moments',
    ['timeline_id', 'id', 'time', 'event'],
    { time: '::mpq', event: '::jsonb' },
    upserted.map(([k, e]) => [id, k, e.time, JSON.stringify(e)]),
  );
  // Final time of any moment, from the patch or the saved rows.
  const momentTimes = new Map(upserted.map(([k, e]) => [k, e.time]));
  const timesOf = async (ids) => {
    const missing = [...new Set(ids)].filter((m) => !momentTimes.has(m) && !momentChanges.has(m));
    if (missing.length) {
      const { rows } = await c.query(
        `SELECT m.id,oc_qtext(m.time) AS time FROM unnest($2::text[]) k(id)
        CROSS JOIN LATERAL ${index.lookup('oc_moments', ['k.id'])} m`,
        [id, missing],
      );
      for (const r of rows) momentTimes.set(r.id, r.time);
    }
  };

  // Durations: changed ones and those anchored to moved or deleted moments.
  const { rows: durationRows } = await c.query(
    `SELECT DISTINCT ON (d.band->>'id') oc_qtext(d.first_time) AS first,oc_qtext(d.last_time) AS last,d.band,d.definition FROM (
      SELECT n.* FROM unnest($2::text[]) k(id) CROSS JOIN LATERAL
        (SELECT * FROM ${index('oc_duration_nodes')} x WHERE x.band->>'id'=k.id OFFSET 0) n
      UNION ALL SELECT n.* FROM unnest($3::text[]) k(id) CROSS JOIN LATERAL
        (SELECT * FROM ${index('oc_duration_nodes')} x WHERE x.definition->'start'->>'moment'=k.id OFFSET 0) n
      UNION ALL SELECT n.* FROM unnest($3::text[]) k(id) CROSS JOIN LATERAL
        (SELECT * FROM ${index('oc_duration_nodes')} x WHERE x.definition->'end'->>'moment'=k.id OFFSET 0) n) d`,
    [id, [...durationChanges.keys()], [...moved]],
  );
  const savedDurations = new Map(durationRows.map((r) => [r.band.id, r]));
  const definitions = new Map();
  for (const [durationId, row] of savedDurations) definitions.set(durationId, row.definition);
  for (const [durationId, duration] of durationChanges) definitions.set(durationId, duration);
  // Anchors to deleted moments keep the moment's last saved time.
  const anchor = (endpoint) => {
    if (typeof endpoint === 'string') return endpoint;
    if (momentChanges.get(endpoint.moment) === null) {
      const last = saved.get(endpoint.moment)?.time;
      if (last === undefined) fail('Duration anchors must name existing moments.');
      return last;
    }
    return endpoint;
  };
  for (const [durationId, d] of definitions)
    if (d) {
      const start = anchor(d.start),
        end = anchor(d.end);
      if (start !== d.start || end !== d.end) definitions.set(durationId, { ...d, start, end });
    }
  await timesOf(
    [...definitions.values()]
      .flatMap((d) => (d ? [d.start, d.end] : []))
      .filter((e) => typeof e !== 'string')
      .map((e) => e.moment),
  );
  const durations = new PersistentTree(
    c,
    INTERVAL_TREE,
    'oc_duration_nodes',
    t,
    t.duration_root,
    index,
  );
  const bands = new Map(); // final bands of affected durations (null when deleted)
  const durationOps = [];
  for (const [durationId, d] of definitions) {
    const before = savedDurations.get(durationId);
    let band = null;
    if (d) {
      band = resolveDuration(d, (m) => momentTimes.get(m));
      if (!band) fail('Duration anchors must name existing moments.');
    }
    // Unchanged definitions still move when an anchor moment moved.
    if (
      before?.definition &&
      canonical(before.definition) === canonical(d) &&
      band.first === before.first &&
      band.last === before.last &&
      band.startTime === before.band.startTime &&
      band.endTime === before.band.endTime
    )
      continue;
    if (!before && !d) continue;
    bands.set(durationId, band);
    storage += (d ? bytes(d) + 1 : 0) - (before ? bytes(before.definition) + 1 : 0);
    durationOps.push({ durationId, before, band });
  }
  await durations.prefetch(
    durationOps.flatMap(({ durationId, before, band }) => [
      ...(before ? [{ first: before.first, id: durationId }] : []),
      ...(band ? [{ first: band.first, id: durationId }] : []),
    ]),
  );
  for (const { durationId, before, band } of durationOps) {
    if (before && band && before.first === band.first && before.last === band.last)
      await durations.replace({ first: band.first, id: durationId }, (n) =>
        Object.assign(n, intervalPayload(band)),
      );
    else {
      if (before) await durations.remove({ first: before.first, id: durationId });
      if (band)
        await durations.insert({ first: band.first, id: durationId }, intervalPayload(band));
    }
  }
  if (!withinEntryLimit(await durations.size))
    fail(`Use at most ${entryLimitText()} durations per timeline.`);
  // Where an entity sits for arcs: a moment's time or a duration's start.
  const placedBefore = (durationId) => savedDurations.get(durationId)?.band.startTime;
  const movedDurations = [...bands]
    .filter(([k, band]) => savedDurations.has(k) && band?.startTime !== placedBefore(k))
    .map(([k]) => k);

  // Relationships: links of deleted entities go; then the patch's own link changes.
  const removedEntities = [
    ...deleted.map((m) => ['moment', m]),
    ...[...bands]
      .filter(([k, band]) => !band && savedDurations.has(k))
      .map(([k]) => ['duration', k]),
  ];
  const unlinked = [];
  /** Removes these links (rows with LINK columns), which the timeline has. */
  const unlink = async (links) => {
    if (!links.length) return;
    await removeRows(
      c,
      t,
      index,
      'oc_relationships',
      ['text', 'text', 'text', 'text'],
      ['a_kind', 'a_id', 'b_kind', 'b_id'].map((column) => links.map((r) => r[column])),
    );
    unlinked.push(...links);
  };
  if (removedEntities.length) {
    const { rows: links } = await c.query(
      `SELECT r.a_kind,r.a_id,r.b_kind,r.b_id FROM unnest($2::text[],$3::text[]) AS x(kind,id) CROSS JOIN LATERAL
        (SELECT * FROM ${index('oc_relationships')} r WHERE r.a_kind=x.kind AND r.a_id=x.id OFFSET 0) r
      UNION SELECT r.a_kind,r.a_id,r.b_kind,r.b_id FROM unnest($2::text[],$3::text[]) AS x(kind,id) CROSS JOIN LATERAL
        (SELECT * FROM ${index('oc_relationships')} r WHERE r.b_kind=x.kind AND r.b_id=x.id OFFSET 0) r`,
      [id, removedEntities.map(([k]) => k), removedEntities.map(([, v]) => v)],
    );
    await unlink(links);
  }
  // Final existence of linked entities.
  const exists = new Map();
  const wanted = relationshipChanges
    .filter((r) => r.related)
    .flatMap((r) => [r.a, r.b])
    .filter((ref) => !exists.has(refKey(ref)));
  for (const ref of wanted) {
    const key = refKey(ref);
    if ('moment' in ref && momentChanges.has(ref.moment))
      exists.set(key, !!momentChanges.get(ref.moment));
    else if ('duration' in ref && bands.has(ref.duration))
      exists.set(key, !!bands.get(ref.duration));
  }
  const unknown = wanted.filter((ref) => !exists.has(refKey(ref)));
  if (unknown.length) {
    const { rows: present } = await c.query(
      `SELECT 'm:'||m.id AS key FROM unnest($2::text[]) k(id)
        CROSS JOIN LATERAL ${index.lookup('oc_moments', ['k.id'])} m
      UNION ALL SELECT 'd:'||k.id FROM unnest($3::text[]) k(id)
        WHERE EXISTS(SELECT 1 FROM ${index('oc_duration_nodes')} x WHERE x.band->>'id'=k.id)`,
      [
        id,
        unknown.filter((r) => 'moment' in r).map((r) => r.moment),
        unknown.filter((r) => 'duration' in r).map((r) => r.duration),
      ],
    );
    const found = new Set(present.map((r) => r.key));
    for (const ref of unknown) exists.set(refKey(ref), found.has(refKey(ref)));
  }
  const linked = [];
  for (const change of relationshipChanges) {
    const params = [id, kindOf(change.a), refId(change.a), kindOf(change.b), refId(change.b)];
    const link = 'r.a_kind=$2 AND r.a_id=$3 AND r.b_kind=$4 AND r.b_id=$5';
    if (!change.related) {
      const { rows: links } = await c.query(
        `SELECT a_kind,a_id,b_kind,b_id FROM ${index('oc_relationships')} r WHERE ${link}`,
        params,
      );
      await unlink(links);
    } else if (exists.get(refKey(change.a)) && exists.get(refKey(change.b))) {
      // Added unless the timeline has it (a fork's hidden link of its own shows again).
      const { rows: added } = await c.query(
        `INSERT INTO oc_relationships(timeline_id,a_kind,a_id,b_kind,b_id) SELECT $1,$2,$3,$4,$5
        WHERE NOT EXISTS(SELECT 1 FROM ${index('oc_relationships')} r WHERE ${link})
        ON CONFLICT(timeline_id,a_kind,a_id,b_kind,b_id) DO UPDATE SET hidden=false
        WHERE oc_relationships.hidden RETURNING a_kind`,
        params,
      );
      if (added.length) linked.push({ a: change.a, b: change.b });
    }
  }
  const rowRef = (kind, value) => ({ [kind]: value });
  const fromRow = (r) => ({ a: rowRef(r.a_kind, r.a_id), b: rowRef(r.b_kind, r.b_id) });
  const unlinkedKeys = new Set(unlinked.map((r) => relationshipKey(fromRow(r))));
  const linkedNow = linked;
  storage +=
    linkedNow.reduce((s, r) => s + bytes(r) + 1, 0) -
    unlinked.reduce((s, r) => s + bytes(fromRow(r)) + 1, 0);
  // Arcs of links whose endpoints moved are placed again.
  const movedEntities = [
    ...[...moved].filter((m) => momentChanges.get(m)).map((m) => ['moment', m]),
    ...movedDurations.filter((k) => bands.get(k)).map((k) => ['duration', k]),
  ];
  let replaced = [];
  if (movedEntities.length) {
    const { rows: links } = await c.query(
      `SELECT r.a_kind,r.a_id,r.b_kind,r.b_id FROM unnest($2::text[],$3::text[]) AS x(kind,id) CROSS JOIN LATERAL
        (SELECT * FROM ${index('oc_relationships')} r WHERE r.a_kind=x.kind AND r.a_id=x.id OFFSET 0) r
      UNION SELECT r.a_kind,r.a_id,r.b_kind,r.b_id FROM unnest($2::text[],$3::text[]) AS x(kind,id) CROSS JOIN LATERAL
        (SELECT * FROM ${index('oc_relationships')} r WHERE r.b_kind=x.kind AND r.b_id=x.id OFFSET 0) r`,
      [id, movedEntities.map(([k]) => k), movedEntities.map(([, v]) => v)],
    );
    replaced = links
      .map(fromRow)
      .filter((r) => !linkedNow.some((l) => relationshipKey(l) === relationshipKey(r)));
  }
  const arcsOut = [...unlinkedKeys, ...replaced.map(relationshipKey)];
  const arcsIn = [...linkedNow, ...replaced];
  const edges = new PersistentTree(c, INTERVAL_TREE, 'oc_edge_nodes', t, t.edge_root, index);
  const savedArcs = arcsOut.length
    ? (
        await c.query(
          `SELECT oc_qtext(e.first_time) AS first,e.band->>'id' AS id FROM unnest($2::text[]) k(id)
          CROSS JOIN LATERAL (SELECT * FROM ${index('oc_edge_nodes')} x WHERE x.band->>'id'=k.id OFFSET 0) e`,
          [id, arcsOut],
        )
      ).rows
    : [];
  // Placement times for arcs being drawn.
  await timesOf(
    arcsIn
      .flatMap((r) => [r.a, r.b])
      .filter((ref) => 'moment' in ref)
      .map(refId),
  );
  const starts = new Map([...bands].filter(([, b]) => b).map(([k, b]) => [k, b.startTime]));
  const unplaced = arcsIn
    .flatMap((r) => [r.a, r.b])
    .filter((ref) => 'duration' in ref && !starts.has(ref.duration))
    .map(refId);
  if (unplaced.length) {
    const { rows: placed } = await c.query(
      `SELECT d.band->>'id' AS id,d.band->>'startTime' AS start FROM unnest($2::text[]) k(id)
      CROSS JOIN LATERAL (SELECT band FROM ${index('oc_duration_nodes')} x WHERE x.band->>'id'=k.id OFFSET 0) d`,
      [id, [...new Set(unplaced)]],
    );
    for (const r of placed) starts.set(r.id, r.start);
  }
  const place = (ref) => ('moment' in ref ? momentTimes.get(ref.moment) : starts.get(ref.duration));
  const arcs = arcsIn.map((r) => {
    const band = resolveDuration(
      { id: relationshipKey(r), start: place(r.a), end: place(r.b), metadata: {} },
      () => undefined,
    );
    if (!band) throw new Error('Broken timeline index');
    return band;
  });
  await edges.prefetch([...savedArcs, ...arcs.map((b) => ({ first: b.first, id: b.id }))]);
  for (const arc of savedArcs) await edges.remove(arc);
  for (const band of arcs)
    await edges.insert({ first: band.first, id: band.id }, intervalPayload(band));
  if (!withinEntryLimit(await edges.size))
    fail(`Use at most ${entryLimitText()} relationships per timeline.`);

  // Search rows for changed entities.
  const searchDeletes = [
    ...deleted.map((m) => ['moment', m]),
    ...[...bands].filter(([, b]) => !b).map(([k]) => ['duration', k]),
  ];
  if (searchDeletes.length)
    await removeRows(
      c,
      t,
      index,
      'oc_entity_search',
      ['text', 'text'],
      [searchDeletes.map(([k]) => k), searchDeletes.map(([, v]) => v)],
    );
  const search = searchRows(
    upserted.map(([, e]) => e),
    [...bands.values()].filter(Boolean),
  );
  await upsertSearch(c, id, search);

  await moments.flush();
  await durations.flush();
  await edges.flush();
  // Columns feeding the catalogue search vector are set only when they change, since
  // setting them recomputes the vector over the whole catalogue text.
  const vector = [
    ['title', settings.title, ''],
    ['description', settings.description, ''],
    ['tags', settings.tags ?? null, '::text[]'],
  ].filter(([column, value]) => canonical(value) !== canonical(t[column] ?? null));
  // The caller writes these with the revision in one update of the timeline row.
  const assignments = [
    [
      'presentation',
      settings.presentation ? JSON.stringify(settings.presentation) : null,
      '::jsonb',
    ],
    [
      'plugins',
      settings.plugins === undefined ? null : JSON.stringify(settings.plugins),
      '::jsonb',
    ],
    ['assets', settings.assets === undefined ? null : JSON.stringify(settings.assets), '::jsonb'],
    ['root', moments.root],
    ['event_count', momentCount],
    ['duration_root', durations.root],
    ['edge_root', edges.root],
    ['storage_bytes', Math.max(storage, 0)],
    ...vector,
  ];
  const recorded = {
    ...(canonical(settings) === canonical(previousSettings) ? {} : { settings }),
    changes: [...momentChanges].map(([k, event]) => ({ id: k, event })),
    durationChanges: [...durationChanges].map(([k, duration]) => ({ id: k, duration })),
    relationshipChanges: (patch.relationshipChanges ?? []).map(({ a, b, related }) => ({
      a,
      b,
      related,
    })),
  };
  // What saved history must look at (history.mjs): the changed moments, the durations whose
  // definitions or bands changed, and the links added or removed (as stored).
  const touched = {
    moments: [...momentChanges.keys()],
    durations: [...bands.keys()],
    relationships: [
      ...unlinked,
      ...relationshipChanges.map((r) => ({
        a_kind: kindOf(r.a),
        a_id: refId(r.a),
        b_kind: kindOf(r.b),
        b_id: refId(r.b),
      })),
    ],
  };
  return { recorded, assignments, added, settings, storage: Math.max(storage, 0), touched };
}

/** Inserts or replaces entity search rows. */
export async function upsertSearch(c, id, rows) {
  for (let offset = 0; offset < rows.length; offset += 500) {
    const params = [];
    const tuples = rows.slice(offset, offset + 500).map((row) => {
      const start = params.length;
      params.push(id, row.kind, row.id, row.first, row.last, row.title, row.body, row.tags);
      return (
        '(' +
        Array.from(
          { length: 8 },
          (_, i) =>
            '$' + (start + i + 1) + (i === 3 || i === 4 ? '::mpq' : i === 7 ? '::text[]' : ''),
        ).join(',') +
        ')'
      );
    });
    await c.query(
      `INSERT INTO oc_entity_search(timeline_id,kind,entity_id,first_time,last_time,title,body,tags) VALUES ${tuples.join(',')}
      ON CONFLICT(timeline_id,kind,entity_id) DO UPDATE SET first_time=EXCLUDED.first_time,last_time=EXCLUDED.last_time,
      title=EXCLUDED.title,body=EXCLUDED.body,tags=EXCLUDED.tags,hidden=false`,
      params,
    );
  }
}
