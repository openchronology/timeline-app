// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// The Show dialog (#618): a switch for each part of the timeline and each chart it draws, a
// chart plugin's named, hiding and showing them at once, counted on its button. Runs on the
// timeline checkChartAxes leaves open: a debt balance and a spending chart, both plugins'.
import assert from 'node:assert/strict';

export async function checkLayers(page) {
  const dialog = page.locator('#layers-dialog');
  await page.locator('#layers-button').click();
  await dialog.waitFor();
  const switches = await page.evaluate(() =>
    [...document.querySelectorAll('#layers-dialog .layer-switch')].map((row) => [
      row.querySelector('input').dataset.layer,
      row.querySelector('.layer-name').textContent,
      row.querySelector('.layer-source')?.textContent ?? null,
      row.querySelector('input').checked,
    ]),
  );
  assert.deepEqual(switches, [
    ['moments', 'Moments', null, true],
    ['durations', 'Durations', null, true],
    ['backgrounds', 'Backgrounds', null, true],
    ['relationships', 'Relationships', null, true],
    ['balances', 'Balances at the edges', null, true],
    ['chart:measure:debt', 'Federal debt', 'Debt balance plugin', true],
    ['chart:measure:spend', 'Spending', 'Spending plugin', true],
  ]);
  const toggle = (layer) => dialog.locator(`input[data-layer="${layer}"]`).click();
  const shownMarkers = () =>
    page.evaluate(
      () =>
        [...document.querySelectorAll('#markers .event-marker')].filter(
          (m) => getComputedStyle(m).display !== 'none',
        ).length,
    );
  assert((await shownMarkers()) > 0);
  // Moments hidden: no markers or labels, and the button counts one hidden part.
  await toggle('moments');
  await page.waitForFunction(() => document.getElementById('layers-count').textContent === '1');
  assert.equal(await shownMarkers(), 0);
  assert.equal(
    await page.evaluate(
      () =>
        [...document.querySelectorAll('#markers .event-label')].filter(
          (m) => getComputedStyle(m).display !== 'none',
        ).length,
    ),
    0,
  );
  // A chart hidden: its line and axis go, and with one chart left, the axis picker too.
  await toggle('chart:measure:debt');
  await page.waitForFunction(
    () =>
      !document.querySelector('.timeline-chart-measure-line[data-measure=debt]') &&
      document.querySelector('.chart-axis')?.dataset.measure === 'spend' &&
      !document.querySelector('.chart-axis-picker'),
  );
  await toggle('balances');
  await page.waitForFunction(
    () =>
      !document.querySelector('.balance-readout') &&
      document.getElementById('layers-count').textContent === '3',
  );
  // Show all brings everything back, and the switches with it.
  await dialog.locator('#layers-show-all').click();
  await page.waitForFunction(
    () =>
      document.getElementById('layers-count').hidden &&
      !!document.querySelector('.timeline-chart-measure-line[data-measure=debt]') &&
      !!document.querySelector('.balance-readout') &&
      !!document.querySelector('.chart-axis-picker') &&
      [...document.querySelectorAll('#layers-dialog .layer-switch input')].every((i) => i.checked),
  );
  assert((await shownMarkers()) > 0);
  await dialog.getByRole('button', { name: 'Done' }).click();
  await dialog.waitFor({ state: 'hidden' });
  console.log('PASS show dialog: parts and charts hidden and shown, a plugin’s chart named.');
}
