// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// Explore's search (#459) in a live browser: one field across the page finding timelines and
// events, the words highlighted and notes shown where they match; the filters folded away
// until opened, choosing what to show and whose timelines; searched in place; an event
// opening its page; a guest finding public events only; without JavaScript; on a phone.
// SCREENSHOT_DIR keeps screenshots.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { mkdir, readFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { chromium } from 'playwright';
if (!process.env.DATABASE_URL) throw new Error('Use a dedicated PostgreSQL test database.');
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
await pool.query(await readFile(new URL('../server/schema.sql', import.meta.url), 'utf8'));
const port = Number(process.env.PLATFORM_TEST_PORT ?? 5198),
  origin = `http://127.0.0.1:${port}`;
const env = {
  ...process.env,
  NODE_ENV: 'production',
  APP_ORIGIN: origin,
  OCH_APP_ROOT: process.cwd(),
  NEXT_TELEMETRY_DISABLED: '1',
  PORT: String(port),
  HOSTNAME: '127.0.0.1',
};
for (const key of Object.keys(env))
  if (
    key.startsWith('OAUTH_') ||
    ['PLUGIN_LIBRARY', 'FEATURED_TIMELINES', 'LANDING_PAGE'].includes(key)
  )
    delete env[key];
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

// A word only this run's timelines have (letters only, as search terms are words).
const suffix = Date.now().toString(36).replace(/[0-9]/g, 'q'),
  word = 'lumen' + suffix,
  id = randomUUID(),
  username = 'finder_' + suffix;
