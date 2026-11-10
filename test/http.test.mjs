// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// The HTTP server: readiness checks, guest deployments without a database, query validation,
// password hashing, cookies and CSRF, and the limits on what anyone may send.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { createApplication, nestedTooDeeply } from '../server/http.mjs';
import { passwordHash, passwordMatches, Auth } from '../server/auth.mjs';
async function request(application, url, method = 'GET', headers = {}, body) {
  const req = Readable.from(body === undefined ? [] : [Buffer.from(JSON.stringify(body))]);
  Object.assign(req, { url, method, headers, socket: { remoteAddress: '127.0.0.1' } });
  return new Promise((resolve, reject) => {
    const res = {
      headers: {},
      setHeader(k, v) {
        this.headers[k] = v;
      },
      writeHead(status, h) {
        this.status = status;
        Object.assign(this.headers, h);
      },
      end(body) {
        resolve({ status: this.status, headers: this.headers, body: JSON.parse(body) });
      },
    };
    application.listeners('request')[0](req, res).catch(reject);
  });
}
test('readiness checks database schema and does not disclose database errors', async () => {
  assert.equal((await request(createApplication(), '/healthz')).status, 200);
  let query;
  const ready = createApplication({
    pool: {
      async query(sql) {
        query = sql;
      },
    },
  });
  assert.deepEqual((await request(ready, '/healthz')).body, {
    status: 'ok',
    storage: 'postgresql',
  });
  assert.equal(
    query,
    'SELECT t.tags,t.image,t.assets,t.search_document,t.head_revision_id,p.source_revision_id FROM oc_timelines t LEFT JOIN oc_proposals p ON false LEFT JOIN oc_plugins l ON false LEFT JOIN oc_plugin_suites ps ON false LEFT JOIN oc_revisions r ON false LEFT JOIN oc_snapshots s ON false LIMIT 0',
  );
  const unavailable = createApplication({
    pool: {
      async query() {
        throw new Error('secret connection information');
      },
    },
  });
  const result = await request(unavailable, '/healthz');
  assert.equal(result.status, 503);
  assert.deepEqual(result.body, { status: 'unavailable' });
});
test('server deployments expose a guest dashboard without database storage and reject foreign-origin writes', async () => {
  const app = createApplication();
  const session = await request(app, '/api/session');
  assert.deepEqual(session.body, {
    server: false,
    dashboard: true,
    user: null,
    csrf: null,
    providers: [],
    providerLabels: {},
    directory: null,
    fileExchange: false,
    fileLimit: 64 * 1024 * 1024,
    compareLimit: 4,
    entryLimit: 200000,
  });
  const write = await request(app, '/api/timelines', 'POST', {
    origin: 'https://attacker.example',
  });
  assert.equal(write.status, 403);
  const notConfigured = await request(app, '/api/timelines', 'POST', {
    origin: 'http://localhost:5173',
  });
  assert.equal(notConfigured.status, 503);
});
test('query validation rejects bad bounds, search text and duration IDs before accessing storage', async () => {
  const app = createApplication({
    pool: {
      query() {
        throw new Error('Invalid bounds must never reach storage');
      },
    },
  });
  const path = '/api/timelines/00000000-0000-0000-0000-000000000001/query',
    headers = { 'content-type': 'application/json' };
  for (const input of [
    { kind: 'overview', lower: '0', upper: '1' },
    { kind: 'overview', lower: '0', upper: '1', threshold: '-1/2' },
    { kind: 'overview', lower: 0, upper: '1', threshold: '1/2' },
    { kind: 'overview', lower: '0', upper: '1/0', threshold: '1/2' },
    // Huge exponents and over-long times are refused before they are expanded.
    { kind: 'overview', lower: '0', upper: '1e1000000000', threshold: '1/2' },
    { kind: 'overview', lower: '0', upper: '1', threshold: '1e-10001' },
    { kind: 'overview', lower: '0', upper: '9'.repeat(20001), threshold: '1/2' },
    { kind: 'search' },
    { kind: 'search', text: 'x'.repeat(201) },
    { kind: 'search', text: 'harbor', page: 0 },
    { kind: 'search', text: 'harbor', page: 1.5 },
    { kind: 'search', text: 'harbor', page: 1, only: 'duration' },
    { kind: 'duration' },
    { kind: 'duration', id: 'bad id' },
    // A separation's tracks read together (#564): two to eight filters, a window per track.
    {
      kind: 'tracks',
      tracks: [{ tags: ['war'], mode: 'any' }],
      windows: [{ track: 0, lower: '0', upper: '1', threshold: '1' }],
    },
    {
      kind: 'tracks',
      tracks: [{ tags: ['war'], mode: 'any' }, null],
      windows: [{ track: 0, lower: '0', upper: '1', threshold: '1' }],
    },
    {
      kind: 'tracks',
      tracks: [
        { tags: ['war'], mode: 'any' },
        { tags: ['war'], mode: 'any' },
      ],
      windows: [],
    },
    {
      kind: 'tracks',
      tracks: [
        { tags: ['war'], mode: 'any' },
        { tags: ['war'], mode: 'any' },
      ],
      windows: [{ track: 2, lower: '0', upper: '1', threshold: '1' }],
    },
    {
      kind: 'tracks',
      tracks: [
        { tags: ['war'], mode: 'any' },
        { tags: ['war'], mode: 'any' },
      ],
      windows: [
        { track: 1, lower: '0', upper: '1', threshold: '1' },
        { track: 1, lower: '0', upper: '1', threshold: '1' },
      ],
    },
    {
      kind: 'tracks',
      tracks: [
        { tags: ['war'], mode: 'any' },
        { tags: ['war'], mode: 'any' },
      ],
      windows: [{ track: 0, lower: '0', upper: '1', threshold: '-1' }],
    },
  ])
    assert.equal((await request(app, path, 'POST', headers, input)).status, 400);
});
test('requests holding a link to a file on a computer are refused before anything else (#433)', async () => {
  const app = createApplication({
    pool: {
      query() {
        throw new Error('A local path must never reach storage');
      },
    },
  });
  const path = '/api/timelines/00000000-0000-0000-0000-000000000001/query',
    headers = { 'content-type': 'application/json' };
  for (const link of ['file:///home/someone/Pictures/a.jpg', ' FILE://localhost/C:/x.jpg']) {
    const refused = await request(app, path, 'POST', headers, {
      kind: 'overview',
      events: [{ id: 'a', time: '1/1', metadata: { sources: ['https://example.org', link] } }],
    });
    assert.equal(refused.status, 400);
    assert.match(refused.body.error, /file:\/\/\) are never stored on the server/);
  }
});
test('passwords use salted scrypt; cookie and CSRF checks protect mutation requests', async () => {
  const hash = await passwordHash('correct horse battery staple');
  assert(!hash.includes('correct horse'));
  assert(await passwordMatches('correct horse battery staple', hash));
  assert(!(await passwordMatches('different password', hash)));
  assert.notEqual(hash, await passwordHash('correct horse battery staple'));
  const auth = new Auth(null, 'https://chronology.example');
  assert.match(auth.cookie('abc'), /__Host-oc_session=abc/);
  assert.match(auth.cookie('abc'), /HttpOnly.*SameSite=Lax.*Secure/);
  assert.throws(
    () => auth.require(null, { headers: {} }),
    (e) => e.status === 401,
  );
  assert.throws(
    () => auth.require({ csrf: 'expected' }, { headers: { 'x-csrf-token': 'wrong' } }),
    (e) => e.status === 403,
  );
  auth.require({ csrf: 'expected' }, { headers: { 'x-csrf-token': 'expected' } });
});
/** A request with `text` as its body, as sent (`headers` may give a Content-Length). */
async function requestText(application, url, method, headers, text, address = '127.0.0.1') {
  const req = Readable.from([Buffer.from(text)]);
  Object.assign(req, {
    url,
    method,
    headers: { 'content-type': 'application/json', ...headers },
    socket: { remoteAddress: address },
  });
  return new Promise((resolve, reject) => {
    const res = {
      headers: {},
      setHeader(k, v) {
        this.headers[k] = v;
      },
      writeHead(status, h) {
        this.status = status;
        Object.assign(this.headers, h);
      },
      end(body) {
        resolve({ status: this.status, body: JSON.parse(body) });
      },
    };
    application.listeners('request')[0](req, res).catch(reject);
  });
}
test('routes anyone may call read only the body they need, and refuse deeply nested JSON', async () => {
  const app = createApplication({
    pool: {
      query() {
        throw new Error('An over-size or over-deep body must never reach storage');
      },
    },
  });
  const query = '/api/timelines/00000000-0000-0000-0000-000000000001/query';
  // A query may carry a comparison's plugins (1 MiB), but not 16 MiB: refused before reading
  // when Content-Length says so, and as soon as the limit is passed when it does not.
  const huge = JSON.stringify({ kind: 'search', text: 'x', pad: 'x'.repeat(2 * 1024 * 1024) });
  for (const headers of [{ 'content-length': String(huge.length) }, {}])
    assert.equal((await requestText(app, query, 'POST', headers, huge)).status, 413);
  for (const path of ['/api/auth/device/start', '/api/auth/device/poll', '/api/auth/google/start'])
    assert.equal(
      (await requestText(app, path, 'POST', {}, JSON.stringify({ deviceCode: 'x'.repeat(2000) })))
        .status,
      413,
      path,
    );
  // Nested brackets are slow to parse: refused unread past 128 levels, even in a small body.
  const nested = await requestText(app, query, 'POST', {}, '['.repeat(200) + ']'.repeat(200));
  assert.equal(nested.status, 400);
  assert.match(nested.body.error, /nested too deeply/);
  // Brackets inside strings are text, not nesting.
  assert.equal(nestedTooDeeply(Buffer.from(JSON.stringify({ a: '['.repeat(500) }))), false);
  assert.equal(nestedTooDeeply(Buffer.from(JSON.stringify({ a: '\\"[[[' }))), false);
  assert.equal(nestedTooDeeply(Buffer.from('['.repeat(129) + ']'.repeat(129))), true);
  assert.equal(nestedTooDeeply(Buffer.from('['.repeat(128) + ']'.repeat(128))), false);
});
test('queries without an account are limited per address, an IPv6 network counting as one', async () => {
  const app = createApplication({
    pool: {
      query() {
        throw new Error('Invalid queries must never reach storage');
      },
    },
  });
  const query = '/api/timelines/00000000-0000-0000-0000-000000000001/query',
    invalid = JSON.stringify({ kind: 'search' }),
    status = async (address) =>
      (await requestText(app, query, 'POST', {}, invalid, address)).status;
  // Every address of one /64 counts against the same limit (600 a minute).
  const statuses = [];
  for (let i = 1; i <= 601; i++) statuses.push(await status(`2001:db8:1:2::${i.toString(16)}`));
  assert.ok(statuses.slice(0, 600).every((s) => s === 400));
  assert.equal(statuses[600], 429);
  // Another network, and an IPv4 client, have their own.
  assert.equal(await status('2001:db8:1:3::1'), 400);
  assert.equal(await status('203.0.113.5'), 400);
});
