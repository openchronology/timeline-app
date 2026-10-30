// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// The timeline theme (#230): colors and fonts for the whole timeline, set in the plugin list.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { closeMomentDetails } from './moment-dialog-browser.mjs';
import { BUILTIN_PLUGINS, MOMENT_COLORS, TIMELINE_THEME } from '../dist/core.mjs';
/**
 * A theme's settings restyle the timeline (labels, the measure, markers, durations, the
 * background and the halo), colors chosen on events still win, bad values are refused in the
 * plugin list, and "Use default" brings back the usual look.
 */
export async function checkTimelineTheme(page, restore) {
  await closeMomentDetails(page);
  const doc = {
    format: 'openchronology',
    version: 1,
    title: 'Theme',
    description: '',
    plugins: [
      { manifest: MOMENT_COLORS, enabled: true },
      {
        manifest: TIMELINE_THEME,
        enabled: true,
        settings: { textColor: '#112233', measureFont: 'Georgia, serif', durationColor: '#000000' },
      },
    ],
    events: [
      { id: 'a', time: '100/1', metadata: { title: 'Plain' } },
      { id: 'b', time: '900/1', metadata: { title: 'Chosen', color: '#5f8b67' } },
    ],
    durations: [{ id: 'd', start: '200/1', end: '800/1', metadata: { title: 'Span' } }],
  };
  await page.locator('#json-file').setInputFiles({
    name: 'theme.ochx',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(doc)),
  });
  await page.waitForFunction(() => document.getElementById('timeline-title').value === 'Theme');
  await page.locator('#fit-button').click();
  await page.locator('.duration-band[data-duration-id="d"]').waitFor();
  const look = () =>
    page.evaluate(() => {
      const style = (selector) => getComputedStyle(document.querySelector(selector));
      const stage = document.getElementById('timeline-stage');
      return {
        label: style('.event-label').color,
        tickFont: style('.tick-label').fontFamily,
        band: style('.duration-band').backgroundColor,
        bandText: style('.duration-band').color,
        marker: style('.event-marker[data-first="100/1"]').backgroundColor,
        background: getComputedStyle(stage).backgroundColor,
        halo: stage.classList.contains('over-backgrounds'),
        labelShadow: style('.event-label').textShadow,
      };
    });
  let shown = await look();
  assert.equal(shown.label, 'rgb(17, 34, 51)');
  assert.match(shown.tickFont, /^Georgia, serif$/);
  assert.equal(shown.band, 'rgb(0, 0, 0)');
  assert.equal(shown.bandText, 'rgb(255, 255, 255)', 'light text on a dark duration color');
  assert.equal(shown.marker, 'rgb(84, 125, 91)', 'markers keep the default color');
  assert.equal(shown.halo, false);

  // Set in the plugin list: a marker color, a background color and a halo color.
  const setting = (key) => page.locator(`.installed-plugin input[data-plugin-setting="${key}"]`);
  const change = async (key, value) => {
    await setting(key).fill(value);
    await setting(key).dispatchEvent('change');
  };
  await page.locator('#plugins-button').click();
  assert.equal(await setting('textColor').inputValue(), '#112233');
  await change('markerColor', '#aa0000');
  await change('backgroundColor', '#203040');
  await change('haloColor', '#000000');
  // A font list that isn't one is refused, and nothing changes.
  await change('textFont', 'url(https://fonts.example/a.woff)');
  await page.getByText('Use font names separated by commas, such as Georgia, serif.').waitFor();
  await page.locator('[data-close="plugins-dialog"]').click();
  await page.waitForFunction(() =>
    document.getElementById('timeline-stage').classList.contains('over-backgrounds'),
  );
  shown = await look();
  assert.equal(shown.marker, 'rgb(170, 0, 0)');
  assert.equal(shown.background, 'rgb(32, 48, 64)');
  assert.equal(shown.halo, true, 'the halo shows over a background color');
  assert.match(shown.labelShadow, /rgb\(0, 0, 0\)/);
  // A color chosen on a moment still wins.
  assert.equal(
    await page.evaluate(
      () =>
        getComputedStyle(document.querySelector('.event-marker[data-first="900/1"]'))
          .backgroundColor,
    ),
    'rgb(95, 139, 103)',
  );

  // "Use default" brings a color back to the usual look: over the theme's dark background, the
  // stage's dark one (#382).
  await page.locator('#plugins-button').click();
  assert.equal(await setting('textFont').inputValue(), '', 'the bad font was not saved');
  await page
    .locator('.installed-plugin .plugin-setting', { hasText: 'Label color' })
    .getByRole('button', { name: 'Use default' })
    .click();
  await page.locator('[data-close="plugins-dialog"]').click();
  await page.waitForFunction(
    () => getComputedStyle(document.querySelector('.event-label')).color === 'rgb(195, 211, 196)',
  );
  await checkThemeSizes(page);
  await page.locator('#json-file').setInputFiles({
    name: 'restore.ochx',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(restore)),
  });
  await page.waitForFunction(
    (title) => document.getElementById('timeline-title').value === title,
    restore.title,
  );
  console.log(
    'PASS timeline theme: label, measure, marker, duration, background and halo colors, fonts and sizes set in the plugin list; event colors still win; bad values refused; defaults restored; larger text keeps labels apart.',
  );
}
/**
 * Text sizes (#267): the label and measure sizes scale their text, label rows and stems make
 * room for it so no labels overlap each other, the markers or the axis, and the plugin list
 * picks a size. Screenshots of the usual size and larger ones are kept in artifacts/.
 */
