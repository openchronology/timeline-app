// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
/**
 * Versioned index rows (#145). A timeline's index (its live rows: moments, tree nodes,
 * relationships, search rows) is changed in place by saves. So that a fork can later read
 * its source's index as it was when forked instead of copying it, each timeline's index has
 * a clock (`oc_timelines.index_clock`), advanced by every transaction that writes the index,
 * and each live row records the clock that wrote it (`since`; null for rows written before
 * versioning, which count as written at 0). A fork pins the clock it reads its source at
 * (`index_pinned`: the highest pin). Database triggers then copy a row a pin can see into
 * its table's `_retired` twin, ended at the clock (`until`), before changing or deleting it;
 * rows nothing pins change in place as before. The index at clock c is the live rows written
 * by c and the retired rows that were live at c (`indexAt`).
 */

/** The tables of a timeline's index, versioned. */
export const VERSIONED_TABLES = [
  'oc_moments',
  'oc_nodes',
  'oc_duration_nodes',
  'oc_edge_nodes',
  'oc_relationships',
  'oc_entity_search',
];

/**
 * Starts writing timeline `timelineId`'s index in the transaction of `client`: advances its
 * clock and has the rows written until the transaction ends (or the next call) record it.
 * Must precede any change to the index: inserts made without it fail. Returns the clock.
 */
export async function beginIndexWrite(client, timelineId) {
  const { rows } = await client.query(
    `UPDATE oc_timelines SET index_clock=index_clock+1 WHERE id=$1
    RETURNING index_clock::text AS clock,coalesce(index_pinned::text,'') AS pinned`,
    [timelineId],
  );
  if (!rows[0]) throw new Error('Writing the index of a missing timeline.');
  await client.query(
    "SELECT set_config('oc.clock',$1,true),set_config('oc.timeline',$2,true),set_config('oc.pinned',$3,true)",
    [rows[0].clock, timelineId, rows[0].pinned],
  );
  return rows[0].clock;
}

/**
 * Timeline `timelineId`'s index rows of `table` as they were at clock `clock`, without their
 * version columns: the SQL of a query taking the timeline as $1 and the clock as $2.
 */
export function indexAtSql(table) {
  const strip = (alias) => `to_jsonb(${alias})-'since'-'until'-'timeline_id'`;
  return `SELECT ${strip('l')} AS row FROM ${table} l
    WHERE l.timeline_id=$1 AND coalesce(l.since,0)<=$2
    UNION ALL SELECT ${strip('r')} FROM ${table}_retired r
    WHERE r.timeline_id=$1 AND coalesce(r.since,0)<=$2 AND r.until>$2`;
}
