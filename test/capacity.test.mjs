// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
import test from 'node:test';
import assert from 'node:assert/strict';
import { advise, record, nearLimit, THRESHOLDS, LIMIT, SAMPLES } from '../dist/core.mjs';

const none = () => ({ navigation: [], edits: [], views: [] });
test('the browser is advised by its own measurements, then by size', () => {
  assert.deepEqual(advise('browser', none(), { moments: 100 }), []);
  assert.deepEqual(advise('browser', { ...none(), open: THRESHOLDS.open + 1 }, { moments: 100 }), [
    { kind: 'browser', reason: 'open' },
  ]);
  assert.deepEqual(advise('browser', { ...none(), open: THRESHOLDS.open }, { moments: 100 }), []);
  // Navigation waits and draft saves need consistent medians, not one slow sample.
  const slow = THRESHOLDS.navigation + 50;
  assert.deepEqual(
    advise('browser', { ...none(), navigation: [slow, slow] }, { moments: 1000 }),
    [],
  );
  assert.deepEqual(
    advise('browser', { ...none(), navigation: [slow, 10, slow] }, { moments: 1000 }),
    [{ kind: 'browser', reason: 'navigation' }],
  );
  assert.deepEqual(
    advise('browser', { ...none(), navigation: [slow, 10, 10] }, { moments: 1000 }),
    [],
  );
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
test('slow navigation is advised from the size where another platform helps', () => {
  const slow = THRESHOLDS.navigation + 100;
  const m = () => ({ ...none(), navigation: [slow, slow, slow] });
  // Below it, the per-frame cost every platform shares (#68): nothing to advise.
  assert.deepEqual(advise('browser', m(), { moments: THRESHOLDS.navigationMoments - 1 }), []);
  assert.deepEqual(advise('browser', m(), { moments: THRESHOLDS.navigationMoments }), [
    { kind: 'browser', reason: 'navigation' },
  ]);
  // Opening and edits are advised at any size.
  assert.deepEqual(advise('browser', { ...none(), open: THRESHOLDS.open + 1 }, { moments: 10 }), [
    { kind: 'browser', reason: 'open' },
  ]);
});
test('once measured slow, the advice holds for the timeline', () => {
  const m = none();
  const slow = THRESHOLDS.navigation + 100,
    moments = THRESHOLDS.navigationMoments;
  for (const wait of [slow, slow, slow]) record(m.navigation, wait);
  assert.deepEqual(advise('browser', m, { moments }), [{ kind: 'browser', reason: 'navigation' }]);
  assert.deepEqual(m.slow, { reason: 'navigation', ms: slow });
  // Quick views later (a small pan after slow zooming) do not make it fast.
  for (let i = 0; i < SAMPLES; i++) record(m.navigation, 20);
  assert.deepEqual(advise('browser', m, { moments }), [{ kind: 'browser', reason: 'navigation' }]);
  // A slow open is reported over navigation.
  m.open = THRESHOLDS.open + 1;
  assert.deepEqual(advise('browser', m, { moments }), [{ kind: 'browser', reason: 'open' }]);
  assert.deepEqual(m.slow, { reason: 'open', ms: THRESHOLDS.open + 1 });
});
test('only the most recent samples count', () => {
  const samples = [];
  for (let i = 0; i < SAMPLES + 3; i++) record(samples, i < 3 ? 1000 : 1);
  assert.equal(samples.length, SAMPLES);
  assert.deepEqual(advise('browser', { ...none(), navigation: samples }, { moments: 1 }), []);
});

test("the limit warning follows the server's limit, and none without one", () => {
  assert.equal(nearLimit(), THRESHOLDS.nearLimit);
  assert.equal(nearLimit(1000000), 750000);
  assert.deepEqual(advise('platform', none(), { moments: 190000, limit: 1000000 }), []);
  assert.deepEqual(advise('platform', none(), { moments: 750000, limit: 1000000 }), [
    { kind: 'limit', entity: 'moments', count: 750000 },
  ]);
  assert.deepEqual(advise('platform', none(), { moments: 5e7, limit: Infinity }), []);
  assert.deepEqual(advise('platform', none(), { moments: 800, limit: 1000 }), [
    { kind: 'limit', entity: 'moments', count: 800 },
  ]);
});
