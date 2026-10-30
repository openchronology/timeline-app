// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// The landing page and the audience pages (#379) against PostgreSQL and in a live browser: with
// LANDING_PAGE off, / is the timeline browser and nothing else changes; on, / is the landing
// page, /explore the browser with its query and in-place search, each /for/<audience> page
// renders with its metadata and structured data, an unknown one is not found, examples skip
// private, labelled and missing timelines, the operator's copy replaces the built-in, and the
// sitemap lists the pages. In the browser, at phone and desktop widths, in light and dark, no
// page scrolls sideways, the pages read without JavaScript, and the video loads only when
// played. LANDING_SCREENSHOTS names a directory to save screenshots in.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { resolve, join } from 'node:path';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { setTimeout as delay } from 'node:timers/promises';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { chromium, firefox, webkit } from 'playwright';
import { passwordHash } from '../server/auth.mjs';
import { demo } from '../dist/core.mjs';
if (!process.env.DATABASE_URL) throw new Error('Use a dedicated PostgreSQL test database.');
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
await pool.query(await readFile(new URL('../server/schema.sql', import.meta.url), 'utf8'));
const basePort = Number(process.env.PLATFORM_TEST_PORT ?? 5196);
const servers = [];

/** Starts the built platform on `port` with `settings` over a clean environment. */
async function start(port, settings) {
  const origin = `http://127.0.0.1:${port}`;
  const env = {
    ...process.env,
    NODE_ENV: 'production',
    APP_ORIGIN: origin,
    OCH_APP_ROOT: process.cwd(),
    NEXT_TELEMETRY_DISABLED: '1',
    PORT: String(port),
    HOSTNAME: '127.0.0.1',
    ...settings,
  };
  for (const key of Object.keys(env))
    if (
      (key.startsWith('LANDING_') && !(key in settings)) ||
      key.startsWith('OAUTH_') ||
      key === 'PLUGIN_LIBRARY'
    )
      delete env[key];
  const child = spawn(
    process.execPath,
    [resolve(process.env.PLATFORM_TEST_SERVER ?? 'platform/.next/standalone/platform/server.cjs')],
    { env, stdio: ['ignore', 'pipe', 'pipe'] },
  );
  const server = { origin, child, logs: '', exited: false };
  for (const s of [child.stdout, child.stderr])
    s.on('data', (c) => (server.logs = (server.logs + c).slice(-12000)));
  child.on('exit', () => (server.exited = true));
  servers.push(server);
  for (let i = 0; i < 150 && !server.exited; i++) {
    try {
      if ((await fetch(origin + '/healthz', { signal: AbortSignal.timeout(500) })).ok) break;
    } catch {}
    await delay(200);
  }
  assert(!server.exited, server.logs);
  return server;
}
/** A page as a guest gets it: its status, headers and HTML. */
async function get(origin, path) {
  const res = await fetch(origin + path, { redirect: 'manual' });
  return { status: res.status, headers: res.headers, html: await res.text() };
}
/** The page's canonical address, without a trailing slash (Next.js writes the origin's without). */
const canonical = (html) =>
  /<link rel="canonical" href="([^"]*)"/.exec(html)?.[1]?.replace(/\/$/, '');
/** The page's JSON-LD descriptions. */
const structured = (html) =>
  [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) =>
    JSON.parse(m[1]),
  );

const id = randomUUID(),
  suffix = Date.now().toString(36),
  username = 'landing_' + suffix,
  password = 'landing-page-password-2026',
  word = 'zl' + suffix;
