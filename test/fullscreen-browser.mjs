// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// Full screen (#234): the timeline card takes the whole window, and gives it back.
import assert from 'node:assert/strict';

/**
 * The button and the F key enter full screen, where the card covers the viewport and the
 * stage fills what its toolbar and footer leave; dialogs still open above it. The button,
 * Escape and leaving the browser's own full screen all leave, restoring the stage's height.
 */
export async function checkFullscreen(page) {
  const stage = page.locator('#timeline-stage');
  const button = page.locator('#fullscreen-button');
  const before = (await stage.boundingBox()).height;
  const viewport = page.viewportSize();
  const covers = () =>
    page.evaluate(() => {
      const card = document.querySelector('.timeline-card').getBoundingClientRect();
      const stage = document.getElementById('timeline-stage').getBoundingClientRect();
      const footer = document.querySelector('.timeline-footer').getBoundingClientRect();
      return {
        card: [card.left, card.top, card.width, card.height].map(Math.round),
        stageBottom: Math.round(stage.bottom),
        footerTop: Math.round(footer.top),
        footerBottom: Math.round(footer.bottom),
        stageHeight: stage.height,
        // The whole of the window is the card's: nothing else is hit in its corners.
        corners: [
          [1, 1],
          [innerWidth - 2, innerHeight - 2],
        ].every(([x, y]) =>
          document.querySelector('.timeline-card').contains(document.elementFromPoint(x, y)),
        ),
      };
    });
  const full = async () => {
    await page.waitForFunction(() =>
      document.documentElement.classList.contains('timeline-fullscreen'),
    );
    // The browser's own full screen comes a moment later, where it is granted at all.
    await page
      .waitForFunction(() => document.fullscreenElement, null, { timeout: 5000 })
      .catch(() => {});
    await page.waitForFunction(
      (height) => document.getElementById('timeline-stage').clientHeight > height,
      before,
    );
    const box = await covers();
    const window = await page.evaluate(() => [innerWidth, innerHeight]);
    assert.deepEqual(box.card, [0, 0, ...window], JSON.stringify(box));
    assert.equal(box.stageBottom, box.footerTop, JSON.stringify(box));
    assert.equal(box.footerBottom, window[1], JSON.stringify(box));
    assert.ok(box.corners, 'The card covers the window');
    assert.equal(await button.textContent(), 'Exit full screen');
    assert.equal(await button.getAttribute('aria-pressed'), 'true');
  };
  const left = async () => {
    await page.waitForFunction(
      () =>
        !document.documentElement.classList.contains('timeline-fullscreen') &&
        !document.fullscreenElement,
    );
    await page.waitForFunction(
      (height) => Math.abs(document.getElementById('timeline-stage').clientHeight - height) < 1,
      before,
    );
    assert.equal((await button.textContent()).trim(), 'Full screen');
    assert.equal(await button.getAttribute('aria-pressed'), 'false');
  };
  assert.ok(viewport);

  await button.click();
  await full();
  // The timeline draws to its new size, and keeps the keyboard.
  assert.equal(await page.evaluate(() => document.activeElement?.id), 'timeline-stage');
  await page.waitForFunction(() => {
    const stage = document.getElementById('timeline-stage');
    const layer = stage.querySelector('#axis');
    return layer && Math.abs(layer.getBoundingClientRect().width - stage.clientWidth) < 2;
  });
  // A dialog opens above the card, and Escape closes it before leaving full screen.
  await page.locator('#timeline-help-button').click();
  await page.locator('#timeline-help-dialog[open]').waitFor();
  assert.ok(
    await page.evaluate(() => {
      const dialog = document.getElementById('timeline-help-dialog').getBoundingClientRect();
      const hit = document.elementFromPoint(
        dialog.left + dialog.width / 2,
        dialog.top + dialog.height / 2,
      );
      return document.getElementById('timeline-help-dialog').contains(hit);
    }),
    'The help dialog shows above the full-screen timeline',
  );
  // Without the browser's full screen, Escape closes the dialog and stays. With it, Firefox and
  // WebKit spend Escape on leaving their full screen, so the dialog's own button closes it.
  if (await page.evaluate(() => !document.fullscreenElement)) await page.keyboard.press('Escape');
  else await page.locator('#timeline-help-dialog form button').click();
  await page.locator('#timeline-help-dialog').waitFor({ state: 'hidden' });
  assert.ok(
    await page.evaluate(() => document.documentElement.classList.contains('timeline-fullscreen')),
  );
  await button.click();
  await left();

  await stage.focus();
  await page.keyboard.press('f');
  await full();
  // Escape leaves, whether the browser had granted its own full screen or not.
  await stage.focus();
  await page.keyboard.press('Escape');
  await left();

  // Left before the browser has finished entering its full screen, the window is given back
  // once it has.
  await stage.focus();
  await page.keyboard.press('f');
  await page.keyboard.press('Escape');
  await left();
  await page.waitForTimeout(1000);
  await left();

  // Leaving the browser's full screen by its own means leaves the timeline's too.
  await stage.focus();
  await page.keyboard.press('F');
  await full();
  await page.evaluate(() => {
    if (document.fullscreenElement) return document.exitFullscreen();
    // Where the browser refused its full screen, its controls can't leave it either.
    document.getElementById('fullscreen-button').click();
  });
  await left();
  console.log(
    'PASS full screen: the button and F cover the window with the timeline, dialogs open above it, and the button, Escape or leaving the browser’s full screen give it back.',
  );
}
