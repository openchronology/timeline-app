// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
/**
 * Three-way merges of timelines, naming conflicts: whole documents (rebaseDocument), or
 * entity by entity from saved history kept as rows (mergePatch), reading only what the other
 * side changed since the common base. Syncs, rebases and pull request merges use them
 * (versioning.mjs, collaboration.mjs); saves merge edits made on an older revision the same way
 * (save-merge.mjs). See "Merging entity by entity" in docs/architecture.md.
 */
import { HttpError } from './store.mjs';
import { validateDocument, fixMissingAnchors, relationshipKey } from '../dist/core.mjs';
import { differences, valuesAt, settingsAt, keyName } from './history.mjs';
import { indexReader, lineageOf } from './index-versions.mjs';
/** Whether two values are the same JSON, whatever their keys' order (undefined is its own). */
function same(a, b) {
  return canonical(a) === canonical(b);
}
/** JSON with sorted keys; undefined (absent) differs from null. */
function canonical(value) {
  if (value === undefined) return 'undefined';
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  return (
    '{' +
    Object.keys(value)
      .sort()
      .map((k) => JSON.stringify(k) + ':' + canonical(value[k]))
      .join(',') +
    '}'
  );
}
/**
 * Three-way merge of one value: `a` the base, `b` the proposed side, `c` the upstream side
 * (undefined where absent). A side that kept the base takes the other; objects merge field
 * by field when `fields`; anything else changed on both sides is a conflict, named `key`.
 */
export function mergeValue(a, b, c, key, fields, conflicts) {
  if (same(a, b)) return c;
  if (same(a, c) || same(b, c)) return b;
  const object = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
  if (fields && object(a) && object(b) && object(c)) {
    const result = Object.create(null);
    for (const k of new Set([...Object.keys(a), ...Object.keys(b), ...Object.keys(c)])) {
      const value = mergeValue(a[k], b[k], c[k], key + '.' + k, true, conflicts);
      if (value !== undefined) result[k] = value;
    }
    return result;
  }
  conflicts.push(key);
  return c;
}
/** The settings a merge reconciles field by field; others follow the timeline merged into. */
export const SETTINGS = [
  'title',
  'description',
  'tags',
  'image',
  'presentation',
  'plugins',
  'assets',
];
/** The 409 refusing a merge, naming its first ten conflicts and carrying them all. */
function conflict(conflicts) {
  return Object.assign(
    new HttpError(
      409,
      'Rebase conflicts: ' +
        conflicts.slice(0, 10).join(', ') +
        '. Resolve these fields explicitly; both saved versions have been retained.',
    ),
    { conflicts },
  );
}
/**
 * Three-way merge of whole documents: `base` the common ancestor, `proposal` one side and
 * `upstream` the other. Settings in SETTINGS merge as whole values, the rest follow upstream;
 * moments and durations merge by ID, field by field; relationships merge as a set. A merged
 * deletion of a moment pins the durations anchored to it at its last known time, and a link
 * survives only while both its entities do. Returns the validated document, or throws 409
 * with the conflicts.
 */
export function rebaseDocument(base, proposal, upstream) {
  // Older saved versions store durations as moment links; compare standalone definitions.
  [base, proposal, upstream] = [base, proposal, upstream].map((d) => validateDocument(d));
  const result = { ...upstream };
  const conflicts = [];
  const merge = (a, b, c, key, fields = false) => mergeValue(a, b, c, key, fields, conflicts);
  for (const key of SETTINGS) {
    const value = merge(base[key], proposal[key], upstream[key], key);
    if (value === undefined) delete result[key];
    else result[key] = value;
  }
  const maps = [base, proposal, upstream].map((d) => new Map(d.events.map((e) => [e.id, e])));
  const ids = new Set(maps.flatMap((m) => [...m.keys()]));
  result.events = [];
  for (const id of ids) {
    const event = merge(...maps.map((m) => m.get(id)), 'moment ' + id, true);
    if (event) result.events.push(event);
  }
  const spans = [base, proposal, upstream].map(
    (d) => new Map((d.durations ?? []).map((x) => [x.id, x])),
  );
  const durations = [];
  for (const id of new Set(spans.flatMap((m) => [...m.keys()]))) {
    const duration = merge(...spans.map((m) => m.get(id)), 'duration ' + id, true);
    if (duration) durations.push(duration);
  }
  // A merged deletion pins durations that followed the moment at its last known time.
  const merged = new Set(result.events.map((e) => e.id));
  const lastTimes = new Map(
    [base, upstream, proposal].flatMap((d) => d.events.map((e) => [e.id, e.time])),
  );
  const fixed = fixMissingAnchors(
    durations,
    (moment) => merged.has(moment),
    (moment) => lastTimes.get(moment),
  );
  if (fixed.length) result.durations = fixed;
  else delete result.durations;
  // Links merge as a set; a link survives only while both of its entities do.
  const links = [base, proposal, upstream].map(
    (d) => new Map((d.relationships ?? []).map((r) => [relationshipKey(r), r])),
  );
  const present = new Set([
    ...result.events.map((e) => 'm:' + e.id),
    ...fixed.map((d) => 'd:' + d.id),
  ]);
  const key = (ref) => ('moment' in ref ? 'm:' + ref.moment : 'd:' + ref.duration);
  const relationships = [];
  for (const id of new Set(links.flatMap((m) => [...m.keys()]))) {
    const link = merge(...links.map((m) => m.get(id)), 'relationship ' + id);
    if (link && present.has(key(link.a)) && present.has(key(link.b))) relationships.push(link);
  }
  if (relationships.length) result.relationships = relationships;
  else delete result.relationships;
  if (conflicts.length) throw conflict(conflicts);
  return validateDocument(result);
}

