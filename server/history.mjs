// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
/**
 * Saved history as rows. Each version of a timeline's moments, durations, relationships and
 * settings is a row valid from the revision number that saved it (`since`) until the one
 * that changed or removed it (`until`, null while current). Revision n of a timeline is the
 * rows with since <= n < until. A save writes only the versions it changes, so history grows
 * with the changes, never with the timeline's size, and no revision needs a whole document:
 * reading one is a query.
 *
 * `oc_timelines.history_since` is the first revision number kept as rows. Timelines saved
 * before this was introduced start at their revision when migrating (startHistory), with
 * one copy of their state made in the database; their earlier revisions keep their
 * snapshots and patches. Revisions that are not in a timeline's numbered history (pull
 * request sources and rebases) store documents.
 *
 * A fork or duplicate shares the history of the revision it was copied from (its base,
 * `oc_history_bases`) instead of copying it: it reads through to the base for every entity
 * it has not saved itself. An override records the revision from which the copy keeps its
 * own versions of an entity; one without a version is an entity the copy removed. A copy of
 * a copy reads through each level in turn, up to SHARED_LEVELS levels.
 *
 * Statements write each level of a lineage into their SQL as literals (timeline IDs and
 * revision numbers read from the database and checked by `lineage`), so the planner sees
 * which timeline each branch reads and uses its indexes for it. The indexes they rely on
 * are in schema.sql: each history table's primary key (timeline, key, since), the partial
 * unique `_current` indexes (until IS NULL) that saves find current versions by, and the
 * `_since`/`_until` indexes that comparisons find what changed between revisions by.
 * See "Saved history" in docs/architecture.md.
 */
import { validateDocument } from '../dist/core.mjs';
import { indexReader, lineageOf } from './index-versions.mjs';
import { RELATIONSHIP_ORDER } from './document-stream.mjs';

/** How many entities one statement compares: no statement grows with the timeline. */
const PAGE = 20000;
/** How many levels a revision may read through: a copy past that starts its own history. */
const SHARED_LEVELS = 4;
/**
 * After every revision number (the largest bigint): a level read at CURRENT sees its
 * current versions (until IS NULL) rather than those of a revision.
 */
const CURRENT = '9223372036854775807';
/** A relationship's key columns, in canonical order (see oc_relationships in schema.sql). */
const LINK = ['a_kind', 'a_id', 'b_kind', 'b_id'];
/**
 * Each kind of entity: its history table, its key, its stored value, and its live rows (the
 * saved timeline's index, as read by its indexReader `index`) as the same columns, with the
 * expressions that key them.
 *
 * - `values`/`types`: the value columns and their SQL types (none for a relationship, whose
 *   existence is its value); `same`: the column compared to tell whether a version changed.
 * - `live(index, scan)`: SQL for the live rows, ending in a WHERE clause callers extend with
 *   AND; `scan` when reading most of them (see indexReader). Durations come from their
 *   interval tree's nodes, keyed by the band's ID (a null definition is a legacy row).
 * - `bytes`/`overrideBytes`: what a version or an override is charged.
 * - `overrides`: the copy's override table (see the file's header).
 */
const KINDS = {
  moments: {
    table: 'oc_history_moments',
    key: ['id'],
    values: ['time', 'event'],
    types: ['mpq', 'jsonb'],
    same: 'event',
    live: (index, scan) =>
      `SELECT id,time,event FROM ${index('oc_moments', '$1', { scan })} x WHERE true`,
    liveKey: ['id'],
    bytes: 'octet_length(event::text)',
    overrides: 'oc_history_moment_overrides',
    overrideBytes: 'octet_length(id)+16',
  },
  durations: {
    table: 'oc_history_durations',
    key: ['id'],
    values: ['definition'],
    types: ['jsonb'],
    same: 'definition',
    live: (index, scan) =>
      `SELECT band->>'id' AS id,definition FROM ${index('oc_duration_nodes', '$1', { scan })} x WHERE definition IS NOT NULL`,
    liveKey: ["band->>'id'"],
    bytes: 'octet_length(definition::text)',
    overrides: 'oc_history_duration_overrides',
    overrideBytes: 'octet_length(id)+16',
  },
  relationships: {
    table: 'oc_history_relationships',
    key: LINK,
    values: [],
    types: [],
    same: null,
    live: (index, scan) =>
      `SELECT ${LINK} FROM ${index('oc_relationships', '$1', { scan })} x WHERE true`,
    liveKey: LINK,
    bytes: 'octet_length(a_id)+octet_length(b_id)+32',
    overrides: 'oc_history_relationship_overrides',
    overrideBytes: 'octet_length(a_id)+octet_length(b_id)+32',
  },
};
/** Every history table, settings included. */
const TABLES = [...Object.values(KINDS).map((k) => k.table), 'oc_history_settings'];
/** `names` qualified by `alias`, comma-separated, for a SELECT list or a row value. */
const columns = (alias, names) => names.map((name) => `${alias}.${name}`).join(',');
/**
 * The live row with the key of the row `alias`, if any, as a subquery looked up by that key.
 * OFFSET 0 keeps it a lookup per key: otherwise the planner may turn it into a join, and
 * right after a timeline is written (a fork, an import) its statistics can still count the
 * timeline's live rows as none, so the join would read all of them for every key.
 */
const liveAt = (kind, alias, index) =>
  `(${kind.live(index)} AND (${kind.liveKey})=(${columns(alias, kind.key)})${fence(kind)})`;
/** Keeps a subquery a lookup per key, unless the kind's live rows have current statistics. */
const fence = (kind) => (kind.analyzed ? '' : ' OFFSET 0');

/** The parts of a document that are not its entities. */
export function settingsOf({ events, durations, relationships, ...settings }) {
  return settings;
}

