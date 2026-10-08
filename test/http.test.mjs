// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { createApplication } from '../server/http.mjs';
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
    'SELECT t.tags,t.assets,t.search_document,t.head_revision_id,p.source_revision_id FROM oc_timelines t LEFT JOIN oc_proposals p ON false LEFT JOIN oc_plugins l ON false LEFT JOIN oc_revisions r ON false LEFT JOIN oc_snapshots s ON false LIMIT 0',
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
    fileExchange: false,
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
    { kind: 'search' },
    { kind: 'search', text: 'x'.repeat(201) },
    { kind: 'search', text: 'harbor', page: 0 },
    { kind: 'search', text: 'harbor', page: 1.5 },
    { kind: 'duration' },
    { kind: 'duration', id: 'bad id' },
  ])
    assert.equal((await request(app, path, 'POST', headers, input)).status, 400);
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
