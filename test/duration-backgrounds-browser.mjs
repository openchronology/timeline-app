// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// Duration backgrounds (#94): a duration’s image drawn behind the timeline it spans.
import assert from 'node:assert/strict';
import { closeMomentDetails } from './moment-dialog-browser.mjs';
import { DURATION_BACKGROUNDS } from '../dist/core.mjs';
/**
 * Duration backgrounds (#94): a duration's image fills the timeline behind it, centered
 * between its visible start and end, smaller durations above larger ones, edges in view
 * fading out; collapsed durations show none.
 */
export async function checkDurationBackgrounds(page, restore) {
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGMIWJDwHwAE5AJQGRSfFgAAAABJRU5ErkJggg==',
    'base64',
  );
  const images = 'https://backgrounds.example/**';
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
      name: 'backgrounds.ochx',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(doc)),
    });
    await page.waitForFunction(
      (title) => document.getElementById('timeline-title').value === title,
      doc.title,
    );
  };
  const url = (name) => `https://backgrounds.example/${name}.png`;
  await load({
    format: 'openchronology',
    version: 1,
    title: 'Duration backgrounds',
    description: '',
    plugins: [{ manifest: DURATION_BACKGROUNDS, enabled: true }],
    events: [{ id: 'm', time: '120/1', metadata: { title: 'A moment' } }],
    durations: [
      {
        id: 'wide',
        start: '0/1',
        end: '1000/1',
        metadata: { title: 'Wide', backgroundUrl: url('wide') },
      },
      {
        id: 'inner',
        start: '100/1',
        end: '200/1',
        metadata: { title: 'Inner', backgroundUrl: url('inner') },
      },
      // Far too short to draw as a band at these views: summarized, so no background.
      { id: 'tiny', start: '150/1', end: '150001/1000', metadata: { backgroundUrl: url('tiny') } },
      { id: 'plain', start: '60/1', end: '240/1', metadata: { title: 'No image' } },
    ],
  });
  const view = async (left, right) => {
    await page.locator('#left-bound').fill(String(left));
    await page.locator('#right-bound').fill(String(right));
    await page.locator('#apply-bounds').click();
    await page.waitForFunction(
      (expected) => document.getElementById('markers').dataset.view === expected,
      `${left}/1 ${right}/1`,
    );
  };
  /** Each background's place, its image's place and size, its fade and its stacking. */
  const backgrounds = () =>
    page.evaluate(() => {
      const stage = document.getElementById('timeline-stage').getBoundingClientRect();
      return Object.fromEntries(
        [...document.querySelectorAll('.duration-background')].map((box) => {
          const b = box.getBoundingClientRect(),
            img = box.querySelector('img').getBoundingClientRect();
          return [
            box.dataset.durationId,
            {
              left: b.left - stage.left,
              right: b.right - stage.left,
              height: b.height,
              center: img.left + img.width / 2 - stage.left,
              imageWidth: img.width,
              imageHeight: img.height,
              mask: box.style.maskImage || box.style.webkitMaskImage,
              z: Number(box.style.zIndex),
              loaded: box.querySelector('img').classList.contains('loaded'),
              stage: { width: stage.width, height: stage.height },
            },
          ];
        }),
      );
    });
  const band = (id) =>
    page.evaluate((id) => {
      const stage = document.getElementById('timeline-stage').getBoundingClientRect(),
        b = document
          .querySelector(`.duration-band[data-duration-id="${id}"]`)
          .getBoundingClientRect();
      return { left: b.left - stage.left, right: b.right - stage.left };
    }, id);
  const near = (a, b, what) => assert(Math.abs(a - b) < 1.5, `${what}: ${a} ≠ ${b}`);

  // Both ends of "inner" in view, both of "wide" beyond it.
  await view(50, 250);
  await page.waitForFunction(
    () => document.querySelectorAll('.duration-background img.loaded').length === 2,
  );
  let shown = await backgrounds();
  assert.deepEqual(Object.keys(shown).sort(), ['inner', 'wide']);
  const { wide, inner } = shown;
  // The wide one is the timeline's background: all of it, centered, unfaded.
  near(wide.left, 0, 'wide left');
  near(wide.right, wide.stage.width, 'wide right');
  near(wide.center, wide.stage.width / 2, 'wide center');
  assert.equal(wide.mask, 'none');
  // Images fill the timeline's width and height.
  for (const b of [wide, inner]) {
    near(b.imageWidth, b.stage.width, 'image width');
    near(b.imageHeight, b.stage.height, 'image height');
    near(b.height, b.stage.height, 'background height');
  }
  // The inner one covers its band, its image centered between its ends, both edges fading.
  const innerBand = await band('inner');
  near(inner.left, innerBand.left, 'inner left');
  near(inner.right, innerBand.right, 'inner right');
  near(inner.center, (innerBand.left + innerBand.right) / 2, 'inner center');
  assert.match(
    inner.mask,
    /^linear-gradient\(to right, transparent 0(px)?, (rgb\(0, 0, 0\)|#000) [1-9]/,
  );
  assert.match(inner.mask, /calc\(100% - [1-9][0-9.]*px\), transparent 100%\)$/);
  // The smaller duration is above the larger.
  assert(inner.z > wide.z, 'smaller durations stack above larger ones');

  // Its start beyond the view: centered between the view's edge and its end, which alone fades.
  await view(150, 400);
  shown = await backgrounds();
  const after = await band('inner');
  near(shown.inner.left, 0, 'inner from the view edge');
  near(shown.inner.right, after.right, 'inner right');
  near(shown.inner.center, after.right / 2, 'inner center with its start beyond the view');
  assert.match(shown.inner.mask, /transparent 0(px)?, (rgb\(0, 0, 0\)|#000) 0px/);

  // The images follow the timeline's size.
  const size = page.viewportSize();
  await page.setViewportSize({ width: Math.round(size.width * 0.7), height: size.height });
  await page.waitForFunction(() => {
    const stage = document.getElementById('timeline-stage').getBoundingClientRect(),
      img = document.querySelector('.duration-background[data-duration-id="wide"] img');
    return Math.abs(img.getBoundingClientRect().width - stage.width) < 1.5;
  });
  await page.setViewportSize(size);

  // Disabling the plugin removes them all.
  await page.locator('#plugins-button').click();
  await page.locator('.installed-plugin input[type="checkbox"]').first().uncheck();
  await page.locator('[data-close="plugins-dialog"]').click();
  await page.waitForFunction(() => !document.querySelector('.duration-background'));
  await page.unroute(images);
  await load(restore);
  console.log(
    'PASS duration backgrounds: images fill the timeline centered on each duration’s visible part, smaller above larger, edges in view fading, none for collapsed durations.',
  );
}
