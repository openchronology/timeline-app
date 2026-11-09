// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// Saved views in a file (#550): opened, saved, made the default, edited, duplicated, deleted,
// and kept by exports.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { closeMomentDetails } from './moment-dialog-browser.mjs';
import { separateBy } from './tags-browser.mjs';

export async function checkViews(page, restore) {
  const imported = async (doc) => {
    await closeMomentDetails(page);
    await page.locator('#json-file').setInputFiles({
      name: 'views.ochx',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(doc)),
    });
    await page.waitForFunction(
      (title) => document.getElementById('timeline-title').value === title,
      doc.title,
    );
    await page.evaluate(() => new Promise(requestAnimationFrame));
  };
  // Exports are of the whole timeline: rejoined first.
  const exported = async () => {
    if (await page.locator('#separation-rejoin').isVisible())
      await page.locator('#separation-rejoin').click();
    const pending = page.waitForEvent('download');
    await page.locator('#export-button').evaluate((b) => b.click());
    return JSON.parse(await readFile(await (await pending).path(), 'utf8'));
  };
  const war = { tags: ['war'] };
  const doc = {
    format: 'openchronology',
    version: 1,
    title: 'View regression',
    description: '',
    events: [
      { id: 'a', time: '10/1', metadata: { title: 'Battle', tags: ['war'] } },
      { id: 'b', time: '50/1', metadata: { title: 'Market', tags: ['trade'] } },
    ],
    views: [
      { id: 'wars', title: 'Wars', description: 'Battles apart.', separation: war },
      { id: 'trade', title: 'Trade', separation: { tags: ['trade'] } },
    ],
    view: { id: 'wars', separation: war },
  };
  const dialog = page.locator('#views-dialog');
  const cards = () => dialog.locator('#views-list .view-card strong').allTextContents();
  const heading = () => page.locator('#separation-heading').textContent();
  await imported(doc);
  // It opens in its default view, named as the view.
  await page.waitForFunction(
    () => document.getElementById('separation-heading').textContent === 'View: Wars',
  );
  await page.locator('#views-button').click();
  await dialog.waitFor({ state: 'visible' });
  assert.deepEqual(await cards(), ['Wars', 'Trade']);
  assert.equal(await dialog.locator('.view-badge-default').count(), 1);
  assert.match(await page.locator('#views-showing').textContent(), /“Wars”/);
  // Opening another.
  await dialog.getByRole('button', { name: 'Open: Trade' }).click();
  await dialog.waitFor({ state: 'hidden' });
  assert.equal(await heading(), 'View: Trade');
  // Saving what is shown: a new separation, as a new view.
  await page.locator('#separation-rejoin').click();
  await separateBy(page, ['war'], ['trade']);
  await page.locator('#views-button').click();
  assert.match(await page.locator('#views-showing').textContent(), /not saved/);
  await page.locator('#views-save').click();
  await page.locator('#view-edit-dialog').waitFor({ state: 'visible' });
  assert.equal(await page.locator('#view-visibility').isVisible(), false, 'files keep no sharing');
  await page.locator('#view-title').fill('Both');
  await page.locator('#view-description').fill('War and trade apart.');
  await page.locator('#view-edit-submit').click();
  await page.locator('#view-edit-dialog').waitFor({ state: 'hidden' });
  assert.deepEqual(await cards(), ['Wars', 'Trade', 'Both']);
  assert.equal(await heading(), 'View: Both');
  // Made the default; then edited, which the default follows.
  await dialog.getByRole('button', { name: 'Make default: Both' }).click();
  assert.equal(await dialog.locator('.view-badge-default').count(), 1);
  await dialog.getByRole('button', { name: 'Edit…: Both' }).click();
  await page.locator('#view-title').fill('War and trade');
  await page.locator('#view-edit-submit').click();
  await page.locator('#view-edit-dialog').waitFor({ state: 'hidden' });
  await dialog.getByRole('button', { name: 'Duplicate: Trade' }).click();
  assert.deepEqual(await cards(), ['Wars', 'Trade', 'War and trade', 'Trade (copy)']);
  await dialog.getByRole('button', { name: 'Delete: Wars' }).click();
  await page.waitForFunction(
    () => document.querySelectorAll('#views-list .view-card').length === 3,
  );
  await dialog.locator('.dialog-actions [data-close]').click();
  // Exports keep them, and the default names its view.
  const file = await exported();
  assert.deepEqual(
    file.views.map((v) => v.title),
    ['Trade', 'War and trade', 'Trade (copy)'],
  );
  const both = file.views[1];
  assert.equal(both.description, 'War and trade apart.');
  assert.deepEqual(both.separation, { groups: [['war'], ['trade']] });
  assert.deepEqual(file.view, { id: both.id, separation: both.separation });
  // Deleting the default's view leaves its copy.
  await page.locator('#views-button').click();
  await dialog.getByRole('button', { name: 'Delete: War and trade' }).click();
  await page.waitForFunction(
    () => document.querySelectorAll('#views-list .view-card').length === 2,
  );
  await dialog.locator('.dialog-actions [data-close]').click();
  assert.deepEqual((await exported()).view, { separation: both.separation });
  await page
    .locator('#separation-rejoin')
    .click()
    .catch(() => {});
  await imported(restore);
  console.log(
    'PASS views: a file’s views opened, saved from what is shown, made the default and followed, edited, duplicated, deleted, and kept by exports.',
  );
}
