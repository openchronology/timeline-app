// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// View mode (#233): reading a timeline you can edit as its viewers do, in the reader.
import assert from 'node:assert/strict';
import { closeMomentDetails } from './moment-dialog-browser.mjs';
import {
  DATING_CONTEXT,
  DURATION_BACKGROUNDS,
  MOMENT_ICONS,
  MOMENT_SOURCES,
  RICH_TEXT_NOTES,
  parseTimestamp,
} from '../dist/core.mjs';
/**
 * The switch shows for those who can edit. On, the editing controls go, and a moment or
 * duration opens in the reader: its image, time, tags, notes, plugins' fields, sources and
 * relationships, which lead on to the related one. Off, the editor is back.
 */
export async function checkViewMode(page, restore) {
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGMIWJDwHwAE5AJQGRSfFgAAAABJRU5ErkJggg==',
    'base64',
  );
  const images = 'https://reader.example/**';
  await page.route(images, (route) =>
    route.fulfill({
      contentType: 'image/png',
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: png,
    }),
  );
  const load = async (doc) => {
    await closeMomentDetails(page);
    await page.locator('#json-file').setInputFiles({
      name: 'reader.ochx',
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
    title: 'Reading',
    description: '',
    plugins: [
      MOMENT_ICONS,
      RICH_TEXT_NOTES,
      MOMENT_SOURCES,
      DATING_CONTEXT,
      DURATION_BACKGROUNDS,
    ].map((manifest) => ({ manifest, enabled: true })),
    events: [
      {
        id: 'landing',
        time: '100/1',
        metadata: {
          title: 'The landing',
          description: 'They came ashore **at dawn**.',
          tags: ['amphibious', 'pacific'],
          iconUrl: 'https://reader.example/landing.png',
          sources: ['https://sources.example/landing', 'javascript:alert(1)'],
          datePrecision: 'Day',
        },
      },
    ],
    durations: [
      {
        id: 'campaign',
        start: '50/1',
        end: '300/1',
        metadata: { title: 'The campaign', description: 'Six months of **fighting**.' },
      },
    ],
    relationships: [{ a: { moment: 'landing' }, b: { duration: 'campaign' } }],
  });
  await page.locator('#fit-button').click();
  const marker = page.getByRole('button', { name: 'The landing', exact: true });
  await marker.waitFor();

  // Whoever can edit sees the switch, off: the editor opens.
  assert.equal(await page.locator('#view-mode-control').isVisible(), true);
  assert.equal(await page.locator('#view-mode').isChecked(), false);
  await marker.click({ force: true });
  await page.locator('#event-title').waitFor();
  assert.equal(await page.locator('#event-title').isEditable(), true);
  assert.equal(await page.locator('#reader-panel').isVisible(), false);
  await closeMomentDetails(page);

  // On, the editing controls go and the moment opens in the reader.
  await page.locator('#view-mode').check();
  await page.waitForFunction(() => document.getElementById('add-button').hidden);
  assert.equal(await page.locator('#timeline-title').isEditable(), false);
  await marker.click({ force: true });
  const reader = page.locator('#reader-panel');
  await reader.waitFor();
  assert.equal(await page.locator('#moment-panel').isVisible(), false);
  assert.equal(await page.locator('#reader-title').textContent(), 'The landing');
  const read = () =>
    page.evaluate(() => {
      const panel = document.getElementById('reader-panel'),
        all = (selector) => [...panel.querySelectorAll(selector)].map((e) => e.textContent.trim());
      return {
        when: panel.querySelector('.reader-when')?.textContent ?? '',
        tags: all('.reader-tags li'),
        bold: all('.reader-notes strong'),
        details: all('.reader-details dt, .reader-details dd'),
        links: [...panel.querySelectorAll('.reader-links a')].map((a) => a.href),
        image: panel.querySelector('.reader-image img')?.getAttribute('src') ?? null,
        credit: panel.querySelector('.reader-image figcaption')?.textContent ?? null,
        related: all('.related-entity'),
        editors: panel.querySelectorAll('input, textarea, select').length,
      };
    });
  await page.waitForFunction(() => document.querySelector('.related-entity'));
  let shown = await read();
  assert.match(shown.when, /\S/);
  assert.deepEqual(shown.tags, ['amphibious', 'pacific']);
  assert.deepEqual(shown.bold, ['at dawn'], 'notes as Markdown with the rich-text plugin');
  assert.deepEqual(shown.details, ['Date precision', 'Day']);
  assert.deepEqual(shown.links, ['https://sources.example/landing'], 'only safe links');
  assert.equal(shown.image, 'https://reader.example/landing.png');
  assert.equal(shown.credit, 'Image: reader.example');
  assert.equal(shown.related.length, 1);
  assert.match(shown.related[0], /^The campaign/);
  assert.equal(shown.editors, 0, 'nothing to edit in the reader');

  // Its relationship leads to the duration, read in turn: its span, its notes.
  await page.locator('#reader-panel .related-entity').click();
  await page.waitForFunction(
    () => document.getElementById('reader-title').textContent === 'The campaign',
  );
  shown = await read();
  assert.match(shown.when, / → /);
  // Its notes are Markdown too, with the rich-text plugin on.
  assert.deepEqual(shown.bold, ['fighting']);
  assert.match((await read()).related.join(), /The landing/);
  // A duration's band opens it in the reader too.
  await page.locator('#reader-close').click();
  await page.waitForFunction(() => !document.getElementById('inspector').open);
  await page.locator('.duration-band[data-duration-id="campaign"]').click({ force: true });
  await page.waitForFunction(
    () =>
      document.getElementById('inspector').open &&
      document.getElementById('reader-title').textContent === 'The campaign',
  );
  await page.locator('#reader-close').click();
  await page.waitForFunction(() => !document.getElementById('inspector').open);

  // Off again, the editor is back.
  await page.locator('#view-mode').uncheck();
  await page.waitForFunction(() => !document.getElementById('add-button').hidden);
  await marker.click({ force: true });
  await page.locator('#event-title').waitFor();
  assert.equal(await page.locator('#event-title').isEditable(), true);
  assert.equal(await page.locator('#reader-panel').isVisible(), false);
  await closeMomentDetails(page);

  // The reader writes dates in full at their own precision, whatever the view (#344): not
  // "09-09" from a view starting in that year, nor "0091-01-01 BCE" for a year.
  await load({
    format: 'openchronology',
    version: 1,
    title: 'Reading dates',
    description: '',
    presentation: {
      version: 1,
      mode: 'gregorian',
      significantDigits: 6,
      unit: '',
      scale: '1/1',
      origin: '0/1',
      offsetMinutes: 0,
    },
    events: [
      {
        id: 'march',
        time: parseTimestamp('1781-09-09T00:00:00Z').toString(),
        metadata: { title: 'The march south' },
      },
      {
        id: 'social',
        time: parseTimestamp('-0090-01-01T00:00:00Z').toString(),
        metadata: { title: 'The Social War' },
      },
    ],
    relationships: [{ a: { moment: 'march' }, b: { moment: 'social' } }],
  });
  await page.locator('#view-mode').check();
  const view = async (left, right) => {
    await page.locator('#left-bound').fill(left);
    await page.locator('#right-bound').fill(right);
    await page.locator('#apply-bounds').click();
  };
  const readDate = async (title) => {
    await page.getByRole('button', { name: title, exact: true }).click({ force: true });
    await page.waitForFunction(
      (title) =>
        document.getElementById('inspector').open &&
        document.getElementById('reader-title').textContent === title,
      title,
    );
    await page.waitForFunction(() => document.querySelector('#reader-panel .related-entity'));
    const shown = await read();
    await page.locator('#reader-close').click();
    await page.waitForFunction(() => !document.getElementById('inspector').open);
    return shown;
  };
  await view('1781-03-01T00:00:00Z', '1782-06-01T00:00:00Z');
  shown = await readDate('The march south');
  assert.equal(shown.when, '1781-09-09 CE');
  assert.deepEqual(shown.related, ['The Social War · 91 BCE']);
  await view('-0091-12-31T12:00:00Z', '-0090-01-01T12:00:00Z');
  shown = await readDate('The Social War');
  assert.equal(shown.when, '91 BCE');
  assert.deepEqual(shown.related, ['The march south · 1781-09-09 CE']);
  await page.locator('#view-mode').uncheck();
  await page.unroute(images);
  await load(restore);
  console.log(
    'PASS view mode: a switch for those who can edit; on, no editing controls, and moments and durations open in the reader with their image, time, tags, notes, fields, sources and relationships; off, the editor again.',
  );
}
