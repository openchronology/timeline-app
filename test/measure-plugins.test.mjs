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

test("scripts that render summaries read their totals, and each compared timeline's (#587)", async () => {
  const { pluginSummaryEffects } = await import('../dist/core.mjs');
  const source = `function render(m, api) {
    return api.compare(api.total("cost"), api.rational("1000")) > 0
      ? api.merge(api.color("#cc0000"), api.size("large"))
      : api.compare(api.total("cost", 2), api.rational("0")) > 0
        ? api.shape("diamond")
        : api.none();
  }`;
  const summaries = installed({ source, renderSummaries: true });
  assert.deepEqual(pluginSummaryEffects(summaries, { cost: '2500' }), {
    color: '#cc0000',
    size: 'large',
  });
  assert.deepEqual(pluginSummaryEffects(summaries, { cost: '10' }), {});
  // In a comparison, the second timeline's own totals; the first's never add to them.
  const timelines = (n) => [{ cost: '9999' }, { cost: '5' }][n - 1];
  assert.deepEqual(pluginSummaryEffects(summaries, undefined, timelines), { shape: 'diamond' });
  // A moment's total is its value.
  assert.equal(pluginColor(summaries, { measures: { cost: '1001' } }), '#cc0000');
  // Plugins that don't render summaries leave them as they were.
  assert.deepEqual(pluginSummaryEffects(installed({ source }), { cost: '2500' }), {});
  assert.throws(() => validatePluginManifest(manifest({ renderSummaries: true })), /with a script/);
  assert.throws(
    () => validatePluginManifest(manifest({ source, renderSummaries: 'yes' })),
    /with a script/,
  );
});

test('derivations read a measure: a value, or a summary’s total (#587)', async () => {
  const { derivedMetadata, pluginSummaryEffects } = await import('../dist/core.mjs');
  const plugins = installed({
    fields: [{ kind: 'color', metadataKey: 'color', label: 'Color' }],
    derive: [
      { metadataKey: 'color', from: [{ measure: 'tier' }], map: { 1: '#111111', 2: '#222222' } },
    ],
    marker: { kind: 'color', metadataKey: 'color' },
    source: 'function render(m, api) { return api.color(api.get("color")); }',
    renderSummaries: true,
  });
  assert.equal(derivedMetadata(plugins, { measures: { tier: '2' } }).color, '#222222');
  assert.equal(pluginColor(plugins, { measures: { tier: '1' } }), '#111111');
  assert.deepEqual(pluginSummaryEffects(plugins, { tier: '2' }), { color: '#222222' });
  assert.throws(() =>
    validatePluginManifest(manifest({ derive: [{ metadataKey: 'x', from: [{ measure: 'No' }] }] })),
  );
});
