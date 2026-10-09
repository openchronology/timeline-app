// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// Latency benchmarks for the in-memory index and PostgreSQL, measured with tinybench.
// Seed first (node bench/seed.mjs). Usage: node bench/run.mjs
//   BENCH_SIZES=1000,10000  BENCH_TIME=1000 (ms per task)  BENCH_DATABASE_URL=postgres://…
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Bench } from 'tinybench';
import { Q, TimelineIndex, Viewport, validateDocument } from '../dist/core.mjs';
import { DATA, sizes } from './seed.mjs';

export const OPERATIONS = [
  ['overview-full', 'Viewport: whole timeline'],
  ['overview-zoomed', 'Viewport: 1% of the timeline'],
  ['events-page', 'Read a page of 100 moments'],
  ['read', 'Read one moment'],
  ['create', 'Create a moment'],
  ['update', 'Update a moment'],
  ['delete', 'Delete a moment'],
];
const RESULTS = resolve(process.env.BENCH_RESULTS_DIR ?? 'bench/results');
const time = Number(process.env.BENCH_TIME ?? 1000);

/** Latency statistics in milliseconds. */
function summary(task) {
  const result = task.result;
  if (result.state !== 'completed')
    throw new Error(`${task.name}: ${result.state} ${result.error ?? ''}`);
  const l = result.latency;
  return { mean: l.mean, sd: l.sd, p50: l.p50, p99: l.p99, rme: l.rme, samples: l.samplesCount };
}
/** Each backend implements the same operations over the same seeded inputs. */
function memoryBackend(document, work) {
  const index = new TimelineIndex(document);
  const frame = ({ lower, upper }) =>
    index.frame(new Viewport(Q.parse(lower), Q.parse(upper).sub(Q.parse(lower))), 1000, 24);
  let counter = 0;
  const fresh = () => ({
    id: 'bench-' + counter++,
    time: work.target.time,
    metadata: { title: 'New' },
  });
  let created, doomed;
  return {
    'overview-full': { fn: () => frame(work.full) },
    'overview-zoomed': { fn: () => frame(work.zoomed) },
    'events-page': { fn: () => index.eventsBetween(work.page.lower, work.page.upper, 100) },
    read: {
      fn: () =>
        index
          .eventsBetween(work.target.time, work.target.time, 100)
          .find((e) => e.id === work.target.id),
    },
    create: { fn: () => index.put((created = fresh())), afterEach: () => index.delete(created.id) },
    update: {
      fn: () =>
        index.put({
          ...work.target,
          metadata: { ...work.target.metadata, title: 'Updated ' + counter++ },
        }),
      afterEach: () => index.put(work.target),
    },
    delete: { beforeEach: () => index.put((doomed = fresh())), fn: () => index.delete(doomed.id) },
  };
}
/** The server's store, as used by the HTTP API: viewport queries and sparse saves. */
async function postgresBackend(size, work) {
  const url = process.env.BENCH_DATABASE_URL;
  if (!url) return null;
  const seeded = JSON.parse(await readFile(`${DATA}/postgres.json`, 'utf8').catch(() => '{}'))[
    size
  ];
  if (!seeded) throw new Error(`No PostgreSQL seed for ${size} moments; run node bench/seed.mjs.`);
  const { default: pg } = await import('pg');
  const { PostgresStore } = await import('../server/store.mjs');
  const pool = new pg.Pool({ connectionString: url, max: 2 });
  const store = new PostgresStore(pool);
  const { id, user } = seeded;
  let timeline = await store.access(id, user);
  const settings = (await store.snapshot(id, user)).document;
  delete settings.events;
  delete settings.durations;
  delete settings.relationships;
  const save = async (changes) => {
    timeline = await store.save(id, user, timeline.revision, undefined, { settings, changes });
  };
  const query = (q) => store.query(id, user, q);
  const overview = ({ lower, upper, threshold }) =>
    query({ kind: 'overview', lower, upper, threshold });
  let counter = 0;
  const fresh = () => ({
    id: 'bench-' + counter++,
    time: work.target.time,
    metadata: { title: 'New' },
  });
  let created, doomed;
  return {
    close: () => pool.end(),
    tasks: {
      'overview-full': { fn: () => overview(work.full) },
      'overview-zoomed': { fn: () => overview(work.zoomed) },
      'events-page': {
        fn: () =>
          query({
            kind: 'events',
            lower: work.page.lower,
            upper: work.page.upper,
            limit: 100,
            after: null,
          }),
      },
      read: {
        fn: () =>
          query({
            kind: 'events',
            id: work.target.id,
            lower: work.target.time,
            limit: 1,
            after: null,
          }),
      },
      create: {
        fn: () => save([{ id: (created = fresh()).id, event: created }]),
        afterEach: () => save([{ id: created.id, event: null }]),
      },
      update: {
        fn: () =>
          save([
            {
              id: work.target.id,
              event: {
                ...work.target,
                metadata: { ...work.target.metadata, title: 'Updated ' + counter++ },
              },
            },
          ]),
        afterEach: () => save([{ id: work.target.id, event: work.target }]),
      },
      delete: {
        beforeEach: () => save([{ id: (doomed = fresh()).id, event: doomed }]),
        fn: () => save([{ id: doomed.id, event: null }]),
      },
    },
  };
}
async function measure(backend, size, tasks, async = false) {
  const bench = new Bench({
    name: `${backend} ${size}`,
    time,
    iterations: 10,
    warmupIterations: 2,
  });
  for (const [operation] of OPERATIONS) {
    const { fn, beforeEach, afterEach } = tasks[operation];
    // tinybench detects asynchronous tasks by declaration, so database tasks are declared async.
    const wrap = (f) => f && (async ? async () => await f() : f);
    bench.add(operation, wrap(fn), { beforeEach: wrap(beforeEach), afterEach: wrap(afterEach) });
  }
  await bench.run();
  return bench.tasks.map((task) => ({ backend, size, operation: task.name, ...summary(task) }));
}
if (import.meta.url === `file://${process.argv[1]}`) {
  await mkdir(RESULTS, { recursive: true });
  const rows = [];
  for (const size of sizes()) {
    const document = validateDocument(
      JSON.parse(await readFile(`${DATA}/timeline-${size}.ochx`, 'utf8')),
    );
    const work = JSON.parse(await readFile(`${DATA}/workload-${size}.json`, 'utf8'));
    rows.push(...(await measure('memory', size, memoryBackend(document, work))));
    console.log(`memory ${size}: done`);
    const postgres = await postgresBackend(size, work);
    if (postgres) {
      try {
        rows.push(...(await measure('postgres', size, postgres.tasks, true)));
        console.log(`postgres ${size}: done`);
      } finally {
        await postgres.close();
      }
    }
  }
  const output = {
    tool: 'tinybench',
    node: process.version,
    platform: `${process.platform} ${process.arch}`,
    time,
    finished: new Date().toISOString(),
    rows,
  };
  await writeFile(`${RESULTS}/node.json`, JSON.stringify(output, null, 2));
  console.table(rows.map((r) => ({ ...r, mean: +r.mean.toFixed(3), sd: +r.sd.toFixed(3) })));
}
