// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// The site's header in a live browser against PostgreSQL: it stays at the top of a scrolling
// page, on wide screens and phones; on phones its links are a side menu that the menu button
// slides in and out, closed by Escape (focus back on the button), a tap outside, its close
// button or a link; without JavaScript the links stay in the header. A timeline's page on a
// touch screen isn't clipped, so pull-to-refresh works. SITE_MENU_SCREENSHOTS
// names a directory to save screenshots in.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFile, mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import pg from 'pg';
import { chromium, firefox, webkit } from 'playwright';
if (!process.env.DATABASE_URL) throw new Error('Use a dedicated PostgreSQL test database.');
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
await pool.query(await readFile(new URL('../server/schema.sql', import.meta.url), 'utf8'));
const port = Number(process.env.PLATFORM_TEST_PORT ?? 5199),
  origin = `http://127.0.0.1:${port}`,
  shots = process.env.SITE_MENU_SCREENSHOTS;
const env = {
  ...process.env,
  NODE_ENV: 'production',
  APP_ORIGIN: origin,
  OCH_APP_ROOT: process.cwd(),
  NEXT_TELEMETRY_DISABLED: '1',
  PORT: String(port),
  HOSTNAME: '127.0.0.1',
  // The landing page on, so the header has its most links (Explore too).
  LANDING_PAGE: '1',
};
for (const key of Object.keys(env))
  if (key.startsWith('OAUTH_') || key === 'PLUGIN_LIBRARY') delete env[key];
const child = spawn(
  process.execPath,
  [resolve(process.env.PLATFORM_TEST_SERVER ?? 'platform/.next/standalone/platform/server.cjs')],
  { env, stdio: ['ignore', 'pipe', 'pipe'] },
);
let logs = '',
  exited = false;
for (const s of [child.stdout, child.stderr])
  s.on('data', (c) => (logs = (logs + c).slice(-12000)));