/** How a conflict names each kind of entity. */
const LABELS = { moments: 'moment', durations: 'duration', relationships: 'relationship' };
/** A stored relationship end (kind and ID) as a document's reference. */
const reference = ({ kind, id }) => (kind === 'moment' ? { moment: id } : { duration: id });
/** A document's relationship as its stored key columns (a_kind, a_id, b_kind, b_id). */
const linkKey = (r) => {
  const side = (ref) => ('moment' in ref ? ['moment', ref.moment] : ['duration', ref.duration]);
  const [[a_kind, a_id], [b_kind, b_id]] = [side(r.a), side(r.b)];
  return { a_kind, a_id, b_kind, b_id };
};
/**
 * Merges what revision `otherId` changed since `baseId` into timeline `timelineId`, whose
 * saved head is `headId` (and whose live rows are that head), as rebaseDocument would merge
 * the three documents, but entity by entity: only what `other` changed is read and merged.
 * Returns the patch that makes the head the merged timeline (as saves take patches, complete:
 * links to removed entities are removed and durations anchored to removed moments keep their
 * last time), or null when a revision is not kept as rows (then merge documents). Throws 409
 * with the conflicts.
 * `client` is the merge's transaction. Reads history and the timeline's live rows; writes
 * nothing (the caller applies the patch as a save, or records it as a revision).
 */
export async function mergePatch(client, timelineId, { baseId, otherId, headId }) {
  const head = await settingsAt(client, headId);
  const pages = head && (await differences(client, baseId, otherId));
  if (!pages) return null;
  const conflicts = [];
  const patch = { settings: head, changes: [], durationChanges: [], relationshipChanges: [] };
  // What the merge decided per entity, by kind and keyName (null: removed).
  const merged = { moments: new Map(), durations: new Map(), relationships: new Map() };
  for await (const page of pages) {
    // Settings in SETTINGS merge three ways; any other the other side changed is taken
    // only if the head still has it as at the base.
    if (page[0].kind === 'settings') {
      const { before, after } = page[0];
      const settings = { ...head };
      for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
        const value = SETTINGS.includes(key)
          ? mergeValue(before[key], after[key], head[key], key, false, conflicts)
          : same(before[key], head[key])
            ? after[key]
            : head[key];
        if (value === undefined) delete settings[key];
        else settings[key] = value;
      }
      patch.settings = settings;
      continue;
    }
    // A page of one kind: the head's versions of its keys, then each merged three ways
    // (relationships as whole values: a link is there or not).
    const name = page[0].kind;
    const ours = await valuesAt(
      client,
      headId,
      name,
      page.map((d) => d.key),
    );
    for (const { key, before, after } of page) {
      const current = ours.get(keyName(key));
      const value = mergeValue(
        before ?? undefined,
        after ?? undefined,
        current,
        LABELS[name] + ' ' + (name === 'relationships' ? keyName(key) : key),
        name !== 'relationships',
        conflicts,
      );
      if (same(value, current)) continue;
      merged[name].set(keyName(key), value ?? null);
    }
  }
  if (conflicts.length) throw conflict(conflicts);
  await complete(client, timelineId, { baseId, otherId, headId }, merged);
  for (const [id, event] of merged.moments) patch.changes.push({ id, event });
  for (const [id, duration] of merged.durations) patch.durationChanges.push({ id, duration });
  for (const [key, value] of merged.relationships) {
    const { a_kind, a_id, b_kind, b_id } = JSON.parse(key);
    patch.relationshipChanges.push({
      a: reference({ kind: a_kind, id: a_id }),
      b: reference({ kind: b_kind, id: b_id }),
      related: value !== null,
    });
  }
  return patch;
}
/**
 * Completes a merge's decisions as rebaseDocument would leave the whole timeline: a link
 * stays only while both its entities do, and a duration anchored to a removed moment keeps
 * that moment's last time.
 * Changes `merged` in place; reads the timeline's live rows (the head) and history.
 */
