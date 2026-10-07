// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
import assert from 'node:assert/strict';
import test from 'node:test';
import { quotaValue, avatarValue } from '../server/administration.mjs';
import { keyInput, authorizeKey } from '../server/api-keys.mjs';
test('quotas accept exact bounded whole bytes only', () => {
  for (const v of [0, '104857600', 10_000_000_000_000]) assert.equal(quotaValue(v), String(v));
  assert.equal(quotaValue(null, true), null);
  for (const v of [null, undefined, -1, 1.5, Infinity, '01', '1e6', '100;DROP', 10_000_000_000_001])
    assert.throws(() => quotaValue(v));
});
test('avatar uploads cannot introduce executable formats or unbounded data', () => {
  const png = 'data:image/png;base64,iVBORw0KGgo=';
  assert.equal(avatarValue(png), png);
  assert.equal(avatarValue('https://example.test/avatar.png'), 'https://example.test/avatar.png');
  assert.equal(avatarValue(''), '');
  for (const v of [
    'http://example.test/a',
    'https://name:secret@example.test/a',
    'javascript:alert(1)',
    'data:image/svg+xml;base64,PHN2Zz4=',
    'data:image/png;base64,PHN2Zz4=',
    png + '=',
    'data:image/png;base64,' + Buffer.alloc(300000).toString('base64'),
  ])
    assert.throws(() => avatarValue(v));
});
test('API key definitions have bounded lifetimes and an explicit scope allowlist', () => {
  assert.deepEqual(keyInput({ name: ' ingest ' }), {
    name: 'ingest',
    scopes: ['timelines:read'],
    days: 90,
  });
  for (const v of [
    { name: '' },
    { name: 'x', scopes: ['admin'] },
    { name: 'x', scopes: [] },
    { name: 'x', days: 366 },
    { name: 'x', days: 1.5 },
    { name: 'x', unexpected: true },
  ])
    assert.throws(() => keyInput(v));
});
test('API scopes cannot grant account/admin access or bypass write restrictions', () => {
  const read = { kind: 'api', scopes: ['timelines:read'] },
    write = { kind: 'api', scopes: ['timelines:read', 'timelines:write'] };
  for (const method of ['GET', 'HEAD']) authorizeKey(read, '/api/timelines/id', method);
  authorizeKey(read, '/api/timelines/id/query', 'POST');
  authorizeKey(read, '/api/timelines/search', 'POST');
  for (const method of ['PUT', 'POST', 'DELETE', 'PATCH'])
    assert.throws(() => authorizeKey(read, '/api/timelines/id', method));
  authorizeKey(write, '/api/timelines/id', 'PUT');
  for (const path of [
    '/api/auth/account',
    '/api/admin/users',
    '/api/timelinesXYZ',
    '/api/files/export',
  ])
    assert.throws(() => authorizeKey(write, path, 'GET'));
});

test('live streaming cannot bypass the API key endpoint boundary', async () => {
  const { liveResponse } = await import('../server/live.mjs');
  const response = await liveResponse(
    new Request('https://example.test/api/live', {
      headers: { Authorization: 'Bearer och_key_invalid' },
    }),
    {
      pool: {},
      auth: {
        session() {
          throw new Error('Must reject before authentication');
        },
      },
    },
  );
  assert.equal(response.status, 403);
});
