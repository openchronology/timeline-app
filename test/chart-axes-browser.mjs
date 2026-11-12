// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// Measure and balance charts together (#595), each with a value axis on the right: a balance
// chart's from the view's lowest balance to its highest, a measure chart's as a rate per the
// ruler's labelled step, both in their measure's format and their plugin's color.
import assert from 'node:assert/strict';
import { closeMomentDetails } from './moment-dialog-browser.mjs';
import { BACKGROUND_CHART, DEFAULT_PRESENTATION } from '../dist/core.mjs';

export async function checkChartAxes(page) {
  const plugin = (id, name, chart) => ({
    ...BACKGROUND_CHART,
    id,
    name,
    chart: { ...chart, setting: 'color' },
  });
  // Every five years from 1800 to 2025: debt grows 6% a year, spending 5%.
  const year = (y) => `${Math.round((y - 1970) * 31557600)}/1`;
  const events = [];
  for (let y = 1800; y <= 2025; y += 5)
    events.push({
      id: `d${y}`,
      time: year(y),
      metadata: {
        title: `${y}`,
        measures: {
          debt: String(BigInt(Math.round(1e6 * 1.06 ** (y - 1800))) * 100n),
          spend: String(BigInt(Math.round(2e5 * 1.05 ** (y - 1800))) * 100n),
        },
      },
    });
  const dollars = { mode: 'fixed', scale: '1/100', decimals: 2, prefix: '$' };
  await closeMomentDetails(page);
  await page.locator('#json-file').setInputFiles({
    name: 'axes.ochx',
    mimeType: 'application/json',
    buffer: Buffer.from(
      JSON.stringify({
        format: 'openchronology',
        version: 1,
        title: 'Chart axes',
        description: '',
        presentation: { ...DEFAULT_PRESENTATION, mode: 'gregorian' },
        measures: {
          debt: {
            type: 'mpz',
            label: 'Federal debt',
            presentation: dollars,
            balance: { at: 'start', value: '0' },
          },
          spend: { type: 'mpz', label: 'Spending', presentation: dollars },
        },
        plugins: [
          {
            manifest: plugin('debt-balance', 'Debt balance', { kind: 'balance', measure: 'debt' }),
            enabled: true,
            settings: { color: '#3b6fb6' },
          },
          {
            manifest: plugin('spending-chart', 'Spending', { kind: 'measure', measure: 'spend' }),
            enabled: true,
            settings: { color: '#c0612b' },
          },
        ],
        events,
      }),
    ),
  });
  await page.waitForFunction(
    () => document.getElementById('timeline-title').value === 'Chart axes',
  );
  await page.locator('#fit-button').click();
  // The whole timeline in view: its balance after is the last debt's.
  await page.waitForFunction(
    () =>
      document.querySelector('.balance-readout .balance-end')?.textContent ===
        'Federal debt $3,909,956,292,398.00' &&
      document.querySelectorAll('.chart-axis').length === 2,
  );
  const axes = await page.evaluate(() =>
    [...document.querySelectorAll('.chart-axis')].map((column) => ({
      measure: column.dataset.measure,
      color: getComputedStyle(column).color,
      title: column.querySelector('.chart-axis-title').textContent,
      values: [...column.querySelectorAll('.chart-axis-value')].map((v) => ({
        text: v.textContent,
        top: parseFloat(v.style.top),
      })),
    })),
  );
  const [debt, spend] = axes;
  // In plugin order, each in its plugin's color, named by its measure.
  assert.equal(debt.measure, 'debt');
  assert.equal(debt.color, 'rgb(59, 111, 182)');
  assert.equal(debt.title, 'Federal debt');
  assert.equal(spend.measure, 'spend');
  assert.equal(spend.color, 'rgb(192, 97, 43)');
  assert.match(spend.title, /^Spending per \d* ?(year|years)$/);
  // Round values in the measure's format, abbreviated, higher up the stage as they grow.
  assert.deepEqual(
    debt.values.map((v) => v.text),
    ['$1T', '$2T', '$3T'],
  );
  for (const { values } of axes) {
    assert(values.length >= 2, 'at least two values');
    for (let i = 1; i < values.length; i++) assert(values[i].top < values[i - 1].top);
  }
  // Both lines are drawn, the balance's as steps.
  assert.deepEqual(
    await page.evaluate(() =>
      [...document.querySelectorAll('.timeline-chart-measure-line')].map((line) => [
        line.dataset.measure,
        line.classList.contains('balance'),
        (line.getAttribute('d') ?? '').length > 0,
      ]),
    ),
    [
      ['debt', true, true],
      ['spend', false, true],
    ],
  );
  // Resizing the items (Ctrl and the wheel) changes neither axis: the rate stays per the same
  // time, and the values stay where they were.
  const box = await page.locator('#timeline-stage').boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  for (const [delta, larger] of [
    [-400, true],
    [800, false],
  ]) {
    await page.keyboard.down('Control');
    await page.mouse.wheel(0, delta);
    await page.keyboard.up('Control');
    await page.waitForFunction((larger) => {
      const scale = Number(document.getElementById('timeline-stage').dataset.uiScale);
      return larger ? scale > 1.5 : scale < 0.8;
    }, larger);
    const resized = await page.evaluate(() =>
      [...document.querySelectorAll('.chart-axis')].map((column) => ({
        title: column.querySelector('.chart-axis-title').textContent,
        values: [...column.querySelectorAll('.chart-axis-value')].map((v) => v.textContent),
      })),
    );
    assert.deepEqual(
      resized.map((axis) => axis.title),
      axes.map((axis) => axis.title),
    );
    // Values the readout would meet may be left out, but the others are the same.
    for (const [i, axis] of resized.entries())
      for (const value of axis.values)
        assert(
          axes[i].values.some((v) => v.text === value),
          `${value} was on the axis`,
        );
  }
  console.log('PASS chart axes: a balance and a measure chart together, each with its own axis.');
}
