// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// Presumptive outline (#325): presumptive moments, stack entries and durations drawn dashed.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { closeMomentDetails } from './moment-dialog-browser.mjs';
import {
  FOCUS_ON_HOVER,
  MOMENT_COLORS,
  MOMENT_ICONS,
  MOMENT_SHAPES,
  MOMENT_STACKS,
  PRESUMPTIVE_OUTLINE,
  TIMELINE_THEME,
  validateDocument,
} from '../dist/core.mjs';

/** WCAG contrast between two computed `rgb(…)` colors. */
function contrast(a, b) {
  const luminance = (color) => {
    const [r, g, b] = color
      .match(/[\d.]+/g)
      .slice(0, 3)
      .map((v) => {
        const c = Number(v) / 255;
        return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
      });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}

/**
 * Presumptive outline (#325): a checkbox marks a moment, stack entry or duration presumptive,
 * and its marker (any shape, colored or not, or an icon) or band is drawn dashed, visibly on a
 * light and a dark background; summaries stay solid. It is edited in the details panel and
 * the duration dialog, flagged in the reader, dashed on the hover card, kept by export and
 * reimport, and gone (with its metadata kept) when the plugin is disabled.
 */
export async function checkPresumptive(page, restore) {
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGMIWJDwHwAE5AJQGRSfFgAAAABJRU5ErkJggg==',
    'base64',
  );
  const images = 'https://presumptive.example/**';
  await page.route(images, (route) =>
    route.fulfill({
      contentType: 'image/png',
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: png,
    }),
  );
  /** Loads a timeline; ours (not the one restored at the end) have a moment at 0. */
  const load = async (doc, ours = true) => {
    await closeMomentDetails(page);
    await page.locator('#json-file').setInputFiles({
      name: 'presumptive.ochx',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(doc)),
    });
    await page.waitForFunction(
      (title) => document.getElementById('timeline-title').value === title,
      doc.title,
    );
    if (!ours) return;
    await page.locator('#fit-button').click();
    await page.locator('#markers .event-marker[data-first="0/1"]').waitFor();
  };
  const plugins = (enabled = true, theme) => [
    ...[MOMENT_STACKS, MOMENT_SHAPES, MOMENT_COLORS, MOMENT_ICONS, FOCUS_ON_HOVER].map(
      (manifest) => ({ manifest, enabled: true }),
    ),
    { manifest: PRESUMPTIVE_OUTLINE, enabled },
    ...(theme
      ? [{ manifest: TIMELINE_THEME, enabled: true, settings: { backgroundColor: theme } }]
      : []),
  ];
  const timeline = (title, list) => ({
    format: 'openchronology',
    version: 1,
    title,
    description: '',
    plugins: list,
    events: [
      { id: 'circle', time: '0/1', metadata: { title: 'Suspected leak', presumptive: true } },
      {
        id: 'star',
        time: '100/1',
        metadata: { title: 'Alarm', shape: 'star', color: '#bc6663', presumptive: true },
      },
      { id: 'plain', time: '200/1', metadata: { title: 'Confirmed' } },
      {
        id: 'stacked',
        time: '300/1',
        metadata: {
          title: 'Factors',
          stack: [
            { id: 'maybe', metadata: { title: 'Maybe', shape: 'hexagon', presumptive: true } },
            { id: 'sure', metadata: { title: 'Sure' } },
          ],
        },
      },
      {
        id: 'icon',
        time: '400/1',
        metadata: {
          title: 'Photo',
          iconUrl: 'https://presumptive.example/photo.png',
          presumptive: true,
        },
      },
      { id: 'odd', time: '500/1', metadata: { title: 'Odd', presumptive: 'yes' } },
    ],
    durations: [
      {
        id: 'condition',
        start: '-50/1',
        end: '450/1',
        metadata: { title: 'Condition', presumptive: true },
      },
      { id: 'known', start: '150/1', end: '550/1', metadata: { title: 'Known' } },
    ],
  });
  /** What each marker and band shows: its outline, its dashes, and the colors around them. */
  const look = () =>
    page.evaluate(() => {
      const stage = document.getElementById('timeline-stage');
      const marker = (selector) => {
        const node = document.querySelector(selector);
        if (!node) return null;
        const style = getComputedStyle(node);
        const dashes = node.querySelector('.marker-dashes');
        const dash = dashes && getComputedStyle(dashes);
        return {
          outline: node.dataset.outline ?? null,
          shaped: node.classList.contains('shaped'),
          // A circle or icon: its CSS outline over its white border.
          css: style.outlineStyle,
          cssColor: style.outlineColor,
          border: style.borderTopColor,
          // Any other shape: a dashed copy of its SVG outline, over the white stroke.
          dashes: dash && {
            array: dash.strokeDasharray,
            stroke: dash.stroke,
            path: dashes.getAttribute('d'),
            outline: node
              .querySelector('.marker-outline path:not(.marker-dashes)')
              .getAttribute('d'),
            under: node
              .querySelector('.marker-outline path:not(.marker-dashes)')
              .getAttribute('stroke'),
          },
        };
      };
      return {
        background: getComputedStyle(stage).backgroundColor,
        circle: marker('#markers .event-marker[data-first="0/1"]'),
        star: marker('#markers .event-marker[data-first="100/1"]'),
        plain: marker('#markers .event-marker[data-first="200/1"]'),
        icon: marker('#markers .event-marker[data-first="400/1"]'),
        odd: marker('#markers .event-marker[data-first="500/1"]'),
        maybe: marker('.stack-marker[data-stack-entry="maybe"]'),
        sure: marker('.stack-marker[data-stack-entry="sure"]'),
        condition: marker('.duration-band[data-duration-id="condition"]'),
        known: marker('.duration-band[data-duration-id="known"]'),
      };
    });
  const waitForMarkers = () =>
    page.waitForFunction(
      () =>
        document.querySelector('.stack-marker[data-stack-entry="maybe"]') &&
        document.querySelector('.duration-band[data-duration-id="condition"]') &&
        document.querySelector('#markers .event-marker[data-first="400/1"].icon'),
    );
  /** Checks the dashes show against the white they alternate with and the background. */
  const visible = (shown, name) => {
    const { background } = shown;
    for (const key of ['circle', 'icon', 'condition']) {
      const m = shown[key];
      assert.equal(m.outline, 'dashed', `${key} (${name})`);
      assert.equal(m.css, 'dashed', `${key} (${name})`);
      assert.equal(m.border, 'rgb(255, 255, 255)', `${key} keeps its white border (${name})`);
      assert(contrast(m.cssColor, m.border) >= 4.5, `${key}: dashes on white (${name})`);
      assert(
        Math.max(contrast(m.cssColor, background), contrast(m.border, background)) >= 3,
        `${key}: the dashes or the white between them stand out (${name})`,
      );
    }
    for (const key of ['star', 'maybe']) {
      const m = shown[key];
      assert.equal(m.outline, 'dashed', `${key} (${name})`);
      assert(m.shaped, key);
      assert.notEqual(m.dashes.array, 'none', `${key} (${name})`);
      assert.equal(m.dashes.path, m.dashes.outline, `${key}: dashed along its own outline`);
      assert(contrast(m.dashes.stroke, 'rgb(255, 255, 255)') >= 4.5, `${key} (${name})`);
      assert.equal(m.dashes.under, 'white');
    }
    for (const key of ['plain', 'odd', 'sure', 'known']) {
      assert.equal(shown[key].outline, null, `${key} is solid (${name})`);
      assert.notEqual(shown[key].css, 'dashed', key);
      assert.equal(shown[key].dashes, null, key);
    }
  };

  // Light: the usual background.
  await load(timeline('Presumptive', plugins()));
  await waitForMarkers();
  visible(await look(), 'light');
  // Dark: a dark background color from the timeline theme.
  await load(timeline('Presumptive dark', plugins(true, '#1b2229')));
  await waitForMarkers();
  const dark = await look();
  assert.equal(dark.background, 'rgb(27, 34, 41)');
  visible(dark, 'dark');

  // Summaries stay solid: zoomed out, everything groups.
  await page.locator('#left-bound').fill('-100000');
  await page.locator('#right-bound').fill('100000');
  await page.locator('#apply-bounds').click();
  await page.waitForFunction(() =>
    [...document.querySelectorAll('#markers .event-marker')].some((m) => m.dataset.count === '6'),
  );
  assert.equal(await page.locator('#markers .event-marker.group[data-outline]').count(), 0);

  // Edited with a checkbox in the details panel: on stores true, off removes the key.
  await load(timeline('Presumptive editing', plugins()));
  const plain = page.locator('#markers .event-marker[data-first="200/1"]');
  await plain.click({ force: true });
  await page.waitForFunction(() => document.getElementById('event-title').value === 'Confirmed');
  const box = page.locator('#plugin-event-fields input[data-plugin-key="presumptive"]');
  assert.equal(await box.isChecked(), false);
  assert.match(
    await page
      .locator('#plugin-event-fields .plugin-field[data-metadata-key="presumptive"]')
      .textContent(),
    /Presumptive \(unconfirmed\)/,
  );
  const metadata = async () => JSON.parse(await page.locator('#event-metadata').inputValue());
  await box.check();
  await page.waitForFunction(
    () =>
      document.querySelector('#markers .event-marker[data-first="200/1"]').dataset.outline ===
      'dashed',
  );
  assert.equal((await metadata()).presumptive, true);
  await box.uncheck();
  await page.waitForFunction(
    () => !document.querySelector('#markers .event-marker[data-first="200/1"]').dataset.outline,
  );
  assert.equal('presumptive' in (await metadata()), false);
  await box.check();
  await page.waitForFunction(
    () =>
      document.querySelector('#markers .event-marker[data-first="200/1"]').dataset.outline ===
      'dashed',
  );
  // An odd stored value reads as unchecked and is kept until changed.
  await closeMomentDetails(page);
  await page.locator('#markers .event-marker[data-first="500/1"]').click({ force: true });
  await page.waitForFunction(() => document.getElementById('event-title').value === 'Odd');
  assert.equal(await box.isChecked(), false);
  assert.equal((await metadata()).presumptive, 'yes');
  await closeMomentDetails(page);
  // A stack entry's card has its own checkbox.
  await page.locator('#markers .event-marker[data-first="300/1"]').click({ force: true });
  await page.waitForFunction(() => document.getElementById('event-title').value === 'Factors');
  const entryBox = (id) =>
    page.locator(`.stack-card[data-stack-id="${id}"] input[data-plugin-key="presumptive"]`);
  assert.equal(await entryBox('maybe').isChecked(), true);
  assert.equal(await entryBox('sure').isChecked(), false);
  await entryBox('sure').check();
  await page.waitForFunction(
    () =>
      document.querySelector('.stack-marker[data-stack-entry="sure"]')?.dataset.outline ===
      'dashed',
  );
  await closeMomentDetails(page);

  // A duration's dialog has the checkbox too.
  await page.locator('.duration-band[data-duration-id="known"]').click({ force: true });
  const durationBox = page.locator('#plugin-duration-fields input[data-plugin-key="presumptive"]');
  await durationBox.waitFor();
  assert.equal(await durationBox.isChecked(), false);
  await durationBox.check();
  await page.waitForFunction(
    () =>
      document.querySelector('.duration-band[data-duration-id="known"]').dataset.outline ===
      'dashed',
  );
  await page.locator('#duration-save').click();
  await page.waitForFunction(() => !document.getElementById('inspector').open);

  // The hover card is dashed too.
  await page.locator('#markers .event-marker[data-first="100/1"]').hover({ force: true });
  await page.waitForFunction(() =>
    document.getElementById('moment-hover-preview')?.classList.contains('open'),
  );
  assert.equal(
    await page
      .locator('#moment-hover-preview')
      .evaluate((card) => getComputedStyle(card).borderTopStyle),
    'dashed',
  );
  await page.mouse.move(2, 2);

  // Export keeps it, and a reimport draws it again.
  const downloading = page.waitForEvent('download');
  await page.locator('#export-button').evaluate((button) => button.click());
  const exported = validateDocument(
    JSON.parse(await readFile(await (await downloading).path(), 'utf8')),
  );
  const saved = Object.fromEntries(exported.events.map((e) => [e.id, e.metadata]));
  assert.equal(saved.plain.presumptive, true);
  assert.equal(saved.odd.presumptive, 'yes');
  assert.deepEqual(
    saved.stacked.stack.map((e) => e.metadata.presumptive),
    [true, true],
  );
  assert.equal(exported.durations.find((d) => d.id === 'known').metadata.presumptive, true);
  await load({ ...exported, title: 'Presumptive reimported' });
  await waitForMarkers();
  const reimported = await look();
  for (const key of ['circle', 'star', 'plain', 'icon', 'maybe', 'sure', 'condition', 'known'])
    assert.equal(reimported[key].outline, 'dashed', key);

  // The reader flags it.
  await page.locator('#view-mode').check();
  await page.waitForFunction(() => document.getElementById('add-button').hidden);
  await page.locator('#markers .event-marker[data-first="300/1"]').click({ force: true });
  await page.locator('#reader-panel').waitFor();
  assert.deepEqual(
    await page.locator('#reader-panel .reader-stack .reader-flags li').allTextContents(),
    ['Presumptive (unconfirmed)', 'Presumptive (unconfirmed)'],
  );
  await page.locator('#reader-close').click();
  await page.waitForFunction(() => !document.getElementById('inspector').open);
  await page.locator('#markers .event-marker[data-first="100/1"]').click({ force: true });
  await page.waitForFunction(() => document.getElementById('reader-title').textContent === 'Alarm');
  assert.deepEqual(
    await page
      .locator('#reader-panel > .reader-flags li, #reader-panel .reader-flags li')
      .allTextContents(),
    ['Presumptive (unconfirmed)'],
  );
  await page.locator('#reader-close').click();
  await page.waitForFunction(() => !document.getElementById('inspector').open);
  await page.locator('#view-mode').uncheck();
  await page.waitForFunction(() => !document.getElementById('add-button').hidden);

  // Disabled: everything solid, and the metadata kept.
  await load(timeline('Presumptive disabled', plugins(false)));
  await waitForMarkers();
  assert.equal(await page.locator('[data-outline], .marker-dashes').count(), 0);
  await page.unroute(images);
  await load(restore, false);
  console.log(
    'PASS presumptive outline: moments of any shape, icons, stack entries and durations dashed on light and dark backgrounds, summaries solid, edited by checkbox, flagged in the reader, kept by export.',
  );
}
