// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// Measures in the editor (#573): declared in the Measures dialog with how each is shown, typed in
// a moment's form as shown and stored exactly, read in the reader, and renamed with their
// values as one Undo.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { closeMomentDetails } from './moment-dialog-browser.mjs';
import { validateDocument } from '../dist/core.mjs';

export async function checkMeasures(page) {
  const input = (id) => page.locator('#' + id);
  await closeMomentDetails(page);
  await input('json-file').setInputFiles({
    name: 'measures.ochx',
    mimeType: 'application/json',
    buffer: Buffer.from(
      JSON.stringify({
        format: 'openchronology',
        version: 1,
        title: 'Invoices',
        description: '',
        events: [
          { id: 'inv1', time: '10/1', metadata: { title: 'Invoice 1' } },
          { id: 'inv2', time: '20/1', metadata: { title: 'Invoice 2' } },
        ],
      }),
    ),
  });
  await page.waitForFunction(() => document.getElementById('timeline-title').value === 'Invoices');
  const exported = async () => {
    const downloading = page.waitForEvent('download');
    await input('export-button').evaluate((button) => button.click());
    const download = await downloading;
    return validateDocument(JSON.parse(await readFile(await download.path(), 'utf8')));
  };
  const dialog = input('measures-dialog');

  // Declare Cost, in cents shown as dollars.
  await input('measures-button').evaluate((button) => button.click());
  await dialog.waitFor();
  assert(await input('measures-empty').isVisible());
  await input('measures-add').click();
  const row = dialog.locator('.measure-row').last();
  await row.locator('.measure-label').fill('Cost');
  assert.equal(await row.locator('.measure-name').inputValue(), 'cost');
  await row.locator('.measure-mode').selectOption('fixed');
  await row.locator('.measure-scale').fill('1/100');
  await row.locator('.measure-prefix').fill('$');
  assert.match(await row.locator('.measure-example').textContent(), /123456 shows as \$1,234\.56/);
  await input('measures-save').click();
  await dialog.waitFor({ state: 'hidden' });
  let document = await exported();
  assert.deepEqual(document.measures, {
    cost: {
      type: 'mpz',
      label: 'Cost',
      presentation: { mode: 'fixed', scale: '1/100', decimals: 2, prefix: '$' },
    },
  });

  // A moment's value, typed as shown: stored exactly in cents; what would round is refused.
  await page.locator('.event-marker:not(.group)').first().click();
  const field = page.locator('#event-measures input[data-measure="cost"]');
  await field.waitFor();
  await field.fill('$1,234.56');
  await field.press('Tab');
  await page.waitForFunction(() =>
    document.getElementById('event-edit-status').textContent.startsWith('Shown on the timeline'),
  );
  await field.fill('12.345');
  await field.press('Tab');
  await page.waitForFunction(() =>
    /at most 2 decimal places/.test(document.getElementById('event-error').textContent),
  );
  await field.fill('1234.56');
  await field.press('Tab');
  await closeMomentDetails(page);
  document = await exported();
  assert.deepEqual(document.events.find((e) => e.id === 'inv1').metadata.measures, {
    cost: '123456',
  });

  // Renamed: its values move with it, and one Undo takes both back.
  await input('measures-button').evaluate((button) => button.click());
  await dialog.waitFor();
  const first = dialog.locator('.measure-row').first();
  await first.locator('.measure-name').fill('price');
  await first.locator('.measure-label').fill('Price');
  assert.match(await input('measures-summary').textContent(), /Cost becomes Price/);
  await input('measures-save').click();
  await dialog.waitFor({ state: 'hidden' });
  document = await exported();
  assert.deepEqual(Object.keys(document.measures), ['price']);
  assert.deepEqual(document.events.find((e) => e.id === 'inv1').metadata.measures, {
    price: '123456',
  });
  await input('undo-button').click();
  document = await exported();
  assert.deepEqual(Object.keys(document.measures), ['cost']);
  assert.deepEqual(document.events.find((e) => e.id === 'inv1').metadata.measures, {
    cost: '123456',
  });

  // In View mode, the reader shows the value as the measure shows it.
  await input('view-mode').check();
  await page.locator('.event-marker:not(.group)').first().click();
  const reader = page.locator('#reader-body .measure-list');
  await reader.waitFor();
  assert.equal(await reader.locator('dt').first().textContent(), 'Cost');
  assert.equal(await reader.locator('dd').first().textContent(), '$1,234.56');
  await input('reader-close').click();
  await input('inspector').waitFor({ state: 'hidden' });
  await input('view-mode').uncheck();

  // A summary's label shows its total as the measure shows totals (#575).
  await input('json-file').setInputFiles({
    name: 'summed.ochx',
    mimeType: 'application/json',
    buffer: Buffer.from(
      JSON.stringify({
        format: 'openchronology',
        version: 1,
        title: 'Summed',
        description: '',
        measures: document.measures,
        events: ['1999', '150', '1'].map((cost, i) => ({
          id: 'same' + i,
          time: '10/1',
          metadata: { title: 'Same ' + i, measures: { cost } },
        })),
      }),
    ),
  });
  await page.waitForFunction(() => document.getElementById('timeline-title').value === 'Summed');
  const summary = page.locator('.event-marker.group').first();
  await summary.waitFor();
  assert.match(await summary.getAttribute('aria-label'), /^3 moments · Cost \$21\.50 near /);
  assert.match(
    await page.locator('.event-caption-title', { hasText: '3 moments' }).first().textContent(),
    /3 moments · Cost \$21\.50/,
  );
}
