// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// The editor's color scheme (#382): it follows the system's setting, its header's Theme choice
// is kept across reloads and set before the first paint, and a timeline's theme keeps its colors
// on its own light stage in dark.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { closeMomentDetails } from './moment-dialog-browser.mjs';

/** Whether a computed color is dark. */
const dark = (color) => {
  const [r, g, b] = color.match(/\d+/g).map(Number);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b < 80;
};
/** The page's and the timeline card's backgrounds, and the attribute set on <html>. */
const look = (page) =>
  page.evaluate(() => ({
    page: getComputedStyle(document.documentElement).backgroundColor,
    card: getComputedStyle(document.querySelector('.timeline-card')).backgroundColor,
    label: getComputedStyle(document.querySelector('.event-label')).color,
    theme: document.documentElement.dataset.theme ?? null,
  }));

export async function checkTheme(page) {
  await closeMomentDetails(page);
  // The system's setting, by default.
  await page.emulateMedia({ colorScheme: 'dark' });
  let shown = await look(page);
  assert.equal(shown.theme, null);
  assert(dark(shown.page) && dark(shown.card), JSON.stringify(shown));
  assert(!dark(shown.label), 'labels read on the dark stage');
  await mkdir('artifacts', { recursive: true });
  // Controls ease into their new colors.
  await page.waitForTimeout(400);
  await page.screenshot({ path: 'artifacts/editor-dark.png' });
  await page.emulateMedia({ colorScheme: 'light' });
  assert(!dark((await look(page)).card));

  // Chosen in the header: at once, and in a new page before the first paint.
  const select = page.locator('#theme-choice');
  assert.equal(await select.inputValue(), 'system');
  await select.selectOption('dark');
  shown = await look(page);
  assert.equal(shown.theme, 'dark');
  assert(dark(shown.card));
  const other = await page.context().newPage();
  await other.addInitScript(() => {
    const watch = new MutationObserver(() => {
      if (!document.body) return;
      window.themeAtBody = document.documentElement.getAttribute('data-theme');
      watch.disconnect();
    });
    watch.observe(document, { childList: true, subtree: true });
  });
  await other.goto(page.url());
  await other.locator('.event-marker').first().waitFor({ state: 'attached' });
  assert.equal(await other.evaluate(() => window.themeAtBody), 'dark');
  assert.equal(await other.locator('#theme-choice').inputValue(), 'dark');
  // System, chosen there, reaches this page too (the storage event).
  await other.locator('#theme-choice').selectOption('system');
  await page.waitForFunction(() => !document.documentElement.hasAttribute('data-theme'));
  assert.equal(await select.inputValue(), 'system');
  await other.close();
  console.log(
    'PASS theme: the system’s setting by default, dark labels and card readable; the header’s choice at once, kept and set before the first paint, followed across tabs.',
  );
}
