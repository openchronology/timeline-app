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
  client.indexWrites = true;
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

/** How many levels a fork reads through at most: a fork of one that deep copies instead. */
export const INDEX_LEVELS = 4;
/** Each table's key, after the timeline. */
const KEYS = {
  oc_moments: ['id'],
  oc_nodes: ['id'],
  oc_duration_nodes: ['id'],
  oc_edge_nodes: ['id'],
  oc_relationships: ['a_kind', 'a_id', 'b_kind', 'b_id'],
  oc_entity_search: ['kind', 'entity_id'],
};
let tableColumns = null;
/**
 * Each index table's columns in order (`names`), and those a copy of a row writes (`written`:
 * not the timeline, version, hidden flag or generated ones). Read once per process.
 */
function indexColumns(client) {
  tableColumns ??= client
    .query(
      `SELECT table_name,array_agg(column_name::text ORDER BY ordinal_position) AS names,
      array_agg(column_name::text ORDER BY ordinal_position) FILTER (WHERE is_generated='NEVER'
        AND column_name NOT IN ('timeline_id','since','hidden')) AS written
      FROM information_schema.columns WHERE table_schema=current_schema() AND table_name=ANY($1)
      GROUP BY table_name`,
      [VERSIONED_TABLES],
    )
    .then(({ rows }) => Object.fromEntries(rows.map((r) => [r.table_name, r])))
    .catch((error) => {
      tableColumns = null;
      throw error;
    });
  return tableColumns;
}
const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
/**
 * How to read timeline `t`'s index (a row with index_bases and index_clocks): a function of
 * a table, giving SQL for the rows of that table the timeline sees, with its ID as `tid`
 * ($1 unless given). A timeline that reads through to nothing sees its own rows. A fork sees
 * its own rows that are not hidden, then those of each level it reads through to at that
 * level's clock (the live version, or the version retired since) whose key no nearer level
 * has a version of. Its levels are written into the SQL (they are IDs and integers read from
 * the database), so it plans as written. `depth` is how many levels it reads through. A
 * query reading most of the rows, rather than looking some up, passes { scan: true } (in a
 * transaction, whose hash memory this raises; see below).
 * `client` is the one to query with: a transaction's, or the pool.
 */