/**
 * Records the timeline's saved state as revision `number`, after the save changed its live
 * rows (oc_moments, oc_duration_nodes, oc_relationships) and with its new `settings`.
 * `touched` names what the save may have changed: { moments, durations, relationships } (ids,
 * ids, and objects of LINK columns); without it every entity is compared, a page at a time.
 * Returns the bytes of the versions written, which the revision is charged.
 * Runs in the save's transaction (the timeline row locked). The first time history is kept
 * as rows (history_since null) it starts at `number`: a timeline then copies its whole
 * state, while a copy starts as its base and records only its settings.
 */
export async function recordHistory(client, timelineId, number, settings, touched = null) {
  // Where its history starts, and the revision it reads through to if it is a copy.
  const { rows } = await client.query(
    `SELECT t.history_since,b.base_revision_id FROM oc_timelines t
    LEFT JOIN oc_history_bases b ON b.timeline_id=t.id WHERE t.id=$1`,
    [timelineId],
  );
  const starting = rows[0].history_since === null;
  if (starting)
    await client.query('UPDATE oc_timelines SET history_since=$2 WHERE id=$1', [
      timelineId,
      number,
    ]);
  const bytes = await recordSettings(client, timelineId, number, settings);
  // A copy starts as its base: it has nothing of its own to record yet.
  if (starting && rows[0].base_revision_id) return bytes;
  return bytes + (await recordEntities(client, KINDS, timelineId, number, starting, touched));
}
/**
 * Records the entities of `kinds` (KINDS, read from live rows, or STAGED_KINDS): those
 * `touched` names, or all of them (when `starting`, or without `touched`). Returns the
 * bytes written.
 */
async function recordEntities(client, kinds, timelineId, number, starting, touched) {
  const levels = await lineage(client, timelineId, CURRENT);
  // A timeline's live rows, read through as a fork's are (staged rows are their own).
  const index =
    kinds === KINDS ? await indexReader(client, await lineageOf(client, timelineId)) : null;
  let bytes = 0,
    written = 0;
  for (const [name, kind] of Object.entries(kinds)) {
    // History starting at this save copies everything, not only what the save changed.
    const keys = starting ? null : touched?.[name];
    const result = keys
      ? await recordKeys(client, kind, timelineId, number, keys.map(keyOf(kind)), levels, index)
      : await recordAll(client, kind, timelineId, number, starting, levels, index);
    bytes += result.bytes;
    written += result.count;
  }
  // A timeline's first versions can outnumber what the planner last saw of these tables;
  // later saves look versions up by key, which needs current statistics.
  // (ANALYZE samples the tables within the transaction; it takes no lock that blocks writes.)
  if (starting && written > PAGE) await client.query(`ANALYZE ${TABLES.join(',')}`);
  return bytes;
}

/**
 * A document's entities staged in temporary tables, with the same columns as each kind's
 * live rows: a revision that is not a timeline's state (a pull request's source) is recorded
 * from them as a timeline's saves are from its live rows.
 */
const STAGED = {
  moments: {
    table: 'oc_staged_moments',
    columns: ['timeline_id', 'id', 'time', 'event'],
    definition:
      'timeline_id uuid,id text,time mpq NOT NULL,event jsonb NOT NULL,PRIMARY KEY(timeline_id,id)',
    values: "e->>'id',(e->>'time')::mpq,e",
    items: (document) => document.events,
  },
  durations: {
    table: 'oc_staged_durations',
    columns: ['timeline_id', 'id', 'definition'],
    definition: 'timeline_id uuid,id text,definition jsonb NOT NULL,PRIMARY KEY(timeline_id,id)',
    values: "e->>'id',e",
    items: (document) => document.durations ?? [],
  },
  relationships: {
    table: 'oc_staged_relationships',
    columns: ['timeline_id', ...LINK],
    definition: `timeline_id uuid,a_kind text,a_id text,b_kind text,b_id text,PRIMARY KEY(timeline_id,${LINK})`,
    values: LINK.map((c) => `e->>'${c}'`).join(','),
    items: (document) =>
      (document.relationships ?? []).map((r) => {
        const [a_kind, a_id] = reference(r.a),
          [b_kind, b_id] = reference(r.b);
        return { a_kind, a_id, b_kind, b_id };
      }),
  },
};
/** How many entities one statement stages. */
const STAGE_BATCH = 5000;
/** A relationship end ({moment} or {duration}) as its [kind, id] columns. */
const reference = (ref) => ('moment' in ref ? ['moment', ref.moment] : ['duration', ref.duration]);
/** Each kind, read from its staged rows instead of its live ones. */
const STAGED_KINDS = Object.fromEntries(
  Object.entries(KINDS).map(([name, kind]) => {
    const staged = STAGED[name].columns.slice(1);
    return [
      name,
      {
        ...kind,
        live: () => `SELECT ${staged} FROM ${STAGED[name].table} WHERE timeline_id=$1`,
        liveKey: kind.key,
        // Staged rows are analyzed once staged (recordDetached), so plans may join them.
        analyzed: true,
      },
    ];
  }),
);

/**
 * Records `document` (validated) as a revision outside any timeline's numbered history (a pull request's
 * source, or a rebase of one): `revisionId` is its own one-revision history, number 1, that
 * reads through to `baseRevisionId` and keeps only what the document changes from it, so it is
 * charged its changes. Returns the bytes written, or null when the base is not kept as rows
 * (then the revision stores the document).
 */
