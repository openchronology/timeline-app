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
 * by c and the retired rows that were live at c (`indexAtSql`).
 *
 * A fork reads through to its source (#145, phase 2): its index is its own rows over each
 * level it reads through to at that level's clock (`oc_timelines.index_bases`, nearest first,
 * and `index_clocks`), where a key it removed is hidden by a `hidden` row of its own
 * (indexReader, removeRows). What forks no longer read is released by oc_release_index in
 * schema.sql. See "Versioned index rows" and "Forks read through" in docs/architecture.md.
 */

/**
 * The tables of a timeline's index, versioned: each has `since` and `hidden` columns, a
 * `_retired` twin and the triggers that fill it (the DO blocks in schema.sql).
 */
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
 * Side effects: the UPDATE locks the timeline row until the transaction ends, so writers of
 * one timeline's index take turns; sets `client.indexWrites` (the store's transaction then
 * checks how many versions were retired, to refresh statistics). Throws when the timeline
 * is missing.
 */
export async function beginIndexWrite(client, timelineId) {
  // Advances the clock and reads the highest pin (empty text when nothing pins the index).
  const { rows } = await client.query(
    `UPDATE oc_timelines SET index_clock=index_clock+1 WHERE id=$1
    RETURNING index_clock::text AS clock,coalesce(index_pinned::text,'') AS pinned`,
    [timelineId],
  );
  if (!rows[0]) throw new Error('Writing the index of a missing timeline.');
  client.indexWrites = true;
  // Transaction-local settings (set_config's third argument) the triggers read: oc.clock is
  // the `since` default of every index table and the clock recorded by updates and
  // retirements; a row is retired only when it belongs to oc.timeline and was written at or
  // before oc.pinned (a pin can see it). They end with the transaction, so a pooled
  // connection never carries them into the next one.
  await client.query(
    "SELECT set_config('oc.clock',$1,true),set_config('oc.timeline',$2,true),set_config('oc.pinned',$3,true)",
    [rows[0].clock, timelineId, rows[0].pinned],
  );
  return rows[0].clock;
}

/**
 * Timeline `timelineId`'s index rows of `table` as they were at clock `clock`, without their
 * version columns: the SQL of a query taking the timeline as $1 and the clock as $2.
 * The live rows written by then (a null `since`, before versioning, counts as 0) and the
 * retired versions live then (since <= clock < until), each as one jsonb `row`. It reads the
 * timeline's own rows only, not what it reads through to; the tests compare versions with it.
 */
export function indexAtSql(table) {
  const strip = (alias) => `to_jsonb(${alias})-'since'-'until'-'timeline_id'`;
  return `SELECT ${strip('l')} AS row FROM ${table} l
    WHERE l.timeline_id=$1 AND coalesce(l.since,0)<=$2
    UNION ALL SELECT ${strip('r')} FROM ${table}_retired r
    WHERE r.timeline_id=$1 AND coalesce(r.since,0)<=$2 AND r.until>$2`;
}

/**
 * How many levels a fork reads through at most: a fork of one that deep copies what it would
 * read of the nearest (copyLevel) and reads through to the rest.
 */
export const INDEX_LEVELS = 4;
/**
 * Each table's key, after the timeline: its primary key (timeline_id first), by which a
 * nearer level's version of a row shadows a deeper one's.
 */
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
  // A promise shared by concurrent callers; reset when the query fails, so a later call
  // tries again rather than reusing the failure.
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
 * The result also has `lookup` (one row by key, below) and `depth`. Throws when the lineage
 * holds anything but UUIDs and integers, since they are written into SQL.
 */