export async function indexReader(client, t) {
  const bases = t.index_bases ?? [],
    clocks = (t.index_clocks ?? []).map(String);
  if (bases.some((b) => !uuid.test(b)) || clocks.some((c) => !/^\d+$/.test(c)))
    throw new Error('Invalid index lineage');
  const columns = bases.length ? await indexColumns(client) : null;
  // For the rest of this transaction: reading through levels looks costly enough to the
  // planner to compile its queries (JIT), which takes far longer than running them; and a
  // scan hashes the keys of nearer levels, which the planner otherwise does only while it
  // expects them to fit in work_mem, beyond that comparing every row with all of them.
  if (bases.length && typeof client.release === 'function')
    await client.query(
      "SELECT set_config('jit','off',true),set_config('hash_mem_multiplier','64',true)",
    );
  const rows = (table, tid = '$1', { scan = false } = {}) => {
    if (!bases.length) return `(SELECT * FROM ${table} WHERE timeline_id=${tid})`;
    const names = columns[table].names.map((c) => 'x.' + c).join(',');
    const at = (alias, level) =>
      `${alias}.timeline_id='${bases[level]}'::uuid AND coalesce(${alias}.since,0)<=${clocks[level]}`;
    // Rows (v) of a nearer level with the key of row x: looked up row by row, or for a scan,
    // their keys gathered once and hashed (they are the fewer rows).
    const shadow = (from) =>
      scan
        ? `(${KEYS[table].map((k) => 'x.' + k)}) NOT IN (SELECT ${KEYS[table].map((k) => 'v.' + k)} FROM ${from})`
        : `NOT EXISTS(SELECT 1 FROM ${from} AND ${KEYS[table].map((k) => `v.${k}=x.${k}`).join(' AND ')})`;
    const branches = [
      `SELECT ${names} FROM ${table} x WHERE x.timeline_id=${tid} AND NOT x.hidden`,
    ];
    let shadows = shadow(`${table} v WHERE v.timeline_id=${tid}`);
    for (let level = 0; level < bases.length; level++) {
      branches.push(
        `SELECT ${names} FROM ${table} x WHERE ${at('x', level)} AND NOT x.hidden AND ${shadows}`,
        `SELECT ${names} FROM ${table}_retired x WHERE ${at('x', level)} AND x.until>${clocks[level]}
        AND x.hidden IS NOT TRUE AND ${shadows}`,
      );
      shadows += ` AND ${shadow(`${table} v WHERE ${at('v', level)}`)}
        AND ${shadow(`${table}_retired v WHERE ${at('v', level)} AND v.until>${clocks[level]}`)}`;
    }
    return `(${branches.join('\n      UNION ALL ')})`;
  };
  /**
   * The row of `table` the timeline sees with key `key` (SQL per key column), as a subquery
   * of at most one row: its first version going down the levels, unless that is hidden. One
   * lookup per level until found, rather than a check of nearer levels for every row.
   */
  rows.lookup = (table, key, tid = '$1') => {
    const same = (alias) => KEYS[table].map((k, i) => `${alias}.${k}=${key[i]}`).join(' AND ');
    if (!bases.length)
      return `(SELECT * FROM ${table} x WHERE x.timeline_id=${tid} AND ${same('x')} OFFSET 0)`;
    const names = columns[table].names.map((c) => 'x.' + c).join(',');
    // In the order of the table's key (and its retired twin's), so that index is the one
    // used even when statistics have yet to count the timeline (then any index starting
    // with it looks as good, and one that does not lead with the key reads all its rows).
    const inOrder = (retired) =>
      ` ORDER BY ${['timeline_id', ...KEYS[table], ...(retired ? ['until'] : [])].map((c) => 'x.' + c)} LIMIT 1`;
    const versions = [
      `(SELECT x FROM ${table} x WHERE x.timeline_id=${tid} AND ${same('x')}${inOrder(false)})`,
    ];
    bases.forEach((base, level) => {
      const at = `x.timeline_id='${base}'::uuid AND ${same('x')} AND coalesce(x.since,0)<=${clocks[level]}`;
      versions.push(
        `(SELECT x FROM ${table} x WHERE ${at}${inOrder(false)})`,
        `(SELECT ROW(${names})::${table} FROM ${table}_retired x WHERE ${at} AND x.until>${clocks[level]}${inOrder(true)})`,
      );
    });
    // Evaluated once (OFFSET 0), stopping at the first version found.
    return `(SELECT (v).* FROM (SELECT coalesce(${versions.join(',')}) AS v OFFSET 0) found
      WHERE (v).${KEYS[table][0]} IS NOT NULL AND NOT (v).hidden)`;
  };
  rows.depth = bases.length;
  return rows;
}

/** A timeline's lineage (index_bases and index_clocks), for indexReader. */
export async function lineageOf(client, id) {
  const { rows } = await client.query(
    'SELECT id,index_bases,index_clocks FROM oc_timelines WHERE id=$1',
    [id],
  );
  if (!rows[0]) throw new Error('Reading the index of a missing timeline.');
  return rows[0];
}

/**
 * Removes the rows of `table` with keys `keys` (one array per key column, of SQL `types`)
 * from timeline `t`'s index (read by `rows`, its indexReader). A fork hides what it reads
 * through to with rows of its own: hidden copies of them.
 */
export async function removeRows(client, t, rows, table, types, keys) {
  const key = KEYS[table];
  const unnest = `unnest(${types.map((type, i) => `$${i + 2}::${type}[]`)}) k(${key})`;
  const same = key.map((k) => `x.${k}=k.${k}`).join(' AND ');
  await client.query(`DELETE FROM ${table} x USING ${unnest} WHERE x.timeline_id=$1 AND ${same}`, [
    t.id,
    ...keys,
  ]);
  if (!rows.depth) return;
  const columns = (await indexColumns(client))[table].written;
  await client.query(
    `INSERT INTO ${table}(timeline_id,${columns},hidden)
    SELECT $1,${columns.map((c) => 'x.' + c)},true FROM ${unnest}
    CROSS JOIN LATERAL ${rows.lookup(
      table,
      key.map((k) => 'k.' + k),
    )} x`,
    [t.id, ...keys],
  );
}
