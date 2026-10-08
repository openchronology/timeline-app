// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
import assert from 'node:assert/strict';
import { closeMomentDetails } from './moment-dialog-browser.mjs';
/** Short durations collapse into summaries and still open as durations. */
export async function checkSummaries(page, restore) {
  const imported = async (doc) => {
    await closeMomentDetails(page);
    await page.locator('#json-file').setInputFiles({
      name: 'summaries.ochx',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(doc)),
    });
    await page.waitForFunction(
      (title) => document.getElementById('timeline-title').value === title,
      doc.title,
    );
    await page.evaluate(() => new Promise(requestAnimationFrame));
  };
  const bounds = async (left, right) => {
    await page.locator('#left-bound').fill(left);
    await page.locator('#right-bound').fill(right);
    await page.locator('#apply-bounds').click();
    await page.waitForFunction((old) => document.getElementById('left-bound').value !== old, left);
  };
  const doc = {
    format: 'openchronology',
    version: 1,
    title: 'Summary regression',
    description: '',
    events: [
      { id: 'near', time: '500/1', metadata: { title: 'Near moment' } },
      { id: 'edge', time: '0/1', metadata: { title: 'Edge' } },
      { id: 'other', time: '1000/1', metadata: { title: 'Other edge' } },
    ],
    durations: [
      { id: 'alone', start: '200/1', end: '201/1', metadata: { title: 'Alone' } },
      { id: 'paired', start: '501/1', end: '502/1', metadata: { title: 'Paired' } },
      { id: 'long', start: '100/1', end: '900/1', metadata: { title: 'Long' } },
    ],
  };
  const dialog = page.locator('#duration-dialog');
  try {
    await imported(doc);
    await bounds('0', '1000');
    // At this zoom the one-unit durations collapse; the long one stays a band.
    await page.locator('.duration-band[data-duration-id="long"]').waitFor();
    assert.equal(await page.locator('.duration-band[data-duration-id="alone"]').count(), 0);
    const alone = page.locator('.event-marker.duration-point[aria-label="Duration: Alone"]');
    await alone.waitFor();
    await alone.click({ force: true });
    await dialog.waitFor({ state: 'visible' });
    assert.equal(await page.locator('#duration-title').inputValue(), 'Alone');
    await page.getByRole('button', { name: 'Close duration details' }).click();
    await dialog.waitFor({ state: 'hidden' });
    // A collapsed duration next to a moment joins its summary.
    const mixed = page.locator('.event-marker.group[aria-label^="1 moment · 1 duration"]');
    await mixed.waitFor();
    await mixed.click({ force: true });
    await page.locator('#group-details').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#group-title').textContent(), '1 moment · 1 duration');
    const listed = page.locator('#group-duration-list button').filter({ hasText: 'Paired' });
    await listed.waitFor();
    assert.equal(await page.locator('#group-events button').count(), 1);
    await listed.click();
    await dialog.waitFor({ state: 'visible' });
    assert.equal(await page.locator('#duration-title').inputValue(), 'Paired');
    await page.getByRole('button', { name: 'Close duration details' }).click();
    await dialog.waitFor({ state: 'hidden' });
    await closeMomentDetails(page);
    // Zooming in separates them and restores the band.
    await bounds('499', '504');
    await page.locator('.duration-band[data-duration-id="paired"]').waitFor();
    assert.equal(await page.locator('.event-marker.duration-point').count(), 0);
    console.log(
      'PASS summaries: collapsed durations, duration points, mixed summaries and zoom restoring bands.',
    );
  } finally {
    await imported(restore);
  }
}