export async function recordDetached(client, revisionId, baseRevisionId, document) {
  if (!(await startDetached(client, revisionId, baseRevisionId))) return null;
  await stage(client, revisionId, document);
  const bytes =
    (await recordSettings(client, revisionId, 1, settingsOf(document))) +
    (await recordEntities(client, STAGED_KINDS, revisionId, 1, false, null));
  await unstage(client, revisionId);
  return bytes;
}
/**
 * Records, like recordDetached, a revision that is its base changed by `patch` (as saves
 * take it: settings, changes, durationChanges, relationshipChanges): only what the patch
 * names is compared, so it costs what it changes.
 */
export async function recordDetachedPatch(client, revisionId, baseRevisionId, patch) {
  // A patch only exists against a base kept as rows (mergePatch).
  if (!(await startDetached(client, revisionId, baseRevisionId))) return null;
  const relationships = (patch.relationshipChanges ?? []).map((r) => ({ a: r.a, b: r.b }));
  await stage(client, revisionId, {
    events: patch.changes.filter((c) => c.event).map((c) => c.event),
    durations: (patch.durationChanges ?? []).filter((c) => c.duration).map((c) => c.duration),
    relationships: relationships.filter((_, i) => patch.relationshipChanges[i].related),
  });
  const link = (r) => {
    const [a_kind, a_id] = reference(r.a),
      [b_kind, b_id] = reference(r.b);
    return { a_kind, a_id, b_kind, b_id };
  };
  const bytes =
    (await recordSettings(client, revisionId, 1, patch.settings)) +
    (await recordEntities(client, STAGED_KINDS, revisionId, 1, false, {
      moments: patch.changes.map((c) => c.id),
      durations: (patch.durationChanges ?? []).map((c) => c.id),
      relationships: relationships.map(link),
    }));
  await unstage(client, revisionId);
  return bytes;
}
/**
 * A detached revision's history reads through to its base, which must be kept as rows:
 * records `baseRevisionId` as the base of `revisionId` (used as a timeline ID in the history
 * tables) and returns true, or returns false, writing nothing, when the base is not kept so.
 */
async function startDetached(client, revisionId, baseRevisionId) {
  // history_rows: the base's content is kept as rows (not a snapshot or patch, nor forgotten).
  const base = await client.query('SELECT 1 FROM oc_revisions WHERE id=$1 AND history_rows', [
    baseRevisionId,
  ]);
  if (!base.rows.length) return false;
  await client.query('INSERT INTO oc_history_bases(timeline_id,base_revision_id) VALUES($1,$2)', [
    revisionId,
    baseRevisionId,
  ]);
  return true;
}
/**
 * Stages a document's entities (see STAGED) for `id`, until the transaction ends. The tables
 * are temporary (private to this connection) and dropped at commit; IF NOT EXISTS lets a
 * transaction stage more than once (unstage empties them between).
 */
async function stage(client, id, document) {
  for (const stage of Object.values(STAGED)) {
    await client.query(
      `CREATE TEMPORARY TABLE IF NOT EXISTS ${stage.table}(${stage.definition}) ON COMMIT DROP`,
    );
    const items = stage.items(document);
    // A batch of entities sent as one JSON array and expanded in the database, rather than
    // one parameter per value.
    for (let i = 0; i < items.length; i += STAGE_BATCH)
      await client.query(
        `INSERT INTO ${stage.table}(${stage.columns}) SELECT $1,${stage.values}
        FROM jsonb_array_elements($2::jsonb) e`,
        [id, JSON.stringify(items.slice(i, i + STAGE_BATCH))],
      );
  }
  // Statistics of their keys, so comparisons with the base read the staged rows by key.
  await client.query(
    `ANALYZE ${Object.entries(STAGED).map(([name, stage]) => `${stage.table}(timeline_id,${KINDS[name].key})`)}`,
  );
}
/** Empties the staged rows of `id`, so a later stage in the transaction starts clean. */
async function unstage(client, id) {
  for (const stage of Object.values(STAGED))
    await client.query(`DELETE FROM ${stage.table} WHERE timeline_id=$1`, [id]);
}

/** A touched entity (an ID, or an object of LINK columns) as an array of key values. */
const keyOf = (kind) => (value) =>
  kind.key.length === 1 ? [value] : kind.key.map((column) => value[column]);

/**
 * The levels revision `number` of a timeline reads, as [timeline id, revision number]: the
 * timeline at that number, then the revision it was copied from, and so on.
 * `number` is a revision number as text, or CURRENT.
 */
async function lineage(client, timelineId, number) {
  // Follows base links: each level's base revision (oc_history_bases, by its primary key)
  // gives the next level's timeline and number (oc_revisions, by its primary key). Copies
  // read through at most SHARED_LEVELS levels; the depth bound only guards against a cycle.
  const { rows } = await client.query(
    `WITH RECURSIVE l(timeline_id,number,depth) AS (
      SELECT $1::uuid,$2::bigint,0
      UNION ALL SELECT r.timeline_id,r.number,l.depth+1 FROM l
      JOIN oc_history_bases b ON b.timeline_id=l.timeline_id
      JOIN oc_revisions r ON r.id=b.base_revision_id WHERE l.depth<64
    ) SELECT timeline_id::text,number::text FROM l ORDER BY depth`,
    [timelineId, number],
  );
  // Both are written into statements as literals (see visible), so the planner sees each
  // level's own rows.
  return rows.map(({ timeline_id: id, number: n }) => {
    if (!/^[0-9a-f-]{36}$/.test(id) || !/^[0-9]+$/.test(n)) throw new Error('Invalid lineage.');
    return [id, n];
  });
}

/**
 * The versions a level sees (see lineage): its current ones, or those of a revision (valid
 * at n: since <= n < until, a null until meaning still current). SQL conditions on `alias`.
 */
const seen = (alias, [id, n]) =>
  `${alias}.timeline_id='${id}' AND ${alias}.since<=${n} AND ${
    n === CURRENT ? `${alias}.until IS NULL` : `(${alias}.until IS NULL OR ${alias}.until>${n})`
  }`;

