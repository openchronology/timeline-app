// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// Headings (#110): moments shown as a title sized by their heading level.
import assert from 'node:assert/strict';
import { closeMomentDetails } from './moment-dialog-browser.mjs';
import { MOMENT_HEADINGS } from '../dist/core.mjs';
/**
 * Headings (#110): a moment with a heading level shows only its title, which is what is
 * clicked, sized by its level and in its font; it still groups and counts in summaries.
 */
export async function checkHeadings(page, restore) {
  const load = async (doc) => {
    await closeMomentDetails(page);
    await page.locator('#json-file').setInputFiles({
      name: 'headings.ochx',
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
    title: 'Headings',
    description: '',
    plugins: [{ manifest: MOMENT_HEADINGS, enabled: true }],
    events: [
      { id: 'part', time: '0/1', metadata: { title: 'Part One', headingLevel: 'h1' } },
      { id: 'plain', time: '50/1', metadata: { title: 'An ordinary moment' } },
      {
        id: 'chapter',
        time: '100/1',
        metadata: {
          title: 'Chapter 2',
          headingLevel: 'h3',
          headingFont: 'Helvetica, Arial, sans-serif',
        },
      },
    ],
  });
  const marker = (time) => page.locator(`#markers .event-marker[data-first="${time}"]`);
  const look = (time) =>
    marker(time).evaluate((button) => ({
      heading: button.classList.contains('heading-marker'),
      level: button.dataset.heading,
      text: button.textContent,
      font: getComputedStyle(button).fontFamily,
      size: parseFloat(getComputedStyle(button).fontSize),
      // Its label and stem are hidden: the title is the marker.
      captions: [...document.querySelectorAll('#markers .event-label:not([hidden])')].map(
        (c) => c.textContent,
      ),
    }));
  await marker('0/1').waitFor();
  const part = await look('0/1'),
    chapter = await look('100/1'),
    plain = await look('50/1');
  assert.deepEqual([part.heading, part.level, part.text], [true, 'h1', 'Part One']);
  assert.match(part.font, /Times New Roman/);
  assert.deepEqual([chapter.heading, chapter.level, chapter.text], [true, 'h3', 'Chapter 2']);
  assert.match(chapter.font, /Helvetica/);
  assert(part.size > chapter.size, 'higher levels are larger');
  assert.equal(plain.heading, false);
  assert.equal(plain.text, '');
  assert(!part.captions.some((c) => c.includes('Part One')), 'a heading has no separate label');
  assert(part.captions.some((c) => c.includes('An ordinary moment')));

  // The title is what is clicked: it opens the moment.
  await marker('0/1').click();
  await page.waitForFunction(() => document.getElementById('event-title').value === 'Part One');
  // Its level and font are chosen in the details panel.
  const level = page.locator('#plugin-event-fields select[data-plugin-key="headingLevel"]');
  assert.equal(await level.inputValue(), 'h1');
  await level.selectOption('h2');
  await page.waitForFunction(
    () =>
      document.querySelector('#markers .event-marker[data-first="0/1"]').dataset.heading === 'h2',
  );
  const font = page.locator('#plugin-event-fields select[data-plugin-key="headingFont"]');
  await font.selectOption('custom');
  const custom = page.getByLabel('Heading font (custom)');
  await custom.fill('Georgia, serif');
  await custom.dispatchEvent('change');
  await page.waitForFunction(() =>
    /Georgia/.test(
      getComputedStyle(document.querySelector('#markers .event-marker[data-first="0/1"]'))
        .fontFamily,
    ),
  );
  // Not a heading: an ordinary moment again.
  await level.selectOption('');
  await page.waitForFunction(
    () =>
      !document
        .querySelector('#markers .event-marker[data-first="0/1"]')
        .classList.contains('heading-marker'),
  );
  assert.equal(await marker('0/1').textContent(), '');
  await level.selectOption('h1');
  await page.waitForFunction(
    () =>
      document.querySelector('#markers .event-marker[data-first="0/1"]').dataset.heading === 'h1',
  );
  await closeMomentDetails(page);

  // Zoomed out, headings group into summaries and count like other moments.
  await page.locator('#left-bound').fill('-100000');
  await page.locator('#right-bound').fill('100000');
  await page.locator('#apply-bounds').click();
  await page.waitForFunction(() => {
    const markers = [...document.querySelectorAll('#markers .event-marker')];
    return markers.length === 1 && markers[0].dataset.count === '3';
  });
  assert.equal(await page.locator('#markers .heading-marker').count(), 0);
  await load(restore);
  console.log(
    'PASS headings: titles alone as markers, sized by level, in their font, clicked to open, and grouped and counted in summaries.',
  );
}
