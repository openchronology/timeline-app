// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// Cached downloads (#204): a revision's .ochx (and .och) file is made once and served again
// byte for byte, with ETags and ranges, only to those who may see the timeline; one build per
// key is stored; entries are evicted least recently used first, never above the limit; a
// deleted timeline's entries go; a public timeline redirects to the public address, and is
// swept from it once private. With S3_TEST_ENDPOINT (a MinIO, say) the same runs on S3.
import assert from 'node:assert/strict';
import { readFile, mkdtemp, rm, readdir } from 'node:fs/promises';
import { createServer } from 'node:http';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { PostgresStore } from '../server/store.mjs';
import { Auth } from '../server/auth.mjs';
import { createRequestHandler } from '../server/http.mjs';
import { dispatchNextRequest } from '../server/next-handler.mjs';
import { ExportCache, DiskBackend, S3Backend } from '../server/export-cache.mjs';
import { TimelineFiles } from '../server/files.mjs';
if (!process.env.DATABASE_URL) throw new Error('Use a dedicated PostgreSQL test database.');
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
await pool.query(await readFile(new URL('../server/schema.sql', import.meta.url), 'utf8'));
const store = new PostgresStore(pool),
  origin = 'http://127.0.0.1';
const users = [],
  timelines = [],
  directories = [],
  servers = [];

/** A handler on a local port, with `exportCache`; its base address. */
async function serve(exportCache) {
  const handler = createRequestHandler({
    pool,
    origin,
    exportCache,
    converter: new TimelineFiles(),
  });
  const server = createServer(handler);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  servers.push(server);
  return { base: `http://127.0.0.1:${server.address().port}`, handler };
}
/** A disk cache in a new directory, holding at most `maxBytes`. */
async function diskCache(maxBytes, options = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'och-export-cache-'));
  directories.push(dir);
  return new ExportCache({
    pool,
    backend: new DiskBackend(dir),
    staging: join(dir, '.staging'),
    maxBytes,
    ...options,
  });
}
/** Counts the build claims a cache wins (its INSERT into oc_export_cache). */
function countClaims(cache) {
  const counted = { claims: 0 };
  const query = pool.query.bind(pool);
  cache.pool = {
    query: async (sql, params) => {
      const result = await query(sql, params);
      if (/^INSERT INTO oc_export_cache/.test(sql.trim())) counted.claims += result.rowCount;
      return result;
    },
  };
  return counted;
}

