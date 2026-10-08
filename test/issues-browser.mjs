// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { closeMomentDetails } from './moment-dialog-browser.mjs';
import { DEFAULT_PRESENTATION, FOCUS_ON_HOVER, parseTimestamp, Q } from '../dist/core.mjs';
export async function checkIssues(page, restore) {
  const imported = async (doc) => {
    await closeMomentDetails(page);
    await page.locator('#json-file').setInputFiles({
      name: 'issues.ochx',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(doc)),
    });
    await page.waitForFunction(
      (title) => document.getElementById('timeline-title').value === title,
      doc.title,
    );
    await page.evaluate(() => new Promise(requestAnimationFrame));
  };
  const exported = async () => {
    const pending = page.waitForEvent('download');
    await page.locator('#export-button').evaluate((b) => b.click());
    return JSON.parse(await readFile(await (await pending).path(), 'utf8'));
  };
  const doc = {
    format: 'openchronology',
    version: 1,
    title: 'Six issues regression',
    description: '',
    presentation: { ...DEFAULT_PRESENTATION, mode: 'gregorian' },
    plugins: [{ manifest: FOCUS_ON_HOVER, enabled: true }],
    events: [
      {
        id: 'start',
        time: parseTimestamp('2026-10-05T13:45:30{+1/3}Z').toString(),
        metadata: { title: 'Start', description: 'Inspect this preview' },
      },
      {
        id: 'end',
        time: parseTimestamp('2026-10-05T14:00:00Z').toString(),
        metadata: { title: 'End' },
      },
    ],
  };
  try {
    await imported(doc);
    const marker = page.locator('#markers button[aria-label="Start"]');
    await marker.hover({ force: true });
    const preview = page.locator('#moment-hover-preview.open');
    await preview.waitFor();
    await preview.click();
    await page.locator('#inspector').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#event-title').inputValue(), 'Start');
    assert.equal(
      await page.locator('#event-edit-status').evaluate((n) => {
        const r = n.getBoundingClientRect();
        return r.width <= 1 && r.height <= 1;
      }),
      true,
    );
    // Gregorian time fields open the date/time dialog instead of an inline picker.
    const dialog = page.locator('#datetime-dialog'),
      picker = page.locator('#datetime-picker'),
      apply = () => page.locator('#datetime-apply').click(),
      closed = () => dialog.waitFor({ state: 'hidden' });
    await page.locator('#event-time').click();
    await dialog.waitFor({ state: 'visible' });
    assert.equal(await page.locator('#datetime-heading').textContent(), 'Moment date and time');
    // An hour-sized view only exposes minute/second controls until context expands.
    assert.equal(await picker.getByLabel('Calendar year', { exact: true }).isVisible(), false);
    assert(await picker.getByLabel('Calendar minute', { exact: true }).isVisible());
    await picker.getByLabel('Calendar minute', { exact: true }).fill('46');
    await picker.getByLabel('Calendar minute', { exact: true }).dispatchEvent('change');
    assert.match(await page.locator('#datetime-text').inputValue(), /13:46:30/);
    await picker.locator('summary').click();
    await picker.getByLabel('Calendar year', { exact: true }).waitFor({ state: 'visible' });
    await picker.getByLabel('Pick day 6', { exact: true }).click();
    await apply();
    await closed();
    // Exact fractions survive cosmetic date/time field edits.
    assert.equal(
      await page.locator('#event-exact').inputValue(),
      parseTimestamp('2026-10-06T13:46:30{+1/3}Z').toString(),
    );
    // Cancelling leaves the moment unchanged.
    await page.locator('#event-time').click();
    await dialog.waitFor({ state: 'visible' });
    await picker.locator('summary').click();
    await picker.getByLabel('Pick day 9', { exact: true }).click();
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
    await closed();
    assert.equal(
      await page.locator('#event-exact').inputValue(),
      parseTimestamp('2026-10-06T13:46:30{+1/3}Z').toString(),
    );
    // Typed entry stays available underneath the picker.
    await page.locator('#event-time').click();
    await dialog.waitFor({ state: 'visible' });
    await page.locator('#datetime-text').fill('2026-10-05T13:46:30Z');
    await apply();
    await closed();
    assert.equal(
      await page.locator('#event-exact').inputValue(),
      parseTimestamp('2026-10-05T13:46:30Z').toString(),
    );
    // Bounds use the same dialog and navigate on apply.
    await closeMomentDetails(page);
    const before = await page.locator('#left-bound').inputValue();
    await page.locator('#left-bound').click();
    await dialog.waitFor({ state: 'visible' });
    assert.equal(await page.locator('#datetime-heading').textContent(), 'Left bound date and time');
    await page.locator('#datetime-text').fill('2026-10-05T13:00:00Z');
    await apply();
    await closed();
    await page.waitForFunction(
      (old) => document.getElementById('left-bound').value !== old,
      before,
    );
    assert.match(await page.locator('#left-bound').inputValue(), /13:00/);
    // An inverted range is rejected inside the dialog.
    await page.locator('#right-bound').click();
    await dialog.waitFor({ state: 'visible' });
    await page.locator('#datetime-text').fill('2026-10-04T00:00:00Z');
    await apply();
    assert.match(await page.locator('#datetime-error').textContent(), /earlier than the right/);
    await page.keyboard.press('Escape');
    await closed();
    await page.locator('#markers button[aria-label="Start"]').click({ force: true });
    await page.locator('#inspector').waitFor({ state: 'visible' });
    // Durations are standalone; this one starts at the open moment and follows "End".
    await page.getByRole('button', { name: 'New duration starting here', exact: true }).click();
    const durationDialog = page.locator('#duration-dialog');
    await durationDialog.waitFor({ state: 'visible' });
    assert.equal(await page.locator('#duration-heading').textContent(), 'New duration');
    await page.locator('#duration-title').fill('Linked span');
    const endpoint = durationDialog.locator('[data-endpoint="end"]');
    await endpoint.locator('select').selectOption('moment');
    await endpoint.locator('.duration-moments button').filter({ hasText: 'End' }).click();
    await endpoint.locator('.duration-anchor').filter({ hasText: 'End' }).waitFor();
    const durationOf = async () => (await exported()).durations?.[0];
    await page.waitForFunction(() => !document.querySelector('#duration-error').textContent);
    let saved = await durationOf();
    for (let i = 0; i < 20 && saved?.metadata.title !== 'Linked span'; i++) {
      await page.waitForTimeout(100);
      saved = await durationOf();
    }
    assert.deepEqual(saved.start, { moment: 'start' });
    assert.deepEqual(saved.end, { moment: 'end' });
    assert.equal(saved.metadata.title, 'Linked span');
    assert.equal((await exported()).events[0].metadata.durations, undefined);
    await durationDialog.getByRole('button', { name: 'Close duration details' }).click();
    await durationDialog.waitFor({ state: 'hidden' });
    // The moment lists durations that follow it.
    await page
      .locator('#event-durations .duration-link')
      .filter({ hasText: 'Linked span' })
      .waitFor();
    await closeMomentDetails(page);
    const band = page.locator('.duration-band');
    await band.waitFor({ state: 'visible' });
    // Hover cards apply to durations as well as moments.
    await band.hover({ force: true });
    await page.locator('#moment-hover-preview.open').filter({ hasText: 'Linked span' }).waitFor();
    await band.click({ force: true });
    await durationDialog.waitFor({ state: 'visible' });
    assert.equal(await page.locator('#duration-title').inputValue(), 'Linked span');
    await durationDialog.getByRole('button', { name: 'Close duration details' }).click();
    await durationDialog.waitFor({ state: 'hidden' });
    // Deleting a moment pins durations that followed it; undo re-anchors them.
    await page.locator('#markers button[aria-label="Start"]').click({ force: true });
    await page.locator('#inspector').waitFor({ state: 'visible' });
    await page.locator('#event-delete').click();
    await page.locator('#delete-dialog').waitFor({ state: 'visible' });
    assert.match(await page.locator('#delete-description').textContent(), /keep its current time/);
    await page.locator('#delete-cancel').click();
    await page.locator('#delete-dialog').waitFor({ state: 'hidden' });
    assert.equal((await exported()).events.length, 2);
    await page.locator('#event-delete').click();
    await page.locator('#delete-confirm').click();
    await page.locator('#inspector').waitFor({ state: 'hidden' });
    const pinned = await exported();
    assert.equal(pinned.events.length, 1);
    assert.equal(pinned.durations[0].start, parseTimestamp('2026-10-05T13:46:30Z').toString());
    await band.waitFor({ state: 'visible' });
    await page.locator('#undo-button').click();
    assert.deepEqual((await durationOf()).start, { moment: 'start' });
    // Deleting the duration leaves both moments.
    await band.click({ force: true });
    await durationDialog.waitFor({ state: 'visible' });
    await page.locator('#duration-delete').click();
    await page.locator('#delete-confirm').click();
    await durationDialog.waitFor({ state: 'hidden' });
    await band.first().waitFor({ state: 'detached' });
    const remaining = await exported();
    assert.equal(remaining.events.length, 2);
    assert.equal(remaining.durations, undefined);
    console.log(
      'PASS issue regressions: contextual calendar, exact fractions, preview selection, unobtrusive status, standalone durations and deletion confirmation.',
    );
  } finally {
    await imported(restore);
  }
}