/**
 * The versions of a kind that `levels` see (see lineage), as its key and value columns:
 * each entity from the first level that saved it, unless it removed it there. `filter`
 * narrows the versions and overrides read: SQL given their alias.
 *
 * With several levels: a branch per level of the versions it sees and of its overrides (as
 * rows of the key with null values), tagged with the level's depth. DISTINCT ON (key),
 * ordered by depth then override, keeps per key the nearest level's row, its version before
 * its override; an override alone there (the entity removed by that copy) wins and is then
 * dropped, so it hides deeper levels' versions. Overrides count from their `since`: before
 * it the copy still read the entity through.
 */
function visible(kind, levels, filter = () => '') {
  const names = [...kind.key, ...kind.values];
  if (levels.length === 1)
    return `SELECT ${columns('h', names)} FROM ${kind.table} h WHERE ${seen('h', levels[0])} ${filter('h')}`;
  const branches = levels.flatMap(([id, n], depth) => [
    `SELECT ${depth} AS depth,false AS override,${columns('h', names)} FROM ${kind.table} h
    WHERE ${seen('h', [id, n])} ${filter('h')}`,
    `SELECT ${depth},true,${columns('o', kind.key)}${kind.types.map((type) => `,NULL::${type}`).join('')}
    FROM ${kind.overrides} o WHERE o.timeline_id='${id}' AND o.since<=${n} ${filter('o')}`,
  ]);
  return `SELECT ${names} FROM (SELECT DISTINCT ON (${kind.key}) * FROM (${branches.join(' UNION ALL ')}) v
    ORDER BY ${kind.key},depth,override) v WHERE NOT override`;
}

/**
 * Makes a new copy's history read through to `revisionId`, the revision it was copied from
 * (and its live rows were written from), instead of copying it: when that revision is kept
 * as rows and the copy would read through at most SHARED_LEVELS levels, itself included.
 * Returns whether it does; otherwise the copy's first revision copies its state.
 */
export async function shareHistory(client, timelineId, revisionId) {
  // Only a revision whose content is kept as rows can be read through to.
  const { rows } = await client.query(
    'SELECT timeline_id,number FROM oc_revisions WHERE id=$1 AND history_rows',
    [revisionId],
  );
  if (!rows[0]) return false;
  if ((await lineage(client, rows[0].timeline_id, rows[0].number)).length >= SHARED_LEVELS)
    return false;
  await client.query('INSERT INTO oc_history_bases(timeline_id,base_revision_id) VALUES($1,$2)', [
    timelineId,
    revisionId,
  ]);
  return true;
}

/**
 * Records the timeline's settings at revision `number`: ends the current version if they
 * changed, then adds a version when none is current (changed, or the first). Returns the
 * bytes added (0 when unchanged).
 */
async function recordSettings(client, timelineId, number, settings) {
  const value = JSON.stringify(settings);
  // The current version, found by the partial unique index oc_history_settings_current.
  // IS DISTINCT FROM compares the jsonb values (key order does not matter in jsonb).
  await client.query(
    `UPDATE oc_history_settings SET until=$2 WHERE timeline_id=$1 AND until IS NULL
    AND settings IS DISTINCT FROM $3::jsonb`,
    [timelineId, number, value],
  );
  const { rows } = await client.query(
    // Inserts only when no version is current any more: the unique index allows one.
    `INSERT INTO oc_history_settings(timeline_id,since,settings)
    SELECT $1,$2,$3::jsonb WHERE NOT EXISTS(
      SELECT 1 FROM oc_history_settings WHERE timeline_id=$1 AND until IS NULL)
    RETURNING octet_length(settings::text) AS bytes`,
    [timelineId, number, value],
  );
  return Number(rows[0]?.bytes ?? 0);
}

/**
 * Entities a save changed (`keys`, each an array of key values): their current versions end
 * at `number` unless unchanged, and their live rows without a current version start one. In
 * a copy, an entity it has not saved before and that now differs from what it reads through
 * to (`levels`) gets an override first: from here on, the copy keeps its own versions.
 * A page of PAGE keys per round of three statements, each reading the keys from arrays (one
 * text[] per key column) in a `k` CTE. Returns { bytes, count } of what it wrote.
 */
