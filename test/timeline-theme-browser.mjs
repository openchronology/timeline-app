// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// The timeline theme (#230): colors and fonts for the whole timeline, set in the plugin list.
import assert from 'node:assert/strict';
import { closeMomentDetails } from './moment-dialog-browser.mjs';
import { MOMENT_COLORS, TIMELINE_THEME } from '../dist/core.mjs';
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

  // "Use default" brings a color back to the usual look.
  await page.locator('#plugins-button').click();
  assert.equal(await setting('textFont').inputValue(), '', 'the bad font was not saved');
  await page
    .locator('.installed-plugin .plugin-setting', { hasText: 'Label color' })
    .getByRole('button', { name: 'Use default' })
    .click();
  await page.locator('[data-close="plugins-dialog"]').click();
  await page.waitForFunction(
    () => getComputedStyle(document.querySelector('.event-label')).color === 'rgb(76, 101, 76)',
  );
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
    'PASS timeline theme: label, measure, marker, duration, background and halo colors and fonts set in the plugin list; event colors still win; bad values refused; defaults restored.',
  );
}
