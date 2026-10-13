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
 */
import { validateDocument } from '../dist/core.mjs';

/** How many entities one statement compares: no statement grows with the timeline. */
const PAGE = 20000;
const LINK = ['a_kind', 'a_id', 'b_kind', 'b_id'];
/**
 * Each kind of entity: its history table, its key, its stored value, and its live rows (the
 * saved timeline's index) as the same columns.
 */
const KINDS = {
  moments: {
    table: 'oc_history_moments',
    key: ['id'],
    values: ['time', 'event'],
    same: 'event',
    live: 'SELECT id,time,event FROM oc_moments WHERE timeline_id=$1',
    bytes: 'octet_length(event::text)',
  },
  durations: {
    table: 'oc_history_durations',
    key: ['id'],
    values: ['definition'],
    same: 'definition',
    live: "SELECT band->>'id' AS id,definition FROM oc_duration_nodes WHERE timeline_id=$1 AND definition IS NOT NULL",
    bytes: 'octet_length(definition::text)',
  },
  relationships: {
    table: 'oc_history_relationships',
    key: LINK,
    values: [],
    same: null,
    live: `SELECT ${LINK} FROM oc_relationships WHERE timeline_id=$1`,
    bytes: 'octet_length(a_id)+octet_length(b_id)+32',
  },
};
const TABLES = [...Object.values(KINDS).map((k) => k.table), 'oc_history_settings'];
const columns = (alias, names) => names.map((name) => `${alias}.${name}`).join(',');

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
  const { rows } = await client.query('SELECT history_since FROM oc_timelines WHERE id=$1', [
    timelineId,
  ]);
  const starting = rows[0].history_since === null;
  if (starting)
    await client.query('UPDATE oc_timelines SET history_since=$2 WHERE id=$1', [
      timelineId,
      number,
    ]);
  let bytes = await recordSettings(client, timelineId, number, settings),
    written = 0;
  for (const [name, kind] of Object.entries(KINDS)) {
    // History starting at this save copies everything, not only what the save changed.
    const keys = starting ? null : touched?.[name];
    const result = keys
      ? await recordKeys(client, kind, timelineId, number, keys.map(keyOf(kind)))
      : await recordAll(client, kind, timelineId, number, starting);
    bytes += result.bytes;
    written += result.count;
  }
  // A timeline's first versions can outnumber what the planner last saw of these tables;
  // later saves look versions up by key, which needs current statistics.
  if (starting && written > PAGE) await client.query(`ANALYZE ${TABLES.join(',')}`);
  return bytes;
}
const keyOf = (kind) => (value) =>
  kind.key.length === 1 ? [value] : kind.key.map((column) => value[column]);

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
 * at `number` unless unchanged, and their live rows without a current version start one.
 */
async function recordKeys(client, kind, timelineId, number, keys) {
  let bytes = 0,
    count = 0;
  for (let i = 0; i < keys.length; i += PAGE) {
    const page = keys.slice(i, i + PAGE);
    const params = [timelineId, number, ...kind.key.map((_, c) => page.map((key) => key[c]))];
    const k = `k AS (SELECT * FROM unnest(${kind.key.map((_, c) => `$${c + 3}::text[]`)}) AS k(${kind.key}))`;
    const live = `live AS (SELECT l.* FROM (${kind.live}) l JOIN k USING (${kind.key}))`;
    const key = (alias) => `(${columns(alias, kind.key)})`;
    await client.query(
      `WITH ${k},${live} UPDATE ${kind.table} h SET until=$2 FROM k
      WHERE h.timeline_id=$1 AND h.until IS NULL AND ${key('h')}=${key('k')}
      AND NOT EXISTS(SELECT 1 FROM live l WHERE ${key('l')}=${key('h')}
        ${kind.same ? `AND l.${kind.same}=h.${kind.same}` : ''})`,
      params,
    );
    const { rows } = await client.query(
      `WITH ${k},${live},added AS (
        INSERT INTO ${kind.table}(timeline_id,${kind.key},since${kind.values.map((v) => ',' + v).join('')})
        SELECT $1,${columns('l', kind.key)},$2${kind.values.map((v) => ',l.' + v).join('')} FROM live l
        WHERE NOT EXISTS(SELECT 1 FROM ${kind.table} h WHERE h.timeline_id=$1 AND h.until IS NULL
          AND ${key('h')}=${key('l')})
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
 * Every entity of a kind, a page of keys at a time: those with a current version, then the
 * live ones without. A timeline starting history has no versions yet: its live entities are
 * copied as they are, without looking for versions the planner cannot yet estimate.
 */
async function recordAll(client, kind, timelineId, number, starting) {
  const total = { bytes: 0, count: 0 };
  const key = (alias) => `(${columns(alias, kind.key)})`;
  const after = (alias, cursor) =>
    cursor ? `AND ${key(alias)}>(${kind.key.map((_, c) => `$${c + 2}`)})` : '';
  const open = (alias) =>
    `SELECT 1 FROM ${kind.table} h WHERE h.timeline_id=$1 AND h.until IS NULL AND ${key('h')}=${key(alias)}`;
  const pages = [
    ...(starting
      ? []
      : [
          (cursor) =>
            `SELECT ${kind.key} FROM ${kind.table} h WHERE h.timeline_id=$1 AND h.until IS NULL
            ${after('h', cursor)} ORDER BY ${kind.key} LIMIT ${PAGE}`,
        ]),
    (cursor) =>
      `SELECT ${columns('l', kind.key)} FROM (${kind.live}) l
      WHERE true ${starting ? '' : `AND NOT EXISTS(${open('l')})`} ${after('l', cursor)}
      ORDER BY ${kind.key} LIMIT ${PAGE}`,
  ];
  for (const page of pages) {
    let cursor = null;
    for (;;) {
      const { rows } = await client.query(page(cursor), [timelineId, ...(cursor ?? [])]);
      if (!rows.length) break;
      const keys = rows.map((row) => kind.key.map((column) => row[column]));
      const result = starting
        ? await copyKeys(client, kind, timelineId, number, keys)
        : await recordKeys(client, kind, timelineId, number, keys);
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
      FROM (${kind.live}) l JOIN unnest(${kind.key.map((_, c) => `$${c + 3}::text[]`)}) AS k(${kind.key})
      USING (${kind.key})
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
  const at = 'timeline_id=$1 AND since<=$2 AND (until IS NULL OR until>$2)';
  const params = [timelineId, number];
  const settings = await client.query(
    `SELECT settings FROM oc_history_settings WHERE ${at}`,
    params,
  );
  if (!settings.rows[0]) return null;
  const events = await client.query(
    `SELECT event FROM oc_history_moments WHERE ${at} ORDER BY time,id COLLATE "C"`,
    params,
  );
  const durations = await client.query(
    `SELECT definition FROM oc_history_durations WHERE ${at} ORDER BY id COLLATE "C"`,
    params,
  );
  const relationships = await client.query(
    `SELECT ${LINK} FROM oc_history_relationships WHERE ${at}`,
    params,
  );
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
 * versions need checking.
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
}
