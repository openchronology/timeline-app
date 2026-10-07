// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
import assert from 'node:assert/strict';
import { closeMomentDetails } from './moment-dialog-browser.mjs';
import { readFile } from 'node:fs/promises';
import { validateDocument, DEFAULT_PRESENTATION, parseTimestamp } from '../dist/core.mjs';

/** Shared UI checks run against both the regular application and isolated file:// build. */
export async function checkPresentation(page, restoreDocument) {
  const input = (id) => page.locator('#' + id);
  const imported = async (document) => {
    await closeMomentDetails(page);
    await input('json-file').setInputFiles({
      name: 'display.ochx',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(document)),
    });
    await page.waitForFunction(
      (title) => document.getElementById('timeline-title').value === title,
      document.title,
    );
    await page.evaluate(() => new Promise(requestAnimationFrame));
  };
  const exported = async () => {
    const downloading = page.waitForEvent('download');
    // Inspect serialization without dismissing the editor under test.
    await input('export-button').evaluate((button) => button.click());
    const download = await downloading;
    return validateDocument(JSON.parse(await readFile(await download.path(), 'utf8')));
  };
  await imported({
    format: 'openchronology',
    version: 1,
    title: 'Time display UI',
    description: '',
    events: [{ id: 'third', time: '1/3', metadata: { title: 'Third' } }],
  });
  await closeMomentDetails(page);
  await input('presentation-button').click();
  await input('presentation-mode').selectOption('float');
  await input('presentation-unit-preset').selectOption('2');
  await input('presentation-preview').click();
  assert.match(
    await input('presentation-preview-result').textContent(),
    /minutes.*\nParsed:.*\nRounded display/s,
  );
  await input('presentation-save').click();
  await input('presentation-dialog').waitFor({ state: 'hidden' });
  await page.locator('.event-marker:not(.group)').first().click();
  assert.match(await input('event-time').inputValue(), /minutes$/);
  await input('event-title').fill('Renamed without rounding');
  await page.waitForFunction(() =>
    document.getElementById('event-edit-status').textContent.startsWith('Applied to timeline'),
  );
  assert.equal(await input('event-exact').inputValue(), '1/3');
  let document = await exported();
  assert.equal(document.presentation.mode, 'float');
  assert.equal(document.presentation.scale, '60/1');
  assert.equal(document.events[0].time, '1/3');
  assert.match(await input('left-bound').inputValue(), /minutes$/);
  assert.match(await input('right-bound').inputValue(), /minutes$/);
  const exactBounds = await Promise.all(
    ['exact-left', 'exact-right'].map((id) => input(id).inputValue()),
  );
  await closeMomentDetails(page);
  await input('apply-bounds').click();
  await page.evaluate(() => new Promise(requestAnimationFrame));
  assert.deepEqual(
    await Promise.all(['exact-left', 'exact-right'].map((id) => input(id).inputValue())),
    exactBounds,
  );
  await input('left-bound').fill('0.1 minutes');
  await input('right-bound').fill('2 minutes');
  await closeMomentDetails(page);
  await input('apply-bounds').click();
  await page.evaluate(() => new Promise(requestAnimationFrame));
  assert.equal(await input('exact-left').inputValue(), '6/1');
  assert.equal(await input('exact-right').inputValue(), '120/1');
  await input('fit-button').click();
  await page.locator('.event-marker').first().click();
  await input('event-time').fill('1.5 minutes');
  assert.equal(await input('event-exact').inputValue(), '90/1');
  await page.waitForFunction(() =>
    document.getElementById('event-edit-status').textContent.startsWith('Applied to timeline'),
  );
  assert.equal((await exported()).events[0].time, '90/1');

  await closeMomentDetails(page);
  await input('presentation-button').click();
  await input('presentation-mode').selectOption('gregorian');
  await input('presentation-epoch').selectOption('mjd');
  await input('presentation-preview-time').fill('40587');
  await input('presentation-preview').click();
  assert.match(
    await input('presentation-preview-result').textContent(),
    /1970-01-01T00:00:00Z.*Exact round trip/s,
  );
  await input('presentation-save').click();
  await input('presentation-dialog').waitFor({ state: 'hidden' });
  document = await exported();
  assert.equal(document.presentation.scale, '1/86400');

  await closeMomentDetails(page);
  await input('presentation-button').click();
  await input('presentation-mode').selectOption('custom');
  const source =
    'function print(time, api) { return api.exact(time) + " ticks"; } function parse(text, api) { return api.rational(api.stripSuffix(text, " ticks")); }';
  await input('presentation-source').fill(source);
  await input('presentation-preview-time').fill('1/3');
  await input('presentation-preview').click();
  assert.match(
    await input('presentation-preview-result').textContent(),
    /1\/3 ticks.*Exact round trip/s,
  );
  await input('presentation-save').click();
  await input('presentation-dialog').waitFor({ state: 'hidden' });
  document = await exported();
  assert.equal(document.presentation.source, source);
  await page.waitForFunction(() => document.getElementById('left-bound').value.endsWith(' ticks'));
  await input('left-bound').fill('1/3 ticks');
  await input('right-bound').fill('100/1 ticks');
  await closeMomentDetails(page);
  await input('apply-bounds').click();
  await page.evaluate(() => new Promise(requestAnimationFrame));
  assert.equal(await input('exact-left').inputValue(), '1/3');
  assert.equal(await input('exact-right').inputValue(), '100/1');
  await imported({ ...document, title: 'Custom settings reimported' });
  await closeMomentDetails(page);
  await input('presentation-button').click();
  assert.equal(await input('presentation-source').inputValue(), source);
  await input('presentation-source').fill(
    `function print(time, api) { return "<img src='https://example.invalid/tracker'>"; } function parse(text, api) { return api.rational(text); }`,
  );
  await input('presentation-save').click();
  await input('presentation-dialog').waitFor({ state: 'hidden' });
  await page.evaluate(() => new Promise(requestAnimationFrame));
  assert.equal(await page.locator('.tick-label img, .event-label img').count(), 0);
  assert.match(await page.locator('.tick-label').first().textContent(), /^<img/);
  await closeMomentDetails(page);
  await input('presentation-button').click();
  await input('presentation-source').fill(
    'function print(time, api) { return fetch("https://example.invalid"); } function parse(text, api) { return api.rational(text); }',
  );
  await input('presentation-save').click();
  assert(await input('presentation-dialog').isVisible());
  assert.match(await input('presentation-error').textContent(), /Unknown local variable/);
  await page.locator('[data-close="presentation-dialog"]').click();
  const day = parseTimestamp('2026-10-05T00:00:00Z');
  await imported({
    format: 'openchronology',
    version: 1,
    title: 'Calendar context UI',
    description: '',
    presentation: { ...DEFAULT_PRESENTATION, mode: 'gregorian' },
    events: [
      {
        id: 'noon',
        time: day.add(parseTimestamp('1970-01-01T13:45:30Z')).toString(),
        metadata: { title: 'Afternoon' },
      },
    ],
  });
  await input('left-bound').fill('2026-10-05T00:00:00Z');
  await input('right-bound').fill('2026-10-06T00:00:00Z');
  await closeMomentDetails(page);
  await input('apply-bounds').click();
  await page.evaluate(() => new Promise(requestAnimationFrame));
  assert.match(await input('time-context').textContent(), /2026-10-05.*UTC/);
  const tickText = await page.locator('.tick-label').allTextContents();
  assert(tickText.every((label) => !label.includes('2026') && !label.includes('T')));
  assert(tickText.some((label) => /\d{2}h/.test(label)));
  assert.equal(
    await page.locator('.event-label .event-time-current').first().textContent(),
    '13:45',
  );
  await page.locator('.event-marker').first().click();
  assert.equal(await input('event-time').inputValue(), '2026-10-05T13:45:30Z CE');
  await input('event-time').fill('14:30');
  assert.equal(
    await input('event-exact').inputValue(),
    parseTimestamp('2026-10-05T14:30:00Z').toString(),
  );
  // Reproduce the screenshots: a tiny pan across midnight must not reintroduce dates.
  await imported({
    format: 'openchronology',
    version: 1,
    title: 'Midnight rollover UI',
    description: '',
    presentation: { ...DEFAULT_PRESENTATION, mode: 'gregorian' },
    events: [
      {
        id: 'early',
        time: parseTimestamp('2026-10-05T00:00:03.5Z').toString(),
        metadata: { title: 'Early' },
      },
      {
        id: 'later',
        time: parseTimestamp('2026-10-05T00:00:13{+2/3}Z').toString(),
        metadata: { title: 'Later' },
      },
    ],
  });
  await input('left-bound').fill('2026-10-04T23:59:59Z');
  await input('right-bound').fill('2026-10-05T00:00:19Z');
  await closeMomentDetails(page);
  await input('apply-bounds').click();
  await page.evaluate(() => new Promise(requestAnimationFrame));
  assert.equal(await input('left-bound').inputValue(), '2026-10-04T23:59:59Z CE');
  assert.match(
    await input('time-context').textContent(),
    /2026-10-04 CE → 2026-10-05 CE.*23:59 → 00:00/,
  );
  assert(
    (await page.locator('.tick-label').allTextContents()).every((label) => /^\d{2}s$/.test(label)),
  );
  assert.deepEqual(await page.locator('.event-label .event-time-current').allTextContents(), [
    '03.5s',
    '13.7s',
  ]);
  await input('left-bound').fill('2026-10-04T23:59:13Z');
  await input('right-bound').fill('2026-10-05T00:00:53Z');
  await closeMomentDetails(page);
  await input('apply-bounds').click();
  await page.evaluate(() => new Promise(requestAnimationFrame));
  assert(
    (await page.locator('.tick-label').allTextContents()).every((label) =>
      /^\d{2}m \d{2}s$/.test(label),
    ),
  );
  assert.deepEqual(await page.locator('.event-label .event-time-current').allTextContents(), [
    '00m 03.5s',
    '00m 13.7s',
  ]);
  await closeMomentDetails(page);
  await input('presentation-button').click();
  await input('presentation-adaptive').uncheck();
  await input('presentation-save').click();
  await input('presentation-dialog').waitFor({ state: 'hidden' });
  await page.evaluate(() => new Promise(requestAnimationFrame));
  assert(await input('time-context').isHidden());
  assert.match(await page.locator('.tick-label').first().textContent(), /2026-10-04T/);
  await imported(restoreDocument);
  assert.deepEqual(await exported(), restoreDocument);
}
