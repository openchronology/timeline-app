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
test('local deployments serve an anonymous session and reject foreign-origin writes', async () => {
  const app = createApplication();
  const session = await request(app, '/api/session');
  assert.deepEqual(session.body, { server: false, user: null, csrf: null });
  const write = await request(app, '/api/timelines', 'POST', {
    origin: 'https://attacker.example',
  });
  assert.equal(write.status, 403);
  const notConfigured = await request(app, '/api/timelines', 'POST', {
    origin: 'http://localhost:5173',
  });
  assert.equal(notConfigured.status, 503);
});
test('overview validation rejects missing, negative, or inexact numeric bounds before accessing storage', async () => {
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
