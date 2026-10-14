// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// Forks a large timeline (timing the answer and when its index is ready), then saves to it
// straight away, and again once statistics are current. Usage: node bench/fork-save.mjs [moments]   (default 200000)
// Needs BENCH_DATABASE_URL: a PostgreSQL database it creates and removes its own data in.
import pg from 'pg';
import { randomUUID } from 'node:crypto';
import { PostgresStore } from '../server/store.mjs';
import { Versioning } from '../server/versioning.mjs';
import { setEntryLimit } from '../dist/core.mjs';
import { generateTimeline } from './generate.mjs';

if (!process.env.BENCH_DATABASE_URL) throw new Error('Set BENCH_DATABASE_URL.');
setEntryLimit(Infinity);
const size = Number(process.argv[2] ?? 200000);
const pool = new pg.Pool({
  connectionString: process.env.BENCH_DATABASE_URL,
  statement_timeout: 30000,
});
const store = new PostgresStore(pool),
  versions = new Versioning(store);
const user = randomUUID(),
  ids = [];
async function time(label, run) {
  const started = performance.now();
  const result = await run();
  const seconds = (performance.now() - started) / 1000;
  console.log(JSON.stringify({ size, label, seconds: Number(seconds.toFixed(2)) }));
  return result;
}
try {
  await pool.query('INSERT INTO oc_users(id,username,quota_bypass) VALUES($1,$2,true)', [
    user,
    'bench_' + user.slice(0, 8),
  ]);
  const document = generateTimeline(size);
  const timeline = await time('create', () => store.create(user, document));
  ids.push(timeline.id);
  const settings = { ...document, events: [], durations: undefined, relationships: undefined };
  // Moves `count` moments from `from` on, each to a new time.
  const edit = (from, count) => ({
    settings,
    changes: document.events.slice(from, from + count).map((e) => ({
      id: e.id,
      event: { ...e, time: e.time + '1', metadata: { ...e.metadata, title: 'Edited' } },
    })),
  });
  const started = performance.now();
  let fork = await time('fork answered', () =>
    versions.copy(timeline.id, user, { revision: timeline.revision }),
  );
  ids.push(fork.id);
  // A large copy's index is copied after answering.
  await store.idle();
  const ready = (performance.now() - started) / 1000;
  console.log(JSON.stringify({ size, label: 'fork ready', seconds: Number(ready.toFixed(2)) }));
  fork = await store.access(fork.id, user);
  fork = await time('save 10 right after forking', () =>
    store.save(fork.id, user, fork.revision, undefined, edit(100, 10)),
  );
  await store.idle();
  await pool.query('ANALYZE');
  await time('save 10 with current statistics', () =>
    store.save(fork.id, user, fork.revision, undefined, edit(200, 10)),
  );
} finally {
  await store.idle();
  for (const id of ids.reverse()) {
    await pool.query('DELETE FROM oc_timelines WHERE id=$1', [id]);
    await store.transaction((c) => store.removeHistory(c, id));
  }
  await pool.query('DELETE FROM oc_storage_entries WHERE user_id=$1', [user]);
  await pool.query('DELETE FROM oc_users WHERE id=$1', [user]);
  await pool.end();
}
