// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// Rebuilding a fork's catalogue text (oc_event_text, run by refreshText after each save) once
// its source has been saved many times since the fork (#285), against the same on the source.
// Prints one JSON line: the median milliseconds of each, and whether the fork's text equals
// that of a timeline created from the fork's document (built from the whole document).
// Usage: node bench/fork-text.mjs [moments] [source saves] [moments per save]
//   (default 5000, 100 and 20)
// Needs BENCH_DATABASE_URL: a PostgreSQL database it creates and removes its own data in.
import pg from 'pg';
import { randomUUID } from 'node:crypto';
import { PostgresStore } from '../server/store.mjs';
import { Versioning } from '../server/versioning.mjs';
import { Q, setEntryLimit } from '../dist/core.mjs';
import { generateTimeline } from './generate.mjs';

if (!process.env.BENCH_DATABASE_URL) throw new Error('Set BENCH_DATABASE_URL.');
setEntryLimit(Infinity);
const size = Number(process.argv[2] ?? 5000),
  saves = Number(process.argv[3] ?? 100),
  perSave = Number(process.argv[4] ?? 20);
const pool = new pg.Pool({ connectionString: process.env.BENCH_DATABASE_URL });
const store = new PostgresStore(pool),
  versions = new Versioning(store);
const user = randomUUID(),
  ids = [];
const median = (values) => values.sort((a, b) => a - b)[Math.floor(values.length / 2)];
/** oc_event_text for `id` as refreshText reads it, a median of five runs after a warm-up. */
async function text(id) {
  const times = [];
  let result;
  for (let run = 0; run < 6; run++) {
    const started = performance.now();
    result = await store.transaction(async (c) => {
      await c.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY');
      return (await c.query('SELECT oc_event_text($1) AS text', [id])).rows[0].text;
    });
    if (run) times.push(performance.now() - started);
  }
  return { ms: Number(median(times).toFixed(1)), text: result };
}
try {
  await pool.query('INSERT INTO oc_users(id,username,quota_bypass) VALUES($1,$2,true)', [
    user,
    'bench_' + user.slice(0, 8),
  ]);
  const document = generateTimeline(size);
  let source = await store.create(user, document);
  ids.push(source.id);
  await store.idle();
  let fork = await versions.copy(source.id, user, { revision: source.revision }, true);
  ids.push(fork.id);
  await store.idle();
  const settings = { ...document, events: [], durations: undefined, relationships: undefined };
  // Saves `count` moments from `from` on, each moved and retitled.
  const edit = (from, count, title) => ({
    settings,
    changes: document.events.slice(from, from + count).map((e) => ({
      id: e.id,
      event: {
        ...e,
        time: Q.parse(e.time).add(Q.from(1000n)).toString(),
        metadata: { ...e.metadata, title },
      },
    })),
  });
  const before = await text(fork.id);
  // The source is saved many times after the fork, spread through its moments.
  const step = Math.max(1, Math.floor((size - perSave) / saves));
  for (let i = 0; i < saves; i++) {
    source = await store.save(
      source.id,
      user,
      source.revision,
      undefined,
      edit((i * step) % (size - perSave), perSave, 'Source ' + i),
    );
  }
  // And the fork once, of its own.
  fork = await store.save(fork.id, user, fork.revision, undefined, edit(1, 5, 'Fork'));
  await store.idle();
  const [onSource, onFork] = [await text(source.id), await text(fork.id)];
  const copy = await store.create(user, (await store.snapshot(fork.id, user)).document);
  ids.push(copy.id);
  const whole = (await pool.query('SELECT event_text FROM oc_timelines WHERE id=$1', [copy.id]))
    .rows[0].event_text;
  console.log(
    JSON.stringify({
      size,
      saves,
      perSave,
      'fork, just forked': before.ms,
      source: onSource.ms,
      fork: onFork.ms,
      ratio: Number((onFork.ms / onSource.ms).toFixed(1)),
      matches: onFork.text === whole,
    }),
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
