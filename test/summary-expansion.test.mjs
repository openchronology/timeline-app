// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
import test from 'node:test';
import assert from 'node:assert/strict';
import { radialPositions } from '../dist/summary-expansion.mjs';
import { configureImages, imageSource } from '../dist/image-assets.mjs';
import {
  EXPAND_ON_HOVER,
  pluginExpand,
  validatePluginManifest,
  validateDocument,
} from '../dist/core.mjs';

test('null server asset maps do not interrupt repeated icon rendering, and offline images stay local', () => {
  const url =
    'https://thumb.wikimedia.org/wikipedia/commons/thumb/1/1c/Walls_of_Constantinople.JPG/330px-Walls_of_Constantinople.JPG';
  for (const empty of [null, undefined, {}]) {
    configureImages(empty);
    for (let i = 0; i < 100; i++) assert.equal(imageSource(url), url);
    configureImages(empty, true);
    assert.equal(imageSource(url), null);
    assert.equal(imageSource(null), null);
  }
  const embedded = 'data:image/png;base64,AAAA';
  configureImages({ [url]: embedded }, true);
  assert.equal(imageSource(url), embedded);
  configureImages(null, false);
  assert.equal(imageSource(url), url);
});
test('fan graduation is bounded and stays inside the viewport even near its edges', () => {
  for (const count of [2, 3, 4, 5])
    for (const [width, height] of [
      [1200, 365],
      [240, 180],
    ])
      for (const [x, y] of [
        [0, 0],
        [width, height],
        [width / 2, height / 2],
      ])
        for (const scale of [0.25, 1, 4]) {
          const points = radialPositions(count, width, height, x, y, scale);
          assert.equal(points.length, count);
          assert.equal(new Set(points.map((p) => `${p.x}:${p.y}`)).size, count);
          for (const p of points) {
            assert(p.x >= 20 * p.scale && p.x <= width - 20 * p.scale);
            assert(p.y >= 20 * p.scale && p.y <= height - 20 * p.scale);
          }
        }
  for (const count of [1, 6, 100000])
    assert.throws(() => radialPositions(count, 1200, 365, 500, 192, 1));
});
test('radial expansion is an optional serializable scripted plugin with restricted host effects', () => {
  assert.equal(pluginExpand(), false);
  const installed = { manifest: EXPAND_ON_HOVER, enabled: true };
  assert.equal(pluginExpand([installed]), true);
  assert.equal(pluginExpand([{ ...installed, enabled: false }]), false);
  const doc = validateDocument({
    format: 'openchronology',
    version: 1,
    title: 'Fan',
    description: '',
    events: [],
    plugins: [installed],
  });
  assert.equal(pluginExpand(validateDocument(JSON.parse(JSON.stringify(doc))).plugins), true);
  const custom = validatePluginManifest({
    ...EXPAND_ON_HOVER,
    id: 'custom-fan',
    source: 'function render(moment: string, api: PluginAPI): string { return api.expand(); }',
  });
  assert.equal(pluginExpand([{ manifest: custom, enabled: true }]), true);
  assert.throws(() => validatePluginManifest({ ...custom, summary: { kind: 'html' } }));
  assert.throws(() =>
    validatePluginManifest({
      ...custom,
      source:
        'function render(moment: string, api: PluginAPI): string { return api.fetch("https://example.org"); }',
    }),
  );
});
