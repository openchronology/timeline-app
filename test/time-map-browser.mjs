// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
import assert from 'node:assert/strict';
import { closeMomentDetails } from './moment-dialog-browser.mjs';
/**
 * Shifting and scaling times for good (#96), in a timeline in the page: what is tagged, from
 * the timeline menu; everything, with the view following; a separated track, from its bar.
 * Each is one Undo.
 */
export async function checkTimeMap(page, restore) {
  const load = async (doc) => {
    await closeMomentDetails(page);
    await page.locator('#json-file').setInputFiles({
      name: 'mapping.ochx',
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
    title: 'Mapping times',
    description: '',
    events: Array.from({ length: 10 }, (_, i) => ({
      id: 'm' + i,
      time: `${i * 10}/1`,
      metadata: { title: 'Moment ' + i, ...(i < 5 ? { tags: ['early'] } : {}) },
    })),
    durations: [
      { id: 'span', start: '20/1', end: '40/1', metadata: { title: 'Span', tags: ['early'] } },
      { id: 'follows', start: { moment: 'm5' }, end: '95/1', metadata: { title: 'Follows' } },
    ],
  });
  const view = async (left, right) => {
    await page.locator('#left-bound').fill(String(left));
    await page.locator('#right-bound').fill(String(right));
    await page.locator('#apply-bounds').click();
    await page.waitForFunction(
      (expected) => document.getElementById('markers').dataset.view === expected,
      `${left}/1 ${right}/1`,
    );
  };
  const count = () =>
    page.evaluate(() =>
      [...document.querySelectorAll('.event-marker')].reduce(
        (n, m) => n + Number(m.dataset.count),
        0,
      ),
    );
  const counted = (n) =>
    page.waitForFunction(
      (n) =>
        [...document.querySelectorAll('.event-marker')].reduce(
          (sum, m) => sum + Number(m.dataset.count),
          0,
        ) === n,
      n,
    );
  const dialog = page.locator('#map-dialog');
  const open = async () => {
    const stage = await page.locator('#timeline-stage').boundingBox();
    await page.mouse.click(stage.x + stage.width / 2, stage.y + 60, { button: 'right' });
    await page
      .locator('#timeline-menu')
      .getByRole('menuitem', { name: 'Shift or scale times…' })
      .click();
    await dialog.waitFor();
  };
  await view(-5, 105);
  assert.equal(await count(), 10);

  // What is tagged moves 1000 later; the rest stays.
  await open();
  assert.equal(await page.locator('#map-scale').inputValue(), '1');
  assert.notEqual(await page.locator('#map-around').inputValue(), '', 'Around where clicked.');
  await page.locator('#map-offset').fill('1000');
  await page.locator('#map-tags').fill('early');
  assert(await page.locator('input[name=map-scope][value=tagged]').isChecked());
  await page
    .locator('#map-summary')
    .getByText('This moves 5 moments and 1 duration. You can undo it.')
    .waitFor();
  // Refused until it makes sense.
  await page.locator('#map-scale').fill('0');
  await page.locator('#map-summary').getByText('Scale must be positive.').waitFor();
  await page.locator('#map-submit').click();
  await page.locator('#map-error').getByText('Scale must be positive.').waitFor();
  await page.locator('#map-scale').fill('1');
  await page.locator('#map-submit').click();
  await dialog.waitFor({ state: 'hidden' });
  await counted(5);
  assert.equal(await page.locator('.duration-band[data-duration-id="span"]').count(), 0);
  await page.locator('.duration-band[data-duration-id="follows"]').waitFor();
  await view(995, 1105);
  await counted(5);
  await page.locator('.duration-band[data-duration-id="span"]').waitFor();
  // One Undo brings them all back.
  await page.locator('#undo-button').click();
  await counted(0);
  await view(-5, 105);
  await counted(10);

  // Everything, twice as long around 0: the view follows, showing the same moments.
  await open();
  await page.locator('#map-scale').fill('2');
  await page.locator('#map-around').fill('0');
  await page
    .locator('#map-summary')
    .getByText('This moves 9 moments and 2 durations. You can undo it.')
    .waitFor();
  await page.locator('#map-submit').click();
  await dialog.waitFor({ state: 'hidden' });
  await page.waitForFunction(
    () => document.getElementById('markers').dataset.view === '-10/1 210/1',
  );
  await counted(10);
  await page.locator('#undo-button').click();
  await view(-5, 105);
  await counted(10);

  // A separated track, from its bar: back to the whole timeline, with those moved.
  await page.locator('#separate-button').click();
  await page.locator('#separate-extra').fill('early');
  await page.locator('#separate-submit').click();
  await page.locator('#separation-settings').waitFor();
  await page.locator('#separation-map').click();
  await dialog.waitFor();
  assert(await page.locator('input[name=map-scope][value=tagged]').isChecked());
  assert.equal(await page.locator('#map-tags').inputValue(), 'early');
  await page.locator('#map-offset').fill('-100');
  await page.locator('#map-submit').click();
  await dialog.waitFor({ state: 'hidden' });
  await page.locator('#separation-settings').waitFor({ state: 'hidden' });
  await counted(5);
  await page.locator('#undo-button').click();
  await counted(10);
  await load(restore);
  console.log('PASS time mapping: tagged, everything with the view, a separated track; Undo.');
}
