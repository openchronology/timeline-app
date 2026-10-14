// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// A timeline written in one go (created, imported, forked) has its index tables' statistics
// refreshed before the write returns (for a large fork, before its index is ready), so the
// next request plans with it counted: a lookup by ID uses the ID's index, not any index that
// starts with the timeline (#139).
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import pg from 'pg';
import { PostgresStore } from '../server/store.mjs';
import { Versioning } from '../server/versioning.mjs';
import { setEntryLimit } from '../dist/core.mjs';
import { generateTimeline } from '../bench/generate.mjs';
if (!process.env.DATABASE_URL) throw new Error('Use a dedicated PostgreSQL test database.');
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL }),
  store = new PostgresStore(pool),
  versions = new Versioning(store);
const user = randomUUID(),
  created = [];
/** When each index table was last analyzed (manually, not by autovacuum). */
const analyzed = async () =>
  Object.fromEntries(
    (
      await pool.query(
        `SELECT relname,last_analyze FROM pg_stat_user_tables WHERE relname IN
        ('oc_moments','oc_nodes','oc_duration_nodes','oc_edge_nodes','oc_relationships','oc_entity_search')`,
      )
    ).rows.map((r) => [r.relname, r.last_analyze?.getTime() ?? 0]),
  );
/** The index a lookup of one entity by ID uses. */
async function lookupIndex(sql, params) {
  const { rows } = await pool.query(`EXPLAIN (FORMAT JSON) ${sql}`, params);
  const indexes = [];
  const walk = (plan) => {
    if (plan['Index Name']) indexes.push(plan['Index Name']);
    for (const child of plan.Plans ?? []) walk(child);
  };
  walk(rows[0]['QUERY PLAN'][0].Plan);
  return indexes;
}
try {
  await pool.query(await readFile(new URL('../server/schema.sql', import.meta.url), 'utf8'));
  await pool.query(
    'INSERT INTO oc_users(id,username,email_verified_at,quota_bypass) VALUES($1,$2,now(),true)',
    [user, 'statistics_' + user.slice(0, 8)],
  );
  setEntryLimit(Infinity);
  // Small writes leave statistics to autovacuum.
  let before = await analyzed();
  const small = await store.create(user, generateTimeline(1000));
  created.push(small.id);
  assert.deepEqual(await analyzed(), before, 'a small timeline is not worth analyzing');
  // A large one is analyzed before create returns, and so is a fork of it.
  before = await analyzed();
  const large = await store.create(user, generateTimeline(25000));
  created.push(large.id);
  let after = await analyzed();
  for (const [table, time] of Object.entries(after))
    assert(time > before[table], `${table} analyzed after a large create`);
  before = after;
  const fork = await versions.copy(large.id, user, { revision: large.revision });
  created.push(fork.id);
  // A large copy's index is copied after answering (see fork-preparing-postgres.mjs).
  await store.idle();
  after = await analyzed();
  for (const [table, time] of Object.entries(after))
    assert(time > before[table], `${table} analyzed after a large fork`);
  // So the fork's entities are looked up through their own index.
  const { rows: durations } = await pool.query(
    "SELECT band->>'id' AS id FROM oc_duration_nodes WHERE timeline_id=$1 LIMIT 1",
    [fork.id],
  );
  assert.deepEqual(
    await lookupIndex("SELECT * FROM oc_duration_nodes WHERE timeline_id=$1 AND band->>'id'=$2", [
      fork.id,
      durations[0].id,
    ]),
    ['oc_duration_nodes_duration_id'],
  );
  assert.deepEqual(
    await lookupIndex('SELECT * FROM oc_duration_nodes WHERE timeline_id=$1 AND id=$2', [
      fork.id,
      1,
    ]),
    ['oc_duration_nodes_pkey'],
  );
  assert.deepEqual(
    await lookupIndex('SELECT * FROM oc_moments WHERE timeline_id=$1 AND id=$2', [fork.id, 'm1']),
    ['oc_moments_pkey'],
  );
  console.log(
    'PASS statistics: large timelines written in one go are analyzed before the write returns; their lookups use their own indexes.',
  );
} finally {
  await store.idle();
  for (const id of created.reverse()) {
    await pool.query('DELETE FROM oc_timelines WHERE id=$1', [id]);
    await store.transaction((c) => store.removeHistory(c, id)).catch(() => {});
  }
  await pool.query('DELETE FROM oc_storage_entries WHERE user_id=$1', [user]);
  await pool.query('DELETE FROM oc_users WHERE id=$1', [user]);
  await pool.end();
}
