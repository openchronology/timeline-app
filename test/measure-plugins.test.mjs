// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// What plugins do with measures (#575): a background chart of a measure's totals, markers sized
// by one, scripts reading a moment's value exactly, and overviews carrying the values.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validatePluginManifest,
  pluginChart,
  pluginSizeMeasure,
  pluginColor,
  pluginMetadata,
  momentDensity,
} from '../dist/core.mjs';

const manifest = (extra) => ({
  apiVersion: 1,
  id: 'costs',
  version: 1,
  name: 'Costs',
  description: 'Costs',
  fields: [],
  ...extra,
});
const installed = (extra) => [{ manifest: validatePluginManifest(manifest(extra)), enabled: true }];

test('a chart may draw a measure, and markers may be sized by one', () => {
  const chart = validatePluginManifest(manifest({ chart: { kind: 'measure', measure: 'cost' } }));
  assert.deepEqual(chart.chart, { kind: 'measure', measure: 'cost' });
  assert.deepEqual(pluginChart([{ manifest: chart, enabled: true }]), {
    color: null,
    series: [],
    measure: 'cost',
  });
  for (const bad of [
    { kind: 'measure' },
    { kind: 'measure', measure: 'Cost' },
    { kind: 'measure', measure: 'cost', series: [{ label: 'x', tags: ['a'], color: '#000000' }] },
    { kind: 'moments', measure: 'cost' },
  ])
    assert.throws(
      () => validatePluginManifest(manifest({ chart: bad })),
      undefined,
      JSON.stringify(bad),
    );
  const sized = validatePluginManifest(manifest({ sizeBy: { measure: 'hours' } }));
  assert.deepEqual(sized.sizeBy, { measure: 'hours' });
  assert.equal(pluginSizeMeasure([{ manifest: sized, enabled: true }]), 'hours');
  assert.equal(pluginSizeMeasure([{ manifest: sized, enabled: false }]), null);
  assert.throws(() => validatePluginManifest(manifest({ sizeBy: { measure: '1x' } })));
  assert.throws(() => validatePluginManifest(manifest({ sizeBy: { measure: 'x', by: 1 } })));
});

test("scripts read a moment's measure value exactly, and compare it", () => {
  const plugins = installed({
    source: `function render(m, api) {
      return api.compare(api.measure("cost"), api.rational("100000")) > 0
        ? api.color("#cc0000")
        : api.compare(api.add(api.measure("cost"), api.measure("tips")), api.rational("1/3")) === 0
          ? api.color("#00cc00")
          : api.none();
    }`,
  });
  assert.equal(pluginColor(plugins, { measures: { cost: '250000' } }), '#cc0000');
  assert.equal(pluginColor(plugins, { measures: { cost: '1/2', tips: '-1/6' } }), '#00cc00');
  assert.equal(pluginColor(plugins, {}), null);
  // A name no measure could have makes the script fail, which shows nothing of it.
  const bad = installed({
    source:
      'function render(m, api) { return api.measure("No") ? api.color("#ff0000") : api.none(); }',
  });
  assert.equal(pluginColor(bad, { measures: { cost: '1' } }), null);
});

test('overviews carry measure values for the plugins that read them', () => {
  const plugins = installed({ hover: { kind: 'card' } });
  assert.deepEqual(pluginMetadata(plugins, { title: 'A', measures: { cost: '5' } }).measures, {
    cost: '5',
  });
  // Not without an enabled plugin, nor when too large to carry.
  assert.equal(
    pluginMetadata([{ ...plugins[0], enabled: false }], { measures: { cost: '5' } }).measures,
    undefined,
  );
  assert.equal(
    pluginMetadata(plugins, { measures: { cost: '9'.repeat(1100) } }).measures,
    undefined,
  );
});

test("a measure chart weighs each group by its total's value", () => {
  const groups = [
    { first: '0/1', last: '0/1', count: '1' },
    { first: '100/1', last: '100/1', count: '3' },
  ];
  const x = (t) => Number(t.split('/')[0]);
  const values = momentDensity(groups, x, 100, 1);
  assert(values[values.length - 1] > values[0]);
});
