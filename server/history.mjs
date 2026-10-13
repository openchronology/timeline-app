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
 */
import { validateDocument } from '../dist/core.mjs';

/** How many entities one statement compares: no statement grows with the timeline. */
const PAGE = 20000;
/** How many levels a revision may read through: a copy past that starts its own history. */
const SHARED_LEVELS = 4;
/** After every revision number: the versions current at a level. */
const CURRENT = '9223372036854775807';
const LINK = ['a_kind', 'a_id', 'b_kind', 'b_id'];
/**
 * Each kind of entity: its history table, its key, its stored value, and its live rows (the
 * saved timeline's index) as the same columns, with the expressions that key them.
 */
const KINDS = {
  moments: {
    table: 'oc_history_moments',
    key: ['id'],
    values: ['time', 'event'],
    types: ['mpq', 'jsonb'],
    same: 'event',
    live: 'SELECT id,time,event FROM oc_moments WHERE timeline_id=$1',
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
    live: "SELECT band->>'id' AS id,definition FROM oc_duration_nodes WHERE timeline_id=$1 AND definition IS NOT NULL",
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
    live: `SELECT ${LINK} FROM oc_relationships WHERE timeline_id=$1`,
    liveKey: LINK,
    bytes: 'octet_length(a_id)+octet_length(b_id)+32',
    overrides: 'oc_history_relationship_overrides',
    overrideBytes: 'octet_length(a_id)+octet_length(b_id)+32',
  },
};
const TABLES = [...Object.values(KINDS).map((k) => k.table), 'oc_history_settings'];
const columns = (alias, names) => names.map((name) => `${alias}.${name}`).join(',');
/**
 * The live row with the key of the row `alias`, if any, as a subquery looked up by that key.
 * OFFSET 0 keeps it a lookup per key: otherwise the planner may turn it into a join, and
 * right after a timeline is written (a fork, an import) its statistics can still count the
 * timeline's live rows as none, so the join would read all of them for every key.
 */
const liveAt = (kind, alias) =>
  `(${kind.live} AND (${kind.liveKey})=(${columns(alias, kind.key)})${fence(kind)})`;
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
 */
