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
    await page.waitForFunction(() => !document.getElementById('search-dialog').open);
    // Duration endpoints follow a moment chosen from a paged, searchable selector.
    const picker = page.locator('#moment-picker'),
      choices = page.locator('#moment-picker-results .search-result'),
      status = (pattern) =>
        page.waitForFunction(
          (source) =>
            new RegExp(source).test(document.getElementById('moment-picker-status').textContent),
          pattern,
        );
    await page.locator('#add-duration-button').click();
    const durationDialog = page.locator('#duration-dialog');
    await durationDialog.waitFor({ state: 'visible' });
    const start = durationDialog.locator('[data-endpoint="start"]'),
      end = durationDialog.locator('[data-endpoint="end"]');
    // Cancelling the selector leaves the endpoint fixed.
    await start.locator('select').selectOption('moment');
    await picker.waitFor({ state: 'visible' });
    await page.keyboard.press('Escape');
    // The dialog's close event, which resets the kind, follows hiding it.
    await page.waitForFunction(
      () => document.querySelector('[data-endpoint="start"] select').value === 'time',
    );
    assert.equal(await start.locator('.duration-time').count(), 1);
    await end.locator('select').selectOption('moment');
    await picker.waitFor({ state: 'visible' });
    await status('^32 moments in time order · page 1 of 2$');
    assert.equal(await choices.count(), 25);
    assert(await page.locator('#moment-picker-previous').isDisabled());
    await page.locator('#moment-picker-next').click();
    await status('page 2 of 2');
    assert.equal(await choices.count(), 7);
    assert(await page.locator('#moment-picker-next').isDisabled());
    // Typing searches moments only: "Harbor works" is a duration.
    await page.locator('#moment-picker-text').fill('harbor');
    await status('^2 moments match$');
    assert.deepEqual(await choices.locator('strong').allTextContents(), [
      'Harbor survey',
      'Lighthouse',
    ]);
    await choices.nth(1).click();
    await picker.waitFor({ state: 'hidden' });
    await end.locator('.duration-anchor').filter({ hasText: 'Lighthouse' }).waitFor();
    // Choosing again starts from a fresh, unsearched list; closing it keeps the moment.
    await end.getByRole('button', { name: 'Choose another moment…' }).click();
    await status('in time order');
    assert.equal(await page.locator('#moment-picker-text').inputValue(), '');
    await page.getByRole('button', { name: 'Close moment selector' }).click();
    await picker.waitFor({ state: 'hidden' });
    await end.locator('.duration-anchor').filter({ hasText: 'Lighthouse' }).waitFor();
    assert.equal(await end.locator('select').inputValue(), 'moment');
    await durationDialog.getByRole('button', { name: 'Close duration details' }).click();
    await durationDialog.waitFor({ state: 'hidden' });
    console.log(
      'PASS search: dialog results, pages, unchanged view while searching, navigation, highlight and the moment selector.',
    );
  } finally {
    for (const open of ['#moment-picker', '#search-dialog', '#duration-dialog'])
      if (await page.locator(open).isVisible()) await page.keyboard.press('Escape');
    // Closing dialogs return focus to their openers; let that finish before the next check.
    await page.waitForFunction(() => !document.querySelector('dialog[open]'));
    await imported(restore);
  }
}
