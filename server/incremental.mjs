// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// Applies a sparse patch to a timeline's stored index without loading the whole timeline:
// moment rows, the moment tree, the duration and arc interval trees, relationships and
// search rows change only where the patch reaches. The result matches rebuilding the index
// from applyPatch(current, patch); test/incremental-postgres.mjs checks this.
import {
  validateDocument,
  validateDuration,
  resolveDuration,
  relationshipKey,
  refKey,
  searchRows,
  parseTime,
} from '../dist/core.mjs';
import { HttpError } from './store.mjs';
import { PersistentTree, MOMENT_TREE, INTERVAL_TREE, intervalPayload, upsertRows } from './avl.mjs';

const LIMIT = 200000;
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
 * Whether a patch can be applied in place. Larger patches (relative to the timeline) and
 * plugin changes, which revalidate every moment, rebuild the index instead.
 */
export function incremental(t, patch) {
  if (t.index_version < 2 || t.comparison || patch.settings.comparison) return false;
  if (canonical(patch.settings.plugins) !== canonical(t.plugins ?? undefined)) return false;
  const size =
    patch.changes.length +
    (patch.durationChanges?.length ?? 0) +
    (patch.relationshipChanges?.length ?? 0);
  return size <= Math.max(64, Number(t.event_count) / 8);
}

/**
 * Applies `patch` to timeline `t` (locked by the caller). Returns the normalized patch to
 * record as the revision and the timeline row's new values, or throws an HttpError.
 */