async function complete(client, timelineId, { baseId, otherId, headId }, merged) {
  const removed = [...merged.moments].filter(([, e]) => e === null).map(([id]) => id);
  const index = await indexReader(client, await lineageOf(client, timelineId));
  // Whether a moment or duration is in the merged timeline: decided, or as at the head.
  const present = async (kind, ids) => {
    const name = kind === 'moment' ? 'moments' : 'durations';
    const undecided = [...new Set(ids)].filter((id) => !merged[name].has(id));
    const atHead = undecided.length ? await valuesAt(client, headId, name, undecided) : new Map();
    return (id) => (merged[name].has(id) ? merged[name].get(id) !== null : atHead.has(id));
  };
  // Durations the head holds, anchored to moments the merge removes, follow them as saves do.
  if (removed.length) {
    // The head's durations with a start or end anchored to a removed moment: the two
    // expression indexes on definition->'start'->>'moment' and definition->'end'->>'moment'
    // (timeline first) find them, at each level the timeline reads through to.
    const { rows: anchored } = await client.query(
      `SELECT DISTINCT definition FROM ${index('oc_duration_nodes')} x WHERE definition IS NOT NULL
      AND (definition->'start'->>'moment'=ANY($2::text[]) OR definition->'end'->>'moment'=ANY($2::text[]))`,
      [timelineId, removed],
    );
    for (const { definition } of anchored)
      if (!merged.durations.has(definition.id)) merged.durations.set(definition.id, definition);
  }
  // Durations the merge keeps whose anchors it removes keep the moment's last time: the
  // proposed side's, the head's, or the base's.
  const kept = [...merged.durations.values()].filter(Boolean);
  const anchors = kept.flatMap((d) =>
    [d.start, d.end].filter((e) => typeof e !== 'string').map((e) => e.moment),
  );
  if (anchors.length) {
    const exists = await present('moment', anchors);
    const missing = [...new Set(anchors.filter((m) => !exists(m)))];
    if (missing.length) {
      const times = new Map();
      for (const revision of [baseId, headId, otherId])
        for (const [id, event] of await valuesAt(client, revision, 'moments', missing))
          times.set(id, event.time);
      for (const d of fixMissingAnchors(kept, exists, (m) => times.get(m)))
        merged.durations.set(d.id, d);
    }
  }
  // Links stay only while both their entities do: links the head holds to removed
  // entities go, and links the merge adds to missing ones are not added.
  const gone = [
    ...removed.map((id) => ['moment', id]),
    ...[...merged.durations].filter(([, d]) => d === null).map(([id]) => ['duration', id]),
  ];
  if (gone.length) {
    // The head's links with either end among the removed entities, by the primary key's
    // prefix (a side) and oc_relationships_b (b side).
    const { rows: links } = await client.query(
      `SELECT a_kind,a_id,b_kind,b_id FROM ${index('oc_relationships')} r JOIN unnest($2::text[],$3::text[]) x(kind,id)
      ON (r.a_kind=x.kind AND r.a_id=x.id) OR (r.b_kind=x.kind AND r.b_id=x.id)`,
      [timelineId, gone.map(([kind]) => kind), gone.map(([, id]) => id)],
    );
    for (const row of links) {
      const key = keyName({
        a_kind: row.a_kind,
        a_id: row.a_id,
        b_kind: row.b_kind,
        b_id: row.b_id,
      });
      if (!merged.relationships.has(key)) merged.relationships.set(key, null);
    }
  }
  const added = [...merged.relationships].filter(([, v]) => v !== null).map(([k]) => JSON.parse(k));
  if (added.length) {
    const ends = (kind) =>
      added.flatMap((r) => [
        ...(r.a_kind === kind ? [r.a_id] : []),
        ...(r.b_kind === kind ? [r.b_id] : []),
      ]);
    const [moment, duration] = [
      await present('moment', ends('moment')),
      await present('duration', ends('duration')),
    ];
    const exists = (kind, id) => (kind === 'moment' ? moment(id) : duration(id));
    for (const r of added)
      if (!exists(r.a_kind, r.a_id) || !exists(r.b_kind, r.b_id))
        merged.relationships.delete(keyName(r));
  }
}
export { linkKey };