let browser;
try {
  for (let i = 0; i < 100 && !exited; i++) {
    try {
      if ((await fetch(origin + '/healthz', { signal: AbortSignal.timeout(500) })).ok) break;
    } catch {}
    await delay(200);
  }
  assert(!exited, logs);
  await pool.query(
    "INSERT INTO oc_users(id,username,email_verified_at,terms_version,created_at) VALUES($1,$2,now(),oc_policy_version(),now()-interval '40 days')",
    [id, username],
  );
  const { PostgresStore } = await import('../server/store.mjs');
  const { Auth } = await import('../server/auth.mjs');
  const { sweepStanding } = await import('../server/standing.mjs');
  const { validateDocument } = await import('../dist/core.mjs');
  const store = new PostgresStore(pool);
  const timeline = async (title, visibility, events, durations = []) => {
    const t = await store.create(
      id,
      validateDocument({
        format: 'openchronology',
        version: 1,
        title,
        description: '',
        events,
        durations,
      }),
    );
    await pool.query('UPDATE oc_timelines SET visibility=$2 WHERE id=$1', [t.id, visibility]);
    return t;
  };
  const notes = 'The keepers logged the weather every night. '.repeat(12);
  const coast = await timeline(
    `Lighthouses ${word}`,
    'public',
    [
      { id: 'eddystone', time: '1698/1', metadata: { title: `Eddystone ${word} tower` } },
      {
        id: 'bell',
        time: '1811/1',
        metadata: { title: 'Bell Rock', description: `${notes}Its ${word} lamp was first lit.` },
      },
    ],
    [{ id: 'age', start: '1700/1', end: '1900/1', metadata: { title: `The ${word} age` } }],
  );
  const diary = await timeline(`Private ${suffix}`, 'private', [
    { id: 'diary', time: '1/1', metadata: { title: `Keeper’s ${word} diary` } },
  ]);
  // Starred, for the filter of starred timelines.
  await pool.query('INSERT INTO oc_timeline_stars(timeline_id,user_id) VALUES($1,$2)', [
    diary.id,
    id,
  ]);
  await store.idle();
  await sweepStanding(pool);
  browser = await chromium.launch(
    process.env.BROWSER_EXECUTABLE ? { executablePath: process.env.BROWSER_EXECUTABLE } : {},
  );
  const [name, value] = (
    await new Auth(pool, origin).issue(
      (await pool.query('SELECT * FROM oc_users WHERE id=$1', [id])).rows[0],
    )
  ).cookie
    .split(';')[0]
    .split('=');
  const errors = [];
  const shoot = async (page, label) => {
    if (!process.env.SCREENSHOT_DIR) return;
    await mkdir(process.env.SCREENSHOT_DIR, { recursive: true });
    await page.screenshot({
      path: resolve(process.env.SCREENSHOT_DIR, `library-search-${label}.png`),
      fullPage: true,
    });
  };

  // A guest: one field across the section, its filters folded away; public events found,
  // the words marked, long notes shown where they match.
  const guest = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  let page = await guest.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${origin}/?search=${word}#explore`);
  const explore = page.locator('#explore');
  const field = explore.getByRole('searchbox', { name: 'Search timelines and events' });
  const [fieldBox, sectionBox] = [await field.boundingBox(), await explore.boundingBox()];
  assert(fieldBox.width > sectionBox.width * 0.75, 'the field spans the section');
  assert.equal(await explore.locator('.search-filters').getAttribute('open'), null);
  assert.equal(await explore.getByLabel('Tag', { exact: true }).isVisible(), false);
  const events = explore.locator('.entity-result');
  await events.first().waitFor();
  const titles = () => explore.locator('.entity-result-title a').allTextContents();
  assert.deepEqual((await titles()).sort(), [
    `Bell Rock`,
    `Eddystone ${word} tower`,
    `The ${word} age`,
  ]);
  assert.equal(await explore.locator('.entity-result-title mark').first().textContent(), word);
  const bell = events.filter({ hasText: 'Bell Rock' });
  const snippet = await bell.locator('p').textContent();
  assert(snippet.startsWith('…') && snippet.includes(`Its ${word} lamp`), snippet);
  assert.equal(await bell.locator('p mark').textContent(), word);
  // The timeline matches too, its title marked on its card.
  assert.equal(await explore.locator('.timeline-card-title mark').textContent(), word);
  assert.match(
    await explore.locator('.entity-result-meta').first().textContent(),
    new RegExp(`on Lighthouses ${word} by ${username}`),
  );
  await shoot(page, 'guest');
  // An event opens its own page.
  await explore.locator('.entity-result-title a', { hasText: 'Eddystone' }).click();
  await page.waitForURL((url) => url.pathname.endsWith('/moments/eddystone'));
  assert.equal(
    new URL(page.url()).pathname,
    `/${username}/${coast.slug ?? coast.id}/moments/eddystone`,
  );
  await guest.close();

  // Signed in: the account's private events too, then the filters.
  const signed = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await signed.addCookies([{ name, value, url: origin }]);
  page = await signed.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${origin}/?search=${word}#explore`);
  const mine = page.locator('#explore');
  await mine.locator('.entity-result').first().waitFor();
  assert(
    (await mine.locator('.entity-result-title a').allTextContents()).includes(
      `Keeper’s ${word} diary`,
    ),
  );
  await page.evaluate(() => (window.stillHere = true));
  await mine.locator('.search-filters summary').click();
  // Events only: the timelines go, in place.
  await mine.getByRole('checkbox', { name: 'Timelines' }).uncheck();
  await page.waitForURL((url) => url.searchParams.get('show') === 'moments,durations');
  await mine.locator('.timeline-card').first().waitFor({ state: 'detached' });
  assert.equal(await mine.locator('.search-filters summary').textContent(), 'Filters (1)');
  // Durations only; the last box shown can't be cleared.
  await mine.getByRole('checkbox', { name: 'Moments' }).uncheck();
  await page.waitForURL((url) => url.searchParams.get('show') === 'durations');
  await page.waitForFunction(
    () => document.querySelectorAll('#explore .entity-result').length === 1,
  );
  assert.deepEqual(await mine.locator('.entity-result-title a').allTextContents(), [
    `The ${word} age`,
  ]);
  assert.equal(await mine.getByRole('checkbox', { name: 'Durations' }).isDisabled(), true);
  await mine.getByRole('checkbox', { name: 'Moments' }).check();
  await page.waitForURL((url) => url.searchParams.get('show') === 'moments,durations');
  // My timelines alone: still their private events.
  await mine.getByRole('radio', { name: 'My timelines' }).check();
  await page.waitForURL((url) => url.searchParams.get('within') === 'mine');
  await page.waitForFunction(
    () => document.querySelectorAll('#explore .entity-result').length === 4,
  );
  // Only the timelines it starred: the private one's event.
  const onlyStarred = mine.getByRole('switch', { name: 'Only timelines I starred' });
  await onlyStarred.check();
  await page.waitForURL((url) => url.searchParams.get('starred') === '1');
  await page.waitForFunction(
    () => document.querySelectorAll('#explore .entity-result').length === 1,
  );
  assert.deepEqual(await mine.locator('.entity-result-title a').allTextContents(), [
    `Keeper’s ${word} diary`,
  ]);
  // What it shows, whose and starred.
  assert.equal(await mine.locator('.search-filters summary').textContent(), 'Filters (3)');
  await onlyStarred.uncheck();
  await page.waitForURL((url) => !url.searchParams.has('starred'));
  await page.waitForFunction(
    () => document.querySelectorAll('#explore .entity-result').length === 4,
  );
  // Typing searches in place.
  await mine.getByRole('searchbox').fill(`${word} diary`);
  await page.waitForURL((url) => url.searchParams.get('search') === `${word} diary`);
  await page.waitForFunction(
    () => document.querySelectorAll('#explore .entity-result').length === 1,
  );
  assert(await page.evaluate(() => window.stillHere), 'searching loaded the page');
  assert.equal(await mine.locator('.list-status').last().textContent(), '1 match · Page 1 of 1');
  await shoot(page, 'filters');
  // On a phone the page doesn't scroll sideways.
  await page.setViewportSize({ width: 390, height: 844 });
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await shoot(page, 'phone');
  await signed.close();

  // Without JavaScript the form says the same in the address.
  const plain = await browser.newContext({ javaScriptEnabled: false });
  page = await plain.newPage();
  await page.goto(`${origin}/#explore`);
  await page.locator('#explore').getByRole('searchbox').fill(word);
  await page.locator('#explore .search-filters summary').click();
  await page.locator('#explore').getByRole('checkbox', { name: 'Timelines' }).uncheck();
  await page.locator('#explore').getByRole('button', { name: 'Search', exact: true }).click();
  await page.waitForURL((url) => url.searchParams.get('search') === word);
  assert.deepEqual(new URL(page.url()).searchParams.getAll('show'), ['moments', 'durations']);
  assert.equal(await page.locator('#explore .timeline-card').count(), 0);
  assert.equal(await page.locator('#explore .entity-result').count(), 3);
  await plain.close();
  assert.deepEqual(errors, []);
  console.log(
    'PASS Explore’s search in a browser: one field across the page finding timelines and events with the words marked and notes where they match; filters folded away, choosing what to show and whose timelines, in place; an event opens its page; guests find public events only; without JavaScript; on a phone.',
  );
} finally {
  await browser?.close();
  child.kill();
  await pool.query('DELETE FROM oc_timelines WHERE owner_id=$1', [id]);
  await pool.query('DELETE FROM oc_sessions WHERE user_id=$1', [id]);
  await pool.query('DELETE FROM oc_users WHERE id=$1', [id]);
  await pool.end();
}
