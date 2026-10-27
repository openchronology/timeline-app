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
        metadata: {
          title: 'The campaign',
          description: 'Six months of **fighting**.',
          sources: ['https://sources.example/campaign'],
          datePrecision: 'Month',
        },
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
  // Its sources and dating context too (#341).
  assert.deepEqual(shown.details, ['Date precision', 'Month']);
  assert.deepEqual(shown.links, ['https://sources.example/campaign']);
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

  // Separated (#345), its tracks still open in the reader, as the timeline keeps them.
  await page.locator('#separate-button').click();
  await page.locator('#separate-extra').fill('pacific');
  await page.locator('#separate-submit').click();
  await page.locator('#separation-settings').waitFor();
  // Separation re-keys markers into tracks, which ease into place: click once they hold still.
  const settled = async (selector) => {
    let last = null;
    for (let i = 0; i < 100; i++) {
      const box = await page.locator(selector).boundingBox();
      if (box && last && box.x === last.x && box.y === last.y) return;
      last = box;
      await new Promise((r) => setTimeout(r, 150));
    }
  };
  await settled('.event-marker[aria-label="The landing"]');
  await page.getByRole('button', { name: 'The landing', exact: true }).click({ force: true });
  await page.waitForFunction(
    () =>
      document.getElementById('inspector').open &&
      document.getElementById('reader-title').textContent === 'The landing',
  );
  assert.equal(await page.locator('#moment-panel').isVisible(), false);
  await page.waitForFunction(() => document.querySelector('#reader-panel .related-entity'));
  shown = await read();
  assert.deepEqual(shown.tags, ['amphibious', 'pacific']);
  assert.deepEqual(shown.details, ['Date precision', 'Day']);
  assert.match(shown.related.join(), /The campaign/, 'its relationships, by its own ID');
  await page.locator('#reader-close').click();
  await page.waitForFunction(() => !document.getElementById('inspector').open);
  await settled('.duration-band[data-duration-id="rest:campaign"]');
  await page.locator('.duration-band[data-duration-id="rest:campaign"]').click({ force: true });
  await page.waitForFunction(
    () =>
      document.getElementById('inspector').open &&
      document.getElementById('reader-title').textContent === 'The campaign',
  );
  shown = await read();
  assert.match(shown.when, / → /);
  assert.match(shown.related.join(), /The landing/);
  await page.locator('#reader-close').click();
  await page.waitForFunction(() => !document.getElementById('inspector').open);
  await page.locator('#separation-rejoin').click();
  await page.locator('#separation-settings').waitFor({ state: 'hidden' });

  // Off again, the editor is back.
  await page.locator('#view-mode').uncheck();
  await page.waitForFunction(() => !document.getElementById('add-button').hidden);
  await marker.click({ force: true });
  await page.locator('#event-title').waitFor();
  assert.equal(await page.locator('#event-title').isEditable(), true);
  assert.equal(await page.locator('#reader-panel').isVisible(), false);
  await closeMomentDetails(page);
  await page.unroute(images);
  await load(restore);
  console.log(
    'PASS view mode: a switch for those who can edit; on, no editing controls, and moments and durations open in the reader with their image, time, tags, notes, fields, sources and relationships; off, the editor again.',
  );
}
