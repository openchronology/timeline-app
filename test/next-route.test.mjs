// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// The Next.js route bridge (server/next-handler.mjs): streamed requests, redirects, cookies and
// sessions, startup failures, binary responses, and safe login return paths.
import test from 'node:test';
import assert from 'node:assert/strict';
import { dispatchNextRequest } from '../server/next-handler.mjs';
import { createRequestHandler } from '../server/http.mjs';
import { safeReturnTo } from '../platform/lib/navigation.js';

test('Next route bridge preserves streamed requests, redirects, and separate session cookies', async () => {
  const request = new Request('https://timescale.info/api/auth/example?state=abc', {
    method: 'POST',
    headers: { Origin: 'https://timescale.info', 'Content-Type': 'application/json' },
    body: JSON.stringify({ value: '1/3' }),
  });
  const response = await dispatchNextRequest(request, async (req, res) => {
    assert.equal(req.url, '/api/auth/example?state=abc');
    assert.equal(req.method, 'POST');
    assert.equal(req.headers.origin, 'https://timescale.info');
    const parts = [];
    for await (const part of req) parts.push(part);
    assert.deepEqual(JSON.parse(Buffer.concat(parts)), { value: '1/3' });
    res.writeHead(303, {
      Location: '/account',
      'Set-Cookie': [
        '__Host-oc_session=one; Path=/; Secure; HttpOnly',
        '__Host-oc_login=; Path=/; Max-Age=0; Secure; HttpOnly',
      ],
    });
    res.end();
  });
  assert.equal(response.status, 303);
  assert.equal(response.headers.get('location'), '/account');
  assert.equal(response.headers.getSetCookie().length, 2);
});
test('Next handlers retain guest sessions, origin restrictions and non-disclosing database failures', async () => {
  const handler = createRequestHandler({ origin: 'https://timescale.info' });
  const session = await dispatchNextRequest(
    new Request('https://timescale.info/api/session'),
    handler,
  );
  assert.equal(session.status, 200);
  assert.equal((await session.json()).user, null);
  assert.equal(session.headers.get('cache-control'), 'no-store');
  const foreign = await dispatchNextRequest(
    new Request('https://timescale.info/api/timelines', {
      method: 'POST',
      headers: { Origin: 'https://evil.example', 'Content-Type': 'application/json' },
      body: '{}',
    }),
    handler,
  );
  assert.equal(foreign.status, 403);
  const failed = createRequestHandler({
    pool: {
      async query() {
        throw new Error('SECRET database connection');
      },
    },
  });
  const health = await dispatchNextRequest(new Request('https://timescale.info/healthz'), failed);
  assert.equal(health.status, 503);
  assert.deepEqual(await health.json(), { status: 'unavailable' });
});
test('platform startup failures answer JSON, and plain HTTP is allowed only when opted in', async (t) => {
  const names = ['NODE_ENV', 'APP_ORIGIN', 'ALLOW_INSECURE_ORIGIN', 'DATABASE_URL', 'PGDATABASE'];
  const saved = Object.fromEntries(names.map((name) => [name, process.env[name]]));
  const services = Symbol.for('openchronology.platform.services');
  t.after(() => {
    for (const name of names)
      if (saved[name] === undefined) delete process.env[name];
      else process.env[name] = saved[name];
    delete globalThis[services];
  });
  t.mock.method(console, 'error', () => {});
  delete process.env.DATABASE_URL;
  delete process.env.PGDATABASE;
  delete process.env.ALLOW_INSECURE_ORIGIN;
  process.env.NODE_ENV = 'production';
  process.env.APP_ORIGIN = 'http://timeline.lan:5173';
  const request = () => new Request('http://timeline.lan:5173/api/session');
  const refused = await dispatchNextRequest(request());
  assert.equal(refused.status, 503);
  assert.match((await refused.json()).error, /^Server misconfigured: .*ALLOW_INSECURE_ORIGIN=1/);
  process.env.ALLOW_INSECURE_ORIGIN = '1';
  const allowed = await dispatchNextRequest(request());
  assert.equal(allowed.status, 200);
  assert.equal((await allowed.json()).user, null);
});
test('Next handlers preserve binary responses and omit HEAD and no-content bodies', async () => {
  const bytes = Uint8Array.from([83, 81, 76, 105, 116, 101]);
  const binary = await dispatchNextRequest(
    new Request('https://timescale.info/api/files/export'),
    async (_req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/vnd.openchronology.sqlite' });
      res.end(bytes);
    },
  );
  assert.deepEqual(new Uint8Array(await binary.arrayBuffer()), bytes);
  const head = await dispatchNextRequest(
    new Request('https://timescale.info/api/session', { method: 'HEAD' }),
    async (_req, res) => {
      res.writeHead(200);
      res.end('private');
    },
  );
  assert.equal(await head.text(), '');
});
test('login return paths accept canonical pages and refuse external or ambiguous destinations', () => {
  for (const path of [
    '/',
    '/account',
    '/editor',
    '/plugins',
    '/timelines/00000000-0000-0000-0000-000000000001',
    '/ada/voyages',
    '/ada/00000000-0000-0000-0000-000000000001',
    '/connect/desktop/ABCDEFGH23',
  ])
    assert.equal(safeReturnTo(path), path);
  for (const path of [
    'https://evil.example',
    '//evil.example',
    '/\\evil.example',
    '/editor?next=https://evil.example',
    '/api/auth/logout',
    '/ada/voyages/settings',
    '/ada/voyages?next=https://evil.example',
    '/login/voyages',
    undefined,
  ])
    assert.equal(safeReturnTo(path), '/');
});