export async function applyIncrementally(c, t, patch) {
  const id = t.id;
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
        CROSS JOIN LATERAL (SELECT * FROM oc_moments WHERE timeline_id=$1 AND id=k.id) m`,
        [id, [...momentChanges.keys()]],
      )
    ).rows.map((r) => [r.id, r.event]),
  );
  let storage = Number(t.storage_bytes) - bytes(previousSettings) + bytes(settings);
  let added = false;
  const moved = new Set(); // moments whose time changed or that were deleted
  const moments = new PersistentTree(c, MOMENT_TREE, 'oc_nodes', id, t.root);
  const removals = [],
    insertions = [];
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
  }
  await moments.prefetch([...removals, ...insertions]);
  for (const r of removals)
    await moments.remove(r, (n) => {
      n.ids = n.ids.filter((x) => x !== r.id);
      return n.ids.length > 0;
    });
  for (const i of insertions) await moments.insert(i, i);
  const momentCount = await moments.size;
  if (momentCount > LIMIT) fail('Expected at most 200,000 point events.');
  const upserted = [...momentChanges].filter(([, e]) => e);
  const deleted = [...momentChanges].filter(([k, e]) => !e && saved.has(k)).map(([k]) => k);
  if (deleted.length)
    await c.query(
      'DELETE FROM oc_moments m USING unnest($2::text[]) k(id) WHERE m.timeline_id=$1 AND m.id=k.id',
      [id, deleted],
    );
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
        CROSS JOIN LATERAL (SELECT id,time FROM oc_moments WHERE timeline_id=$1 AND id=k.id) m`,
        [id, missing],
      );
      for (const r of rows) momentTimes.set(r.id, r.time);
    }
  };

  // Durations: changed ones and those anchored to moved or deleted moments.
  const { rows: durationRows } = await c.query(
    `SELECT DISTINCT ON (d.band->>'id') oc_qtext(d.first_time) AS first,oc_qtext(d.last_time) AS last,d.band,d.definition FROM (
      SELECT n.* FROM unnest($2::text[]) k(id) CROSS JOIN LATERAL
        (SELECT * FROM oc_duration_nodes WHERE timeline_id=$1 AND band->>'id'=k.id) n
      UNION ALL SELECT n.* FROM unnest($3::text[]) k(id) CROSS JOIN LATERAL
        (SELECT * FROM oc_duration_nodes WHERE timeline_id=$1 AND definition->'start'->>'moment'=k.id) n
      UNION ALL SELECT n.* FROM unnest($3::text[]) k(id) CROSS JOIN LATERAL
        (SELECT * FROM oc_duration_nodes WHERE timeline_id=$1 AND definition->'end'->>'moment'=k.id) n) d`,
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
  const durations = new PersistentTree(c, INTERVAL_TREE, 'oc_duration_nodes', id, t.duration_root);
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
  if ((await durations.size) > LIMIT) fail('Use at most 200,000 durations per timeline.');
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
  if (removedEntities.length) {
    const { rows } = await c.query(
      `WITH ends AS (SELECT * FROM unnest($2::text[],$3::text[]) AS x(kind,id)),
      a AS (DELETE FROM oc_relationships r USING ends x WHERE r.timeline_id=$1 AND r.a_kind=x.kind AND r.a_id=x.id
        RETURNING r.a_kind,r.a_id,r.b_kind,r.b_id),
      b AS (DELETE FROM oc_relationships r USING ends x WHERE r.timeline_id=$1 AND r.b_kind=x.kind AND r.b_id=x.id
        RETURNING r.a_kind,r.a_id,r.b_kind,r.b_id)
      SELECT * FROM a UNION SELECT * FROM b`,
      [id, removedEntities.map(([k]) => k), removedEntities.map(([, v]) => v)],
    );
    unlinked.push(...rows);
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
    const { rows } = await c.query(
      `SELECT 'm:'||m.id AS key FROM unnest($2::text[]) k(id)
        CROSS JOIN LATERAL (SELECT id FROM oc_moments WHERE timeline_id=$1 AND id=k.id) m
      UNION ALL SELECT 'd:'||k.id FROM unnest($3::text[]) k(id)
        WHERE EXISTS(SELECT 1 FROM oc_duration_nodes WHERE timeline_id=$1 AND band->>'id'=k.id)`,
      [
        id,
        unknown.filter((r) => 'moment' in r).map((r) => r.moment),
        unknown.filter((r) => 'duration' in r).map((r) => r.duration),
      ],
    );
    const found = new Set(rows.map((r) => r.key));
    for (const ref of unknown) exists.set(refKey(ref), found.has(refKey(ref)));
  }
  const linked = [];
  for (const change of relationshipChanges) {
    const params = [id, kindOf(change.a), refId(change.a), kindOf(change.b), refId(change.b)];
    if (!change.related) {
      const { rows } = await c.query(
        'DELETE FROM oc_relationships WHERE timeline_id=$1 AND a_kind=$2 AND a_id=$3 AND b_kind=$4 AND b_id=$5 RETURNING a_kind,a_id,b_kind,b_id',
        params,
      );
      unlinked.push(...rows);
    } else if (exists.get(refKey(change.a)) && exists.get(refKey(change.b))) {
      const { rows } = await c.query(
        'INSERT INTO oc_relationships(timeline_id,a_kind,a_id,b_kind,b_id) VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING RETURNING a_kind',
        params,
      );
      if (rows.length) linked.push({ a: change.a, b: change.b });
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
    const { rows } = await c.query(
      `SELECT r.a_kind,r.a_id,r.b_kind,r.b_id FROM unnest($2::text[],$3::text[]) AS x(kind,id) CROSS JOIN LATERAL
        (SELECT * FROM oc_relationships WHERE timeline_id=$1 AND a_kind=x.kind AND a_id=x.id) r
      UNION SELECT r.a_kind,r.a_id,r.b_kind,r.b_id FROM unnest($2::text[],$3::text[]) AS x(kind,id) CROSS JOIN LATERAL
        (SELECT * FROM oc_relationships WHERE timeline_id=$1 AND b_kind=x.kind AND b_id=x.id) r`,
      [id, movedEntities.map(([k]) => k), movedEntities.map(([, v]) => v)],
    );
    replaced = rows
      .map(fromRow)
      .filter((r) => !linkedNow.some((l) => relationshipKey(l) === relationshipKey(r)));
  }
  const arcsOut = [...unlinkedKeys, ...replaced.map(relationshipKey)];
  const arcsIn = [...linkedNow, ...replaced];
  const edges = new PersistentTree(c, INTERVAL_TREE, 'oc_edge_nodes', id, t.edge_root);
  const savedArcs = arcsOut.length
    ? (
        await c.query(
          `SELECT oc_qtext(e.first_time) AS first,e.band->>'id' AS id FROM unnest($2::text[]) k(id)
          CROSS JOIN LATERAL (SELECT * FROM oc_edge_nodes WHERE timeline_id=$1 AND band->>'id'=k.id) e`,
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
    const { rows } = await c.query(
      `SELECT d.band->>'id' AS id,d.band->>'startTime' AS start FROM unnest($2::text[]) k(id)
      CROSS JOIN LATERAL (SELECT band FROM oc_duration_nodes WHERE timeline_id=$1 AND band->>'id'=k.id) d`,
      [id, [...new Set(unplaced)]],
    );
    for (const r of rows) starts.set(r.id, r.start);
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
  if ((await edges.size) > LIMIT) fail('Use at most 200,000 relationships per timeline.');

  // Search rows for changed entities.
  const searchDeletes = [
    ...deleted.map((m) => ['moment', m]),
    ...[...bands].filter(([, b]) => !b).map(([k]) => ['duration', k]),
  ];
  if (searchDeletes.length)
    await c.query(
      `DELETE FROM oc_entity_search s USING unnest($2::text[],$3::text[]) AS x(kind,id)
      WHERE s.timeline_id=$1 AND s.kind=x.kind AND s.entity_id=x.id`,
      [id, searchDeletes.map(([k]) => k), searchDeletes.map(([, v]) => v)],
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
  return { recorded, assignments, added, settings, storage: Math.max(storage, 0) };
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
      title=EXCLUDED.title,body=EXCLUDED.body,tags=EXCLUDED.tags`,
      params,
    );
  }
}
