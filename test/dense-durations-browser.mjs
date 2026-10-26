// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// Dense durations in the editor (#316): thousands of spans over the same time are drawn as one
// band, rows stop at what fits, the rest sit behind a "more" chip that lists them all, and the
// arrangement holds still while the view pans.
import assert from 'node:assert/strict';
import { closeMomentDetails } from './moment-dialog-browser.mjs';
/** A document of `same` durations over 100–900, an era over 0–1000, and staggered spans. */
export function denseDocument(same = 3000) {
  return {
    format: 'openchronology',
    version: 1,
    title: 'Dense durations',
    description: '',
    events: [],
    durations: [
      { id: 'era', start: '0/1', end: '1000/1', metadata: { title: 'Era' } },
      ...Array.from({ length: same }, (_, i) => ({
        id: 'same' + String(i).padStart(4, '0'),
        start: '100/1',
        end: '900/1',
        metadata: { title: 'Same ' + i },
      })),
      // Each overlaps all the others and none is near another's span, so each needs a row;
      // longer than the 3,000 but starting after them, they are sent ahead of most of them.
      ...Array.from({ length: 18 }, (_, i) => ({
        id: 'stair' + String(i).padStart(2, '0'),
        start: `${105 + i * 80}/1`,
        end: `${1000 + i * 90}/1`,
        metadata: { title: 'Stair ' + i },
      })),
    ],
  };
}
/** Dense durations are grouped, capped, listed and stable while panning. */
export async function checkDenseDurations(page, restore) {
  const doc = denseDocument();
  const total = doc.durations.length;
  await closeMomentDetails(page);
  await page.locator('#json-file').setInputFiles({
    name: 'dense.ochx',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(doc)),
  });
  await page.waitForFunction(
    (title) => document.getElementById('timeline-title').value === title,
    doc.title,
  );
  try {
    await page.locator('#fit-button').click();
    const chip = page.locator('.duration-more');
    await chip.waitFor();
    // The band elements stay few, however many durations there are.
    const bands = page.locator('.duration-band');
    const drawn = await bands.count();
    // (On a narrow screen the staggered spans are close enough to group with the others.)
    assert(drawn >= 1 && drawn <= 17, `drew ${drawn} bands`);
    // The 3,000 same spans are one band, "Same … + N more"; the chip holds every other one.
    const counts = await page.evaluate(() => ({
      grouped: [...document.querySelectorAll('.duration-band')].map((b) =>
        Number(b.dataset.grouped),
      ),
      text: [...document.querySelectorAll('.duration-band')].map((b) => b.textContent),
      chip: Number(document.querySelector('.duration-more').dataset.count),
    }));
    // Led by whichever of its spans ranks first (on a narrow screen, a longer staggered one).
    assert(
      counts.text.some((t) => / \+ \d+ more$/.test(t) && Number(t.match(/(\d+) more$/)[1]) > 200),
      counts.text.join(' | '),
    );
    assert.equal(
      counts.grouped.reduce((n, g) => n + g, 0) + counts.chip,
      total,
      'shown and hidden add up to every duration in the window',
    );
    assert.match(await chip.textContent(), /^＋[\d,]+ more durations ▾$/);
    // The arrangement holds still while the view pans in small steps.
    const arrangement = () =>
      page.evaluate(() =>
        JSON.stringify(
          [...document.querySelectorAll('.duration-band')]
            .map((b) => [b.dataset.durationId, b.style.top, b.dataset.grouped])
            .sort(),
        ),
      );
    const before = await arrangement();
    const stage = await page.locator('#timeline-stage').boundingBox();
    const x = stage.x + stage.width / 2,
      y = stage.y + 60;
    for (let i = 0; i < 6; i++) {
      await page.mouse.move(x, y);
      await page.mouse.down();
      await page.mouse.move(x + (i % 2 ? -7 : 7), y, { steps: 3 });
      await page.mouse.up();
      await page.evaluate(() => new Promise(requestAnimationFrame));
      assert.equal(await arrangement(), before, 'bands kept their rows across pan ' + i);
    }
    // The chip lists every duration in the window: paged, searchable, sorted, each one
    // opened or fitted in view.
    await chip.click();
    const dialog = page.locator('#duration-list');
    await dialog.waitFor();
    const status = page.locator('#duration-list-status');
    await page.waitForFunction(
      (n) =>
        document.getElementById('duration-list-status').textContent ===
        `${n.toLocaleString('en-US')} durations · 1–25`,
      total,
    );
    assert.equal(await page.locator('#duration-list-results li').count(), 25);
    // Longest first: the longest staircase span leads.
    assert.equal(
      await page.locator('#duration-list-results li strong').first().textContent(),
      'Stair 17',
    );
    await page.locator('#duration-list-next').click();
    await page.waitForFunction(() =>
      document.getElementById('duration-list-status').textContent.endsWith('26–50'),
    );
    await page.locator('#duration-list-sort').selectOption('title');
    await page.waitForFunction(() =>
      document.getElementById('duration-list-status').textContent.endsWith('1–25'),
    );
    await page.locator('#duration-list-text').fill('stair 1');
    // "Stair 1" and "Stair 10" to "Stair 17".
    await page.waitForFunction(
      () => document.getElementById('duration-list-status').textContent === '9 durations',
    );
    assert.equal(await status.textContent(), '9 durations');
    await page.locator('#duration-list-text').fill('Era');
    await page.waitForFunction(
      () => document.getElementById('duration-list-status').textContent === '1 duration',
    );
    await page.getByRole('button', { name: 'Fit Era in view' }).click();
    await dialog.waitFor({ state: 'hidden' });
    // Fit in view spans the era with Fit all's margin: wider than 0 to 1000.
    const bounds = await page.evaluate(() =>
      ['left-bound', 'right-bound'].map((id) => document.getElementById(id).value),
    );
    assert(Number(bounds[0].split('/')[0]) < 0, bounds.join(' '));
    // A grouped band lists its own durations.
    await page.locator('#fit-button').click();
    await page
      .locator('.duration-band', { hasText: / \+ \d+ more$/ })
      .first()
      .click();
    await dialog.waitFor();
    assert.equal(
      await page.locator('#duration-list-heading').textContent(),
      'Durations spanning nearly this time',
    );
    await page.waitForFunction(() =>
      /^\d[\d,]* durations/.test(document.getElementById('duration-list-status').textContent),
    );
    await page.locator('[data-close="duration-list"]').click();
    await dialog.waitFor({ state: 'hidden' });
  } finally {
    await page.locator('#json-file').setInputFiles({
      name: 'restore.ochx',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(restore)),
    });
    await page.waitForFunction(
      (title) => document.getElementById('timeline-title').value === title,
      restore.title,
    );
  }
  console.log(
    'PASS dense durations: grouped spans, capped rows, the more chip and its list, stable panning.',
  );
}
