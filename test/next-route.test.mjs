// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
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
    '/connect/desktop/ABCDEFGH23',
  ])
    assert.equal(safeReturnTo(path), path);
  for (const path of [
    'https://evil.example',
    '//evil.example',
    '/\\evil.example',
    '/editor?next=https://evil.example',
    '/api/auth/logout',
    undefined,
  ])
    assert.equal(safeReturnTo(path), '/');
});
