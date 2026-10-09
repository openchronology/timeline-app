// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
import test from 'node:test';
import assert from 'node:assert/strict';
import { advise, record, THRESHOLDS, LIMIT, SAMPLES } from '../dist/core.mjs';

const none = () => ({ redraws: [], edits: [], views: [] });
test('the browser is advised by its own measurements, then by size', () => {
  assert.deepEqual(advise('browser', none(), { moments: 100 }), []);
  assert.deepEqual(advise('browser', { ...none(), open: THRESHOLDS.open + 1 }, { moments: 100 }), [
    { kind: 'browser', reason: 'open' },
  ]);
  assert.deepEqual(advise('browser', { ...none(), open: THRESHOLDS.open }, { moments: 100 }), []);
  // Redraws and draft saves need consistent medians, not one slow sample.
  const slow = THRESHOLDS.redraw + 50;
  assert.deepEqual(advise('browser', { ...none(), redraws: [slow, slow] }, { moments: 100 }), []);
  assert.deepEqual(advise('browser', { ...none(), redraws: [slow, 10, slow] }, { moments: 100 }), [
    { kind: 'browser', reason: 'redraw' },
  ]);
  assert.deepEqual(advise('browser', { ...none(), redraws: [slow, 10, 10] }, { moments: 100 }), []);
  assert.deepEqual(
    advise(
      'browser',
      { ...none(), edits: [THRESHOLDS.edit + 1, THRESHOLDS.edit + 5] },
      { moments: 5 },
    ),
    [{ kind: 'browser', reason: 'edit' }],
  );
  assert.deepEqual(advise('browser', none(), { moments: THRESHOLDS.moments }), [
    { kind: 'browser', reason: 'size' },
  ]);
  assert.deepEqual(advise('browser', none(), { moments: THRESHOLDS.moments - 1 }), []);
});
test('the desktop app and the platform are advised only on slow devices and near the limit', () => {
  assert.deepEqual(advise('desktop', none(), { moments: 190000 }), [
    { kind: 'limit', entity: 'moments', count: 190000 },
  ]);
  assert.deepEqual(advise('desktop', none(), { moments: 100000 }), []);
  const views = [1200, 1100, 1300];
  assert.deepEqual(advise('desktop', { ...none(), views }, { moments: 10 }), [
    { kind: 'desktop', reason: 'view' },
  ]);
  // The platform is never advised to move elsewhere.
  assert.deepEqual(advise('platform', { ...none(), views, open: 1e6 }, { moments: 10 }), []);
});
test('the limit warning covers moments, durations and relationships, before platform advice', () => {
  const near = THRESHOLDS.nearLimit;
  assert(near < LIMIT);
  assert.deepEqual(
    advise('browser', none(), { moments: near, durations: near - 1, relationships: near }),
    [
      { kind: 'limit', entity: 'moments', count: near },
      { kind: 'limit', entity: 'relationships', count: near },
      { kind: 'browser', reason: 'size' },
    ],
  );
});
test('only the most recent samples count', () => {
  const samples = [];
  for (let i = 0; i < SAMPLES + 3; i++) record(samples, i < 3 ? 1000 : 1);
  assert.equal(samples.length, SAMPLES);
  assert.deepEqual(advise('browser', { ...none(), redraws: samples }, { moments: 1 }), []);
});