child.on('exit', () => (exited = true));
let browser;
try {
  for (let i = 0; i < 150 && !exited; i++) {
    try {
      if ((await fetch(origin + '/healthz', { signal: AbortSignal.timeout(500) })).ok) break;
    } catch {}
    await delay(200);
  }
  assert(!exited, logs);
  if (shots) await mkdir(shots, { recursive: true });
  const engine = { chromium, firefox, webkit }[process.env.BROWSER ?? 'chromium'];
  browser = await engine.launch();
  const errors = [];
  /** A new page at `size`, with `javaScriptEnabled`, collecting script errors. */
  const open = async (size, javaScriptEnabled = true) => {
    const context = await browser.newContext({ viewport: size, javaScriptEnabled });
    const page = await context.newPage();
    page.on('pageerror', (error) => errors.push(error.message));
    return page;
  };
  const header = (page) => page.locator('.platform-header');
  const headerTop = async (page) => (await header(page).boundingBox()).y;

  // Wide: the links in the header, no menu button, and the header stays as the page scrolls.
  const wide = await open({ width: 1280, height: 800 });
  await wide.goto(origin + '/help');
  await wide.getByRole('link', { name: 'Plugin library' }).waitFor();
  assert(await wide.getByRole('link', { name: 'Plugin library' }).isVisible());
  assert.equal(await wide.getByRole('button', { name: 'Menu', exact: true }).isVisible(), false);
  await wide.mouse.wheel(0, 1500);
  await wide.waitForFunction(() => scrollY > 500);
  assert.equal(await headerTop(wide), 0, 'the header stays at the top');
  await wide.context().close();

  // A phone: one row (the menu button, the brand and Sign in), and the links slide in.
  const phone = await open({ width: 390, height: 844 });
  await phone.goto(origin + '/help');
  const menu = phone.getByRole('button', { name: 'Menu', exact: true }),
    nav = phone.locator('#site-navigation'),
    library = nav.getByRole('link', { name: 'Plugin library' });
  await menu.waitFor();
  // Loading the page doesn't slide the panel: it is off the screen from the first frame.
  assert.equal(await nav.evaluate((n) => getComputedStyle(n).visibility), 'hidden');
  assert((await header(phone).boundingBox()).height < 70, 'one row');
  assert.equal(await library.isVisible(), false);
  assert.equal(await menu.getAttribute('aria-expanded'), 'false');
  if (shots) await phone.screenshot({ path: join(shots, 'phone-closed.png') });
  // It slides: a transform transition on the panel, which starts off the screen.
  await phone.waitForFunction(
    () => document.getElementById('site-navigation').dataset.animate === 'true',
  );
  assert.match(await nav.evaluate((n) => getComputedStyle(n).transitionProperty), /transform/);
  await menu.click();
  assert.equal(await menu.getAttribute('aria-expanded'), 'true');
  await phone.waitForFunction(
    () => document.getElementById('site-navigation').getBoundingClientRect().left === 0,
  );
  assert(await library.isVisible());
  for (const name of ['Explore', '＋ New timeline', 'Download', 'Help'])
    assert(await nav.getByRole('link', { name }).isVisible(), name);
  // The focus moves into it, and the page behind doesn't scroll.
  assert.equal(
    await phone.evaluate(() => document.activeElement.closest('nav')?.id),
    'site-navigation',
  );
  assert.equal(await phone.evaluate(() => document.documentElement.style.overflow), 'hidden');
  await delay(300);
  if (shots) await phone.screenshot({ path: join(shots, 'phone-open.png') });
  // Escape closes it, sliding out, and returns the focus to the menu button.
  await phone.keyboard.press('Escape');
  assert.equal(await menu.getAttribute('aria-expanded'), 'false');
  await phone.waitForFunction(
    () => getComputedStyle(document.getElementById('site-navigation')).visibility === 'hidden',
  );
  assert.equal(
    await phone.evaluate(() => document.activeElement.getAttribute('aria-label')),
    'Menu',
  );
  assert.equal(await phone.evaluate(() => document.documentElement.style.overflow), '');
  // A tap outside closes it, and so does its close button.
  await menu.click();
  await library.waitFor();
  await phone.mouse.click(380, 600);
  assert.equal(await menu.getAttribute('aria-expanded'), 'false');
  await menu.click();
  await nav.getByRole('button', { name: 'Close menu' }).click();
  assert.equal(await menu.getAttribute('aria-expanded'), 'false');
  await phone.waitForFunction(
    () => getComputedStyle(document.getElementById('site-navigation')).visibility === 'hidden',
  );
  // The menu button comes first in the row, before the brand.
  assert(
    (await menu.boundingBox()).x < (await phone.locator('.brand').boundingBox()).x,
    'the menu button first',
  );
  // The header stays at the top on a phone too.
  await phone.mouse.wheel(0, 2000);
  await phone.waitForFunction(() => scrollY > 500);
  assert.equal(await headerTop(phone), 0);
  if (shots) await phone.screenshot({ path: join(shots, 'phone-scrolled.png') });
  // A link goes, closing the menu.
  await menu.click();
  await library.click();
  await phone.waitForURL(origin + '/plugins');
  await menu.waitFor();
  assert.equal(await menu.getAttribute('aria-expanded'), 'false');
  await phone.context().close();

  // A timeline's page on a touch screen fills the screen without scrolling, and isn't clipped,
  // so the browser's pull-to-refresh still works; with a mouse it is clipped.
  for (const touch of [true, false]) {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      ...(touch && process.env.BROWSER !== 'firefox' ? { isMobile: true, hasTouch: true } : {}),
    });
    const editor = await context.newPage();
    await editor.goto(origin + '/editor?new=1');
    await editor.locator('.editor-frame').waitFor();
    const page = await editor.evaluate(() => ({
      overflow: getComputedStyle(document.body).overflow,
      mouse: matchMedia('(hover: hover) and (pointer: fine)').matches,
      fits: document.scrollingElement.scrollHeight <= innerHeight + 1,
    }));
    assert(page.fits, 'one screen tall');
    // A headless browser may have no mouse; what it reports decides.
    assert.equal(page.overflow, page.mouse ? 'hidden' : 'visible');
    if (touch && process.env.BROWSER !== 'firefox') assert(!page.mouse, 'a touch screen');
    await context.close();
  }

  // Without JavaScript, a phone's header keeps its links, beneath the brand.
  const plain = await open({ width: 390, height: 844 }, false);
  await plain.goto(origin + '/help');
  assert(await plain.getByRole('link', { name: 'Plugin library' }).isVisible());
  assert.equal(await plain.getByRole('button', { name: 'Menu', exact: true }).isVisible(), false);
  await plain.context().close();
  assert.deepEqual(errors, []);
  console.log(
    'PASS site menu: the header stays at the top on wide screens and phones; on phones a side menu that slides in and out, closed by Escape, a tap outside, its button or a link; the links in the header without JavaScript.',
  );
} finally {
  await browser?.close();
  child.kill();
  await pool.end();
}
