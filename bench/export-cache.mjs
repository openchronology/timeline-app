// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// Downloading a large timeline's .ochx (and .och) file with the export cache (#204): the
// first download, made from the database, against the next ones, read from the cache, and
// against downloads without a cache. Prints one JSON line of milliseconds (to the last byte)
// and the file sizes.
// Usage: node bench/export-cache.mjs [moments] (default 100000)
// Needs BENCH_DATABASE_URL: a PostgreSQL database it creates and removes its own data in.
// OCH_CONVERTER (och-convert) adds the .och file.
import pg from 'pg';
import { createServer } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { PostgresStore } from '../server/store.mjs';
import { Auth } from '../server/auth.mjs';
import { createRequestHandler } from '../server/http.mjs';
import { DiskBackend, ExportCache } from '../server/export-cache.mjs';
import { TimelineFiles } from '../server/files.mjs';
import { setEntryLimit } from '../dist/core.mjs';
import { generateTimeline } from './generate.mjs';

if (!process.env.BENCH_DATABASE_URL) throw new Error('Set BENCH_DATABASE_URL.');
setEntryLimit(Infinity);
const size = Number(process.argv[2] ?? 100000);
const pool = new pg.Pool({ connectionString: process.env.BENCH_DATABASE_URL });
const store = new PostgresStore(pool),
  origin = 'http://127.0.0.1';
const user = randomUUID(),
  dir = await mkdtemp(join(tmpdir(), 'och-bench-export-'));
const median = (values) => values.sort((a, b) => a - b)[Math.floor(values.length / 2)];
let timeline,
  servers = [];
async function serve(exportCache) {
  const server = createServer(
    createRequestHandler({
      pool,
      origin,
      exportCache,
      entryLimit: Infinity,
      converter: new TimelineFiles(),
    }),
  );
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  servers.push(server);
  return `http://127.0.0.1:${server.address().port}`;
}
/** Milliseconds to download `path` to its last byte, and its size. */
async function download(base, path, headers) {
  const started = performance.now();
  const response = await fetch(base + path, { headers });
  if (response.status !== 200)
    throw new Error(`${path}: ${response.status} ${(await response.text()).slice(0, 200)}`);
  const bytes = (await response.arrayBuffer()).byteLength;
  return { ms: performance.now() - started, bytes };
}
try {
  await pool.query(
    'INSERT INTO oc_users(id,username,email,email_verified_at,quota_bypass,terms_version) VALUES($1,$2,$3,now(),true,oc_policy_version())',
    [user, 'bench_' + user.slice(0, 8), user.slice(0, 8) + '@example.test'],
  );
  const { token } = await new Auth(pool, origin).issue(
    { id: user, username: 'bench', email_verified_at: new Date() },
    'desktop',
  );
  const headers = { Authorization: 'Bearer ' + token };
  timeline = await store.create(user, generateTimeline(size));
  await store.idle();
  const cache = new ExportCache({
    pool,
    backend: new DiskBackend(dir),
    staging: join(dir, '.staging'),
    maxBytes: 64 * 1024 ** 3,
  });
  const cached = await serve(cache),
    plain = await serve(null);
  const result = { moments: size };
  for (const [name, path] of [
    ['ochx', `/api/timelines/${timeline.id}/export/bench.ochx`],
    ...(new TimelineFiles().enabled ? [['och', `/api/timelines/${timeline.id}/file`]] : []),
  ]) {
    // The .och file is rate-limited per address (ten a minute): fewer runs.
    const runs = name === 'och' ? 3 : 5;
    const uncached = [];
    try {
      for (let i = 0; i < runs; i++) uncached.push((await download(plain, path, headers)).ms);
    } catch (error) {
      // Past what the server converts (its file, time or memory limit), with or without a cache.
      result[name] = { error: error.message };
      continue;
    }
    const first = await download(cached, path, headers);
    await cache.idle();
    const again = [];
    for (let i = 0; i < runs; i++) again.push((await download(cached, path, headers)).ms);
    result[name] = {
      bytes: first.bytes,
      uncachedMs: Math.round(median(uncached)),
      firstMs: Math.round(first.ms),
      cachedMs: Math.round(median(again)),
    };
    await pool
      .query("DELETE FROM oc_auth_attempts WHERE key LIKE 'file-download:%'")
      .catch(() => {});
  }
  console.log(JSON.stringify(result));
} finally {
  for (const server of servers) server.close();
  if (timeline) {
    await pool.query('DELETE FROM oc_export_cache WHERE timeline_id=$1', [timeline.id]);
    await pool.query('DELETE FROM oc_timelines WHERE id=$1', [timeline.id]);
  }
  await pool.query('DELETE FROM oc_users WHERE id=$1', [user]);
  await rm(dir, { recursive: true, force: true });
  await pool.end();
}
