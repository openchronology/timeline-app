// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// Light and dark (#382) against PostgreSQL and in a live browser: the main pages (the browser, a
// timeline in its editor, a moment in the reader, the account, help, administration, plugins,
// sign-in, an embed and a missing page) follow the system's setting at phone and desktop widths,
// with readable text in both; the footer's and the account menu's choice persists across
// reloads and is set before the page first paints, in the editor's frame too, with no content
// security policy refusals; embeds follow the system or their `theme` parameter; print and
// pages without JavaScript; and a timeline's theme keeps its colors, on its light stage, in
// both. THEME_SCREENSHOTS names a directory to save screenshots in.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { resolve, join } from 'node:path';
import { mkdir, readFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { chromium, firefox, webkit } from 'playwright';
import { passwordHash } from '../server/auth.mjs';
import { demo, TIMELINE_THEME } from '../dist/core.mjs';
if (!process.env.DATABASE_URL) throw new Error('Use a dedicated PostgreSQL test database.');
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
await pool.query(await readFile(new URL('../server/schema.sql', import.meta.url), 'utf8'));
const port = Number(process.env.PLATFORM_TEST_PORT ?? 5197),
  origin = `http://127.0.0.1:${port}`;

/** Starts the built platform, with the landing page on so /explore is the browser. */
async function start() {
  const env = {
    ...process.env,
    NODE_ENV: 'production',
    APP_ORIGIN: origin,
    OCH_APP_ROOT: process.cwd(),
    NEXT_TELEMETRY_DISABLED: '1',
    PORT: String(port),
    HOSTNAME: '127.0.0.1',
    LANDING_PAGE: '1',
  };
  for (const key of Object.keys(env))
    if (key.startsWith('OAUTH_') || key === 'PLUGIN_LIBRARY') delete env[key];
  const child = spawn(
    process.execPath,
    [resolve(process.env.PLATFORM_TEST_SERVER ?? 'platform/.next/standalone/platform/server.cjs')],
    { env, stdio: ['ignore', 'pipe', 'pipe'] },
  );
  const server = { child, logs: '', exited: false };
  for (const s of [child.stdout, child.stderr])
    s.on('data', (c) => (server.logs = (server.logs + c).slice(-12000)));
  child.on('exit', () => (server.exited = true));
  for (let i = 0; i < 150 && !server.exited; i++) {
    try {
      if ((await fetch(origin + '/healthz', { signal: AbortSignal.timeout(500) })).ok) break;
    } catch {}
    await delay(200);
  }
  assert(!server.exited, server.logs);
  return server;
}

const id = randomUUID(),
  suffix = Date.now().toString(36),
  username = 'theme_' + suffix,
  password = 'theme-test-password-2026';
const cookies = new Map();
let csrf;
/** Calls the API as the test's account. */
async function call(path, data) {
  const res = await fetch(origin + path, {
    method: data ? 'POST' : 'GET',
    headers: {
      Origin: origin,
      ...(cookies.size ? { Cookie: [...cookies].map(([k, v]) => `${k}=${v}`).join('; ') } : {}),
      ...(csrf ? { 'X-CSRF-Token': csrf } : {}),
      ...(data ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(data ? { body: JSON.stringify(data) } : {}),
  });
  for (const header of res.headers.getSetCookie()) {
    const [key, value] = header.split(';')[0].split('=');
    if (value) cookies.set(key, value);
    else cookies.delete(key);
  }
  const value = await res.json();
  assert(res.ok, `${path}: ${JSON.stringify(value)}`);
  csrf = value.csrf ?? csrf;
  return value;
}

/**
 * The visible text in `root`'s document drawn with too little contrast against what is behind
 * it (WCAG AA: 4.5:1, or 3:1 for large text), skipping text over images or gradients, faded or
 * disabled text, and text hidden from assistive technology.
 */
function lowContrast() {
  const rgba = (color) => {
    const m = color.match(/[\d.]+/g)?.map(Number) ?? [0, 0, 0, 0];
    return [m[0] / 255, m[1] / 255, m[2] / 255, m.length > 3 ? m[3] : 1];
  };
  const luminance = (c) =>
    c
      .slice(0, 3)
      .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
      .reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0);
  const over = (top, under) => [
    ...top.slice(0, 3).map((v, i) => v * top[3] + under[i] * (1 - top[3])),
    1,
  ];
  /** The opaque color behind `element`, or null over an image or gradient. */
  const behind = (element) => {
    const layers = [];
    for (let e = element; e; e = e.parentElement) {
      const style = getComputedStyle(e);
      if (style.backgroundImage !== 'none' || e.tagName === 'IMG') return null;
      const color = rgba(style.backgroundColor);
      if (color[3] > 0) layers.push(color);
      if (color[3] === 1) break;
    }
    const base = rgba(getComputedStyle(document.documentElement).backgroundColor);
    let color = base[3] === 1 ? base : [1, 1, 1, 1];
    for (const layer of layers.reverse()) color = over(layer, color);
    return color;
  };
  const failures = [];
  for (const element of document.body.querySelectorAll('*')) {
    const text = [...element.childNodes]
      .filter((n) => n.nodeType === Node.TEXT_NODE)
      .map((n) => n.textContent)
      .join('')
      .trim();
    if (!text || !element.getClientRects().length) continue;
    if (element.closest('[aria-hidden="true"], [hidden], option, :disabled, .sr-only')) continue;
    const style = getComputedStyle(element);
    if (style.visibility !== 'visible') continue;
    let faded = false;
    for (let e = element; e; e = e.parentElement)
      if (Number(getComputedStyle(e).opacity) < 1) faded = true;
    if (faded) continue;
    const back = behind(element);
    if (!back) continue;
    const front = over(rgba(style.color), back);
    const [a, b] = [luminance(front), luminance(back)].sort((x, y) => y - x);
    const ratio = (a + 0.05) / (b + 0.05);
    const size = parseFloat(style.fontSize),
      large = size >= 24 || (size >= 18.6 && Number(style.fontWeight) >= 700);
    if (ratio < (large ? 3 : 4.5))
      failures.push(
        `${element.tagName.toLowerCase()}.${element.className} "${text.slice(0, 30)}" ${ratio.toFixed(2)}`,
      );
  }
  return failures;
}

/** Whether `color` (computed) is dark: the dark scheme's page, not the light one's. */
const dark = (color) => {
  const [r, g, b] = color.match(/\d+/g).map(Number);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b < 80;
};

const engine = { chromium, firefox, webkit }[process.env.BROWSER ?? 'chromium'];
let browser, server;
try {
  server = await start();
  await pool.query(
    "INSERT INTO oc_users(id,username,email_verified_at,password_hash,terms_version,trust,is_admin) VALUES($1,$2,now(),$3,oc_policy_version(),'trusted',true)",
    [id, username, await passwordHash(password)],
  );
  await call('/api/session');
  await call('/api/auth/login', { username, password });
  const sample = demo();
  /** A public timeline of the sample's moments at `slug`, with `plugins` added. */
  const make = async (slug, title, plugins = []) => {
    const t = await call('/api/timelines', {
      ...sample,
      plugins: [...(sample.plugins ?? []), ...plugins],
      title,
      description: `The ${title} timeline of the theme test.`,
    });
    await pool.query("UPDATE oc_timelines SET slug=$2,visibility='public' WHERE id=$1", [
      t.id,
      slug,
    ]);
    return { ...t, path: `/${username}/${slug}` };
  };
  const plain = await make('plain', 'Plain colors');
  // A theme of its own colors, and no background: its stage stays light in both.
  const themed = await make('themed', 'Themed colors', [
    {
      manifest: TIMELINE_THEME,
      enabled: true,
      settings: { textColor: '#7a2e1f', markerColor: '#aa0000', durationColor: '#335577' },
    },
  ]);
  const moment = sample.events[0].id;

  browser = await engine.launch(
    process.env.BROWSER_EXECUTABLE ? { executablePath: process.env.BROWSER_EXECUTABLE } : {},
  );
  const shots = process.env.THEME_SCREENSHOTS;
  if (shots) await mkdir(shots, { recursive: true });
  const signedIn = async (context) =>
    context.addCookies(
      [...cookies].map(([name, value]) => ({ name, value, url: origin, sameSite: 'Lax' })),
    );
  /** A new tab in `context` that records page errors and content security policy refusals. */
  const open = async (context) => {
    const tab = await context.newPage();
    tab.errors = [];
    tab.on('pageerror', (e) => tab.errors.push(e.message));
    tab.on('console', (m) => {
      if (/Content.Security.Policy|Refused to/i.test(m.text())) tab.errors.push(m.text());
    });
    return tab;
  };
  /** The editor in `tab` (its frame, or the page itself for an embed), drawn. */
  const editor = async (tab) => {
    const frame = tab.url().includes('/embed/')
      ? tab.mainFrame()
      : tab.frames().find((f) => f.url().includes('/editor/frame'));
    const scope =
      frame ?? (await (await tab.waitForSelector('iframe.editor-frame')).contentFrame());
    await scope.waitForSelector('.event-marker', { state: 'attached', timeout: 30000 });
    return scope;
  };

  const sizes = {
    desktop: { width: 1280, height: 900 },
    phone: { width: 390, height: 844 },
  };
  const pages = [
    ['explore', '/explore'],
    ['timeline', plain.path, 'editor'],
    ['account', '/account'],
    ['help', '/help/guide'],
    ['admin', '/admin'],
    ['plugins', '/plugins'],
    ['embed', `/embed/${plain.id}`, 'editor'],
    ['missing', '/no-such-page-' + suffix],
  ];
  // A moment's page opens it in the reader for a guest (the editor's dialog for its owner).
  const guestPages = [
    ['login', '/login'],
    ['reader', `/timelines/${plain.id}/moments/${encodeURIComponent(moment)}`, 'editor'],
  ];
  for (const [size, viewport] of Object.entries(sizes))
    for (const scheme of ['light', 'dark']) {
      for (const [who, list] of [
        ['owner', pages],
        ['guest', guestPages],
      ]) {
        const context = await browser.newContext({ viewport, colorScheme: scheme });
        if (who === 'owner') await signedIn(context);
        const tab = await open(context);
        for (const [name, path, kind] of list) {
          await tab.goto(origin + path);
          // Not found's page has its stylesheet once its script has run.
          await tab.waitForFunction(
            () => getComputedStyle(document.documentElement).backgroundColor !== 'rgba(0, 0, 0, 0)',
          );
          const background = await tab.evaluate(
            () => getComputedStyle(document.documentElement).backgroundColor,
          );
          assert.equal(dark(background), scheme === 'dark', `${name} ${scheme}: ${background}`);
          let failures = await tab.evaluate(lowContrast);
          if (kind === 'editor') {
            const frame = await editor(tab);
            await delay(300);
            const card = await frame.evaluate(
              () => getComputedStyle(document.querySelector('.timeline-card')).backgroundColor,
            );
            assert.equal(dark(card), scheme === 'dark', `${name}'s timeline ${scheme}: ${card}`);
            failures = [...failures, ...(await frame.evaluate(lowContrast))];
          }
          assert.deepEqual(failures, [], `${name} ${size} ${scheme}`);
          if (shots)
            await tab.screenshot({
              path: join(shots, `${name}-${size}-${scheme}.png`),
              fullPage: kind !== 'editor' && name !== 'help',
            });
        }
        assert.deepEqual(tab.errors, []);
        await context.close();
      }
    }

  // The footer's choice, signed out: kept across reloads and set before the first paint.
  {
    const context = await browser.newContext({ viewport: sizes.desktop, colorScheme: 'light' });
    // What <html data-theme> is as <body> begins, before anything can be painted.
    await context.addInitScript(() => {
      const watch = new MutationObserver(() => {
        if (!document.body) return;
        window.themeAtBody = document.documentElement.getAttribute('data-theme');
        watch.disconnect();
      });
      watch.observe(document, { childList: true, subtree: true });
    });
    const tab = await open(context);
    await tab.goto(origin + '/explore');
    const footer = tab.locator('.platform-footer select');
    assert.equal(await footer.inputValue(), 'system');
    await footer.selectOption('dark');
    assert.equal(await tab.evaluate(() => document.documentElement.dataset.theme), 'dark');
    assert(
      dark(await tab.evaluate(() => getComputedStyle(document.documentElement).backgroundColor)),
    );
    await tab.reload();
    assert.equal(await tab.evaluate(() => window.themeAtBody), 'dark', 'set before the body');
    assert.equal(await tab.locator('.platform-footer select').inputValue(), 'dark');
    // The editor's frame, on the same site, takes it too, also before its first paint.
    await tab.goto(origin + plain.path);
    const frame = await editor(tab);
    assert.equal(await frame.evaluate(() => window.themeAtBody), 'dark');
    assert(
      dark(await frame.evaluate(() => getComputedStyle(document.documentElement).backgroundColor)),
    );
    // An embed ignores it: the system's setting, or its parameter.
    await tab.goto(origin + `/embed/${plain.id}`);
    assert.equal(await tab.evaluate(() => document.documentElement.dataset.theme), undefined);
    assert(
      !dark(await tab.evaluate(() => getComputedStyle(document.documentElement).backgroundColor)),
    );
    await tab.goto(origin + `/embed/${plain.id}?theme=dark`);
    assert.equal(await tab.evaluate(() => window.themeAtBody), 'dark');
    // Light, chosen on a dark system, holds too; print is light whatever is chosen.
    await tab.goto(origin + '/explore');
    await tab.locator('.platform-footer select').selectOption('light');
    await tab.emulateMedia({ colorScheme: 'dark' });
    await tab.reload();
    assert.equal(await tab.evaluate(() => window.themeAtBody), 'light');
    assert(
      !dark(await tab.evaluate(() => getComputedStyle(document.documentElement).backgroundColor)),
    );
    await tab.locator('.platform-footer select').selectOption('dark');
    await tab.emulateMedia({ media: 'print' });
    assert(
      !dark(await tab.evaluate(() => getComputedStyle(document.documentElement).backgroundColor)),
      'print is light',
    );
    await tab.emulateMedia({ media: 'screen' });
    assert.deepEqual(tab.errors, []);
    await context.close();
  }

  // The account menu's choice, signed in: System brings back the system's setting.
  {
    const context = await browser.newContext({ viewport: sizes.desktop, colorScheme: 'dark' });
    await signedIn(context);
    const tab = await open(context);
    await tab.goto(origin + '/explore');
    await tab.locator('.account-menu-button').click();
    await tab.getByRole('menuitemradio', { name: 'Light' }).click();
    assert.equal(await tab.evaluate(() => document.documentElement.dataset.theme), 'light');
    assert.equal(
      await tab.getByRole('menuitemradio', { name: 'Light' }).getAttribute('aria-checked'),
      'true',
    );
    assert.equal(await tab.locator('.platform-footer select').inputValue(), 'light');
    await tab.reload();
    assert.equal(await tab.evaluate(() => document.documentElement.dataset.theme), 'light');
    await tab.locator('.account-menu-button').click();
    await tab.getByRole('menuitemradio', { name: 'System' }).click();
    assert.equal(await tab.evaluate(() => document.documentElement.dataset.theme), undefined);
    assert(
      dark(await tab.evaluate(() => getComputedStyle(document.documentElement).backgroundColor)),
    );
    assert.equal(await tab.evaluate(() => localStorage.getItem('openchronology-theme')), null);
    assert.deepEqual(tab.errors, []);
    await context.close();
  }

  // Without JavaScript the system's setting applies, and the choice is not offered.
  {
    const context = await browser.newContext({ javaScriptEnabled: false, colorScheme: 'dark' });
    const tab = await context.newPage();
    await tab.goto(origin + '/explore');
    assert(
      dark(await tab.evaluate(() => getComputedStyle(document.documentElement).backgroundColor)),
    );
    assert.equal(await tab.locator('.platform-footer select').isVisible(), false);
    await context.close();
  }

  // A timeline's theme keeps its colors in both, and the stage behind them follows the page.
  const look = {};
  for (const scheme of ['light', 'dark']) {
    const context = await browser.newContext({ viewport: sizes.desktop, colorScheme: scheme });
    const tab = await open(context);
    for (const [name, timeline] of [
      ['themed', themed],
      ['plain', plain],
    ]) {
      await tab.goto(origin + `/embed/${timeline.id}`);
      const frame = await editor(tab);
      look[`${name} ${scheme}`] = await frame.evaluate(() => {
        const style = (selector) => getComputedStyle(document.querySelector(selector));
        return {
          label: style('.event-label').color,
          marker: style('.event-marker:not(.group)').backgroundColor,
          card: style('.timeline-card').backgroundColor,
          stage: style('#timeline-stage').backgroundColor,
        };
      });
      if (shots && name === 'themed')
        await tab.screenshot({ path: join(shots, `themed-desktop-${scheme}.png`) });
    }
    assert.deepEqual(tab.errors, []);
    await context.close();
  }
  for (const scheme of ['light', 'dark']) {
    assert.equal(look[`themed ${scheme}`].label, 'rgb(122, 46, 31)', scheme);
    assert.equal(look[`themed ${scheme}`].marker, 'rgb(170, 0, 0)', scheme);
  }
  assert.notEqual(look['plain light'].label, look['plain dark'].label, 'defaults switch');
  // The page around a themed stage follows the system; the stage, made on light, stays light.
  assert.notEqual(look['themed light'].card, look['themed dark'].card, 'the page follows');
  for (const scheme of ['light', 'dark'])
    assert(!dark(look[`themed ${scheme}`].stage), `themed stage ${scheme}`);
  assert.equal(look['plain dark'].stage, 'rgba(0, 0, 0, 0)', 'a plain stage is the card’s');
  console.log(
    'PASS themes: the browser, a timeline, the reader, account, help, administration, plugins, sign-in, an embed and a missing page in light and dark at phone and desktop widths with readable text; the footer’s and account menu’s choice kept across reloads and set before the first paint, in the editor’s frame too; embeds by the system or their parameter; print light; no JavaScript, the system’s; a timeline’s theme kept in both.',
  );
} finally {
  await browser?.close();
  server?.child.kill();
  await pool.query('DELETE FROM oc_timelines WHERE owner_id=$1', [id]);
  await pool.query('DELETE FROM oc_users WHERE id=$1', [id]);
  // Sign-in attempts are counted per address across servers, a minute at a time: this test's
  // are not left to count against the live tests that follow it in CI.
  await pool.query('DELETE FROM oc_auth_attempts');
  await pool.end();
}