export async function recordHistory(client, timelineId, number, settings, touched = null) {
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
/** Records the entities of `kinds` (see recordHistory); returns the bytes written. */
async function recordEntities(client, kinds, timelineId, number, starting, touched) {
  const levels = await lineage(client, timelineId, CURRENT);
  let bytes = 0,
    written = 0;
  for (const [name, kind] of Object.entries(kinds)) {
    // History starting at this save copies everything, not only what the save changed.
    const keys = starting ? null : touched?.[name];
    const result = keys
      ? await recordKeys(client, kind, timelineId, number, keys.map(keyOf(kind)), levels)
      : await recordAll(client, kind, timelineId, number, starting, levels);
    bytes += result.bytes;
    written += result.count;
  }
  // A timeline's first versions can outnumber what the planner last saw of these tables;
  // later saves look versions up by key, which needs current statistics.
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
const reference = (ref) => ('moment' in ref ? ['moment', ref.moment] : ['duration', ref.duration]);
/** Each kind, read from its staged rows instead of its live ones. */
const STAGED_KINDS = Object.fromEntries(
  Object.entries(KINDS).map(([name, kind]) => {
    const staged = STAGED[name].columns.slice(1);
    return [
      name,
      {
        ...kind,
        live: `SELECT ${staged} FROM ${STAGED[name].table} WHERE timeline_id=$1`,
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
  const base = await client.query('SELECT 1 FROM oc_revisions WHERE id=$1 AND history_rows', [
    baseRevisionId,
  ]);
  if (!base.rows.length) return null;
  await client.query('INSERT INTO oc_history_bases(timeline_id,base_revision_id) VALUES($1,$2)', [
    revisionId,
    baseRevisionId,
  ]);
  for (const stage of Object.values(STAGED)) {
    await client.query(
      `CREATE TEMPORARY TABLE IF NOT EXISTS ${stage.table}(${stage.definition}) ON COMMIT DROP`,
    );
    const items = stage.items(document);
    for (let i = 0; i < items.length; i += STAGE_BATCH)
      await client.query(
        `INSERT INTO ${stage.table}(${stage.columns}) SELECT $1,${stage.values}
        FROM jsonb_array_elements($2::jsonb) e`,
        [revisionId, JSON.stringify(items.slice(i, i + STAGE_BATCH))],
      );
  }
  // Statistics of their keys, so comparisons with the base read the staged rows by key.
  await client.query(
    `ANALYZE ${Object.entries(STAGED).map(([name, stage]) => `${stage.table}(timeline_id,${KINDS[name].key})`)}`,
  );
  const bytes =
    (await recordSettings(client, revisionId, 1, settingsOf(document))) +
    (await recordEntities(client, STAGED_KINDS, revisionId, 1, false, null));
  for (const stage of Object.values(STAGED))
    await client.query(`DELETE FROM ${stage.table} WHERE timeline_id=$1`, [revisionId]);
  return bytes;
}

const keyOf = (kind) => (value) =>
  kind.key.length === 1 ? [value] : kind.key.map((column) => value[column]);

/**
 * The levels revision `number` of a timeline reads, as [timeline id, revision number]: the
 * timeline at that number, then the revision it was copied from, and so on.
 */
async function lineage(client, timelineId, number) {
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

/** The versions a level sees (see lineage): its current ones, or those of a revision. */
const seen = (alias, [id, n]) =>
  `${alias}.timeline_id='${id}' AND ${alias}.since<=${n} AND ${
    n === CURRENT ? `${alias}.until IS NULL` : `(${alias}.until IS NULL OR ${alias}.until>${n})`
  }`;

/**
 * The versions of a kind that `levels` see (see lineage), as its key and value columns:
 * each entity from the first level that saved it, unless it removed it there. `filter`
 * narrows the versions and overrides read: SQL given their alias.
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

async function recordSettings(client, timelineId, number, settings) {
  const value = JSON.stringify(settings);
  await client.query(
    `UPDATE oc_history_settings SET until=$2 WHERE timeline_id=$1 AND until IS NULL
    AND settings IS DISTINCT FROM $3::jsonb`,
    [timelineId, number, value],
  );
  const { rows } = await client.query(
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
 */
async function recordKeys(client, kind, timelineId, number, keys, levels) {
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
    await client.query(
      `WITH ${k} UPDATE ${kind.table} h SET until=$2 FROM k
      WHERE h.timeline_id=$1 AND h.until IS NULL AND ${key('h')}=${key('k')}
      AND NOT EXISTS(SELECT 1 FROM ${liveAt(kind, 'h')} l
        ${kind.same ? `WHERE l.${kind.same}=h.${kind.same}` : ''})`,
      params,
    );
    if (copy) {
      // What the copy read through to before this save, compared with what it holds now.
      const inherited = visible(kind, levels.slice(1), (alias) => `AND ${key(alias)}=${key('k')}`);
      const present = (alias) => `(${alias}.${kind.key[0]} IS NOT NULL)`;
      const { rows } = await client.query(
        `WITH ${k},added AS (
          INSERT INTO ${kind.overrides}(timeline_id,${kind.key},since)
          SELECT $1,${columns('k', kind.key)},$2 FROM k
          LEFT JOIN LATERAL ${liveAt(kind, 'k')} l ON true
          LEFT JOIN LATERAL (${inherited}${fence(kind)}) i ON true
          WHERE NOT EXISTS(${own('k')}) AND (${present('l')}<>${present('i')}
            ${kind.same ? `OR l.${kind.same} IS DISTINCT FROM i.${kind.same}` : ''})
          RETURNING ${kind.overrideBytes} AS bytes
        ) SELECT coalesce(sum(bytes),0) AS bytes FROM added`,
        params,
      );
      bytes += Number(rows[0].bytes);
    }
    const { rows } = await client.query(
      `WITH ${k},added AS (
        INSERT INTO ${kind.table}(timeline_id,${kind.key},since${kind.values.map((v) => ',' + v).join('')})
        SELECT $1,${columns('l', kind.key)},$2${kind.values.map((v) => ',l.' + v).join('')}
        FROM k CROSS JOIN LATERAL ${liveAt(kind, 'k')} l
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
 * entities are copied as they are, without looking for versions the planner cannot yet
 * estimate.
 */
async function recordAll(client, kind, timelineId, number, starting, levels) {
  const total = { bytes: 0, count: 0 };
  const key = (alias) => `(${columns(alias, kind.key)})`;
  const after = (alias, cursor) =>
    cursor ? `AND ${key(alias)}>(${kind.key.map((_, c) => `$${c + 2}`)})` : '';
  const pages = [
    (cursor) =>
      `SELECT ${columns('l', kind.key)} FROM (${kind.live}) l WHERE true ${after('l', cursor)}
      ORDER BY ${kind.key} LIMIT ${PAGE}`,
    ...(starting
      ? []
      : levels.map(
          ([id, n]) =>
            (cursor) =>
              `SELECT ${columns('h', kind.key)} FROM ${kind.table} h WHERE ${seen('h', [id, n])}
              AND NOT EXISTS(SELECT 1 FROM (${kind.live}) l WHERE ${key('l')}=${key('h')})
              ${after('h', cursor)} ORDER BY ${kind.key} LIMIT ${PAGE}`,
        )),
  ];
  for (const page of pages) {
    let cursor = null;
    for (;;) {
      const { rows } = await client.query(page(cursor), [timelineId, ...(cursor ?? [])]);
      if (!rows.length) break;
      const keys = rows.map((row) => kind.key.map((column) => row[column]));
      const result = starting
        ? await copyKeys(client, kind, timelineId, number, keys)
        : await recordKeys(client, kind, timelineId, number, keys, levels);
      total.bytes += result.bytes;
      total.count += result.count;
      if (rows.length < PAGE) break;
      cursor = keys.at(-1);
    }
  }
  return total;
}
/** Live entities as their first versions. */
async function copyKeys(client, kind, timelineId, number, keys) {
  const { rows } = await client.query(
    `WITH added AS (
      INSERT INTO ${kind.table}(timeline_id,${kind.key},since${kind.values.map((v) => ',' + v).join('')})
      SELECT $1,${columns('l', kind.key)},$2${kind.values.map((v) => ',l.' + v).join('')}
      FROM unnest(${kind.key.map((_, c) => `$${c + 3}::text[]`)}) AS k(${kind.key})
      CROSS JOIN LATERAL ${liveAt(kind, 'k')} l
      RETURNING ${kind.bytes} AS bytes
    ) SELECT coalesce(sum(bytes),0) AS bytes,count(*) AS count FROM added`,
    [timelineId, number, ...kind.key.map((_, c) => keys.map((key) => key[c]))],
  );
  return { bytes: Number(rows[0].bytes), count: Number(rows[0].count) };
}

/**
 * Starts history as rows for every timeline saved before it was kept so (when migrating):
 * their state at their current revision, copied in the database. Returns how many started.
 */
export async function startHistory(client) {
  const starting = 'JOIN oc_timelines t ON t.id=x.timeline_id WHERE t.history_since IS NULL';
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
    FROM oc_timelines t WHERE t.history_since IS NULL ON CONFLICT DO NOTHING`,
  );
  const { rowCount } = await client.query(
    'UPDATE oc_timelines SET history_since=revision WHERE history_since IS NULL',
  );
  if (rowCount) await client.query(`ANALYZE ${TABLES.join(',')}`);
  return rowCount;
}

/** Revision `number` of a timeline kept as rows, as a document. */
export async function historyDocument(client, timelineId, number) {
  const settings = await client.query(
    `SELECT settings FROM oc_history_settings
    WHERE timeline_id=$1 AND since<=$2 AND (until IS NULL OR until>$2)`,
    [timelineId, number],
  );
  if (!settings.rows[0]) return null;
  const levels = await lineage(client, timelineId, String(number));
  const read = (kind, order = '') =>
    client.query(`SELECT * FROM (${visible(KINDS[kind], levels)}) v ${order}`);
  const events = await read('moments', 'ORDER BY time,id COLLATE "C"');
  const durations = await read('durations', 'ORDER BY id COLLATE "C"');
  const relationships = await read('relationships');
  return validateDocument({
    ...settings.rows[0].settings,
    events: events.rows.map((r) => r.event),
    ...(durations.rows.length ? { durations: durations.rows.map((r) => r.definition) } : {}),
    ...(relationships.rows.length
      ? {
          relationships: relationships.rows.map((r) => ({
            a: { [r.a_kind]: r.a_id },
            b: { [r.b_kind]: r.b_id },
          })),
        }
      : {}),
  });
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
  const head = await client.query(
    `SELECT 1 FROM oc_timelines t JOIN oc_revisions r ON r.id=t.head_revision_id
    WHERE t.id=$1 AND r.history_rows`,
    [timelineId],
  );
  for (const table of TABLES)
    await client.query(
      `DELETE FROM ${table} h WHERE h.timeline_id=$1 AND (h.until IS NOT NULL OR NOT $2)
      AND NOT EXISTS(SELECT 1 FROM oc_revisions r WHERE r.timeline_id=$1 AND r.history_rows
        AND r.number>=h.since AND (h.until IS NULL OR r.number<h.until))`,
      [timelineId, head.rows.length > 0],
    );
  for (const kind of Object.values(KINDS))
    await client.query(
      `DELETE FROM ${kind.overrides} o WHERE o.timeline_id=$1 AND NOT EXISTS(
        SELECT 1 FROM oc_revisions r WHERE r.timeline_id=$1 AND r.history_rows AND r.number>=o.since)`,
      [timelineId],
    );
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
async function* comparePages(client, from, to) {
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
 */
async function candidates(client, kind, from, to, cursor) {
  const i = from.findIndex(([id]) => to.some(([other]) => other === id));
  const j = i < 0 ? -1 : to.findIndex(([id]) => id === from[i][0]);
  const above = i < 0 ? [...from, ...to] : [...from.slice(0, i), ...to.slice(0, j)];
  const branches = above.flatMap(([id, n]) => [
    `SELECT ${kind.key} FROM ${kind.table} WHERE timeline_id='${id}' AND since<=${n}`,
    `SELECT ${kind.key} FROM ${kind.overrides} WHERE timeline_id='${id}' AND since<=${n}`,
  ]);
  if (i >= 0 && from[i][1] !== to[j][1]) {
    const [lo, hi] = [BigInt(from[i][1]), BigInt(to[j][1])].sort((x, y) => (x < y ? -1 : 1));
    const between = (column) => `(${column}>${lo} AND ${column}<=${hi})`;
    branches.push(
      `SELECT ${kind.key} FROM ${kind.table} WHERE timeline_id='${from[i][0]}'
      AND (${between('since')} OR ${between('until')})`,
      `SELECT ${kind.key} FROM ${kind.overrides} WHERE timeline_id='${from[i][0]}' AND ${between('since')}`,
    );
  }
  if (!branches.length) return [];
  const after = cursor ? `AND (${kind.key})>(${kind.key.map((_, c) => `$${c + 1}`)})` : '';
  const { rows } = await client.query(
    `SELECT DISTINCT ${kind.key} FROM (${branches
      .map((branch) => `(${branch} ${after} ORDER BY ${kind.key} LIMIT ${PAGE})`)
      .join(' UNION ALL ')}) c ORDER BY ${kind.key} LIMIT ${PAGE}`,
    cursor ?? [],
  );
  return rows.map((row) => kind.key.map((column) => row[column]));
}
/** The keys whose versions differ between two lineages, with both versions. */
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
