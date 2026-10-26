// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// The zoom buttons: animated zooms that land exactly, repeated clicks adding up.
import assert from 'node:assert/strict';
import { Q, Viewport } from '../dist/core.mjs';

export async function checkZoomHelp(page) {
  const stage = page.locator('#timeline-stage');
  const camera = async () => {
    const left = Q.parse(await page.locator('#timeline-stage').getAttribute('data-view-left'));
    return new Viewport(
      left,
      Q.parse(await page.locator('#timeline-stage').getAttribute('data-view-right')).sub(left),
    );
  };
  const width = await stage.evaluate((node) => node.clientWidth - 96);
  const before = await camera();
  const expected = before.zoom(width / 2, width, Q.from(4n, 5n)).rasterize(width);
  await page.evaluate(() => document.getElementById('zoom-in').click());
  assert.equal(await stage.getAttribute('data-zooming'), 'true');
  await page.waitForFunction(() => !document.getElementById('timeline-stage').dataset.zooming);
  await page.waitForFunction(
    (left) => document.getElementById('timeline-stage').dataset.viewLeft === left,
    expected.left.toString(),
  );
  assert.equal((await camera()).span.toString(), expected.span.toString());

  // Clicks accumulate against the destination rather than an arbitrary in-flight frame.
  const target = expected
    .zoom(width / 2, width, Q.from(4n, 5n))
    .rasterize(width)
    .zoom(width / 2, width, Q.from(4n, 5n))
    .rasterize(width);
  await page.evaluate(() => {
    document.getElementById('zoom-in').click();
    document.getElementById('zoom-in').click();
  });
  await page.waitForFunction((span) => {
    const node = document.getElementById('timeline-stage');
    return (
      !node.dataset.zooming && document.getElementById('timeline-stage').dataset.viewLeft === span
    );
  }, target.left.toString());
  assert.equal((await camera()).span.toString(), target.span.toString());

  // The first frame after a zoom key already moves the view (#319). A busy page handles input
  // at the start of a frame, after the frame's timestamp, so the animation's first tick saw no
  // time pass and redrew the old view. Frame timestamps are shifted 50 ms back here to make that
  // happen every time; the result is read after the frame paints (a message posted from
  // requestAnimationFrame runs after it).
  const view = () => page.evaluate(() => document.getElementById('markers').dataset.view);
  await page.evaluate(() => {
    window.__raf = window.requestAnimationFrame;
    window.requestAnimationFrame = (callback) => window.__raf((now) => callback(now - 50));
  });
  for (let i = 0; i < 5; i++) {
    await page.evaluate(() => {
      const before = document.getElementById('markers').dataset.view;
      window.__firstZoomFrame = null;
      addEventListener(
        'keydown',
        () => {
          const channel = new MessageChannel();
          channel.port1.onmessage = () =>
            (window.__firstZoomFrame = document.getElementById('markers').dataset.view !== before);
          window.__raf(() => channel.port2.postMessage(0));
        },
        { capture: true, once: true },
      );
    });
    const shown = await view();
    await stage.focus();
    await page.keyboard.press(i % 2 ? '-' : '+');
    await page.waitForFunction(() => window.__firstZoomFrame !== null);
    assert.equal(await page.evaluate(() => window.__firstZoomFrame), true, 'first frame moves');
    await page.waitForFunction(() => !document.getElementById('timeline-stage').dataset.zooming);
    assert.notEqual(await view(), shown);
  }
  await page.evaluate(() => (window.requestAnimationFrame = window.__raf));

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.waitForFunction(() => matchMedia('(prefers-reduced-motion: reduce)').matches);
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );
  await page.evaluate(() => document.getElementById('zoom-out').click());
  assert.equal(await stage.getAttribute('data-zooming'), null);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.locator('#fit-button').click();

  assert.equal(await page.locator('.below-timeline').count(), 0);
  assert.doesNotMatch(await page.locator('.timeline-footer').textContent(), /Drag to pan/);
  await page.locator('#timeline-help-button').click();
  const dialog = page.locator('#timeline-help-dialog');
  assert(await dialog.isVisible());
  assert.match(await dialog.textContent(), /Alt-scroll moves vertically/);
  assert.match(await dialog.textContent(), /Ctrl-scroll, a trackpad pinch/);
  await page.mouse.click(2, 2);
  await dialog.waitFor({ state: 'hidden' });
}
