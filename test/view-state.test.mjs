// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// A view kept across reloads (#128, src/view-state.ts): read back whole, malformed parts dropped,
// kept per server and timeline.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readViewState, viewStorageKey, VIEW_PREFIX } from '../dist/view-state.mjs';

test('a stored view is read back whole', () => {
  const state = {
    left: '-3/7',
    right: '1000000000000000000001/3',
    density: 30,
    separation: { tags: ['deploy', 'incident'] },
    follow: true,
  };
  assert.deepEqual(readViewState(JSON.stringify(state)), state);
  const related = { related: { duration: 'd1' }, depth: 'all', label: 'Release' };
  assert.deepEqual(readViewState(JSON.stringify({ separation: related })), {
    separation: related,
  });
});

test('malformed or missing parts are dropped', () => {
  for (const text of [null, '', 'not json', '[]', '7', 'null'])
    assert.deepEqual(readViewState(text), {});
  assert.deepEqual(readViewState(JSON.stringify({ left: '2', right: '1', follow: false })), {
    follow: false,
  });
  assert.deepEqual(readViewState(JSON.stringify({ left: '1', right: '1' })), {});
  assert.deepEqual(readViewState(JSON.stringify({ left: 'x', right: '1/0' })), {});
  assert.deepEqual(readViewState(JSON.stringify({ left: 1, right: 2 })), {});
  for (const density of [11, 49, 24.5, '24'])
    assert.deepEqual(readViewState(JSON.stringify({ density })), {});
  for (const separation of [
    { tags: [] },
    { tags: ['a', 3] },
    { tags: Array.from({ length: 65 }, (_, i) => 't' + i) },
    { related: { moment: 'm', duration: 'd' }, depth: 'all', label: '' },
    { related: { event: 'm' }, depth: 'all', label: '' },
    { related: { moment: 'm' }, depth: 'some', label: '' },
    { related: { moment: 'm' }, depth: 'direct' },
    'tags',
  ])
    assert.deepEqual(readViewState(JSON.stringify({ separation })), {});
  assert.deepEqual(readViewState(JSON.stringify({ follow: 'true' })), {});
});

test('views are kept per server and timeline', () => {
  const a = viewStorageKey('https://a.example', 'id'),
    b = viewStorageKey('https://b.example', 'id');
  assert.notEqual(a, b);
  assert(a.startsWith(VIEW_PREFIX) && b.startsWith(VIEW_PREFIX));
});
