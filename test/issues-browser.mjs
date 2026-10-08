// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { closeMomentDetails } from './moment-dialog-browser.mjs';
import { DEFAULT_PRESENTATION, FOCUS_ON_HOVER, parseTimestamp, Q } from '../dist/core.mjs';
export async function checkIssues(page, restore) {
  const imported = async (doc) => {
    await closeMomentDetails(page);
    await page
      .locator('#json-file')
      .setInputFiles({
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
    const picker = page.locator('#event-calendar-picker');
    await picker.waitFor({ state: 'visible' });
    // An hour-sized view only exposes minute/second controls until context expands.
    assert.equal(await picker.getByLabel('Calendar year', { exact: true }).isVisible(), false);
    assert(await picker.getByLabel('Calendar minute', { exact: true }).isVisible());
    await picker.getByLabel('Calendar minute', { exact: true }).fill('46');
    await picker.getByLabel('Calendar minute', { exact: true }).dispatchEvent('change');
    // Exact fractions survive cosmetic date/time field edits.
    assert.equal(
      await page.locator('#event-exact').inputValue(),
      parseTimestamp('2026-10-05T13:46:30{+1/3}Z').toString(),
    );
    await picker.locator('summary').click();
    await picker.getByLabel('Calendar year', { exact: true }).waitFor({ state: 'visible' });
    await picker.getByLabel('Pick day 6', { exact: true }).click();
    assert.equal(
      await page.locator('#event-exact').inputValue(),
      parseTimestamp('2026-10-06T13:46:30{+1/3}Z').toString(),
    );
    await picker.getByLabel('Pick day 5', { exact: true }).click();
    await page.getByRole('button', { name: 'Link to end moment', exact: true }).click();
    await page.locator('.duration-endpoints button').filter({ hasText: 'End' }).click();
    const card = page.locator('.duration-editor');
    await card.waitFor();
    await card.getByLabel('Duration title', { exact: true }).fill('Linked span');
    await page.waitForFunction(() =>
      document.getElementById('event-edit-status').textContent.startsWith('Applied'),
    );
    const saved = await exported();
    assert.equal(saved.events[0].metadata.durations[0].endId, 'end');
    assert.equal(saved.events[0].metadata.durations[0].metadata.title, 'Linked span');
    await closeMomentDetails(page);
    await page.locator('.duration-band').waitFor({ state: 'visible' });
    await page.locator('.duration-band').click();
    await page.locator('#event-durations').waitFor({ state: 'visible' });
    await page.locator('#event-delete').click();
    await page.locator('#delete-dialog').waitFor({ state: 'visible' });
    assert.match(await page.locator('#delete-description').textContent(), /durations linked/);
    await page.locator('#delete-cancel').click();
    await page.locator('#delete-dialog').waitFor({ state: 'hidden' });
    assert.equal((await exported()).events.length, 2);
    await page.locator('#event-delete').click();
    await page.locator('#delete-confirm').click();
    await page.locator('#inspector').waitFor({ state: 'hidden' });
    assert.equal((await exported()).events.length, 1);
    assert.equal(await page.locator('.duration-band').count(), 0);
    console.log(
      'PASS issue regressions: contextual calendar, exact fractions, preview selection, unobtrusive status, linked durations and deletion confirmation.',
    );
  } finally {
    await imported(restore);
  }
}