const cookies = new Map();
let csrf, api;
/** Calls the API as the test's account. */
async function call(path, data, method = data ? 'POST' : 'GET') {
  const res = await fetch(api + path, {
    method,
    headers: {
      Origin: api,
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
const content = await mkdtemp(join(tmpdir(), 'landing-copy-'));
let browser;
try {
  const off = await start(basePort, { LANDING_PAGE: '' });
  api = off.origin;
  // A trusted account, so browsing lists its public timelines (docs/browsing.md).
  await pool.query(
    "INSERT INTO oc_users(id,username,email_verified_at,password_hash,terms_version,trust) VALUES($1,$2,now(),$3,oc_policy_version(),'trusted')",
    [id, username, await passwordHash(password)],
  );
  await call('/api/session');
  await call('/api/auth/login', { username, password });
  /** A timeline of the sample's moments, at `slug`, public unless said otherwise. */
  const make = async (slug, title, visibility = 'public', labels = []) => {
    const t = await call('/api/timelines', {
      ...demo(),
      title: `${title} ${word}`,
      description: `The ${title} timeline of the landing test.`,
      tags: [word],
    });
    await pool.query(
      'UPDATE oc_timelines SET slug=$2,visibility=$3,content_labels=$4 WHERE id=$1',
      [t.id, `${slug}-${suffix}`, visibility, labels],
    );
    return { ...t, slug: `${slug}-${suffix}`, title: `${title} ${word}` };
  };
  const alpha = await make('alpha', 'Alpha'),
    beta = await make('beta', 'Beta'),
    secret = await make('secret', 'Secret', 'private'),
    grim = await make('grim', 'Grim', 'public', ['violence']);
  const address = (t) => `${username}/${t.slug}`;

  // Off: / is the timeline browser, /explore the same browser, /for not found.
  {
    const home = await get(off.origin, '/');
    assert.equal(home.status, 200);
    assert.match(home.html, /id="explore-heading"/);
    assert.doesNotMatch(home.html, /href="\/explore"/, 'no Explore link in the header');
    assert.equal(canonical(home.html), off.origin);
    const explore = await get(off.origin, `/explore?search=${word}&sort=alphabetical`);
    assert.equal(explore.status, 200);
    assert.equal(canonical(explore.html), off.origin, '/explore repeats /');
    assert.match(explore.html, new RegExp(`Alpha ${word}`));
    assert.match(explore.html, /action="\/explore#explore"/);
    for (const path of ['/for', '/for/educators'])
      assert.equal((await get(off.origin, path)).status, 404, path);
    const pages = await get(off.origin, '/sitemap/pages.xml');
    assert.doesNotMatch(pages.html, /\/explore<|\/for</);
  }
  off.child.kill();

  // On, with the operator's copy for writers, examples for educators and a video.
  await writeFile(
    join(content, 'writers.md'),
    `---\nlabel: Novelists\ntitle: Our own page for writers ${word}\npromise: Written by the operator.\ndescription: The operator's page for writers.\ncard: The operator's card.\n---\n\n## What you can do\n\n- Write.\n`,
  );
  const on = await start(basePort + 1, {
    LANDING_PAGE: 'yes',
    LANDING_CONTENT_DIR: content,
    LANDING_EXAMPLES_EDUCATORS: [
      address(alpha),
      address(secret),
      address(grim),
      `${username}/missing-${suffix}`,
      address(beta),
    ].join(','),
    LANDING_VIDEO_EDUCATORS: 'https://youtu.be/dQw4w9WgXcQ',
    FEATURED_TIMELINES: beta.id,
  });
  const o = on.origin;
  {
    const home = await get(o, '/');
    assert.equal(home.status, 200);
    assert.match(home.html, /<h1[^>]*>Any span of time, on one exact line<\/h1>/);
    assert.match(home.html, /<title>Any span of time, on one exact line · OpenChronology<\/title>/);
    assert.equal(canonical(home.html), o);
    assert.match(home.html, /<meta property="og:title" content="Any span of time/);
    assert.match(home.html, /href="\/explore"/, 'the header and opening link to the browser');
    for (const audience of ['educators', 'researchers', 'operations', 'developers'])
      assert.match(home.html, new RegExp(`href="/for/${audience}"`));
    // The operator's label for writers is on the landing page's card.
    assert.match(home.html, /href="\/for\/writers">Novelists</);
    const [page] = structured(home.html);
    assert.equal(page['@type'], 'WebPage');
    assert.equal(page.url, o + '/');
    // No examples are set for the landing page: the browser's first, featured first.
    assert.match(home.html, new RegExp(`Beta ${word}`));
    assert.doesNotMatch(home.html, new RegExp(`(Secret|Grim) ${word}`));

    const explore = await get(o, `/explore?search=${word}&sort=alphabetical&page=1`);
    assert.equal(explore.status, 200);
    assert.equal(canonical(explore.html), o + '/explore');
    assert.match(explore.html, /<title>Explore timelines · OpenChronology<\/title>/);
    assert.match(explore.html, new RegExp(`Alpha ${word}[\\s\\S]*Beta ${word}`));
    assert.doesNotMatch(explore.html, new RegExp(`Secret ${word}`));
    assert.match(explore.html, /action="\/explore#explore"/);
    assert.match(explore.html, /href="\/explore\?search=[^"]*&amp;tag=/, 'tags keep /explore');

    for (const audience of [
      'educators',
      'researchers',
      'investigators',
      'operations',
      'writers',
      'developers',
    ]) {
      const page = await get(o, '/for/' + audience);
      assert.equal(page.status, 200, audience);
      assert.equal(canonical(page.html), `${o}/for/${audience}`);
      assert.match(page.html, /<meta name="description" content="[^"]+"/);
      assert.match(page.html, new RegExp(`<meta property="og:url" content="${o}/for/${audience}"`));
      assert.match(page.html, /<h1[^>]*>[^<]+<\/h1>/);
      const [data] = structured(page.html);
      assert.equal(data['@type'], 'WebPage');
      assert.equal(data.url, `${o}/for/${audience}`);
      assert.ok(data.audience.audienceType, audience);
      if (audience !== 'writers') assert.match(page.html, /What you can count on/, audience);
    }
    const educators = await get(o, '/for/educators');
    assert.match(educators.html, /Accounts are for people 13 and older/);
    // Its examples, in the order named, without the private, labelled or missing ones.
    assert.match(educators.html, new RegExp(`Alpha ${word}[\\s\\S]*Beta ${word}`));
    assert.doesNotMatch(educators.html, new RegExp(`(Secret|Grim) ${word}`));
    assert.match(educators.html, /href="https:\/\/www\.youtube\.com\/watch\?v=dQw4w9WgXcQ"/);
    assert.doesNotMatch(educators.html, /<iframe/, 'nothing loads from YouTube until played');
    assert.match(
      educators.headers.get('content-security-policy'),
      /frame-src 'self' https:\/\/www\.youtube-nocookie\.com;/,
    );
    const csp = (await get(o, '/explore')).headers.get('content-security-policy');
    assert.match(csp, /frame-src 'self';/);
    const writers = await get(o, '/for/writers');
    assert.match(writers.html, new RegExp(`Our own page for writers ${word}`));
    assert.match(writers.html, /<title>Our own page for writers/);
    for (const path of ['/for/nobody', '/for/Educators', '/for/educators/more'])
      assert.equal((await get(o, path)).status, 404, path);
    const index = await get(o, '/for');
    assert.equal(index.status, 200);
    assert.equal(canonical(index.html), o + '/for');
    assert.equal(structured(index.html)[0]['@type'], 'CollectionPage');
    const pages = await get(o, '/sitemap/pages.xml');
    for (const path of ['/', '/explore', '/for', '/for/educators', '/for/developers'])
      assert.match(pages.html, new RegExp(`<loc>${o}${path}</loc>`), path);
  }

  // In a browser.
  browser = await engine.launch(
    process.env.BROWSER_EXECUTABLE ? { executablePath: process.env.BROWSER_EXECUTABLE } : {},
  );
  const shots = process.env.LANDING_SCREENSHOTS;
  if (shots) await mkdir(shots, { recursive: true });
  const sizes = {
    desktop: { width: 1280, height: 900 },
    phone: { width: 390, height: 844 },
  };
  for (const [size, viewport] of Object.entries(sizes))
    for (const scheme of ['light', 'dark']) {
      const context = await browser.newContext({ viewport, colorScheme: scheme });
      const tab = await context.newPage();
      const errors = [];
      tab.on('pageerror', (e) => errors.push(e.message));
      for (const [name, path] of [
        ['landing', '/'],
        ['educators', '/for/educators'],
      ]) {
        await tab.goto(o + path);
        const { scroll, width, background } = await tab.evaluate(() => ({
          scroll: document.documentElement.scrollWidth,
          width: window.innerWidth,
          background: getComputedStyle(document.documentElement).backgroundColor,
        }));
        assert(scroll <= width, `${name} at ${size} scrolls sideways: ${scroll} > ${width}`);
        // Dark mode darkens the page; light keeps the site's paper.
        const [r] = background.match(/\d+/g).map(Number);
        assert(scheme === 'dark' ? r < 60 : r > 200, `${name} ${scheme}: ${background}`);
        assert.equal(await tab.locator('h1').count(), 1);
        if (shots)
          await tab.screenshot({
            path: join(shots, `${name}-${size}-${scheme}.png`),
            fullPage: true,
          });
      }
      assert.deepEqual(errors, []);
      await context.close();
    }

  // Playing the video loads YouTube's privacy-enhanced player, in place.
  const context = await browser.newContext({ viewport: sizes.desktop });
  const tab = await context.newPage();
  await tab.route('https://www.youtube-nocookie.com/**', (route) =>
    route.fulfill({ status: 200, contentType: 'text/html', body: '<p>player</p>' }),
  );
  await tab.goto(o + '/for/educators');
  await tab.getByRole('link', { name: /^Play: / }).click();
  const frame = tab.locator('.landing-video-frame iframe');
  await frame.waitFor();
  assert.match(await frame.getAttribute('src'), /^https:\/\/www\.youtube-nocookie\.com\/embed\//);
  assert.equal(new URL(tab.url()).pathname, '/for/educators');

  // /explore searches in place, keeping its address.
  await tab.goto(o + '/explore');
  const before = await tab.evaluate(() => (window.marker = performance.timeOrigin));
  await tab.locator('#explore input[type=search]').fill(word);
  await tab.waitForURL(
    (url) => url.pathname === '/explore' && url.searchParams.get('search') === word,
  );
  await tab.waitForFunction(
    (word) =>
      document.querySelector('#explore .list-status')?.textContent.startsWith('3 timelines'),
    word,
  );
  assert.equal(await tab.evaluate(() => window.marker), before, 'no page load');
  await context.close();

  // Without JavaScript the pages read the same, and the video is a link to YouTube.
  const plain = await browser.newContext({ javaScriptEnabled: false, viewport: sizes.phone });
  const still = await plain.newPage();
  await still.goto(o + '/');
  assert.equal(
    await still.getByRole('heading', { level: 1 }).textContent(),
    'Any span of time, on one exact line',
  );
  await still.getByRole('link', { name: 'Educators' }).click();
  await still.waitForURL(o + '/for/educators');
  assert.equal(
    await still.getByRole('link', { name: /^Play: / }).getAttribute('href'),
    'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
  );
  await still.getByRole('link', { name: `Alpha ${word}` }).waitFor();
  await plain.close();
  console.log(
    'PASS landing page: off keeps / as the browser; on, the landing page, /explore with its query and in-place search, six audience pages with metadata and structured data, unknown audiences not found, examples without private, labelled or missing timelines, the operator’s copy, the sitemap, phone and desktop in light and dark, the video on request, and no JavaScript needed.',
  );
} finally {
  await browser?.close();
  for (const server of servers) server.child.kill();
  await pool.query('DELETE FROM oc_timelines WHERE owner_id=$1', [id]);
  await pool.query('DELETE FROM oc_users WHERE id=$1', [id]);
  await pool.end();
  await rm(content, { recursive: true, force: true });
}