export async function indexReader(client, t) {
  const bases = t.index_bases ?? [],
    clocks = (t.index_clocks ?? []).map(String);
  // The levels become SQL literals below: refuse anything but UUIDs and digits, so a
  // corrupted lineage can never inject SQL.
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
  /*
   * The union a fork reads, one branch per source of rows:
   *   1. its own rows, not hidden;
   *   2. per level L (nearest first): L's live rows written by L's clock, and L's retired
   *      rows live at that clock (since <= clock < until), neither hidden, and neither
   *      shadowed: no own row (hidden ones included: they are what hides) and no version at
   *      a nearer level has the key.
   * `shadows` accumulates the shadowing conditions level by level. A retired row's hidden
   * flag can be null (retired before the column existed), so it is tested IS NOT TRUE.
   * Each branch reads its rows by (timeline_id, …) on the table's or twin's indexes.
   */
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
    // One scalar subquery per place a version can be: the fork's own rows, then per level
    // its live row at the level's clock and its retired version live then (cast to the
    // live table's row type, without `until`). A key has at most one version per place at
    // a clock, as versions of one key at one level never overlap.
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
    // Evaluated once (OFFSET 0), stopping at the first version found: coalesce evaluates
    // its arguments in order and only until one is not null. Nothing found leaves a null
    // row (its key null), and a hidden first version means the fork removed it: no row.
    return `(SELECT (v).* FROM (SELECT coalesce(${versions.join(',')}) AS v OFFSET 0) found
      WHERE (v).${KEYS[table][0]} IS NOT NULL AND NOT (v).hidden)`;
  };
  // How many levels the timeline reads through: 0 for one that holds its whole index.
  rows.depth = bases.length;
  return rows;
}

/**
 * A timeline's lineage (index_bases and index_clocks), for indexReader: read by primary key,
 * without locking. Throws when the timeline is missing.
 */
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
 * Must follow beginIndexWrite for `t` in the same transaction: the delete retires rows a pin
 * can see (the delete trigger), and the hidden copies take the transaction's clock.
 */
export async function removeRows(client, t, rows, table, types, keys) {
  const key = KEYS[table];
  const unnest = `unnest(${types.map((type, i) => `$${i + 2}::${type}[]`)}) k(${key})`;
  const same = key.map((k) => `x.${k}=k.${k}`).join(' AND ');
  // The timeline's own rows with these keys, found by primary key from the unnested arrays.
  await client.query(`DELETE FROM ${table} x USING ${unnest} WHERE x.timeline_id=$1 AND ${same}`, [
    t.id,
    ...keys,
  ]);
  if (!rows.depth) return;
  const columns = (await indexColumns(client))[table].written;
  // In a fork: for each key, the row it still sees now that its own is gone (the first
  // version going down its levels, if any and not hidden already), inserted as its own
  // with hidden=true. A key nothing below holds gets no row. The copy keeps every column,
  // so it satisfies the table's constraints.
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

/**
 * Copies into timeline `id`'s own rows the rows of level `base` at clock `clock` whose key it
 * has no row of its own for (hidden rows too, which hide what deeper levels have): what it
 * reads of that level, so it can then stop reading through to it. Returns how many rows of
 * each table it copied. Must follow beginIndexWrite for `id`.
 * Called level by level from the nearest (takeLevels in store.mjs): the rows a nearer level
 * gave are then the timeline's own, and so shadow the same keys of deeper levels here.
 */
export async function copyLevel(client, id, base, clock) {
  const columns = await indexColumns(client);
  const copied = {};
  for (const table of VERSIONED_TABLES) {
    const written = columns[table].written.join(',');
    const at = `timeline_id=$2 AND coalesce(since,0)<=$3`;
    // The level's rows at the clock (live ones written by then, and retired ones live then),
    // minus keys the timeline already has a row of its own for (checked by primary key),
    // inserted as its own. `since` takes this transaction's clock.
    const { rowCount } = await client.query(
      `INSERT INTO ${table}(timeline_id,${written},hidden) SELECT $1,${written},hidden FROM (
        SELECT ${written},hidden FROM ${table} WHERE ${at}
        UNION ALL SELECT ${written},coalesce(hidden,false) FROM ${table}_retired WHERE ${at} AND until>$3) x
      WHERE NOT EXISTS(SELECT 1 FROM ${table} v WHERE v.timeline_id=$1
        AND ${KEYS[table].map((k) => `v.${k}=x.${k}`).join(' AND ')})`,
      [id, base, clock],
    );
    copied[table] = rowCount;
  }
  return copied;
}
