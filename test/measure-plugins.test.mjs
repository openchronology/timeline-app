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

test('a balance chart draws a measure’s running balance as steps (#595)', async () => {
  const { balanceSteps, stepPaths } = await import('../dist/core.mjs');
  const chart = validatePluginManifest(manifest({ chart: { kind: 'balance', measure: 'cost' } }));
  assert.deepEqual(chart.chart, { kind: 'balance', measure: 'cost' });
  assert.deepEqual(pluginChart([{ manifest: chart, enabled: true }]), {
    color: null,
    series: [],
    balance: 'cost',
  });
  assert.throws(() => validatePluginManifest(manifest({ chart: { kind: 'balance' } })));
  const x = (t) => Number(t.split('/')[0]);
  // From 100, down 150 at 20 (below zero), up 50 at 60.
  const groups = [
    { first: '20/1', last: '20/1', balanceAfter: { cost: '-50' } },
    { first: '50/1', last: '70/1', balanceAfter: { cost: '0' } },
  ];
  const { steps, zero, low, high } = balanceSteps(groups, 'cost', 100, 0, x, 100);
  // Its axis runs from the lowest balance in view to the highest.
  assert.deepEqual([low, high], [-50, 100]);
  assert.deepEqual(steps, [
    [0, 1],
    [20, 0],
    [60, 1 / 3],
  ]);
  assert.equal(zero, 1 / 3);
  const { line, area } = stepPaths(steps, zero, 10, 100, 0, 30);
  assert.equal(line, 'M10 0H30V30H70V20H110');
  assert.equal(area, 'M10 0H30V30H70V20H110V20H10Z');
  // Changes with no summary to place them step at the view's end; a flat zero draws nothing.
  assert.deepEqual(balanceSteps([], 'cost', 5, 7, x, 100).steps.at(-1), [100, 1]);
  assert.equal(balanceSteps([], 'cost', 0, 0, x, 100), null);
});

test('every measure and balance chart is drawn, each with its own axis', async () => {
  const { pluginCharts } = await import('../dist/core.mjs');
  const plugin = (id, chart, enabled = true) => ({
    manifest: validatePluginManifest(manifest({ id, chart })),
    enabled,
  });
  const charts = pluginCharts([
    plugin('first-moments', { kind: 'moments' }),
    plugin('debt', { kind: 'balance', measure: 'debt' }),
    plugin('spending', { kind: 'measure', measure: 'spend' }),
    plugin('off', { kind: 'measure', measure: 'off' }, false),
    plugin('last-moments', {
      kind: 'moments',
      series: [{ label: 'Errors', tags: ['error'], color: '#cc0000' }],
    }),
  ]);
  // One moments chart, the last enabled; every enabled measure chart, in plugin order.
  assert.deepEqual(charts.moments, {
    color: null,
    series: [{ label: 'Errors', tags: ['error'], color: '#cc0000' }],
    plugin: 'last-moments',
  });
  assert.deepEqual(charts.measures, [
    { kind: 'balance', measure: 'debt', color: null, plugin: 'debt' },
    { kind: 'measure', measure: 'spend', color: null, plugin: 'spending' },
  ]);
  assert.deepEqual(pluginCharts([]), { moments: null, measures: [] });
});

test('a chart axis has round values, exact, at their heights', async () => {
  const { axisTicks } = await import('../dist/core.mjs');
  const text = (ticks) => ticks.map((t) => t.value.toString().replace(/\/1$/, ''));
  assert.deepEqual(text(axisTicks(0, 3909956292398)), [
    '0',
    '1000000000000',
    '2000000000000',
    '3000000000000',
  ]);
  const ticks = axisTicks(-50, 100);
  assert.deepEqual(text(ticks), ['-50', '0', '50', '100']);
  assert.deepEqual(
    ticks.map((t) => t.at),
    [0, 1 / 3, 2 / 3, 1],
  );
  // Small and fractional: exact decimals, never binary floating point.
  assert.deepEqual(text(axisTicks(0, 0.03)), ['0', '1/100', '1/50', '3/100']);
  assert.deepEqual(axisTicks(5, 5), []);
  assert.deepEqual(axisTicks(0, Infinity), []);
  // More values on a taller axis, at 2.5 times a power of ten where that fits best.
  assert.deepEqual(text(axisTicks(0, 38e12, 9)), [
    '0',
    '5000000000000',
    '10000000000000',
    '15000000000000',
    '20000000000000',
    '25000000000000',
    '30000000000000',
    '35000000000000',
  ]);
  assert.deepEqual(text(axisTicks(0, 10, 4)), ['0', '5/2', '5', '15/2', '10']);
});

test('a balance chart reads exactly under the mouse (#595)', async () => {
  const { balanceAt } = await import('../dist/core.mjs');
  const groups = [
    { first: '10', last: '10', balanceAfter: { debt: '1/3' } },
    { first: '20', last: '40', balanceAfter: { debt: '7' } },
    { first: '50', last: '50' },
    { first: '60', last: '60', balanceAfter: { debt: '-2' } },
  ];
  const x = (time) => Number(time);
  const at = (px) => balanceAt(groups, 'debt', '5', x, 100, px);
  assert.equal(at(0), '5');
  assert.equal(at(10), '1/3');
  // A summary's step is at its middle, as the chart draws it.
  assert.equal(at(29), '1/3');
  assert.equal(at(30), '7');
  assert.equal(at(55), '7');
  assert.equal(at(99), '-2');
});

test('scripts read a moment’s or summary’s balance after it (#595)', async () => {
  const { pluginSummaryEffects, BALANCES, groupBalanceSpans } = await import('../dist/core.mjs');
  const source = `function render(m, api) {
    return api.compare(api.balance("cost"), api.rational("0")) < 0 ? api.color("#cc0000") : api.none();
  }`;
  const plugins = installed({ source, renderSummaries: true });
  const overdrawn = { cost: { before: '10', after: '-5' } },
    fine = { cost: { before: '-5', after: '5' } };
  assert.deepEqual(pluginSummaryEffects(plugins, { cost: '-15' }, undefined, overdrawn), {
    color: '#cc0000',
  });
  assert.deepEqual(pluginSummaryEffects(plugins, { cost: '10' }, undefined, fine), {});
  // A moment's, on its metadata; without a balance there is none to compare.
  assert.equal(pluginColor(plugins, { [BALANCES]: overdrawn }), '#cc0000');
  assert.equal(pluginColor(plugins, {}), null);
  // Each group's balance before is the one before's after; the first's is the window's.
  assert.deepEqual(
    groupBalanceSpans([{ balanceAfter: { cost: '3' } }, { balanceAfter: { cost: '7' } }], {
      cost: { before: '1', after: '7' },
    }),
    [{ cost: { before: '1', after: '3' } }, { cost: { before: '3', after: '7' } }],
  );
  assert.equal(groupBalanceSpans([{}], undefined), undefined);
});