async function recordKeys(client, kind, timelineId, number, keys, levels, index) {
  const copy = levels.length > 1;
  let bytes = 0,
    count = 0;
  for (let i = 0; i < keys.length; i += PAGE) {
    const page = keys.slice(i, i + PAGE);
    const params = [timelineId, number, ...kind.key.map((_, c) => page.map((key) => key[c]))];
    const k = `k AS (SELECT DISTINCT * FROM unnest(${kind.key.map((_, c) => `$${c + 3}::text[]`)}) AS k(${kind.key}))`;
    const key = (alias) => `(${columns(alias, kind.key)})`;
    const own = (alias) =>
      `SELECT 1 FROM ${kind.overrides} o WHERE o.timeline_id=$1 AND ${key('o')}=${key(alias)}`;
    // 1. Ends at this revision each key's current version (found by the `_current` partial
    //    unique index) unless the live row still has the same value; a relationship's
    //    version ends when the link is gone. The immutability trigger allows this one change.
    await client.query(
      `WITH ${k} UPDATE ${kind.table} h SET until=$2 FROM k
      WHERE h.timeline_id=$1 AND h.until IS NULL AND ${key('h')}=${key('k')}
      AND NOT EXISTS(SELECT 1 FROM ${liveAt(kind, 'h', index)} l
        ${kind.same ? `WHERE l.${kind.same}=h.${kind.same}` : ''})`,
      params,
    );
    if (copy) {
      // What the copy read through to before this save, compared with what it holds now.
      // 2. (copies only) An override for each key the copy has none for whose presence or
      //    value now differs from what its levels give: from this revision on, the copy
      //    keeps its own versions of it. Returns the overrides' bytes.
      const inherited = visible(kind, levels.slice(1), (alias) => `AND ${key(alias)}=${key('k')}`);
      const present = (alias) => `(${alias}.${kind.key[0]} IS NOT NULL)`;
      const { rows } = await client.query(
        `WITH ${k},added AS (
          INSERT INTO ${kind.overrides}(timeline_id,${kind.key},since)
          SELECT $1,${columns('k', kind.key)},$2 FROM k
          LEFT JOIN LATERAL ${liveAt(kind, 'k', index)} l ON true
          LEFT JOIN LATERAL (${inherited}${fence(kind)}) i ON true
          WHERE NOT EXISTS(${own('k')}) AND (${present('l')}<>${present('i')}
            ${kind.same ? `OR l.${kind.same} IS DISTINCT FROM i.${kind.same}` : ''})
          RETURNING ${kind.overrideBytes} AS bytes
        ) SELECT coalesce(sum(bytes),0) AS bytes FROM added`,
        params,
      );
      bytes += Number(rows[0].bytes);
    }
    // 3. A new version, from the live row, for each key that has a live row and no current
    //    version (step 1 ended it, or it is new); in a copy only for keys it overrides, the
    //    others still reading through to the same value. Returns bytes and count written.
    const { rows } = await client.query(
      `WITH ${k},added AS (
        INSERT INTO ${kind.table}(timeline_id,${kind.key},since${kind.values.map((v) => ',' + v).join('')})
        SELECT $1,${columns('l', kind.key)},$2${kind.values.map((v) => ',l.' + v).join('')}
        FROM k CROSS JOIN LATERAL ${liveAt(kind, 'k', index)} l
        WHERE NOT EXISTS(SELECT 1 FROM ${kind.table} h WHERE h.timeline_id=$1 AND h.until IS NULL
          AND ${key('h')}=${key('k')}) ${copy ? `AND EXISTS(${own('k')})` : ''}
        RETURNING ${kind.bytes} AS bytes
      ) SELECT coalesce(sum(bytes),0) AS bytes,count(*) AS count FROM added`,
      params,
    );
    bytes += Number(rows[0].bytes);
    count += Number(rows[0].count);
  }
  return { bytes, count };
}

/**
 * Every entity of a kind, a page of keys at a time: the live ones, then those each level
 * sees that are no longer live. A timeline starting history has no versions yet: its live
 * entities are copied as they are (copyAll).
 * The second part finds removals: an entity a level still sees (the timeline's current
 * versions, or for a copy, what it reads through to) but that has no live row. Keys are
 * paged in key order with a cursor (keyset pagination on the primary keys), each page then
 * recorded by recordKeys.
 */
async function recordAll(client, kind, timelineId, number, starting, levels, index) {
  if (starting) return copyAll(client, kind, timelineId, number, index);
  const total = { bytes: 0, count: 0 };
  // Keys after the cursor (the last key of the previous page), compared as a row value.
  const key = (alias) => `(${columns(alias, kind.key)})`;
  const after = (alias, cursor) =>
    cursor ? `AND ${key(alias)}>(${kind.key.map((_, c) => `$${c + 2}`)})` : '';
  const pages = [
    (cursor) =>
      `SELECT ${columns('l', kind.key)} FROM (${kind.live(index, true)}) l WHERE true ${after('l', cursor)}
      ORDER BY ${kind.key} LIMIT ${PAGE}`,
    ...levels.map(
      ([id, n]) =>
        (cursor) =>
          `SELECT ${columns('h', kind.key)} FROM ${kind.table} h WHERE ${seen('h', [id, n])}
          AND NOT EXISTS(SELECT 1 FROM (${kind.live(index, true)}) l WHERE ${key('l')}=${key('h')})
          ${after('h', cursor)} ORDER BY ${kind.key} LIMIT ${PAGE}`,
    ),
  ];
  for (const page of pages) {
    let cursor = null;
    for (;;) {
      const { rows } = await client.query(page(cursor), [timelineId, ...(cursor ?? [])]);
      if (!rows.length) break;
      const keys = rows.map((row) => kind.key.map((column) => row[column]));
      const result = await recordKeys(client, kind, timelineId, number, keys, levels, index);
      total.bytes += result.bytes;
      total.count += result.count;
      if (rows.length < PAGE) break;
      cursor = keys.at(-1);
    }
  }
  return total;
}
/**
 * Live entities as their first versions, a page at a time in key order, each page copied in
 * the statement that reads it: no entity is looked up again by its key, which, right after a
 * timeline is written and before its statistics count its rows, can read all of them for
 * each key (durations, looked up by an expression).
 */
async function copyAll(client, kind, timelineId, number, index) {
  const total = { bytes: 0, count: 0 };
  const names = [...kind.key, ...kind.values];
  let cursor = null;
  // Each statement: a page of live rows after the cursor in key order (`page`), inserted as
  // versions starting at this revision (`added`), returning how many and their bytes along
  // with the page's last key, the next cursor. An empty page returns no row.
  for (;;) {
    const after = cursor
      ? `AND (${columns('l', kind.key)})>(${kind.key.map((_, c) => `$${c + 3}`)})`
      : '';
    const { rows } = await client.query(
      `WITH page AS (
        SELECT ${columns('l', names)} FROM (${kind.live(index, true)}) l WHERE true ${after}
        ORDER BY ${kind.key} LIMIT ${PAGE}
      ), added AS (
        INSERT INTO ${kind.table}(timeline_id,${names},since)
        SELECT $1,${names},$2 FROM page RETURNING ${kind.bytes} AS bytes
      ) SELECT (SELECT count(*) FROM added) AS count,(SELECT coalesce(sum(bytes),0) FROM added) AS bytes,
        last.* FROM (SELECT ${kind.key} FROM page ORDER BY ${kind.key.map((k) => k + ' DESC')} LIMIT 1) last`,
      [timelineId, number, ...(cursor ?? [])],
    );
    if (!rows.length) break;
    total.bytes += Number(rows[0].bytes);
    total.count += Number(rows[0].count);
    if (Number(rows[0].count) < PAGE) break;
    cursor = kind.key.map((column) => rows[0][column]);
  }
  return total;
}

