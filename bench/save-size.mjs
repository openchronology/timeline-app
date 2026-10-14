// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// Save time against timeline size (#135): for each size, creates a timeline, then times
// appending 10, 1,000 and 5,000 moments after its last (as log ingestion does) and changing
// 1,000 moments spread through it, each the median of `runs` saves. Prints one JSON line per
// measurement, and the creation time. The server stops statements after 30 s, so the largest
// saves must stay well under it as timelines grow.
// Usage: node bench/save-size.mjs [sizes, comma-separated] [runs]   (default 100000,1000000 and 3)
// Needs BENCH_DATABASE_URL: a PostgreSQL database it creates and removes its own data in.
import pg from 'pg';
import { randomUUID } from 'node:crypto';
import { PostgresStore } from '../server/store.mjs';
import { setEntryLimit } from '../dist/core.mjs';
import { generateTimeline, SPAN } from './generate.mjs';

if (!process.env.BENCH_DATABASE_URL) throw new Error('Set BENCH_DATABASE_URL.');
setEntryLimit(Infinity);
const sizes = (process.argv[2] ?? '100000,1000000').split(',').map(Number),
  runs = Number(process.argv[3] ?? 3);
const pool = new pg.Pool({ connectionString: process.env.BENCH_DATABASE_URL });
const store = new PostgresStore(pool);
const user = randomUUID(),
  ids = [];
const seconds = (started) => Number(((performance.now() - started) / 1000).toFixed(2));
const median = (values) => values.sort((a, b) => a - b)[Math.floor(values.length / 2)];
try {
  await pool.query('INSERT INTO oc_users(id,username,quota_bypass) VALUES($1,$2,true)', [
    user,
    'bench_' + user.slice(0, 8),
  ]);
  for (const size of sizes) {
    const document = generateTimeline(size);
    const settings = { ...document, events: [], durations: undefined, relationships: undefined };
    let started = performance.now();
    let t = await store.create(user, document);
    ids.push(t.id);
    await store.idle();
    console.log(JSON.stringify({ size, label: 'create', seconds: seconds(started) }));
    let appended = 0,
      edits = 0;
    // New moments after every other, each a second apart.
    const append = (count) =>
      Array.from({ length: count }, () => {
        const id = 'appended' + appended;
        const time = `${SPAN + 1000 + appended++}/1`;
        return { id, event: { id, time, metadata: { title: 'Appended ' + id } } };
      });
    // Existing moments spread evenly through the timeline, moved slightly.
    const spread = (count) => {
      const step = Math.floor(document.events.length / count),
        round = edits++;
      return Array.from({ length: count }, (_, i) => {
        const e = document.events[i * step + (round % step)];
        return { id: e.id, event: { ...e, metadata: { ...e.metadata, title: 'Edited' } } };
      });
    };
    for (const [label, changes] of [
      ['append 10', () => append(10)],
      ['append 1000', () => append(1000)],
      ['append 5000', () => append(5000)],
      ['change 1000 spread', () => spread(1000)],
    ]) {
      const times = [];
      for (let run = 0; run < runs; run++) {
        const patch = { settings, changes: changes() };
        started = performance.now();
        t = await store.save(t.id, user, t.revision, undefined, patch);
        times.push(seconds(started));
        await store.idle();
      }
      console.log(JSON.stringify({ size, label, seconds: median(times), runs: times }));
    }
    await pool.query('DELETE FROM oc_timelines WHERE id=$1', [t.id]);
    await store.transaction((c) => store.removeHistory(c, t.id));
    ids.pop();
  }
} finally {
  await store.idle();
  for (const id of ids) {
    await pool.query('DELETE FROM oc_timelines WHERE id=$1', [id]);
    await store.transaction((c) => store.removeHistory(c, id));
  }
  await pool.query('DELETE FROM oc_storage_entries WHERE user_id=$1', [user]);
  await pool.query('DELETE FROM oc_users WHERE id=$1', [user]);
  await pool.end();
}
