// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
import assert from 'node:assert/strict';
import { closeMomentDetails } from './moment-dialog-browser.mjs';
/**
 * Deleting everything in the view at once (#91): the moments in it and the durations wholly
 * inside it go, others stay, and one Undo brings them all back.
 */
export async function checkRangeDelete(page, restore) {
  const load = async (doc) => {
    await closeMomentDetails(page);
    await page.locator('#json-file').setInputFiles({
      name: 'range.ochx',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(doc)),
    });
    await page.waitForFunction(
      (title) => document.getElementById('timeline-title').value === title,
      doc.title,
    );
  };
  await load({
    format: 'openchronology',
    version: 1,
    title: 'Range deletion',
    description: '',
    events: Array.from({ length: 30 }, (_, i) => ({
      id: 'm' + i,
      time: `${i * 10}/1`,
      metadata: { title: 'Moment ' + i },
    })),
    durations: [
      { id: 'inside', start: '105/1', end: '115/1', metadata: { title: 'Inside' } },
      { id: 'across', start: '50/1', end: '250/1', metadata: { title: 'Across' } },
    ],
  });
  const count = () =>
    page.evaluate(() =>
      [...document.querySelectorAll('.event-marker')].reduce(
        (n, m) => n + Number(m.dataset.count),
        0,
      ),
    );
  // View 100 to 190: moments 10 to 19, and the duration inside it.
  await page.locator('#left-bound').fill('100');
  await page.locator('#right-bound').fill('190');
  await page.locator('#apply-bounds').click();
  // Going to bounds animates; a menu opened meanwhile closes when the animation lands.
  await page.waitForFunction(
    () => document.getElementById('markers').dataset.view === '100/1 190/1',
  );
  const stage = await page.locator('#timeline-stage').boundingBox();
  await page.mouse.click(stage.x + stage.width / 2, stage.y + 60, { button: 'right' });
  await page
    .locator('#timeline-menu')
    .getByRole('menuitem', { name: 'Delete everything in this view…' })
    .click();
  await page.locator('#delete-dialog').waitFor();
  assert.match(
    await page.locator('#delete-description').textContent(),
    /Delete 10 moments and 1 duration between 100\/1 and 190\/1\? .*You can undo this\./,
  );
  await page.locator('#delete-confirm').click();
  await page.locator('#delete-dialog').waitFor({ state: 'hidden' });
  await page.waitForFunction(() => document.querySelectorAll('.event-marker').length === 0);
  assert.equal(await page.locator('.duration-band[data-duration-id="inside"]').count(), 0);
  // A duration reaching past the view stays.
  await page.locator('.duration-band[data-duration-id="across"]').waitFor();
  // One Undo restores everything.
  await page.locator('#undo-button').click();
  await page.waitForFunction(
    () =>
      [...document.querySelectorAll('.event-marker')].reduce(
        (n, m) => n + Number(m.dataset.count),
        0,
      ) === 10,
  );
  await page.locator('.duration-band[data-duration-id="inside"]').waitFor();
  assert.equal(await count(), 10);
  await page.locator('#redo-button').click();
  await page.waitForFunction(() => document.querySelectorAll('.event-marker').length === 0);
  await page.locator('#undo-button').click();
  await load(restore);
  console.log('PASS range deletion: everything in a view goes at once, and one Undo restores it.');
}
