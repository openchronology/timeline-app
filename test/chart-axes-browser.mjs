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
          interest: String(BigInt(Math.round(3e3 * 1.04 ** (y - 1800)))),
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
          // No chart plugin: charted by itself (#612), in its place's color.
          interest: { type: 'mpz', label: 'Interest paid', presentation: dollars },
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
      document.querySelectorAll('.chart-axis').length === 3,
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
  const [debt, spend, interest] = axes;
  // Charted by itself, as a rate, on its own axis and in the second of the measures' colors.
  assert.equal(interest.measure, 'interest');
  assert.equal(interest.color, 'rgb(235, 104, 52)');
  assert.match(interest.title, /^Interest paid per \d* ?(year|years)$/);
  // In plugin order, each in its plugin's color, named by its measure.
  assert.equal(debt.measure, 'debt');
  assert.equal(debt.color, 'rgb(59, 111, 182)');
  assert.equal(debt.title, 'Federal debt');
  assert.equal(spend.measure, 'spend');
  assert.equal(spend.color, 'rgb(192, 97, 43)');
  assert.match(spend.title, /^Spending per \d* ?(year|years)$/);
  // Round values in the measure's format, abbreviated, higher up the stage as they grow, about
  // every 36 pixels of the chart's height.
  assert.deepEqual(
    debt.values.map((v) => v.text),
    ['$500B', '$1T', '$1.5T', '$2T', '$2.5T', '$3T', '$3.5T'],
  );
  // Above the moments: on the stage itself, after its layers of moments.
  assert(
    await page.evaluate(() => {
      const axes = document.querySelector('.chart-axes');
      return (
        axes.parentElement.id === 'timeline-stage' &&
        !!(document.getElementById('stack-markers').compareDocumentPosition(axes) & 4) &&
        Number(getComputedStyle(axes).zIndex) > 1000
      );
    }),
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
      ['interest', false, true],
    ],
  );
  // Three charts together are lines, without their fills.
  assert(
    await page.evaluate(() =>
      document.querySelector('.timeline-chart').classList.contains('crowded'),
    ),
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
        values: [...column.querySelectorAll('.chart-axis-value')].map((v) => ({
          text: v.textContent,
          top: parseFloat(v.style.top),
        })),
      })),
    );
    assert.deepEqual(
      resized.map((axis) => axis.title),
      axes.map((axis) => axis.title),
    );
    // The same values at the same heights.
    assert.deepEqual(
      resized.map((axis) => axis.values),
      axes.map((axis) => axis.values),
    );
  }
  // Under the mouse, the time and the balance there exactly, with a dot on the line; at the
  // view's left edge, the balance the readout gives for its start.
  const readout = async (side) =>
    (await page.locator(`.balance-readout .balance-${side}`).textContent()).trim();
  // Across the time area, which the readout spans.
  const hover = async (fraction) => {
    const stage = await page.locator('#timeline-stage').boundingBox(),
      area = await page.locator('.balance-readout').boundingBox();
    await page.mouse.move(area.x + 1 + fraction * (area.width - 2), stage.y + stage.height * 0.28);
    await page.waitForSelector('.chart-tooltip .chart-tooltip-value[data-measure=debt]');
    return page.evaluate(() => ({
      time: document.querySelector('.chart-tooltip-time').textContent,
      debt: document.querySelector('.chart-tooltip-value[data-measure=debt]').textContent,
      dots: document.querySelectorAll('.chart-tooltip-dot').length,
    }));
  };
  const middle = await hover(0.5);
  assert.match(middle.debt, /^Federal debt \$[\d,]+\.\d\d$/);
  assert.match(middle.time, /\d{4}/);
  assert.equal(middle.dots, 1);
  const later = await hover(0.9);
  const amount = (text) => BigInt(text.replace(/[^\d]/g, ''));
  assert(amount(later.debt) > amount(middle.debt), 'the debt grows across the view');
  assert.equal((await hover(0)).debt, await readout('start'));
  // Gone once the mouse leaves the stage.
  await page.mouse.move(0, 0);
  await page.waitForFunction(() => !document.querySelector('.chart-tooltip'));
  // Switched off in the Measures dialog, its chart and axis go.
  await page.locator('#measures-button').click();
  const row = page.locator('.measure-row').filter({
    has: page.locator('legend', { hasText: 'Interest paid' }),
  });
  await row.locator('.measure-chart').selectOption('off');
  await page.locator('#measures-save').click();
  await page.waitForFunction(
    () =>
      document.querySelectorAll('.chart-axis').length === 2 &&
      !document.querySelector('.chart-axis[data-measure=interest]'),
  );
  console.log('PASS chart axes: a balance and a measure chart together, each with its own axis.');
}
