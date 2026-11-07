// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// Which pages a shared cache may keep (#473, server/shared-cache.mjs), and the launcher's last
// word on their headers (server/shared-response.cjs): the router's payload and server errors
// kept private, and Vary: Cookie on the rest.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { SHARED_CACHE_CONTROL, sharedPage } from '../server/shared-cache.mjs';

const ID = '0f8fad5b-d9cb-469f-a165-70867728950e';
const page = (pathname, headers = {}, method = 'GET') =>
  sharedPage({ method, pathname, headers: new Headers(headers) });

test('signed-out views of public pages may be kept by a shared cache', () => {
  for (const pathname of [
    '/',
    '/explore',
    '/for',
    '/for/educators',
    '/help',
    '/help/faq',
    '/alice',
    '/users/alice',
    `/timelines/${ID}`,
    `/timelines/${ID}/moments/m1`,
    `/timelines/${ID}/durations/d1`,
    '/alice/history-of-rome',
    '/alice/history-of-rome/moments/m1',
    '/alice/history-of-rome/durations/d1',
  ])
    assert.ok(page(pathname), pathname);
  assert.ok(page('/help', {}, 'HEAD'));
  // Other cookies, such as analytics', do not make a visitor signed in.
  assert.ok(page('/help', { cookie: '_ga=GA1.1.1; theme=dark' }));
  assert.match(SHARED_CACHE_CONTROL, /^public, s-maxage=\d+, stale-while-revalidate=\d+$/);
});

test('a signed-in visitor, a client with a token and other pages are never shared', () => {
  for (const cookie of [
    'oc_session=abc',
    '__Host-oc_session=abc',
    '_ga=GA1.1.1; __Host-oc_session=abc',
  ]) {
    assert.equal(page('/help', { cookie }), false, cookie);
    assert.equal(page(`/timelines/${ID}`, { cookie }), false, cookie);
  }
  assert.equal(page('/alice', { authorization: 'Bearer och_key_x' }), false);
  assert.equal(page(`/timelines/${ID}`, { authorization: 'Bearer token' }), false);
  assert.equal(page('/help', {}, 'POST'), false);
  for (const pathname of [
    '/login',
    '/account',
    '/admin',
    '/editor',
    '/download',
    '/plugins',
    '/compare',
    '/connect/desktop/ABC',
    '/help/faq/more',
    `/timelines/${ID}/history`,
    `/timelines/${ID}/settings`,
    `/timelines/${ID}/pulls`,
    `/timelines/${ID}/sync`,
    `/timelines/${ID}/moments/m1/opengraph-image`,
    '/alice/history-of-rome/settings',
    '/timelines/not-an-id',
    '/favicon.ico',
  ])
    assert.equal(page(pathname), false, pathname);
});

test('the launcher keeps the router payload and server errors private, and varies by Cookie', async () => {
  const require = createRequire(import.meta.url);
  const http = require('node:http');
  const createServer = http.createServer;
  try {
    require('../server/shared-response.cjs');
    const server = http.createServer((req, res) => {
      const url = new URL(req.url, 'http://localhost');
      res.statusCode = Number(url.searchParams.get('status') ?? 200);
      if (url.pathname !== '/private') res.setHeader('Cache-Control', SHARED_CACHE_CONTROL);
      else res.setHeader('Cache-Control', 'private, no-store');
      res.setHeader('Vary', 'rsc, Accept-Encoding');
      res.end('page');
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const origin = `http://127.0.0.1:${server.address().port}`;
    const get = (path, headers) => fetch(origin + path, { headers });
    try {
      const shared = await get('/help');
      assert.equal(shared.headers.get('cache-control'), SHARED_CACHE_CONTROL);
      assert.equal(shared.headers.get('vary'), 'rsc, Accept-Encoding, Cookie');
      const missing = await get('/help?status=404');
      assert.equal(missing.headers.get('cache-control'), SHARED_CACHE_CONTROL);
      for (const [path, headers] of [
        ['/help', { RSC: '1' }],
        ['/help', { 'Next-Router-Prefetch': '1' }],
        ['/help?_rsc=abc', {}],
        ['/help?status=500', {}],
        ['/help?status=503', {}],
      ]) {
        const response = await get(path, headers);
        assert.match(response.headers.get('cache-control'), /^private, no-cache, no-store/, path);
        assert.doesNotMatch(response.headers.get('vary'), /Cookie/, path);
      }
      const other = await get('/private');
      assert.equal(other.headers.get('cache-control'), 'private, no-store');
      assert.equal(other.headers.get('vary'), 'rsc, Accept-Encoding');
    } finally {
      server.close();
    }
  } finally {
    http.createServer = createServer;
  }
});
