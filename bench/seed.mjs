// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// Seeds benchmark timelines: .ochx (JSON), .och (SQLite) and, with BENCH_DATABASE_URL,
// PostgreSQL. Usage: node bench/seed.mjs [--force]   Sizes: BENCH_SIZES=1000,10000,...
import { mkdir, readFile, writeFile, access } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { resolve } from 'node:path';
import { generateTimeline, workload, DEFAULT_SIZES } from './generate.mjs';
import { Viewport, Q } from '../dist/core.mjs';

const exec = promisify(execFile);
export const DATA = resolve(process.env.BENCH_DATA_DIR ?? 'bench/data');
export function sizes() {
  return (process.env.BENCH_SIZES ?? DEFAULT_SIZES.join(','))
    .split(',')
    .map((n) => Number(n.trim()))
    .filter((n) => Number.isInteger(n) && n > 0);
}
const exists = (path) =>
  access(path).then(
    () => true,
    () => false,
  );
/** Thresholds and windows written once, so Node and Rust run identical operations. */
function workloadFile(document) {
  const w = workload(document);
  const threshold = ({ lower, upper }) =>
    new Viewport(Q.parse(lower), Q.parse(upper).sub(Q.parse(lower)))
      .threshold(w.width, w.pixels)
      .toString();
  return {
    full: { ...w.full, threshold: threshold(w.full) },
    zoomed: { ...w.zoomed, threshold: threshold(w.zoomed) },
    page: w.page,
    target: w.target,
  };
}
async function seedFiles(force) {
  await mkdir(DATA, { recursive: true });
  const seeder = resolve('native-store/target/release/och-seed');
  if (!(await exists(seeder))) {
    console.log('Building och-seed…');
    await exec(
      'cargo',
      [
        'build',
        '--manifest-path',
        'native-store/Cargo.toml',
        '--locked',
        '--release',
        '--bin',
        'och-seed',
      ],
      {
        maxBuffer: 1 << 26,
      },
    );
  }
  for (const size of sizes()) {
    const json = `${DATA}/timeline-${size}.ochx`,
      sqlite = `${DATA}/timeline-${size}.och`;
    if (force || !(await exists(json))) {
      const document = generateTimeline(size);
      await writeFile(json, JSON.stringify(document));
      await writeFile(
        `${DATA}/workload-${size}.json`,
        JSON.stringify(workloadFile(document), null, 2),
      );
      console.log(`Wrote ${json}`);
    }
    if (force || !(await exists(sqlite))) {
      await exec(seeder, [json, sqlite], { maxBuffer: 1 << 26 });
      console.log(`Wrote ${sqlite}`);
    }
  }
}
/** Benchmark timelines belong to a dedicated "bench" user; reseeding replaces them. */
async function seedPostgres() {
  const url = process.env.BENCH_DATABASE_URL;
  if (!url) {
    console.log('BENCH_DATABASE_URL is not set; skipping PostgreSQL seeds.');
    return;
  }
  const { default: pg } = await import('pg');
  const { PostgresStore } = await import('../server/store.mjs');
  const pool = new pg.Pool({ connectionString: url });
  try {
    await pool.query(await readFile(new URL('../server/schema.sql', import.meta.url), 'utf8'));
    const { rows } = await pool.query(
      `INSERT INTO oc_users(id,username,email_verified_at) VALUES(gen_random_uuid(),'bench',now())
       ON CONFLICT(username) DO UPDATE SET username=EXCLUDED.username RETURNING id`,
    );
    const user = rows[0].id;
    // Benchmarks measure large timelines; the bench user bypasses storage quotas.
    await pool.query('UPDATE oc_users SET quota_bypass=true WHERE id=$1', [user]);
    await pool.query('DELETE FROM oc_timelines WHERE owner_id=$1', [user]);
    const store = new PostgresStore(pool);
    const timelines = {};
    for (const size of sizes()) {
      const document = JSON.parse(await readFile(`${DATA}/timeline-${size}.ochx`, 'utf8'));
      const started = Date.now();
      const timeline = await store.create(user, document);
      timelines[size] = { id: timeline.id, user };
      console.log(`Seeded PostgreSQL timeline of ${size} moments in ${Date.now() - started} ms`);
    }
    await writeFile(`${DATA}/postgres.json`, JSON.stringify(timelines, null, 2));
  } finally {
    await pool.end();
  }
}
if (import.meta.url === `file://${process.argv[1]}`) {
  await seedFiles(process.argv.includes('--force'));
  await seedPostgres();
}
