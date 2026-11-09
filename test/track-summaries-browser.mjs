// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// Separated tracks summarized like moments (#560): a separation whose disjoin and union are
// too close to draw apart is a summary on the track it unites into, and its own track is not
// drawn; a track with nothing in view is not drawn either.
import assert from 'node:assert/strict';
import { closeMomentDetails } from './moment-dialog-browser.mjs';

export async function checkTrackSummaries(page, restore) {
  const imported = async (doc) => {
    await closeMomentDetails(page);
    await page.locator('#json-file').setInputFiles({
      name: 'tracks.ochx',
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
    await page.locator('#left-bound').fill(String(left));
    await page.locator('#right-bound').fill(String(right));
    await page.locator('#apply-bounds').click();
    await page.evaluate(() => new Promise(requestAnimationFrame));
  };
  const titles = () => page.locator('.comparison-axis-title').allTextContents();
  const waitTitles = (expected) =>
    page.waitForFunction(
      (expected) =>
        JSON.stringify(
          [...document.querySelectorAll('.comparison-axis-title')].map((t) => t.textContent),
        ) === JSON.stringify(expected),
      expected,
    );
  // Blips separate from 300 and unite at 302, two units apart; late is at 990.
  const separation = {
    separations: [
      {
        tags: ['blip'],
        disjoins: [{ from: null, at: '300' }],
        unions: [{ into: null, at: '302' }],
      },
      { tags: ['late'] },
    ],
  };
  await imported({
    format: 'openchronology',
    version: 1,
    title: 'Track summaries',
    description: '',
    events: [
      { id: 'start', time: '0/1', metadata: { title: 'Start' } },
      { id: 'b1', time: '601/2', metadata: { title: 'Blip one', tags: ['blip'] } },
      { id: 'b2', time: '603/2', metadata: { title: 'Blip two', tags: ['blip'] } },
      { id: 'mid', time: '600/1', metadata: { title: 'Middle' } },
      { id: 'late', time: '990/1', metadata: { title: 'Late', tags: ['late'] } },
    ],
    view: { separation },
  });
  try {
    await page.locator('#separation-settings').waitFor({ state: 'visible' });
    // The whole timeline: the blips' two units are far less than the grouping distance. They
    // are a summary on the main timeline, and their track is not drawn, nor its curves.
    await bounds(0, 1000);
    await waitTitles(['Tagged late', 'Everything else']);
    assert.equal(await page.locator('.separation-fork-line').count(), 0);
    const summary = page.locator('.event-label', { hasText: '2 moments' });
    await summary.waitFor();
    // Listed from the blips' track, where its moments are.
    await page
      .getByRole('button', { name: /2 moments/ })
      .first()
      .click({ force: true });
    await page.locator('#group-details').waitFor({ state: 'visible' });
    await page.waitForFunction(() =>
      document.getElementById('group-events').textContent.includes('Blip two'),
    );
    assert.match(await page.locator('#group-events').textContent(), /Blip one/);
    await closeMomentDetails(page);
    // Close in, they are apart again, curving away and back; late, out of view, is not drawn.
    await bounds(295, 310);
    await waitTitles(['Tagged blip', 'Everything else']);
    assert.equal(await page.locator('.separation-fork-line').count(), 2);
    // Past them, only late and the rest.
    await bounds(980, 1000);
    await waitTitles(['Tagged late', 'Everything else']);
    assert.deepEqual(await titles(), ['Tagged late', 'Everything else']);
  } finally {
    await closeMomentDetails(page);
    if (await page.locator('#separation-rejoin').isVisible())
      await page.locator('#separation-rejoin').click();
    await imported(restore);
  }
  console.log(
    'PASS track summaries: a separation too narrow to draw apart summarized on the track it unites into and listed from its own; tracks with nothing in view not drawn.',
  );
}