/**
 * Starts history as rows for every timeline saved before it was kept so (when migrating):
 * their state at their current revision, copied in the database. Timelines that keep no
 * saved history are left without. Returns how many started.
 * Each statement covers every such timeline at once: their own live rows, joined with their
 * timeline row, copied as versions starting at the timeline's revision. ON CONFLICT DO
 * NOTHING skips a version already recorded rather than failing the migration.
 */
export async function startHistory(client) {
  const starting =
    'JOIN oc_timelines t ON t.id=x.timeline_id WHERE t.history_since IS NULL AND t.keep_history';
  await client.query(
    `INSERT INTO oc_history_moments(timeline_id,id,since,time,event)
    SELECT x.timeline_id,x.id,t.revision,x.time,x.event FROM oc_moments x ${starting}
    ON CONFLICT DO NOTHING`,
  );
  await client.query(
    `INSERT INTO oc_history_durations(timeline_id,id,since,definition)
    SELECT x.timeline_id,x.band->>'id',t.revision,x.definition FROM oc_duration_nodes x ${starting}
    AND x.definition IS NOT NULL ON CONFLICT DO NOTHING`,
  );
  await client.query(
    `INSERT INTO oc_history_relationships(timeline_id,${LINK},since)
    SELECT x.timeline_id,${columns('x', LINK)},t.revision FROM oc_relationships x ${starting}
    ON CONFLICT DO NOTHING`,
  );
  // The settings a document of the timeline has (see timelineSettings in incremental.mjs).
  const optional = (name, value = name) =>
    `CASE WHEN t.${name} IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('${name}',${value}) END`;
  await client.query(
    `INSERT INTO oc_history_settings(timeline_id,since,settings)
    SELECT t.id,t.revision,jsonb_build_object('format','openchronology','version',1,
      'title',t.title,'description',t.description)
      ||${optional('presentation')}||${optional('plugins')}||${optional('tags', 'to_jsonb(t.tags)')}
      ||${optional('assets')}||${optional('comparison')}
    FROM oc_timelines t WHERE t.history_since IS NULL AND t.keep_history ON CONFLICT DO NOTHING`,
  );
  const { rowCount } = await client.query(
    'UPDATE oc_timelines SET history_since=revision WHERE history_since IS NULL AND keep_history',
  );
  if (rowCount) await client.query(`ANALYZE ${TABLES.join(',')}`);
  return rowCount;
}

/**
 * Ends the timeline's current versions at revision `until`: what its saved revisions see
 * stays, and nothing from `until` on sees them (its saved history stops).
 */
export async function endHistory(client, timelineId, until) {
  // Current versions found by each table's `_current` partial unique index.
  for (const table of TABLES)
    await client.query(`UPDATE ${table} SET until=$2 WHERE timeline_id=$1 AND until IS NULL`, [
      timelineId,
      until,
    ]);
}

/**
 * Revision `number` of a timeline kept as rows, as a document (validated), read whole; null
 * when it is not kept as rows.
 */
export async function historyDocument(client, timelineId, number) {
  const parts = await historyParts(client, timelineId, number);
  if (!parts) return null;
  const document = { ...parts.settings };
  for (const [name, sql, value] of parts.parts) {
    const { rows } = await client.query(sql);
    if (rows.length || name === 'events') document[name] = rows.map(value);
  }
  return validateDocument(document);
}
/**
 * Revision `number` of a timeline kept as rows, in parts: its settings, and a query per kind
 * of entity, [name, SQL, row => value]. Moments in time order (then ID), durations by ID and
 * relationships as documents sort them; or, for a `stream` (document-stream.mjs), each in its
 * key's order, which the versions' primary keys give without sorting. Null when it is not
 * kept as rows.
 */
export async function historyParts(client, timelineId, number, { stream = false } = {}) {
  // The settings version valid at the number (by primary key: timeline, since). Every
  // revision kept as rows has one, so none means the revision is not.
  const settings = await client.query(
    `SELECT settings FROM oc_history_settings
    WHERE timeline_id=$1 AND since<=$2 AND (until IS NULL OR until>$2)`,
    [timelineId, number],
  );
  if (!settings.rows[0]) return null;
  const levels = await lineage(client, timelineId, String(number));
  const read = (kind, order) =>
    `SELECT * FROM (${visible(KINDS[kind], levels)}) v ORDER BY ${order}`;
  return {
    settings: settings.rows[0].settings,
    parts: [
      ['events', read('moments', stream ? 'id' : 'time,id COLLATE "C"'), (r) => r.event],
      ['durations', read('durations', stream ? 'id' : 'id COLLATE "C"'), (r) => r.definition],
      [
        'relationships',
        read('relationships', stream ? LINK.join(',') : RELATIONSHIP_ORDER),
        (r) => ({ a: { [r.a_kind]: r.a_id }, b: { [r.b_kind]: r.b_id } }),
      ],
    ],
  };
}

