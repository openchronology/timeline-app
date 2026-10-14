// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// Reads and saves on a fork that reads through to its source's index (#145), against the
// same on the source: just forked, then after the source moved some of its moments (so the
// fork reads versions the source retired), then after the fork saved changes of its own.
// Prints one JSON line per measurement: the median milliseconds on each, and their ratio.
// Usage: node bench/fork-reads.mjs [moments] [source changes]   (default 200000 and 5000)
// Needs BENCH_DATABASE_URL: a PostgreSQL database it creates and removes its own data in.
import pg from 'pg';
import { randomUUID } from 'node:crypto';
import { PostgresStore } from '../server/store.mjs';
import { Versioning } from '../server/versioning.mjs';
import { Q, setEntryLimit } from '../dist/core.mjs';
import { generateTimeline, SPAN } from './generate.mjs';

if (!process.env.BENCH_DATABASE_URL) throw new Error('Set BENCH_DATABASE_URL.');
setEntryLimit(Infinity);
const size = Number(process.argv[2] ?? 200000),
  changes = Number(process.argv[3] ?? 5000);
const pool = new pg.Pool({ connectionString: process.env.BENCH_DATABASE_URL });
const store = new PostgresStore(pool),
  versions = new Versioning(store);
const user = randomUUID(),
  ids = [];
const seconds = (started) => Number(((performance.now() - started) / 1000).toFixed(2));
const at = (fraction) => `${Math.round(SPAN * fraction)}/1`;
const threshold = (span) => Q.from(BigInt(Math.round(span)), 1024n).toString();
const reads = [
  ['overview, whole', { kind: 'overview', lower: at(0), upper: at(1), threshold: threshold(SPAN) }],
  [
    'overview, 1%',
    { kind: 'overview', lower: at(0.5), upper: at(0.51), threshold: threshold(SPAN / 100) },
  ],
  [
    'overview, 0.001% in full',
    { kind: 'overview', lower: at(0.5), upper: at(0.50001), threshold: '0/1' },
  ],
  ['events, first 200', { kind: 'events', lower: null, upper: null, limit: 200, after: null }],
  [
    'events, 200 from the middle',
    { kind: 'events', lower: null, upper: null, limit: 200, after: { time: at(0.5), id: '' } },
  ],
  [
    'durations in 1%',
    { kind: 'durations', lower: at(0.5), upper: at(0.51), limit: 100, after: null },
  ],
  ['search', { kind: 'search', text: 'harbor treaty', page: 1 }],
  ['tags', { kind: 'tags' }],
  ['moment by ID', { kind: 'moment', id: 'm777' }],
];
const median = (values) => values.sort((a, b) => a - b)[Math.floor(values.length / 2)];
/** Each read on the source and the fork, alternately, a median of seven runs. */
async function compare(stage, source, fork) {
  for (const [label, query] of reads) {
    const times = { source: [], fork: [] };
    for (let run = 0; run < 8; run++)
      for (const [side, id] of [
        ['source', source],
        ['fork', fork],
      ]) {
        const started = performance.now();
        await store.query(id, user, query);
        if (run) times[side].push(performance.now() - started);
      }
    const [a, b] = [median(times.source), median(times.fork)];
    console.log(
      JSON.stringify({
        size,
        stage,
        read: label,
        source: Number(a.toFixed(1)),
        fork: Number(b.toFixed(1)),
        ratio: Number((b / a).toFixed(2)),
      }),
    );
  }
}
try {
  await pool.query('INSERT INTO oc_users(id,username,quota_bypass) VALUES($1,$2,true)', [
    user,
    'bench_' + user.slice(0, 8),
  ]);
  const document = generateTimeline(size);
  let started = performance.now();
  let source = await store.create(user, document);
  ids.push(source.id);
  console.log(JSON.stringify({ size, label: 'create', seconds: seconds(started) }));
  await store.idle();
  started = performance.now();
  let fork = await versions.copy(source.id, user, { revision: source.revision });
  ids.push(fork.id);
  console.log(
    JSON.stringify({ size, label: 'fork', seconds: seconds(started), preparing: fork.preparing }),
  );
  await compare('just forked', source.id, fork.id);

  const settings = { ...document, events: [], durations: undefined, relationships: undefined };
  // Moves `count` moments from `from` on, each to a new time.
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
  for (const [label, timeline, from, count] of [
    ['save 10 to the source', source, 1000, 10],
    ['save 10 to the fork', fork, 2000, 10],
  ]) {
    started = performance.now();
    const saved = await store.save(
      timeline.id,
      user,
      timeline.revision,
      undefined,
      edit(from, count, label),
    );
    console.log(JSON.stringify({ size, label, seconds: seconds(started) }));
    if (timeline === source) source = saved;
    else fork = saved;
  }
  // The source changes after the fork: what the fork reads of it is now retired.
  for (let from = 0; from < changes; from += 2500) {
    started = performance.now();
    const count = Math.min(2500, changes - from);
    source = await store.save(
      source.id,
      user,
      source.revision,
      undefined,
      edit(10000 + from, count, 'Moved'),
    );
    console.log(
      JSON.stringify({ size, label: `save ${count} to the source`, seconds: seconds(started) }),
    );
  }
  await compare(`source moved ${changes}`, source.id, fork.id);
  // The fork changes too: its own rows over what it reads through to.
  for (let from = 0; from < changes; from += 2500) {
    started = performance.now();
    const count = Math.min(2500, changes - from);
    fork = await store.save(
      fork.id,
      user,
      fork.revision,
      undefined,
      edit(50000 + from, count, 'Fork'),
    );
    console.log(
      JSON.stringify({ size, label: `save ${count} to the fork`, seconds: seconds(started) }),
    );
  }
  await compare(`both moved ${changes}`, source.id, fork.id);
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
