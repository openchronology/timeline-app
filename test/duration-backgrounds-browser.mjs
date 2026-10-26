// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// Duration backgrounds (#94): a duration’s image drawn behind the timeline it spans.
import assert from 'node:assert/strict';
import { closeMomentDetails } from './moment-dialog-browser.mjs';
import { DURATION_BACKGROUNDS, TIMELINE_BACKGROUND } from '../dist/core.mjs';
/**
 * Duration backgrounds (#94): a duration's image fills the timeline behind it, centered
 * between its visible start and end, smaller durations above larger ones, edges in view
 * fading out over a fixed width, narrow ones fading away (#222); collapsed durations show none.
 * The images lie behind the timeline, which carries a white halo over them (#220). The
 * timeline's own background, set in the plugin list, lies beneath them all (#223). A
 * duration's menu fits it in the view (#268).
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
    plugins: [
      { manifest: DURATION_BACKGROUNDS, enabled: true },
      { manifest: TIMELINE_BACKGROUND, enabled: true },
    ],
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
  // A redraw still pending from a change (to the plugins, say) rewrites the bounds from the
  // view it shows, so fields filled straight after are tried again until the view moves.
  const view = async (left, right) => {
    const expected = `${left}/1 ${right}/1`;
    for (let attempt = 0; ; attempt++) {
      await page.locator('#left-bound').fill(String(left));
      await page.locator('#right-bound').fill(String(right));
      await page.locator('#apply-bounds').click();
      try {
        await page.waitForFunction(
          (expected) => document.getElementById('markers').dataset.view === expected,
          expected,
          { timeout: attempt < 2 ? 3000 : 30000 },
        );
        return;
      } catch (error) {
        if (attempt >= 2) throw error;
      }
    }
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
              opacity: Number(getComputedStyle(box).opacity),
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
  // Its edges fade over 48 pixels, however wide it is (#222), and it shows in full.
  assert.match(inner.mask, /(rgb\(0, 0, 0\)|#000) 48px, (rgb\(0, 0, 0\)|#000) calc\(100% - 48px\)/);
  assert.equal(inner.opacity, 1);
  // The smaller duration is above the larger.
  assert(inner.z > wide.z, 'smaller durations stack above larger ones');
  // Both lie behind the timeline (#220): made hit-testable for a moment, the backgrounds
  // still give way to the moment drawn over them.
  const front = await page.evaluate(() => {
    const host = document.getElementById('duration-backgrounds'),
      marker = document.querySelector('#markers .event-marker'),
      r = marker.getBoundingClientRect();
    host.style.pointerEvents = 'auto';
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    host.style.pointerEvents = '';
    return { onMarker: marker.contains(hit), hit: hit?.className };
  });
  assert(front.onMarker, `a background covers the moment: ${front.hit}`);
  // Over them the timeline's text and lines carry a white halo: a filter on markers, but
  // shadows on the axis's lines rather than a filter on its whole layer, which lagged (#232).
  assert.deepEqual(
    await page.evaluate(() => {
      const stage = document.getElementById('timeline-stage'),
        style = (selector) => getComputedStyle(stage.querySelector(selector));
      return [
        stage.classList.contains('over-backgrounds'),
        style('.tick-label').textShadow.includes('255, 255, 255'),
        style('.axis-baseline').boxShadow.includes('255, 255, 255'),
        style('.event-marker').filter.startsWith('drop-shadow'),
        getComputedStyle(document.getElementById('axis')).filter,
        getComputedStyle(document.getElementById('edge-arcs')).filter,
      ];
    }),
    [true, true, true, true, 'none', 'none'],
  );

  // Its start beyond the view: centered between the view's edge and its end, which alone fades.
  await view(150, 400);
  shown = await backgrounds();
  const after = await band('inner');
  near(shown.inner.left, 0, 'inner from the view edge');
  near(shown.inner.right, after.right, 'inner right');
  near(shown.inner.center, after.right / 2, 'inner center with its start beyond the view');
  assert.match(shown.inner.mask, /transparent 0(px)?, (rgb\(0, 0, 0\)|#000) 0px/);

  // Narrowing, a background fades out, as the ruler's finest marks do: from full at four fades
  // wide (192 pixels) to nothing at two (96), while its band still shows (#222).
  const stageWidth = shown.inner.stage.width;
  const narrow = async (pixels) => {
    const span = Math.round((100 * stageWidth) / pixels);
    await view(100 - Math.round(span / 4), 100 - Math.round(span / 4) + span);
    return { shown: await backgrounds(), band: await band('inner') };
  };
  let seen = await narrow(140);
  const width = seen.band.right - seen.band.left,
    t = (width - 96) / 96;
  assert(width > 96 && width < 192, `inner is ${width} pixels wide`);
  near(seen.shown.inner.opacity * 100, t * t * (3 - 2 * t) * 100, 'opacity in hundredths');
  seen = await narrow(60);
  assert.equal(seen.shown.inner, undefined, 'a duration narrower than two fades shows no image');
  assert(seen.band.right - seen.band.left > 24, 'while its band still shows');

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
  assert(
    !(await page.evaluate(() =>
      document.getElementById('timeline-stage').classList.contains('over-backgrounds'),
    )),
    'no halo without backgrounds',
  );

  // The timeline's own background (#223) is set in the plugin list, not on any event.
  const setting = page.locator('.installed-plugin input[data-plugin-setting="imageUrl"]');
  const backdrop = () =>
    page.evaluate(() => {
      const box = document.querySelector('.timeline-backdrop'),
        stage = document.getElementById('timeline-stage').getBoundingClientRect();
      if (!box) return null;
      const img = box.querySelector('img').getBoundingClientRect();
      return {
        z: getComputedStyle(box).zIndex,
        loaded: box.querySelector('img').classList.contains('loaded'),
        fills: Math.abs(img.width - stage.width) < 1.5 && Math.abs(img.height - stage.height) < 1.5,
        halo: document.getElementById('timeline-stage').classList.contains('over-backgrounds'),
      };
    });
  await page.locator('#plugins-button').click();
  await setting.fill('http://backgrounds.example/sky.png');
  await setting.dispatchEvent('change');
  await page.getByText('Enter an HTTPS image address.').waitFor();
  assert.equal(await backdrop(), null);
  await setting.fill(url('sky'));
  await setting.dispatchEvent('change');
  await page.locator('[data-close="plugins-dialog"]').click();
  await page.waitForFunction(() => document.querySelector('.timeline-backdrop img.loaded'));
  assert.deepEqual(await backdrop(), { z: '0', loaded: true, fills: true, halo: true });
  // Beneath the durations' backgrounds, once those show again.
  await page.locator('#plugins-button').click();
  await page.locator('.installed-plugin input[type="checkbox"]').first().check();
  await page.locator('[data-close="plugins-dialog"]').click();
  // Once redrawn with the durations' backgrounds, so the view's fields hold still.
  await view(50, 250);
  await page.waitForFunction(
    () => document.querySelectorAll('.duration-background img.loaded').length === 2,
  );
  shown = await backgrounds();
  assert(Math.min(shown.wide.z, shown.inner.z) > 0, 'durations above the timeline background');
  // Cleared, it goes.
  await page.locator('#plugins-button').click();
  assert.equal(await setting.inputValue(), url('sky'));
  await setting.fill('');
  await setting.dispatchEvent('change');
  await page.locator('[data-close="plugins-dialog"]').click();
  await page.waitForFunction(() => !document.querySelector('.timeline-backdrop'));
  // A scroll's event arrives a frame after the scroll: one for a scroll that ended before the
  // menu opened, as when a right-click follows it at once, must not close the menu (#308).
  const afterScroll = await page.evaluate(async () => {
    const band = document.querySelector('.duration-band[data-duration-id="inner"]');
    const before = window.scrollY;
    window.scrollTo(0, before > 0 ? 0 : 40);
    const scrolled = window.scrollY !== before;
    const rect = band.getBoundingClientRect();
    band.dispatchEvent(
      new MouseEvent('contextmenu', {
        bubbles: true,
        cancelable: true,
        clientX: rect.left + rect.width / 2,
        clientY: rect.top + rect.height / 2,
      }),
    );
    for (let i = 0; i < 2; i++) await new Promise(requestAnimationFrame);
    return { scrolled, open: !document.getElementById('timeline-menu').hidden };
  });
  assert.deepEqual(afterScroll, { scrolled: true, open: true });
  // A press outside it closes it.
  await page.evaluate(() =>
    document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })),
  );
  await page.waitForFunction(() => document.getElementById('timeline-menu').hidden);
  // A duration's menu fits it in the view, with Fit all's margin (#268): 100 to 200 spans
  // 80 to 220, give or take the view's rounding to whole pixels.
  await page.locator('.duration-band[data-duration-id="inner"]').click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Fit in view' }).click();
  const fitted = async () =>
    page.evaluate(() =>
      document
        .getElementById('markers')
        .dataset.view.split(' ')
        .map((q) => q.split('/').reduce((n, d) => Number(n) / Number(d))),
    );
  await page.waitForFunction(
    () => !document.getElementById('markers').dataset.view.startsWith('50/1'),
  );
  const [left, right] = await fitted();
  assert(Math.abs(left - 80) < 1 && Math.abs(right - 220) < 1, `fitted to ${left} … ${right}`);
  await page.unroute(images);
  await load(restore);
  console.log(
    'PASS duration backgrounds: images fill the timeline centered on each duration’s visible part, smaller above larger, edges in view fading over a fixed width, narrow ones fading away, none for collapsed durations; the timeline background beneath them, set in the plugin list.',
  );
}
