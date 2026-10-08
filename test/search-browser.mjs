// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
import assert from 'node:assert/strict';
import { closeMomentDetails } from './moment-dialog-browser.mjs';
/** Search runs in a dialog without moving the view; choosing a result moves to it. */
export async function checkSearch(page, restore) {
  const imported = async (doc) => {
    await closeMomentDetails(page);
    await page.locator('#json-file').setInputFiles({
      name: 'search.ochx',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(doc)),
    });
    await page.waitForFunction(
      (title) => document.getElementById('timeline-title').value === title,
      doc.title,
    );
    await page.evaluate(() => new Promise(requestAnimationFrame));
  };
  const events = [
    { id: 'harbor', time: '0/1', metadata: { title: 'Harbor survey' } },
    {
      id: 'far',
      time: '1000/1',
      metadata: { title: 'Lighthouse', description: 'Near the harbor' },
    },
  ];
  for (let i = 0; i < 30; i++)
    events.push({ id: 'f' + i, time: 2000 + i + '/1', metadata: { title: 'Filler ' + i } });
  const doc = {
    format: 'openchronology',
    version: 1,
    title: 'Search regression',
    description: '',
    events,
    durations: [{ id: 'works', start: '500/1', end: '600/1', metadata: { title: 'Harbor works' } }],
  };
  const dialog = page.locator('#search-dialog'),
    results = page.locator('#search-results .search-result'),
    left = () => page.locator('#left-bound').inputValue();
  try {
    await imported(doc);
    await page.locator('#left-bound').fill('-10');
    await page.locator('#right-bound').fill('10');
    await page.locator('#apply-bounds').click();
    await page.waitForFunction(() => document.getElementById('left-bound').value !== '-10');
    const before = await left();
    // "/" opens search from the timeline.
    await page.locator('#timeline-stage').focus();
    await page.keyboard.press('/');
    await dialog.waitFor({ state: 'visible' });
    await page.locator('#search-text').fill('harbor');
    await page.keyboard.press('Enter');
    await page.waitForFunction(() =>
      /3 matches/.test(document.getElementById('search-status').textContent),
    );
    assert.deepEqual(await results.locator('strong').allTextContents(), [
      'Harbor survey',
      'Harbor works',
      'Lighthouse',
    ]);
    assert.match(await results.nth(1).textContent(), /Duration/);
    assert.match(await results.nth(2).textContent(), /Near the harbor/);
    assert.equal(await left(), before, 'Searching does not move the view.');
    // Paging.
    await page.locator('#search-text').fill('filler');
    await page.locator('#search-submit').click();
    await page.waitForFunction(() =>
      /30 matches · page 1 of 2/.test(document.getElementById('search-status').textContent),
    );
    assert.equal(await results.count(), 25);
    assert(await page.locator('#search-previous').isDisabled());
    await page.locator('#search-next').click();
    await page.waitForFunction(() =>
      /page 2 of 2/.test(document.getElementById('search-status').textContent),
    );
    assert.equal(await results.count(), 5);
    // Choosing a moment closes search and centres it at the current zoom.
    await page.locator('#search-text').fill('lighthouse');
    await page.locator('#search-submit').click();
    await results.first().waitFor();
    await results.first().click();
    await dialog.waitFor({ state: 'hidden' });
    await page.waitForFunction(
      (old) => document.getElementById('left-bound').value !== old,
      before,
    );
    await page.locator('.event-marker.search-hit').waitFor();
    assert.equal(
      await page.locator('.event-marker.search-hit').getAttribute('aria-label'),
      'Lighthouse',
    );
    assert.equal(await page.locator('#inspector').isVisible(), false);
    // Choosing a duration fits it in view.
    await page.locator('#search-button').click();
    await page.locator('#search-text').fill('works');
    await page.locator('#search-submit').click();
    await results.first().waitFor();
    await results.first().click();
    await page.locator('.duration-band.search-hit').waitFor();
    console.log(
      'PASS search: dialog results, pages, unchanged view while searching, navigation and highlight.',
    );
  } finally {
    if (await dialog.isVisible()) await page.keyboard.press('Escape');
    await imported(restore);
  }
}
