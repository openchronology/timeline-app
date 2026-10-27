// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// The timeline browser in a live browser (#338): the dashboard's and profiles' lists search,
// sort, filter and page in place, without loading the page, keeping the address in step,
// Back working, and the scroll and focus where they were; loading and empty states, the
// grid or list layout, keyboard moves between cards, drafts searched in the browser, and
// the same lists without JavaScript.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { mkdir, readFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { chromium, firefox, webkit } from 'playwright';
import { passwordHash } from '../server/auth.mjs';
import { demo } from '../dist/core.mjs';
if (!process.env.DATABASE_URL) throw new Error('Use a dedicated PostgreSQL test database.');
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
await pool.query(await readFile(new URL('../server/schema.sql', import.meta.url), 'utf8'));
const port = Number(process.env.PLATFORM_TEST_PORT ?? 5195),
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
  if (key.startsWith('OAUTH_') || ['PLUGIN_LIBRARY', 'FEATURED_TIMELINES'].includes(key))
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

const id = randomUUID(),
  suffix = Date.now().toString(36),
  username = 'browse_' + suffix,
  password = 'timeline-browser-password-2026',
  // A word only this run's timelines have, so other tests' timelines don't count.
  word = 'zq' + suffix;
const cookies = new Map();
let csrf;
/** Waits for a list's status line to match `pattern`, failing with what it says instead. */
async function statusMatches(page, list, pattern) {
  await page
    .waitForFunction(
      ([selector, source]) =>
        new RegExp(source).test(document.querySelector(selector)?.textContent ?? ''),
      [`#${list} .list-status`, pattern.source],
    )
    .catch(async (error) => {
      const shown = await page
        .locator(`#${list} .list-status, #${list} [role=alert]`)
        .allTextContents();
      throw new Error(`${list}'s status never matched ${pattern}: ${JSON.stringify(shown)}`, {
        cause: error,
      });
    });
}
/** Calls the API as the test's account. */
async function call(path, data, method = data ? 'POST' : 'GET') {
  const res = await fetch(origin + path, {
    method,
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
const engine = { chromium, firefox, webkit }[process.env.BROWSER ?? 'chromium'];
let browser;
try {
  for (let i = 0; i < 100 && !exited; i++) {
    try {
      if ((await fetch(origin + '/healthz', { signal: AbortSignal.timeout(500) })).ok) break;
    } catch {}
    await delay(200);
  }
  assert(!exited, logs);
  // A trusted account, so browsing lists its public timelines (docs/browsing.md).
  await pool.query(
    "INSERT INTO oc_users(id,username,email_verified_at,password_hash,terms_version,trust) VALUES($1,$2,now(),$3,oc_policy_version(),'trusted')",
    [id, username, await passwordHash(password)],
  );
  await call('/api/session');
  await call('/api/auth/login', { username, password });
  // 14 public timelines (two pages of 12) and 2 private ones, all with this run's word.
  const made = [];
  for (let i = 0; i < 16; i++) {
    const t = await call('/api/timelines', {
      ...demo(),
      title: `${i < 3 ? 'Apollo' : 'Survey'} ${String(i).padStart(2, '0')} ${word}`,
      description: `Timeline ${i} of the browser test, about ${word}.`,
      tags: [word, i % 2 ? 'odd' : 'even'],
      // The Apollo timelines show dates: stored times in Julian years, 161 of them before 1970
      // (late 1808), so the sample's 0 to 24 reads 1808 to 1832; the rest show plain numbers.
      ...(i < 3
        ? {
            presentation: {
              version: 1,
              mode: 'gregorian',
              significantDigits: 6,
              unit: '',
              scale: '1/31557600',
              origin: '161',
              offsetMinutes: 0,
            },
          }
        : {}),
    });
    if (i < 14) await call(`/api/timelines/${t.id}/settings`, { visibility: 'public' }, 'PATCH');
    made.push(t);
  }
  // The search results carry each timeline's span and shape (#338).
  const found = await call('/api/timelines/search', { scope: 'mine', search: word, limit: 1 });
  assert.match(found.timelines[0].time_span, / – /);
  assert.equal(found.timelines[0].shape.length, 24);
  assert(found.timelines[0].shape.some((n) => n === 100));

  browser = await engine.launch(
    process.env.BROWSER_EXECUTABLE ? { executablePath: process.env.BROWSER_EXECUTABLE } : {},
  );
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await context.addCookies([...cookies].map(([name, value]) => ({ name, value, url: origin })));
  const tab = await context.newPage();
  const errors = [];
  tab.on('pageerror', (e) => errors.push(e.message));
  tab.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  // Drafts in this browser, for this account: searched in the browser.
  await tab.goto(origin + '/help');
  await tab.evaluate(
    ({ id, word }) =>
      new Promise((done, fail) => {
        const request = indexedDB.open('openchronology', 2);
        request.onupgradeneeded = () => {
          for (const name of [
            'drafts',
            'draft-moments',
            'draft-durations',
            'draft-links',
            'draft-retired',
          ])
            request.result.createObjectStore(name);
        };
        request.onsuccess = () => {
          const tx = request.result.transaction('drafts', 'readwrite');
          tx.objectStore('drafts').put(
            [
              {
                id: 'd1',
                owner: id,
                title: 'Draft about rivers',
                tags: [word],
                moments: 3,
                updated: '2026-10-02T00:00:00Z',
              },
              {
                id: 'd2',
                owner: id,
                title: 'Draft about mountains',
                description: 'Peaks',
                moments: 5,
                updated: '2026-10-01T00:00:00Z',
              },
            ],
            'registry',
          );
          tx.oncomplete = () => (request.result.close(), done());
          tx.onerror = () => fail(tx.error);
        };
        request.onerror = () => fail(request.error);
      }),
    { id, word },
  );
  await tab.goto(origin + '/?search=' + word);
  const explore = tab.locator('#explore'),
    mine = tab.locator('#mine'),
    drafts = tab.locator('#drafts');
  const titles = (section) => section.locator('.timeline-card-title').allTextContents();
  const status = (section) => section.locator('.list-status').textContent();
  await explore.locator('.timeline-card').first().waitFor();
  assert.equal(await status(explore), '14 timelines · Page 1 of 2');
  // A page that loads again would lose this.
  await tab.evaluate(() => (window.stillHere = true));
  const stillHere = () => tab.evaluate(() => window.stillHere === true);
  // The cards: title, owner, when it changed, an excerpt, size, span and shape, and tags.
  const card = explore.locator('.timeline-card').first();
  assert.match(
    await card.locator('.timeline-card-byline').textContent(),
    new RegExp(`@${username} · Changed `),
  );
  assert.match(await card.locator('.timeline-card-facts').textContent(), /Size10 moments/);
  assert.equal((await card.locator('.timeline-shape-bars rect').count()) > 1, true);
  // The span in the timeline's own display: the sample's coordinates as numbers.
  assert.equal(await card.locator('.timeline-shape-span').textContent(), '0 – 24');

  // Searching as you type, in place: the address follows, focus and scroll stay.
  const words = explore.getByLabel('Search timelines');
  await words.evaluate((input) => input.scrollIntoView({ block: 'center' }));
  assert((await tab.evaluate(() => window.scrollY)) > 0);
  await words.fill('Apollo ' + word);
  await tab.waitForURL((url) => url.searchParams.get('search') === 'Apollo ' + word);
  await tab.waitForFunction(() =>
    document.querySelector('#explore .list-status')?.textContent.startsWith('3 timelines'),
  );
  assert(await stillHere(), 'searching loaded the page');
  assert.equal(await tab.evaluate(() => document.activeElement?.getAttribute('name')), 'search');
  // Nothing jumps: the page only gets shorter, and the search box stays in view.
  const top = await words.evaluate((input) => input.getBoundingClientRect().top);
  assert(top >= 0 && top < 900, `the search box moved out of view (${top})`);
  assert((await tab.evaluate(() => window.scrollY)) > 0, 'the page jumped to its top');
  assert.equal(new URL(tab.url()).hash, '#explore');
  // Sort applies at once; a search sorts by relevance until another order is chosen.
  assert.equal(await explore.getByLabel('Sort timelines').inputValue(), 'relevance');
  await explore.getByLabel('Sort timelines').selectOption('alphabetical');
  await tab.waitForURL((url) => url.searchParams.get('sort') === 'alphabetical');
  await tab.waitForFunction(
    (word) =>
      document.querySelector('#explore .timeline-card-title')?.textContent === 'Apollo 00 ' + word,
    word,
  );
  assert.deepEqual(
    await titles(explore),
    ['00', '01', '02'].map((n) => `Apollo ${n} ${word}`),
  );
  // A Gregorian timeline's span reads in years, as its 24 years call for.
  assert.match(
    await explore.locator('.timeline-shape-span').first().textContent(),
    /^1808 CE – 1832 CE$/,
  );
  // A tag filters the list, in place.
  await explore
    .locator('.timeline-card')
    .nth(1)
    .getByRole('link', { name: 'odd', exact: true })
    .click();
  await tab.waitForURL((url) => url.searchParams.get('tag') === 'odd');
  await tab.waitForFunction(() =>
    document.querySelector('#explore .list-status')?.textContent.startsWith('1 timeline '),
  );
  assert.deepEqual(await titles(explore), [`Apollo 01 ${word}`]);
  assert(await stillHere(), 'a tag loaded the page');
  // Back undoes it, still in place.
  await tab.goBack();
  await tab.waitForURL((url) => !url.searchParams.has('tag'));
  await tab.waitForFunction(() =>
    document.querySelector('#explore .list-status')?.textContent.startsWith('3 timelines'),
  );
  assert(await stillHere(), 'Back loaded the page');
  assert.equal(await explore.getByLabel('Filter by tag').inputValue(), '');

  // Nothing found: why, and a way back.
  await words.fill('nothing-like-this ' + word);
  await explore.getByText('No public timelines match this search.').waitFor();
  await explore.getByRole('link', { name: 'Clear the search' }).click();
  await tab.waitForURL((url) => !url.searchParams.has('search'));
  await statusMatches(tab, 'explore', /^[\d,]+ timelines? · Page/);
  assert.equal(await words.inputValue(), '');

  // Pages, in place: the cards take focus, and the other lists keep their state.
  await words.fill(word);
  await tab.waitForURL((url) => url.searchParams.get('search') === word);
  await tab.waitForFunction(() =>
    document.querySelector('#explore .list-status')?.textContent.startsWith('14 timelines'),
  );
  await mine.getByLabel('Visibility').selectOption('private');
  await tab.waitForURL((url) => url.searchParams.get('mineVisibility') === 'private');
  await tab.waitForFunction(
    (word) =>
      [...document.querySelectorAll('#mine .timeline-card-title')].every((t) =>
        /^Survey 1[45] /.test(t.textContent),
      ) && document.querySelectorAll('#mine .timeline-card').length === 2,
    word,
  );
  assert.equal(await mine.locator('.badge', { hasText: 'Private' }).count(), 2);
  await explore
    .getByRole('navigation', { name: 'Pages of timelines' })
    .getByRole('link', { name: 'Next →' })
    .click();
  await tab.waitForURL((url) => url.searchParams.get('page') === '2');
  await tab.waitForFunction(() =>
    document.querySelector('#explore .list-status')?.textContent.endsWith('Page 2 of 2'),
  );
  assert.equal(new URL(tab.url()).searchParams.get('mineVisibility'), 'private');
  assert.equal(new URL(tab.url()).searchParams.get('search'), word);
  assert.equal(
    await tab.evaluate(() => document.activeElement?.getAttribute('aria-label')),
    'Results: timelines',
  );
  assert(await stillHere(), 'paging loaded the page');

  // Loading: the cards stay where they are, dimmed and busy, until the answer comes.
  let release;
  const held = new Promise((r) => (release = r));
  await tab.route('**/api/timelines/search', async (route) => {
    await held;
    await route.continue();
  });
  const box = await explore.locator('.timeline-grid').boundingBox();
  await explore.getByRole('link', { name: '← Previous' }).click();
  await explore.locator('.timeline-grid[aria-busy="true"]').waitFor();
  assert.equal(await status(explore), 'Searching…');
  assert.deepEqual(await explore.locator('.timeline-grid').boundingBox(), box);
  release();
  await explore.locator('.timeline-grid:not([aria-busy])').waitFor();
  await tab.unroute('**/api/timelines/search');
  assert.equal(await status(explore), '14 timelines · Page 1 of 2');

  // Arrow keys move between the cards' titles; Down goes a row.
  const first = explore.locator('.timeline-card-title a').first();
  await first.focus();
  await tab.keyboard.press('ArrowRight');
  const focused = () => tab.evaluate(() => document.activeElement?.textContent);
  assert.equal(await focused(), (await titles(explore))[1]);
  const columns = await explore
    .locator('.timeline-grid')
    .evaluate((grid) => getComputedStyle(grid).gridTemplateColumns.split(' ').length);
  await tab.keyboard.press('ArrowDown');
  assert.equal(await focused(), (await titles(explore))[1 + columns]);
  await tab.keyboard.press('Home');
  assert.equal(await focused(), (await titles(explore))[0]);

  // Grid or list, remembered for the next visit.
  assert(columns > 1, 'a grid on a wide screen');
  await explore
    .getByRole('group', { name: 'Show timelines as' })
    .getByRole('button', { name: 'List' })
    .click();
  await explore.locator('.timeline-grid.list-layout').waitFor();
  assert.equal(await mine.locator('.timeline-grid.list-layout').count(), 1);

  // Drafts, searched in the browser and in place.
  await drafts.locator('.timeline-card').first().waitFor();
  assert.deepEqual(await titles(drafts), ['Draft about rivers', 'Draft about mountains']);
  await drafts.getByLabel('Search drafts').fill('peaks');
  await tab.waitForURL((url) => url.searchParams.get('draftSearch') === 'peaks');
  await tab.waitForFunction(() => document.querySelectorAll('#drafts .timeline-card').length === 1);
  assert.deepEqual(await titles(drafts), ['Draft about mountains']);
  assert(await stillHere(), 'searching drafts loaded the page');

  // Reloaded, the address says it all: the lists show what they showed.
  await tab.reload();
  await explore.locator('.timeline-grid.list-layout').waitFor();
  assert.equal(await explore.getByLabel('Search timelines').inputValue(), word);
  assert.equal(await mine.getByLabel('Visibility').inputValue(), 'private');
  await drafts.locator('.timeline-card').first().waitFor();
  assert.deepEqual(await titles(drafts), ['Draft about mountains']);
  if (process.env.SCREENSHOTS) {
    await mkdir(process.env.SCREENSHOTS, { recursive: true });
    await explore
      .getByRole('group', { name: 'Show timelines as' })
      .getByRole('button', { name: 'Grid' })
      .click();
    await tab.goto(origin + '/?search=' + word + '#explore');
    await explore.locator('.timeline-card').first().waitFor();
    await tab.screenshot({ path: process.env.SCREENSHOTS + '/dashboard.png', fullPage: true });
    await explore.screenshot({ path: process.env.SCREENSHOTS + '/explore-grid.png' });
    await explore
      .getByRole('group', { name: 'Show timelines as' })
      .getByRole('button', { name: 'List' })
      .click();
    await explore.screenshot({ path: process.env.SCREENSHOTS + '/explore-list.png' });
    await explore
      .getByRole('group', { name: 'Show timelines as' })
      .getByRole('button', { name: 'Grid' })
      .click();
    await tab.setViewportSize({ width: 390, height: 844 });
    await tab.screenshot({ path: process.env.SCREENSHOTS + '/phone.png', fullPage: true });
    await tab.setViewportSize({ width: 1280, height: 900 });
  }

  // A profile's lists work the same way.
  await tab.goto(origin + '/' + username);
  const profile = tab.locator('#timelines');
  await profile.locator('.timeline-card').first().waitFor();
  await tab.evaluate(() => (window.stillHere = true));
  await profile.getByLabel('Search public timelines').fill('Apollo');
  await tab.waitForFunction(() =>
    document.querySelector('#timelines .list-status')?.textContent.startsWith('3 public timelines'),
  );
  assert.equal(new URL(tab.url()).pathname, '/' + username);
  assert(await stillHere(), 'searching a profile loaded the page');
  assert.deepEqual(errors, []);

  // Without JavaScript: the form and links load the page, at the list's section.
  const plain = await browser.newContext({
    javaScriptEnabled: false,
    viewport: { width: 1280, height: 900 },
  });
  await plain.addCookies([...cookies].map(([name, value]) => ({ name, value, url: origin })));
  const still = await plain.newPage();
  await still.goto(origin + '/?mineSort=alphabetical');
  await still.locator('#explore').getByLabel('Search timelines').fill(word);
  await still.locator('#explore').getByRole('button', { name: 'Search', exact: true }).click();
  await still.waitForURL((url) => url.searchParams.get('search') === word);
  assert.equal(new URL(still.url()).hash, '#explore');
  assert.equal(new URL(still.url()).searchParams.get('mineSort'), 'alphabetical');
  assert.equal(
    await still.locator('#explore .list-status').textContent(),
    '14 timelines · Page 1 of 2',
  );
  await still.locator('#explore').getByRole('link', { name: 'Next →' }).click();
  await still.waitForURL((url) => url.searchParams.get('page') === '2');
  assert.equal(new URL(still.url()).hash, '#explore');
  await plain.close();
  console.log(
    'PASS timeline browser: in-place search as you type, sort, tags, visibility and pages with the address in step and Back; scroll and focus kept; loading, empty states, layouts, arrow keys, drafts, profiles, and the same without JavaScript.',
  );
} finally {
  await browser?.close();
  child.kill();
  await pool.query('DELETE FROM oc_timelines WHERE owner_id=$1', [id]);
  await pool.query('DELETE FROM oc_users WHERE id=$1', [id]);
  await pool.end();
}
