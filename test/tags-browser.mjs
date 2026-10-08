// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { closeMomentDetails } from './moment-dialog-browser.mjs';
/** Entity tags are edited on moments and durations and separate a timeline into two tracks. */
export async function checkTags(page, restore) {
  const imported = async (doc) => {
    await closeMomentDetails(page);
    await page.locator('#json-file').setInputFiles({
      name: 'tags.ochx',
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
    title: 'Tag regression',
    description: '',
    events: [
      { id: 'a', time: '10/1', metadata: { title: 'Battle', tags: ['war'] } },
      { id: 'b', time: '50/1', metadata: { title: 'Market' } },
      { id: 'c', time: '90/1', metadata: { title: 'Treaty', tags: ['war', 'trade'] } },
    ],
    durations: [
      { id: 'd', start: { moment: 'b' }, end: '70/1', metadata: { title: 'Siege', tags: ['war'] } },
    ],
  };
  try {
    await imported(doc);
    await page.locator('#fit-button').click();
    // Tags are edited as a comma-separated field and stored normalized in metadata.tags.
    await page.getByRole('button', { name: 'Market', exact: true }).click({ force: true });
    await page.locator('#event-tags').fill('Trade,  Ports ');
    await page.waitForFunction(() =>
      document.getElementById('event-edit-status').textContent.startsWith('Applied'),
    );
    assert.equal(await page.locator('#event-metadata').inputValue(), '{}');
    await closeMomentDetails(page);
    const saved = await exported();
    assert.deepEqual(saved.events.find((e) => e.id === 'b').metadata.tags, ['trade', 'ports']);
    const before = await page.locator('#left-bound').inputValue();
    // Separation lists tags with counts and pulls tagged entities into a track above.
    await page.locator('#separate-button').click();
    const dialog = page.locator('#separate-dialog');
    await dialog.getByLabel('war (3)').waitFor();
    assert.deepEqual(await dialog.locator('.checkbox-label').allTextContents(), [
      'war (3)',
      'trade (2)',
      'ports (1)',
    ]);
    await dialog.getByLabel('war (3)').check();
    await page.locator('#separate-submit').click();
    await dialog.waitFor({ state: 'hidden' });
    await page.locator('#separation-settings').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#separation-tags').textContent(), 'war');
    assert.equal(await page.locator('#comparison-settings').isVisible(), false);
    assert.equal(await page.locator('#left-bound').inputValue(), before, 'The view is kept.');
    // Tagged moments and the tagged duration sit above; Market stays below.
    const top = async (name) =>
      (await page.getByRole('button', { name, exact: true }).first().boundingBox()).y;
    assert((await top('Battle')) < (await top('Market')));
    assert((await top('Treaty')) < (await top('Market')));
    const band = await page.locator('.duration-band', { hasText: 'Siege' }).boundingBox();
    assert(band.y < (await top('Market')));
    assert.equal(await page.locator('#add-button').isVisible(), false, 'Separation is read-only.');
    await page.locator('#separation-rejoin').click();
    await page.locator('#separation-settings').waitFor({ state: 'hidden' });
    await page.locator('#add-button').waitFor({ state: 'visible' });
    console.log(
      'PASS tags: editing, normalized storage, tag counts, separation into tracks and rejoin.',
    );
  } finally {
    if (await page.locator('#separation-settings').isVisible())
      await page.locator('#separation-rejoin').click();
    await imported(restore);
  }
}
