// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
import assert from 'node:assert/strict';
import { Q, Viewport } from '../dist/core.mjs';

export async function checkZoomHelp(page) {
  const stage = page.locator('#timeline-stage');
  const camera = async () => {
    const left = Q.parse(await page.locator('#exact-left').inputValue());
    return new Viewport(left, Q.parse(await page.locator('#exact-right').inputValue()).sub(left));
  };
  const width = await stage.evaluate((node) => node.clientWidth - 96);
  const before = await camera();
  const expected = before.zoom(width / 2, width, Q.from(4n, 5n)).rasterize(width);
  await page.evaluate(() => document.getElementById('zoom-in').click());
  assert.equal(await stage.getAttribute('data-zooming'), 'true');
  await page.waitForFunction(() => !document.getElementById('timeline-stage').dataset.zooming);
  await page.waitForFunction(
    (left) => document.getElementById('exact-left').value === left,
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
    return !node.dataset.zooming && document.getElementById('exact-left').value === span;
  }, target.left.toString());
  assert.equal((await camera()).span.toString(), target.span.toString());

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
  assert.match(await dialog.textContent(), /Ctrl-scroll scales/);
  await page.mouse.click(2, 2);
  await dialog.waitFor({ state: 'hidden' });
}
