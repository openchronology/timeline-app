// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// Forks a large timeline (timing the answer and when its index is ready), then saves to it
// straight away, and again once statistics are current. Then forks that fork until a fork
// reads through INDEX_LEVELS levels, and forks the deepest past them (copying what it wrote
// itself): once after it changed 1,000 moments, and once after 25,000 (left to prepare).
// Usage: node bench/fork-save.mjs [moments]   (default 200000)
// Needs BENCH_DATABASE_URL: a PostgreSQL database it creates and removes its own data in.
import pg from 'pg';
import { randomUUID } from 'node:crypto';
import { PostgresStore } from '../server/store.mjs';
import { Versioning } from '../server/versioning.mjs';
import { setEntryLimit } from '../dist/core.mjs';
import { generateTimeline } from './generate.mjs';
import { INDEX_LEVELS } from '../server/index-versions.mjs';

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
  fork = await time('save 10 with current statistics', () =>
    store.save(fork.id, user, fork.revision, undefined, edit(200, 10)),
  );
  // Forks of forks, each moving 1,000 moments of its own, to the deepest a fork reads.
  let deepest = fork;
  for (let level = 2; level <= INDEX_LEVELS; level++) {
    deepest = await versions.copy(deepest.id, user, { revision: deepest.revision });
    ids.push(deepest.id);
    deepest = await store.save(
      deepest.id,
      user,
      deepest.revision,
      undefined,
      edit(level * 1000, 1000),
    );
  }
  await store.idle();
  /** Forks the deepest fork, past INDEX_LEVELS: answered, then ready. */
  async function forkPast(label) {
    const started = performance.now();
    const copy = await time(`fork past ${INDEX_LEVELS} levels, ${label}, answered`, () =>
      versions.copy(deepest.id, user, { revision: deepest.revision }),
    );
    ids.push(copy.id);
    await store.idle();
    const ready = (performance.now() - started) / 1000;
    console.log(
      JSON.stringify({
        size,
        label: `fork past ${INDEX_LEVELS} levels, ${label}, ready`,
        seconds: Number(ready.toFixed(2)),
        preparing: copy.preparing,
      }),
    );
    const own = await store.access(copy.id, user);
    await time(`save 10 to the fork past ${INDEX_LEVELS} levels, ${label}`, () =>
      store.save(own.id, user, own.revision, undefined, edit(300, 10)),
    );
  }
  await forkPast('1,000 own moments');
  for (let from = 10000; from < 35000; from += 2500)
    deepest = await store.save(deepest.id, user, deepest.revision, undefined, edit(from, 2500));
  await store.idle();
  await forkPast('26,000 own moments');
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