try {
  const auth = new Auth(pool, origin);
  const account = async (name) => {
    const id = randomUUID();
    await pool.query(
      'INSERT INTO oc_users(id,username,email,email_verified_at) VALUES($1,$2,$3,now())',
      [id, name + '_' + id.slice(0, 8), id.slice(0, 8) + '@example.test'],
    );
    users.push(id);
    const session = await auth.issue(
      { id, username: name, email_verified_at: new Date() },
      'desktop',
    );
    return { id, headers: { Authorization: 'Bearer ' + session.token }, csrf: session.csrf };
  };
  const owner = await account('owner'),
    stranger = await account('stranger');
  const moments = (n, title = 'Moment') =>
    Array.from({ length: n }, (_, i) => ({
      id: 'm' + i,
      time: `${i * 7}/3`,
      metadata: { title: `${title} ${i}`, notes: 'x'.repeat(40) },
    }));
  const timeline = async (title, n, visibility = 'private') => {
    const created = await store.create(owner.id, {
      format: 'openchronology',
      version: 1,
      title,
      description: 'Cached downloads',
      events: moments(n),
    });
    timelines.push(created.id);
    if (visibility === 'public')
      await pool.query("UPDATE oc_timelines SET visibility='public' WHERE id=$1", [created.id]);
    return created;
  };
  const get = (base, path, { as = owner, headers = {}, method = 'GET' } = {}) =>
    fetch(base + path, { method, redirect: 'manual', headers: { ...as.headers, ...headers } });
  const bytes = async (response) => Buffer.from(await response.arrayBuffer());
  const rows = async (id) =>
    (await pool.query('SELECT * FROM oc_export_cache WHERE timeline_id=$1 ORDER BY key', [id]))
      .rows;

  const backends = [['disk', (max, options) => diskCache(max, options)]];
  if (process.env.S3_TEST_ENDPOINT)
    backends.push([
      's3',
      async (maxBytes, options = {}) => {
        const dir = await mkdtemp(join(tmpdir(), 'och-export-staging-'));
        directories.push(dir);
        return new ExportCache({
          pool,
          backend: new S3Backend({
            endpoint: process.env.S3_TEST_ENDPOINT,
            region: process.env.S3_TEST_REGION ?? 'us-east-1',
            bucket: process.env.S3_TEST_BUCKET,
            prefix: 'test-' + randomUUID().slice(0, 8) + '/',
            accessKeyId: process.env.S3_TEST_ACCESS_KEY_ID,
            secretAccessKey: process.env.S3_TEST_SECRET_ACCESS_KEY,
          }),
          staging: join(dir, '.staging'),
          maxBytes,
          ...options,
        });
      },
    ]);
  const { base: plain } = await serve(null);

  for (const [kind, makeCache] of backends) {
    await pool.query('DELETE FROM oc_export_cache');
    const cache = await makeCache(64 * 1024 * 1024);
    const claims = countClaims(cache);
    const { base, handler } = await serve(cache);
    const t = await timeline(`Cached ${kind}`, 2000);
    const path = `/api/timelines/${t.id}/export/cached-${kind}.ochx`;

    // The first download is made (and stored); the second is the stored file, byte for
    // byte what the server makes without a cache.
    const first = await get(base, path);
    assert.equal(first.status, 200);
    assert.match(first.headers.get('content-disposition'), new RegExp(`cached-${kind}\\.ochx`));
    const made = await bytes(first);
    await cache.idle();
    const [entry] = await rows(t.id);
    assert.equal(Number(entry.bytes), made.length, kind);
    assert.equal(entry.key, `${t.id}:r${t.revision}:ochx`);
    const second = await get(base, path);
    assert.equal(second.status, 200);
    const tag = second.headers.get('etag');
    assert.match(tag, /^"[a-f0-9]{32}"$/);
    assert.equal(second.headers.get('content-length'), String(made.length));
    assert.deepEqual(await bytes(second), made);
    const fresh = await bytes(await get(plain, path));
    assert.deepEqual(made, fresh, 'the cached file is the file made without a cache');
    assert.equal(JSON.parse(made.toString()).events.length, 2000);

    // Through the Next.js adapter too (bytes, not text, in its stream).
    const next = await dispatchNextRequest(
      new Request('http://127.0.0.1' + path, { headers: owner.headers }),
      handler,
    );
    assert.equal(next.status, 200);
    assert.deepEqual(Buffer.from(await next.arrayBuffer()), made);

    // Validators and ranges.
    assert.equal((await get(base, path, { headers: { 'If-None-Match': tag } })).status, 304);
    const part = await get(base, path, { headers: { Range: 'bytes=10-109' } });
    assert.equal(part.status, 206);
    assert.equal(part.headers.get('content-range'), `bytes 10-109/${made.length}`);
    assert.deepEqual(await bytes(part), made.subarray(10, 110));
    const tail = await get(base, path, { headers: { Range: 'bytes=-50' } });
    assert.deepEqual(await bytes(tail), made.subarray(made.length - 50));
    assert.equal(
      (await get(base, path, { headers: { Range: `bytes=${made.length}-` } })).status,
      416,
    );
    // A Range for another version is answered whole.
    assert.equal(
      (await get(base, path, { headers: { Range: 'bytes=0-9', 'If-Range': '"other"' } })).status,
      200,
    );

    // Only those who may see the timeline get it, stored or not.
    assert.equal((await get(base, path, { as: stranger })).status, 404);
    assert.equal((await get(base, path, { as: { headers: {} } })).status, 401);

    // The document?download=1 address uses the same entry; a save makes a new one.
    const named = await get(base, `/api/timelines/${t.id}/document?download=1`);
    assert.deepEqual(await bytes(named), made);
    const saved = await store.save(t.id, owner.id, t.revision, undefined, {
      settings: { format: 'openchronology', version: 1, title: t.title, description: 'Changed' },
      changes: [],
    });
    const after = await bytes(await get(base, path));
    assert.notDeepEqual(after, made);
    assert.equal(JSON.parse(after.toString()).description, 'Changed');
    await cache.idle();
    assert.deepEqual(
      (await rows(t.id)).map((r) => r.key),
      [`${t.id}:r${t.revision}:ochx`, `${t.id}:r${saved.revision}:ochx`].sort(),
    );

    // A saved revision's file, kept as its key says, and identical to the uncached one.
    const history = await (await get(base, `/api/timelines/${t.id}/history`)).json();
    const savedId = history.revisions.at(-1).id;
    const historyPath = `/api/timelines/${t.id}/history/${savedId}?download=1`;
    const oldFirst = await bytes(await get(base, historyPath));
    await cache.idle();
    assert.deepEqual(await bytes(await get(base, historyPath)), oldFirst);
    assert.deepEqual(await bytes(await get(plain, historyPath)), oldFirst);
    assert((await rows(t.id)).some((r) => r.key === `${t.id}:s${savedId}:ochx`));

    // Concurrent downloads of a new revision: one build is stored, every answer the same.
    const t2 = await timeline(`Concurrent ${kind}`, 3000);
    claims.claims = 0;
    const together = await Promise.all(
      Array.from({ length: 6 }, () =>
        get(base, `/api/timelines/${t2.id}/export/together.ochx`).then(bytes),
      ),
    );
    await cache.idle();
    assert.equal(claims.claims, 1, 'one build claimed');
    for (const body of together) assert.deepEqual(body, together[0]);
    assert.equal((await rows(t2.id)).length, 1);
    // A download that starts after a build claimed it waits for that build, then is served
    // from the cache.
    const t3 = await timeline(`Waiting ${kind}`, 3000);
    claims.claims = 0;
    const leader = await get(base, `/api/timelines/${t3.id}/export/wait.ochx`);
    const follower = get(base, `/api/timelines/${t3.id}/export/wait.ochx`);
    const [led, followed] = await Promise.all([bytes(leader), follower]);
    assert.equal(followed.status, 200);
    assert.deepEqual(await bytes(followed), led);
    await cache.idle();
    assert.equal(claims.claims, 1);

    // A download cancelled before its body is read (through the Next.js adapter) keeps
    // nothing, and leaves no claim behind.
    const t4 = await timeline(`Cancelled ${kind}`, 3000);
    const cancelled = await dispatchNextRequest(
      new Request(`http://127.0.0.1/api/timelines/${t4.id}/export/cancelled.ochx`, {
        headers: owner.headers,
      }),
      handler,
    );
    assert.equal(cancelled.status, 200);
    await cancelled.body.cancel();
    await cache.idle();
    assert.equal((await rows(t4.id)).length, 0);
    assert.equal(cache.building.size, 0);

    // Deleting the timeline forgets its entries and their files.
    const deleted = await fetch(base + `/api/timelines/${t2.id}`, {
      method: 'DELETE',
      headers: { ...owner.headers, 'X-CSRF-Token': owner.csrf, Origin: origin },
    });
    assert.equal(deleted.status, 200, await deleted.clone().text());
    assert.equal((await rows(t2.id)).length, 0);

    // A SQLite .och file, when the converter is available: stored, then served as stored.
    if (new TimelineFiles().enabled) {
      const sqlite = await get(base, `/api/timelines/${t.id}/file`);
      assert.equal(sqlite.status, 200);
      assert.equal(sqlite.headers.get('content-type'), 'application/vnd.openchronology.sqlite');
      const och = await bytes(sqlite);
      assert.equal(och.subarray(0, 16).toString('latin1'), 'SQLite format 3\0');
      await cache.idle();
      assert.deepEqual(await bytes(await get(base, `/api/timelines/${t.id}/file`)), och);
      assert((await rows(t.id)).some((r) => r.format === 'och'));
    } else console.log('SKIP .och: no och-convert (set OCH_CONVERTER).');

    // Eviction: with room for about one file, the least recently downloaded goes.
    await pool.query('DELETE FROM oc_export_cache');
    const small = await makeCache(Math.ceil(made.length * 1.5));
    const { base: tight } = await serve(small);
    const a = await timeline(`Evict A ${kind}`, 2000),
      b = await timeline(`Evict B ${kind}`, 2000);
    await bytes(await get(tight, `/api/timelines/${a.id}/export/a.ochx`));
    await small.idle();
    const [older] = await rows(a.id);
    assert(older);
    await bytes(await get(tight, `/api/timelines/${b.id}/export/b.ochx`));
    await small.idle();
    assert.equal((await rows(a.id)).length, 0, 'the older entry is evicted');
    assert.equal(await small.backend.read(older.object, 0, 0), null, 'with its file');
    assert.equal((await rows(b.id)).length, 1);
    const total = (
      await pool.query('SELECT coalesce(sum(bytes),0)::bigint AS n FROM oc_export_cache')
    ).rows[0].n;
    assert(Number(total) <= small.maxBytes);
    if (kind === 'disk')
      assert.equal(
        (await readdir(small.backend.dir)).filter((f) => f !== '.staging').length,
        1,
        'its file went with it',
      );
    // A file larger than the whole cache is sent but not kept.
    const huge = await timeline(`Huge ${kind}`, 6000);
    const hugeBody = await bytes(await get(tight, `/api/timelines/${huge.id}/export/huge.ochx`));
    assert(hugeBody.length > small.maxBytes);
    await small.idle();
    assert.equal((await rows(huge.id)).length, 0);

    // A public timeline redirects to the public address once stored; made private, the
    // sweep removes what was handed out there.
    const shared = await makeCache(64 * 1024 * 1024, { publicUrl: 'https://cdn.example.test/och' });
    const { base: published } = await serve(shared);
    const p = await timeline(`Public ${kind}`, 50, 'public');
    const publicPath = `/api/timelines/${p.id}/export/public.ochx`;
    assert.equal((await get(published, publicPath)).status, 200);
    await shared.idle();
    const moved = await get(published, publicPath);
    assert.equal(moved.status, 302);
    const [stored] = await rows(p.id);
    const objectKey = kind === 's3' ? shared.backend.key(stored.object) : stored.object;
    assert.equal(moved.headers.get('location'), 'https://cdn.example.test/och/' + objectKey);
    assert.equal(stored.published, true);
    // Not for the .och file or document?download=1 (fetched by scripts, not navigated to).
    assert.equal((await get(published, `/api/timelines/${p.id}/document?download=1`)).status, 200);
    await pool.query("UPDATE oc_timelines SET visibility='private' WHERE id=$1", [p.id]);
    assert.equal(await shared.sweep(), 1);
    assert.equal((await rows(p.id)).length, 0);
    // A private timeline is never redirected.
    const q = await timeline(`Private ${kind}`, 50);
    await bytes(await get(published, `/api/timelines/${q.id}/export/private.ochx`));
    await shared.idle();
    assert.equal((await get(published, `/api/timelines/${q.id}/export/private.ochx`)).status, 200);
    // Timelines deleted elsewhere (an administrator, an account deletion) are swept.
    await pool.query('DELETE FROM oc_timelines WHERE id=$1', [q.id]);
    assert.equal(await shared.sweep(), 1);
    // A missing file is made again rather than failing.
    const r = await timeline(`Missing ${kind}`, 50);
    const rPath = `/api/timelines/${r.id}/export/missing.ochx`;
    const original = await bytes(await get(base, rPath));
    await cache.idle();
    await cache.backend.remove((await rows(r.id))[0].object);
    assert.deepEqual(await bytes(await get(base, rPath)), original);
    await cache.idle();
    assert.equal((await rows(r.id)).length, 1);
    console.log(`PASS cached downloads (${kind}).`);
  }
  if (!process.env.S3_TEST_ENDPOINT) console.log('SKIP S3: set S3_TEST_ENDPOINT (MinIO, say).');
  console.log(
    'PASS cached downloads: made once per revision and served byte for byte, with ETags and ranges, only to those with access; one build stored; LRU eviction within the limit; deleted, oversized and no-longer-public entries removed; public timelines redirected.',
  );
} finally {
  for (const server of servers) server.close();
  await pool.query('DELETE FROM oc_export_cache WHERE timeline_id=ANY($1::uuid[])', [timelines]);
  await pool.query('DELETE FROM oc_timelines WHERE id=ANY($1::uuid[])', [timelines]);
  await pool.query('DELETE FROM oc_users WHERE id=ANY($1::uuid[])', [users]);
  for (const dir of directories) await rm(dir, { recursive: true, force: true });
  await pool.end();
}
