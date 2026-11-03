// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// The background chart (#289): the view's moments as a smooth curve behind the timeline.
import assert from 'node:assert/strict';
import { closeMomentDetails } from './moment-dialog-browser.mjs';
import { BACKGROUND_CHART, LOG_SEVERITY_CHART } from '../dist/core.mjs';
/**
 * The background chart (#289): with the plugin enabled, a curve fills the stage's lower part,
 * highest over the cluster of moments, above the backgrounds and beneath the markers. It
 * follows the view, takes the color set in the plugin list, and goes when the plugin is
 * disabled. Log severity chart (#434) adds a curve for each severity beneath the total.
 */
export async function checkBackgroundChart(page, restore) {
  const load = async (doc) => {
    await closeMomentDetails(page);
    await page.locator('#json-file').setInputFiles({
      name: 'chart.ochx',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(doc)),
    });
    await page.waitForFunction(
      (title) => document.getElementById('timeline-title').value === title,
      doc.title,
    );
  };
  // Forty moments around 700 and three alone near 200.
  const events = [
    ...Array.from({ length: 40 }, (_, i) => ({
      id: `c${i}`,
      time: `${6800 + i * 5}/10`,
      metadata: { title: '' },
    })),
    ...[180, 200, 220].map((t) => ({ id: `a${t}`, time: `${t}/1`, metadata: { title: '' } })),
  ];
  await load({
    format: 'openchronology',
    version: 1,
    title: 'Background chart',
    description: '',
    plugins: [{ manifest: BACKGROUND_CHART, enabled: true }],
    events,
  });
  const view = async (left, right) => {
    const expected = `${left}/1 ${right}/1`;
    for (let attempt = 0; ; attempt++) {
      await page.locator('#left-bound').fill(String(left));
      await page.locator('#right-bound').fill(String(right));
      await page.locator('#apply-bounds').click();
      try {
        await page.waitForFunction(
          (expected) => document.getElementById('markers').dataset.view === expected,
          expected,
          { timeout: attempt < 2 ? 3000 : 30000 },
        );
        return;
      } catch (error) {
        if (attempt >= 2) throw error;
      }
    }
  };
  /** Whether the chart covers the stage, its highest point, and its height over some times. */
  const chart = (times) =>
    page.evaluate((times) => {
      const svg = document.querySelector('.timeline-chart');
      if (!svg) return null;
      const stage = document.getElementById('timeline-stage'),
        box = stage.getBoundingClientRect(),
        line = svg.querySelector('.timeline-chart-line'),
        b = svg.getBoundingClientRect();
      const [left, right] = [stage.dataset.viewLeft, stage.dataset.viewRight].map((q) =>
        q.split('/').reduce((n, d) => Number(n) / Number(d)),
      );
      // The ruler's inset: 20 pixels on a narrow stage, 48 otherwise.
      const inset = box.width < 600 ? 20 : 48;
      // The curve's height at x: the line's y there, from the path's own points.
      const length = line.getTotalLength(),
        points = Array.from({ length: 400 }, (_, i) => line.getPointAtLength((i / 399) * length));
      const heightAt = (x) => {
        const p = points.reduce((a, c) => (Math.abs(c.x - x) < Math.abs(a.x - x) ? c : a));
        return box.height - p.y;
      };
      return {
        fills: Math.abs(b.width - box.width) < 1.5 && Math.abs(b.height - box.height) < 1.5,
        top: Math.min(...points.map((p) => p.y)),
        height: box.height,
        heights: times.map(
          (t) => heightAt(((t - left) / (right - left)) * (box.width - 2 * inset) + inset) || 0,
        ),
        beneathMarkers: !!(
          svg.compareDocumentPosition(document.getElementById('markers')) &
          Node.DOCUMENT_POSITION_FOLLOWING
        ),
      };
    }, times);

  await view(0, 1000);
  await page.waitForFunction(() =>
    document.querySelector('.timeline-chart-line')?.getAttribute('d'),
  );
  let shown = await chart([700, 200, 450]);
  assert(shown.fills, 'the chart covers the stage');
  assert(shown.beneathMarkers, 'drawn before the markers');
  // Highest over the cluster: a fifth of the way down the stage.
  assert(Math.abs(shown.top - shown.height * 0.2) < 3, `top at ${shown.top}`);
  const [cluster, alone, between] = shown.heights;
  assert(cluster > 3 * alone && alone > between, `heights ${shown.heights}`);

  // It follows the view: zoomed to the three alone, they are the most there.
  await view(150, 250);
  await page.waitForFunction(() => document.querySelector('.timeline-chart-line'));
  shown = await chart([200]);
  assert(Math.abs(shown.heights[0] - shown.height * 0.8) < 0.15 * shown.height, 'relative to view');

  // Its color, set in the plugin list.
  await page.locator('#plugins-button').click();
  const color = page.locator('.installed-plugin input[data-plugin-setting="color"]');
  await color.fill('#bc6663');
  await color.dispatchEvent('change');
  await page.locator('[data-close="plugins-dialog"]').click();
  await page.waitForFunction(
    () => getComputedStyle(document.querySelector('.timeline-chart')).color === 'rgb(188, 102, 99)',
  );

  // Disabled, it goes.
  await page.locator('#plugins-button').click();
  await page.locator('.installed-plugin input[type="checkbox"]').first().uncheck();
  await page.locator('[data-close="plugins-dialog"]').click();
  await page.waitForFunction(() => !document.querySelector('.timeline-chart'));

  // Series (#434): the cluster is all errors, and the three alone are a warning and two notices.
  await load({
    format: 'openchronology',
    version: 1,
    title: 'Severity chart',
    description: '',
    plugins: [{ manifest: LOG_SEVERITY_CHART, enabled: true }],
    events: events.map((e) => ({
      ...e,
      metadata: {
        title: '',
        tags: [
          e.id.startsWith('c')
            ? 'severity:err'
            : e.id === 'a200'
              ? 'severity:warning'
              : 'severity:notice',
        ],
      },
    })),
  });
  await view(0, 1000);
  await page.waitForFunction(
    () => document.querySelectorAll('.timeline-chart-series-line[d^="M"]').length === 3,
  );
  const series = await page.evaluate(() => {
    const stage = document.getElementById('timeline-stage').getBoundingClientRect();
    const top = (path) => {
      const length = path.getTotalLength();
      return Math.min(
        ...Array.from({ length: 200 }, (_, i) => path.getPointAtLength((i / 199) * length).y),
      );
    };
    const total = top(document.querySelector('.timeline-chart-line'));
    return {
      height: stage.height,
      total,
      lines: [...document.querySelectorAll('.timeline-chart-series-line')].map((line) => ({
        label: line.dataset.series,
        color: getComputedStyle(line).color,
        top: top(line),
        beforeTotal: !!(
          line.compareDocumentPosition(document.querySelector('.timeline-chart-line')) &
          Node.DOCUMENT_POSITION_FOLLOWING
        ),
      })),
    };
  });
  assert.deepEqual(
    series.lines.map((l) => [l.label, l.color, l.beforeTotal]),
    [
      ['Errors', 'rgb(188, 102, 99)', true],
      ['Warnings', 'rgb(214, 173, 76)', true],
      ['Information', 'rgb(122, 173, 196)', true],
    ],
  );
  const [errors, warnings, information] = series.lines.map((l) => series.height - l.top);
  // Errors reach the total's top; the others stay low beneath it, information above warnings.
  assert(Math.abs(series.height - errors - series.total) < 2, `errors at ${errors}`);
  assert(warnings < 0.2 * errors && information > warnings, `${warnings} ${information}`);

  await load(restore);
  console.log(
    'PASS background chart: a smooth curve of the view’s moments behind the timeline, highest over the most, following the view, in the color set in the plugin list, gone when disabled; and a curve per severity beneath it.',
  );
}
