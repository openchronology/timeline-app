// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// The parts of a timeline a reader can hide (#618, src/layers.ts): its own parts, then a switch
// for each chart it draws, a plugin's among them; hidden parts read back from untrusted text.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  layerSwitches,
  measureChartLayer,
  MOMENTS_CHART,
  readHiddenLayers,
  TIMELINE_LAYERS,
} from '../dist/layers.mjs';

test('the timeline’s parts come first, then each chart in the order drawn', () => {
  const switches = layerSwitches({
    moments: { color: '#123456', plugin: 'Background chart' },
    measures: [
      { measure: 'debt', label: 'Federal debt', color: '#2a78d6', plugin: 'Debt balance' },
      { measure: 'spend', label: 'Spending', color: null },
    ],
  });
  assert.deepEqual(
    switches.map((s) => s.key),
    [
      ...TIMELINE_LAYERS.map((s) => s.key),
      MOMENTS_CHART,
      measureChartLayer('debt'),
      measureChartLayer('spend'),
    ],
  );
  assert.deepEqual(switches.at(-2), {
    key: 'chart:measure:debt',
    label: 'Federal debt',
    group: 'charts',
    color: '#2a78d6',
    source: 'Debt balance',
  });
  assert.equal(switches.at(-1).source, undefined);
  assert(switches.slice(0, TIMELINE_LAYERS.length).every((s) => s.group === 'timeline'));
});

test('without charts, only the timeline’s parts', () => {
  assert.deepEqual(layerSwitches({ moments: null, measures: [] }), [...TIMELINE_LAYERS]);
});

test('hidden parts are read back, malformed text dropped', () => {
  assert.deepEqual(
    [...readHiddenLayers(JSON.stringify(['moments', 'chart:measure:debt']))],
    ['moments', 'chart:measure:debt'],
  );
  assert.deepEqual(
    [...readHiddenLayers(JSON.stringify(['moments', 3, '', null, 'x'.repeat(301)]))],
    ['moments'],
  );
  for (const text of [null, '', '{', '{"moments":true}', '"moments"'])
    assert.equal(readHiddenLayers(text).size, 0);
  assert.equal(
    readHiddenLayers(JSON.stringify(Array.from({ length: 400 }, (_, i) => `k${i}`))).size,
    256,
  );
});
