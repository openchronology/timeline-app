// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// A save reads the tree nodes it needs in one query (PersistentTree.prefetch, the trees'
// `path` in server/avl.mjs): the nodes on the paths towards its keys and their children,
// with the keys descending together. Walking to each key afterwards, as an insertion or
// removal does, must find every node already read: on a timeline, and on a fork reading
// through to it. Keys that land on the same nodes are read once.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import pg from 'pg';
import { PostgresStore } from '../server/store.mjs';
import { Versioning } from '../server/versioning.mjs';
import { MOMENT_TREE, INTERVAL_TREE, PersistentTree } from '../server/avl.mjs';
import { indexReader, lineageOf } from '../server/index-versions.mjs';
import { validateDocument } from '../dist/core.mjs';
if (!process.env.DATABASE_URL) throw new Error('Use a dedicated PostgreSQL test database.');
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL }),
  store = new PostgresStore(pool),
  versions = new Versioning(store);
const owner = randomUUID(),
  // An administrator, who may fork the owner's private timeline.
  forker = randomUUID(),
  timelines = [];
/** A client counting the queries made through it. */
const counting = (client) => {
  const counted = { queries: 0, query: (...args) => (counted.queries++, client.query(...args)) };
  return counted;
};
/** Prefetches `keys` into a fresh tree of `table`, then walks to each: no query may follow. */
async function check(name, id, spec, table, root, keys) {
  const t = (await pool.query('SELECT * FROM oc_timelines WHERE id=$1', [id])).rows[0];
  const client = counting(pool);
  const rows = await indexReader(pool, await lineageOf(pool, id));
  const tree = new PersistentTree(client, spec, table, t, t[root], rows);
  await tree.prefetch(keys);
  assert.equal(client.queries, 1, `${name}: one query`);
  const read = tree.nodes.size;
  for (const key of keys) {
    let node = await tree.get(tree.root);
    for (;;) {
      for (const child of [node.left, node.right]) if (child !== null) await tree.get(child);
      const c = spec.compare(key, node);
      if (c === 0 || (c < 0 ? node.left : node.right) === null) break;
      node = await tree.get(c < 0 ? node.left : node.right);
    }
  }
  assert.equal(client.queries, 1, `${name}: every node on the paths and their children were read`);
  return read;
}
try {
  await pool.query(await readFile(new URL('../server/schema.sql', import.meta.url), 'utf8'));
  await pool.query('INSERT INTO oc_users(id,username,quota_bypass) VALUES($1,$2,true)', [
    owner,
    'paths_' + owner.slice(0, 8),
  ]);
  await pool.query(
    'INSERT INTO oc_users(id,username,quota_bypass,is_admin) VALUES($1,$2,true,true)',
    [forker, 'paths_' + forker.slice(0, 8)],
  );
  const document = validateDocument({
    format: 'openchronology',
    version: 1,
    title: 'Paths',
    description: '',
    // Several moments share some times (one node holds them all).
    events: Array.from({ length: 3000 }, (_, i) => ({
      id: 'm' + i,
      time: `${Math.floor(i / 3) * 7 + (i % 3 === 2 ? 1 : 0)}/2`,
      metadata: { title: 'Moment ' + i },
    })),
    durations: Array.from({ length: 400 }, (_, i) => ({
      id: 'd' + String(i).padStart(3, '0'),
      start: `${(i * 13) % 900}/1`,
      end: `${((i * 13) % 900) + 20}/1`,
      metadata: { title: 'Duration ' + i },
    })),
  });
  const t = await store.create(owner, document);
  timelines.push(t.id);
  const fork = await versions.copy(t.id, forker, { revision: t.revision });
  timelines.push(fork.id);
  // Existing times and new ones between them, before and after all of them; appended ones.
  const times = [
    ...document.events.filter((_, i) => i % 97 === 0).map((e) => e.time),
    '-5/1',
    '1/3',
    '2000/7',
    '99999/1',
  ];
  const appended = Array.from({ length: 500 }, (_, i) => `${20000 + i}/1`);
  const starts = [
    ...document.durations.filter((_, i) => i % 9 === 0).map((d) => ({ first: d.start, id: d.id })),
    { first: '13/1', id: 'd000' },
    { first: '13/1', id: 'zz' },
    { first: '-1/1', id: 'a' },
    { first: '5000/1', id: 'a' },
  ];
  for (const [name, id] of [
    ['timeline', t.id],
    ['fork', fork.id],
  ]) {
    await check(
      name + ' moments',
      id,
      MOMENT_TREE,
      'oc_nodes',
      'root',
      times.map((time) => ({ time })),
    );
    await check(
      name + ' durations',
      id,
      INTERVAL_TREE,
      'oc_duration_nodes',
      'duration_root',
      starts,
    );
    // Appended keys share their path: about one path's nodes are read, not one per key.
    const read = await check(
      name + ' appended moments',
      id,
      MOMENT_TREE,
      'oc_nodes',
      'root',
      appended.map((time) => ({ time })),
    );
    assert(read < 60, `${name}: appended keys read ${read} nodes`);
  }
  console.log(
    'PASS tree paths: one query reads every node the walks to a save’s keys need, on a timeline and on a fork, and keys sharing a path read it once.',
  );
} finally {
  await store.idle();
  for (const id of timelines.reverse())
    await store.transaction(async (c) => {
      await c.query('DELETE FROM oc_timelines WHERE id=$1', [id]);
      await store.removeHistory(c, id);
    });
  await pool.query('DELETE FROM oc_storage_entries WHERE user_id=ANY($1)', [[owner, forker]]);
  await pool.query('DELETE FROM oc_users WHERE id=ANY($1)', [[owner, forker]]);
  await pool.end();
}
