// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// Help in the editor (#172): the "?" tips and the guided tour.
import assert from 'node:assert/strict';
/**
 * Help in the editor (#172): the "?" buttons show their tips on hover or focus, inside the
 * dialogs too, and open the help about them; the tour lights up each control in turn, goes
 * back and forward by button or arrow key, ends on Escape, and ends at the guide.
 */
export async function checkHelp(page) {
  // Outside the website, help opens timescale.info's in a new tab: record where.
  await page.evaluate(() => {
    window.openedHelp = [];
    window.realOpen = window.open;
    window.open = (url) => {
      window.openedHelp.push(url);
      return null;
    };
  });
  const opened = () => page.evaluate(() => window.openedHelp.splice(0));
  assert((await page.locator('.help-tip').count()) >= 12);

  const grouping = page.getByRole('button', { name: 'Help on grouping' });
  const tooltip = page.locator('#help-tooltip');
  await grouping.hover();
  await tooltip.waitFor();
  assert.match(await tooltip.textContent(), /numbered summary/);
  assert.equal(await grouping.getAttribute('aria-describedby'), 'help-tooltip');
  // It sits under the button, or above it where there is no room below.
  const [b, t] = [await grouping.boundingBox(), await tooltip.boundingBox()];
  assert(
    (t.y >= b.y + b.height && t.y < b.y + b.height + 20) ||
      (t.y + t.height <= b.y && t.y + t.height > b.y - 20),
    'The tip is beside its button',
  );
  await grouping.click();
  assert.deepEqual(await opened(), ['https://timescale.info/help/guide#what-markers-show']);
  await page.mouse.move(1, 1);
  await tooltip.waitFor({ state: 'hidden' });

  // In a dialog, focused from the keyboard, the tip shows above the dialog.
  await page.locator('#separate-button').click();
  const dialog = page.locator('#separate-dialog');
  await dialog.waitFor();
  // Opening it focuses its first control, not the tip; Shift+Tab reaches the tip.
  const separateTip = dialog.getByRole('button', { name: 'Help on separating by tags' });
  await page.waitForFunction(() => !document.activeElement.classList.contains('help-tip'));
  for (let i = 0; i < 6 && !(await separateTip.evaluate((b) => b === document.activeElement)); i++)
    await page.keyboard.press('Shift+Tab');
  await dialog.locator('#help-tooltip').waitFor();
  assert.match(await dialog.locator('#help-tooltip').textContent(), /track above the rest/);
  await page.keyboard.press('Enter');
  assert.deepEqual(await opened(), ['https://timescale.info/help/tags#separating-by-tags']);
  await page.keyboard.press('Escape');
  await dialog.waitFor({ state: 'hidden' });

  // The tour, from the timeline's Help.
  await page.locator('#timeline-help-button').click();
  await page.getByRole('button', { name: 'Take the tour' }).click();
  const card = page.locator('.tour-card'),
    spotlight = page.locator('.tour-spotlight');
  await card.waitFor();
  await page.locator('#timeline-help-dialog').waitFor({ state: 'hidden' });
  const at = async (title, selector) => {
    await card.getByRole('heading', { name: title, exact: true }).waitFor();
    // The spotlight surrounds the control, once it has moved there.
    await page.waitForFunction((selector) => {
      const s = document.querySelector('.tour-spotlight').getBoundingClientRect(),
        c = document.querySelector(selector).getBoundingClientRect();
      return Math.abs(s.left + 6 - c.left) < 2 && Math.abs(s.width - 12 - c.width) < 2;
    }, selector);
  };
  await at('The timeline', '#timeline-stage');
  assert.match(await card.locator('.tour-count').textContent(), /^1 of \d+$/);
  assert(await card.getByRole('button', { name: 'Back' }).isDisabled());
  assert.equal(
    await page.evaluate(() => document.activeElement.textContent),
    'Next',
    'Next has the focus',
  );
  await card.getByRole('button', { name: 'Next' }).click();
  await at('Add an event', '#add-button');
  await page.keyboard.press('ArrowRight');
  await at('Search', '#search-button');
  await page.keyboard.press('ArrowLeft');
  await at('Add an event', '#add-button');
  await card.getByRole('button', { name: 'Back' }).click();
  await at('The timeline', '#timeline-stage');
  await page.keyboard.press('Escape');
  await card.waitFor({ state: 'detached' });
  assert.equal(await spotlight.count(), 0);

  // To the end: the guide.
  await page.locator('#timeline-help-button').click();
  await page.getByRole('button', { name: 'Take the tour' }).click();
  await card.waitFor();
  const total = Number(/of (\d+)/.exec(await card.locator('.tour-count').textContent())[1]);
  for (let i = 1; i < total; i++) await card.getByRole('button', { name: 'Next' }).click();
  await at('Help is here', '#timeline-help-button');
  await card.getByRole('button', { name: 'Open the guide' }).click();
  await card.waitFor({ state: 'detached' });
  assert.deepEqual(await opened(), ['https://timescale.info/help/guide']);
  await page.evaluate(() => (window.open = window.realOpen));
  console.log(
    'PASS help: tips on hover and focus, in dialogs, opening help; the tour, to the guide.',
  );
}