/**
 * Deletes the timeline's versions that no remaining revision kept as rows can see: after its
 * history was pruned, or once the timeline is gone and nothing refers to its revisions.
 * While the timeline's head is kept as rows it sees every current version, so only ended
 * versions need checking. A copy's overrides go once no remaining revision follows them,
 * and its base once it has no revision kept as rows: then returns the base's timeline,
 * which may have kept that revision only for it.
 */
export async function pruneHistoryRows(client, timelineId) {
  // Whether the head revision is kept as rows.
  const head = await client.query(
    `SELECT 1 FROM oc_timelines t JOIN oc_revisions r ON r.id=t.head_revision_id
    WHERE t.id=$1 AND r.history_rows`,
    [timelineId],
  );
  // A version goes when no revision of the timeline kept as rows falls in its range
  // [since, until). Revisions are found by (timeline_id, number), oc_revisions' unique key.
  for (const table of TABLES)
    await client.query(
      `DELETE FROM ${table} h WHERE h.timeline_id=$1 AND (h.until IS NOT NULL OR NOT $2)
      AND NOT EXISTS(SELECT 1 FROM oc_revisions r WHERE r.timeline_id=$1 AND r.history_rows
        AND r.number>=h.since AND (h.until IS NULL OR r.number<h.until))`,
      [timelineId, head.rows.length > 0],
    );
  // An override applies from its `since` on: it goes once no kept revision is that late.
  for (const kind of Object.values(KINDS))
    await client.query(
      `DELETE FROM ${kind.overrides} o WHERE o.timeline_id=$1 AND NOT EXISTS(
        SELECT 1 FROM oc_revisions r WHERE r.timeline_id=$1 AND r.history_rows AND r.number>=o.since)`,
      [timelineId],
    );
  // The base link goes once the timeline has no revision kept as rows; RETURNING names the
  // base revision's timeline, for the caller to prune in turn.
  const { rows } = await client.query(
    `DELETE FROM oc_history_bases b WHERE b.timeline_id=$1 AND NOT EXISTS(
      SELECT 1 FROM oc_revisions r WHERE r.timeline_id=$1 AND r.history_rows)
    RETURNING (SELECT timeline_id FROM oc_revisions WHERE id=b.base_revision_id) AS released`,
    [timelineId],
  );
  return rows[0]?.released ?? null;
}

/**
 * What differs between two revisions kept as rows (`fromId`, `toId`): an async iterable of
 * pages of { kind, key, before, after }. `kind` is 'settings', 'moments', 'durations' or
 * 'relationships'; `key` an entity's ID (a relationship's LINK columns as an object); before
 * and after its settings, event or definition (true for a relationship), or null where it is
 * absent. Only the entities that either revision's history saved since they last shared a
 * state are compared, so the cost follows the differences, not the timeline's size. Null when
 * either revision is not kept as rows.
 */
export async function differences(client, fromId, toId) {
  // Both revisions by primary key, only if kept as rows.
  const { rows } = await client.query(
    'SELECT id,timeline_id,number::text FROM oc_revisions WHERE id=ANY($1::uuid[]) AND history_rows',
    [[fromId, toId]],
  );
  const revision = (id) => rows.find((row) => row.id === id);
  if (!revision(fromId) || !revision(toId)) return null;
  const [from, to] = await Promise.all(
    [fromId, toId].map((id) => lineage(client, revision(id).timeline_id, revision(id).number)),
  );
  return comparePages(client, from, to);
}
/**
 * The pages `differences` yields, given both lineages: the settings first (when they
 * differ), then each kind of entity, a page of candidate keys (see candidates) at a time.
 */
async function* comparePages(client, from, to) {
  // The settings version valid at each revision (each by its primary key, timeline and since).
  const settings = await client.query(
    `SELECT a.settings AS before,b.settings AS after,a.settings=b.settings AS same
    FROM oc_history_settings a,oc_history_settings b
    WHERE a.timeline_id=$1 AND a.since<=$2 AND (a.until IS NULL OR a.until>$2)
    AND b.timeline_id=$3 AND b.since<=$4 AND (b.until IS NULL OR b.until>$4)`,
    [...from[0], ...to[0]],
  );
  if (settings.rows[0] && !settings.rows[0].same)
    yield [{ kind: 'settings', key: null, ...settings.rows[0], same: undefined }];
  for (const [name, kind] of Object.entries(KINDS)) {
    let cursor = null;
    for (;;) {
      const keys = await candidates(client, kind, from, to, cursor);
      if (!keys.length) break;
      const changed = await compareKeys(client, kind, from, to, keys);
      if (changed.length)
        yield changed.map((row) => ({
          kind: name,
          key:
            kind.key.length === 1
              ? row[kind.key[0]]
              : Object.fromEntries(kind.key.map((c) => [c, row[c]])),
          before: row.before,
          after: row.after,
        }));
      if (keys.length < PAGE) break;
      cursor = keys.at(-1);
    }
  }
}
/**
 * A page of the keys either lineage may have changed since they last shared a state, after
 * `cursor`: everything the levels above the first timeline both read saved (up to their
 * revisions), and what that timeline saved between its two revisions. Lineages that share no
 * timeline compare everything they hold.
 *
 * `i` and `j` are where the lineages meet: the first level of `from` whose timeline `to`
 * also reads, and that level in `to`. Every branch reads one timeline's versions or
 * overrides by the indexes that lead with (timeline_id, since) or (timeline_id, until)
 * (the primary key for the levels above, which also orders by key). Each branch is cut to
 * PAGE distinct keys after the cursor in key order, then the union is made distinct and cut to
 * PAGE.
 */