async function checkThemeSizes(page) {
  const engine = page.context().browser().browserType().name();
  const load = async (title, settings) => {
    const doc = {
      format: 'openchronology',
      version: 1,
      title,
      description: '',
      plugins: [{ manifest: TIMELINE_THEME, enabled: true, ...(settings ? { settings } : {}) }],
      events: Array.from({ length: 8 }, (_, i) => ({
        id: 'm' + i,
        time: `${100 * i}/1`,
        metadata: { title: `Moment number ${i + 1}` },
      })),
    };
    await page.locator('#json-file').setInputFiles({
      name: 'sizes.ochx',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(doc)),
    });
    await page.waitForFunction((t) => document.getElementById('timeline-title').value === t, title);
    await page.locator('#fit-button').click();
    await page.locator('.event-label:not([hidden])').first().waitFor();
    // Rows ease into place; wait for them to settle.
    await page.waitForTimeout(400);
  };
  /** The visible labels', markers' and tick labels' boxes, and the text sizes. */
  const layout = () =>
    page.evaluate(() => {
      const boxes = (selector) =>
        [...document.querySelectorAll(selector)]
          .filter((e) => !e.hidden && e.getClientRects().length)
          .map((e) => {
            const r = e.getBoundingClientRect();
            return { left: r.left, right: r.right, top: r.top, bottom: r.bottom };
          })
          .filter((r) => r.right > r.left);
      const size = (selector) =>
        parseFloat(getComputedStyle(document.querySelector(selector)).fontSize);
      const axis = document.querySelector('.axis-baseline').getBoundingClientRect().top;
      return {
        labels: boxes('#markers .event-label'),
        markers: boxes('#markers .event-marker'),
        ticks: boxes('.tick-label'),
        labelSize: size('.event-label'),
        tickSize: size('.tick-label'),
        axis,
      };
    });
  const overlaps = (a, b) =>
    a.left < b.right - 0.5 &&
    b.left < a.right - 0.5 &&
    a.top < b.bottom - 0.5 &&
    b.top < a.bottom - 0.5;
  const apart = (shown, what) => {
    assert(shown.labels.length >= 4, `${what}: labels are shown`);
    for (const [i, a] of shown.labels.entries()) {
      for (const b of shown.labels.slice(i + 1)) assert(!overlaps(a, b), `${what}: labels overlap`);
      for (const m of shown.markers) assert(!overlaps(a, m), `${what}: a label covers a marker`);
      assert(a.bottom <= shown.axis || a.top >= shown.axis, `${what}: a label crosses the axis`);
    }
    for (const [i, a] of shown.ticks.entries())
      for (const b of shown.ticks.slice(i + 1))
        assert(!overlaps(a, b), `${what}: tick labels overlap`);
    for (const t of shown.ticks) {
      assert(t.top >= shown.axis, `${what}: a tick label crosses the axis`);
      for (const m of shown.markers)
        assert(!overlaps(t, m), `${what}: a tick label covers a marker`);
      for (const a of shown.labels) assert(!overlaps(t, a), `${what}: a tick label covers a label`);
    }
  };
  await mkdir('artifacts', { recursive: true });
  const stage = page.locator('#timeline-stage');
  // The usual size: unchanged.
  await load('Sizes', null);
  let shown = await layout();
  assert.equal(shown.labelSize, 11);
  assert.equal(shown.tickSize, 10);
  await stage.screenshot({ path: `artifacts/theme-sizes-100-${engine}.png` });
  apart(shown, 'usual size');
  // Larger labels and tick labels.
  await load('Sizes 150', { textSize: '150', measureSize: '150' });
  shown = await layout();
  assert.equal(shown.labelSize, 16.5);
  assert.equal(shown.tickSize, 15);
  await stage.screenshot({ path: `artifacts/theme-sizes-150-${engine}.png` });
  apart(shown, '150%');
  // Picked in the plugin list: the largest labels, and smaller tick labels.
  const pick = async (key, value) => {
    const sizes = page.locator(`.installed-plugin select[data-plugin-setting="${key}"]`);
    await sizes.selectOption(value);
  };
  await page.locator('#plugins-button').click();
  assert.equal(
    await page.locator('.installed-plugin select[data-plugin-setting="textSize"]').inputValue(),
    '150',
  );
  await pick('textSize', '200');
  await pick('measureSize', '75');
  await page.locator('[data-close="plugins-dialog"]').click();
  await page.waitForFunction(
    () => getComputedStyle(document.querySelector('.event-label')).fontSize === '22px',
  );
  await page.waitForTimeout(400);
  shown = await layout();
  assert.equal(shown.tickSize, 7.5);
  await stage.screenshot({ path: `artifacts/theme-sizes-200-${engine}.png` });
  apart(shown, '200%');
  // "Default" goes back to the usual size.
  await page.locator('#plugins-button').click();
  await pick('textSize', '');
  await page.locator('[data-close="plugins-dialog"]').click();
  await page.waitForFunction(
    () => getComputedStyle(document.querySelector('.event-label')).fontSize === '11px',
  );
  // A timeline with the first version (no sizes) keeps its look, and the library updates it in
  // place, keeping its colors.
  const first = BUILTIN_PLUGINS.find((p) => p.id === 'timeline-theme' && p.version === 1);
  await page.locator('#json-file').setInputFiles({
    name: 'first.ochx',
    mimeType: 'application/json',
    buffer: Buffer.from(
      JSON.stringify({
        format: 'openchronology',
        version: 1,
        title: 'First theme',
        description: '',
        plugins: [{ manifest: first, enabled: true, settings: { textColor: '#112233' } }],
        events: [{ id: 'a', time: '0/1', metadata: { title: 'A' } }],
      }),
    ),
  });
  await page.waitForFunction(
    () => document.getElementById('timeline-title').value === 'First theme',
  );
  await page.locator('#plugins-button').click();
  assert.equal(await page.locator('.installed-plugin select').count(), 0);
  await page.locator('#plugins-add').click();
  await page.locator('#plugin-search').fill('timeline theme');
  await page.waitForFunction(() => document.querySelectorAll('.library-plugin').length === 1);
  await page
    .locator('.library-plugin')
    .getByRole('button', { name: `Update to v${TIMELINE_THEME.version}`, exact: true })
    .click();
  await page.locator('#plugin-library-dialog').waitFor({ state: 'hidden' });
  await page.locator('.installed-plugin select[data-plugin-setting="textSize"]').waitFor();
  assert.equal(
    await page.locator('.installed-plugin input[data-plugin-setting="textColor"]').inputValue(),
    '#112233',
  );
  await page.locator('[data-close="plugins-dialog"]').click();
}