async function candidates(client, kind, from, to, cursor) {
  const i = from.findIndex(([id]) => to.some(([other]) => other === id));
  const j = i < 0 ? -1 : to.findIndex(([id]) => id === from[i][0]);
  const above = i < 0 ? [...from, ...to] : [...from.slice(0, i), ...to.slice(0, j)];
  const branches = above.flatMap(([id, n]) => [
    `SELECT DISTINCT ${kind.key} FROM ${kind.table} WHERE timeline_id='${id}' AND since<=${n}`,
    `SELECT DISTINCT ${kind.key} FROM ${kind.overrides} WHERE timeline_id='${id}' AND since<=${n}`,
  ]);
  if (i >= 0 && from[i][1] !== to[j][1]) {
    const [lo, hi] = [BigInt(from[i][1]), BigInt(to[j][1])].sort((x, y) => (x < y ? -1 : 1));
    const between = (column) => `(${column}>${lo} AND ${column}<=${hi})`;
    branches.push(
      `SELECT DISTINCT ${kind.key} FROM ${kind.table} WHERE timeline_id='${from[i][0]}'
      AND (${between('since')} OR ${between('until')})`,
      `SELECT DISTINCT ${kind.key} FROM ${kind.overrides} WHERE timeline_id='${from[i][0]}' AND ${between('since')}`,
    );
  }
  if (!branches.length) return [];
  // Each part is distinct before it is cut to a page: history rows repeat a key (one version
  // after another), and a part cut short of a page's distinct keys would end the scan early
  // or have the cursor pass keys it never returned.
  const after = cursor ? `AND (${kind.key})>(${kind.key.map((_, c) => `$${c + 1}`)})` : '';
  const { rows } = await client.query(
    `SELECT DISTINCT ${kind.key} FROM (${branches
      .map((branch) => `(${branch} ${after} ORDER BY ${kind.key} LIMIT ${PAGE})`)
      .join(' UNION ALL ')}) c ORDER BY ${kind.key} LIMIT ${PAGE}`,
    cursor ?? [],
  );
  return rows.map((row) => kind.key.map((column) => row[column]));
}
/**
 * The keys whose versions differ between two lineages, with both versions: of `keys` (a page
 * of candidates), each entity as both lineages see it (visible), matched by a FULL JOIN on
 * the key, kept when either side lacks it or their values differ. A relationship's value is
 * true where present.
 */
async function compareKeys(client, kind, from, to, keys) {
  const key = (alias) => `(${columns(alias, kind.key)})`;
  const filter = (alias) => `AND ${key(alias)} IN (SELECT ${kind.key} FROM k)`;
  const value = (alias) =>
    kind.same
      ? `${alias}.${kind.same}`
      : `CASE WHEN ${alias}.${kind.key[0]} IS NULL THEN NULL ELSE 'true'::jsonb END`;
  const { rows } = await client.query(
    `WITH k AS (SELECT * FROM unnest(${kind.key.map((_, c) => `$${c + 1}::text[]`)}) AS k(${kind.key})),
    a AS (${visible(kind, from, filter)}),b AS (${visible(kind, to, filter)})
    SELECT ${kind.key.map((c) => `coalesce(a.${c},b.${c}) AS ${c}`)},${value('a')} AS before,${value('b')} AS after
    FROM a FULL JOIN b ON ${key('a')}=${key('b')}
    WHERE a.${kind.key[0]} IS NULL OR b.${kind.key[0]} IS NULL
    ${kind.same ? `OR a.${kind.same} IS DISTINCT FROM b.${kind.same}` : ''}`,
    kind.key.map((_, c) => keys.map((k) => k[c])),
  );
  return rows;
}

/**
 * The versions of entities of one kind ('moments', 'durations' or 'relationships') at a
 * revision kept as rows, by key (as `differences` gives keys): a Map from keyName to the
 * event, definition or true. Keys the revision does not hold are absent.
 */
export async function valuesAt(client, revisionId, name, keys) {
  const kind = KINDS[name];
  const { rows: found } = await client.query(
    'SELECT timeline_id,number::text FROM oc_revisions WHERE id=$1 AND history_rows',
    [revisionId],
  );
  if (!found[0]) throw new Error('Expected a revision kept as rows.');
  const levels = await lineage(client, found[0].timeline_id, found[0].number);
  const values = new Map();
  const columnsOf = (key) => (kind.key.length === 1 ? [key] : kind.key.map((c) => key[c]));
  for (let i = 0; i < keys.length; i += PAGE) {
    const page = keys.slice(i, i + PAGE).map(columnsOf);
    // The versions the revision's lineage sees of a page of keys (unnested from one text[]
    // per key column), each looked up through the primary keys.
    const { rows } = await client.query(
      `WITH k AS (SELECT * FROM unnest(${kind.key.map((_, c) => `$${c + 1}::text[]`)}) AS k(${kind.key}))
      ${visible(kind, levels, (alias) => `AND (${columns(alias, kind.key)}) IN (SELECT ${kind.key} FROM k)`)}`,
      kind.key.map((_, c) => page.map((key) => key[c])),
    );
    for (const row of rows)
      values.set(
        keyName(
          kind.key.length === 1
            ? row[kind.key[0]]
            : Object.fromEntries(kind.key.map((c) => [c, row[c]])),
        ),
        kind.same ? row[kind.same] : true,
      );
  }
  return values;
}
/** A key as `differences` gives it, as a string to look values up by. */
export const keyName = (key) => (typeof key === 'string' ? key : JSON.stringify(key));
/** The settings of a revision kept as rows, or null when it is not. */
export async function settingsAt(client, revisionId) {
  // The revision by primary key, and its timeline's settings version valid at its number.
  const { rows } = await client.query(
    `SELECT s.settings FROM oc_revisions r JOIN oc_history_settings s ON s.timeline_id=r.timeline_id
    AND s.since<=r.number AND (s.until IS NULL OR s.until>r.number) WHERE r.id=$1 AND r.history_rows`,
    [revisionId],
  );
  return rows[0]?.settings ?? null;
}
