// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { createServer } from 'node:http';
// GitHub's latest release, as the download page reads it (#111).
const assetBase = 'https://github.com/openchronology/timeline-app/releases/download/v9.8.7/';
const github = createServer((req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.end(
    JSON.stringify({
      tag_name: 'v9.8.7',
      name: 'v9.8.7',
      published_at: '2026-09-30T12:00:00Z',
      html_url: 'https://github.com/openchronology/timeline-app/releases/tag/v9.8.7',
      assets: [
        'openchronology-desktop-windows-amd64-setup.exe',
        'openchronology-desktop-macos-arm64.dmg',
        'openchronology-server-ubuntu24.04-amd64.deb',
      ].map((name) => ({ name, browser_download_url: assetBase + name, size: 12 * 1048576 })),
    }),
  );
});
await new Promise((resolve) => github.listen(0, '127.0.0.1', resolve));
const port = Number(process.env.PLATFORM_TEST_PORT ?? 5199),
  origin = `http://127.0.0.1:${port}`;
const env = {
  ...process.env,
  NODE_ENV: 'production',
  APP_ORIGIN: origin,
  NEXT_TELEMETRY_DISABLED: '1',
  OCH_APP_ROOT: process.cwd(),
};
for (const key of Object.keys(env))
  if (
    key.startsWith('PG') ||
    key.startsWith('OAUTH_') ||
    ['DATABASE_URL', 'PLUGIN_LIBRARY', 'FEATURED_TIMELINES'].includes(key)
  )
    delete env[key];
// A named platform with Google Analytics (#100, #101); next-postgres checks neither is set.
env.PLATFORM_NAME = 'timescale.test';
env.RELEASES_API_URL = `http://127.0.0.1:${github.address().port}/latest`;
env.GOOGLE_ANALYTICS_ID = 'G-TEST12345';
env.PORT = String(port);
env.HOSTNAME = '127.0.0.1';
const child = spawn(
  process.execPath,
  [resolve(process.env.PLATFORM_TEST_SERVER ?? 'platform/.next/standalone/platform/server.cjs')],
  {
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  },
);
let logs = '';
for (const stream of [child.stdout, child.stderr])
  stream.on('data', (chunk) => {
    logs = (logs + chunk).slice(-12000);
  });
let exited = false;
child.on('exit', () => {
  exited = true;
});
try {
  let ready = false;
  for (let i = 0; i < 100; i++) {
    if (exited) throw new Error('Next.js exited before readiness:\n' + logs);
    try {
      const r = await fetch(origin + '/healthz', { signal: AbortSignal.timeout(500) });
      if (r.ok) {
        ready = true;
        break;
      }
    } catch {}
    await delay(200);
  }
  assert(ready, 'Next.js did not become ready');
  const dashboard = await fetch(origin),
    html = await dashboard.text();
  assert.equal(dashboard.status, 200);
  assert.match(html, /Explore timelines/);
  assert.match(html, /Build: /);
  assert.match(html, /<a href="\/download">Download<\/a>/);
  // The download page puts the visitor's system first, with the latest release's files.
  const download = async (agent) => {
    const r = await fetch(origin + '/download', { headers: { 'User-Agent': agent } });
    assert.equal(r.status, 200);
    return r.text();
  };
  const windows = await download('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/141.0');
  assert.match(windows, /Version <strong>v9\.8\.7<\/strong>/);
  assert.match(windows, /Desktop app for Windows/);
  assert.match(
    windows,
    new RegExp(
      `class="button primary download-primary" href="${assetBase}openchronology-desktop-windows-amd64-setup\\.exe"`,
    ),
  );
  assert.match(windows, /12\.0 MB/);
  // Files the release lacks link to the latest release by name.
  assert.match(windows, /releases\/latest\/download\/openchronology-desktop-linux-amd64\.AppImage/);
  const ubuntu = await download('Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:143.0) Firefox/143.0');
  assert.match(ubuntu, /Desktop app for Linux/);
  assert.match(ubuntu, /data-server="ubuntu24\.04"[^>]*>.{0,200}Your system/s);
  assert.match(
    ubuntu,
    new RegExp(
      `curl -fLO ${assetBase}openchronology-server-ubuntu24\\.04-amd64\\.deb &amp;&amp; sudo apt install \\./openchronology-server-ubuntu24\\.04-amd64\\.deb`,
    ),
  );
  assert.match(ubuntu, /docker compose up --build --wait/);
  const phone = await download('Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X)');
  assert.match(phone, /Use OpenChronology in your browser/);
  assert.match(html, /id="dashboard-browser"/);
  assert.match(html, /Sort timelines/);
  assert.doesNotMatch(html, /id="dashboard-favorites"/);
  assert.doesNotMatch(html, /id="dashboard-mine"/);
  assert.doesNotMatch(html, /id="timeline-stage"/);
  assert.match(html, /href="\/editor\?new=1"/);
  assert.match(html, /◷ <!-- -->timescale\.test<\/a>|◷ timescale\.test<\/a>/);
  assert.match(html, /<title>timescale\.test · OpenChronology<\/title>/);
  assert.match(html, /Powered by OpenChronology/);
  const csp = dashboard.headers.get('content-security-policy');
  assert.match(csp, /script-src [^;]*https:\/\/www\.googletagmanager\.com/);
  assert.match(csp, /connect-src [^;]*https:\/\/\*\.google-analytics\.com/);
  assert.match(csp, /'nonce-[^']+'/);
  assert.match(csp, /frame-ancestors 'none'/);
  const nonce = csp.match(/'nonce-([^']+)'/)[1];
  assert(html.includes(`nonce="${nonce}"`), 'Next hydration scripts must use the response nonce');
  const again = await fetch(origin);
  assert.notEqual(again.headers.get('content-security-policy'), csp);
  for (const path of [
    '/login',
    '/account',
    '/plugins',
    '/download',
    '/legal',
    '/editor',
    '/?search=history&page=2',
    '/?owner=seed&search=history&page=2',
  ]) {
    const r = await fetch(origin + path);
    assert.equal(r.status, 200, path);
  }
  // The HTTP API (#178): its reference, under the content security policy, and its OpenAPI
  // description, with or without the server's storage.
  const reference = await fetch(origin + '/docs/api'),
    referenceHtml = await reference.text();
  assert.equal(reference.status, 200);
  const referenceNonce = reference.headers
    .get('content-security-policy')
    .match(/'nonce-([^']+)'/)[1];
  assert(referenceHtml.includes(`nonce="${referenceNonce}"`));
  assert.match(referenceHtml, /timescale\.test HTTP API/);
  assert.match(referenceHtml, /id="op-searchTimelines"/);
  assert.match(referenceHtml, /href="\/api\/openapi\.json"/);
  const described = await fetch(origin + '/api/openapi.json');
  assert.equal(described.status, 200);
  const openapi = await described.json();
  assert.equal(openapi.openapi, '3.1.0');
  assert.equal(openapi.servers[0].url, origin);
  assert(openapi.paths['/api/timelines/{id}/settings'].patch);
  assert.match(html, /href="\/docs\/api"/);
  // The help (#172): docs/ as the server runs, by section, searchable, under the policy.
  const help = await fetch(origin + '/help'),
    helpHtml = await help.text();
  assert.equal(help.status, 200);
  assert(
    helpHtml.includes(
      `nonce="${help.headers.get('content-security-policy').match(/'nonce-([^']+)'/)[1]}"`,
    ),
  );
  assert.match(helpHtml, /href="\/help\/tags"/);
  assert.match(helpHtml, /href="\/docs\/api"/);
  const tags = await (await fetch(origin + '/help/tags')).text();
  assert.match(tags, /<h2 id="separating-by-tags">Separating by tags<\/h2>/);
  assert.match(tags, /href="\/help\/time-mapping"/);
  const found = await (await fetch(origin + '/help?q=separating+tags')).text();
  assert.match(found, /href="\/help\/tags#separating-by-tags"/);
  assert.equal((await fetch(origin + '/help/no-such-page')).status, 404);
  assert.match(html, /href="\/help"/);
  // The plugin library page lists the official plugin suites (#78) above the plugins.
  const plugins = await (await fetch(origin + '/plugins')).text();
  assert.match(plugins, /Plugin suites/);
  assert.match(plugins, /History education/);
  assert.match(plugins, /Causal factor analysis/);
  const editor = await fetch(origin + '/editor/frame'),
    markup = await editor.text();
  assert.equal(editor.status, 200);
  assert.match(markup, /id="timeline-stage"/);
  assert.match(markup, /src="\/app.js"/);
  assert.match(editor.headers.get('content-security-policy'), /frame-ancestors 'self'/);
  assert.equal((await fetch(origin + '/app.js')).status, 200);
  assert.equal((await fetch(origin + '/openchronology-web-source.tar.gz')).status, 200);
  const session = await fetch(origin + '/api/session');
  assert.equal(session.status, 200);
  assert.equal((await session.json()).server, false);
  const foreign = await fetch(origin + '/api/timelines', {
    method: 'POST',
    headers: { Origin: 'https://evil.example', 'Content-Type': 'application/json' },
    body: '{}',
  });
  assert.equal(foreign.status, 403);
  assert.equal(
    (await fetch(origin + '/timelines/00000000-0000-0000-0000-000000000001')).status,
    404,
  );
  const device = await fetch(origin + '/connect/desktop/ABCDEFGH23', { redirect: 'manual' });
  assert.equal(device.status, 307);
  assert.match(device.headers.get('location'), /^\/login\?returnTo=/);
  if (process.env.PLATFORM_BROWSER_TEST === '1') {
    const engine = process.env.BROWSER ?? 'chromium';
    const engines = await import('playwright');
    if (!['chromium', 'firefox', 'webkit'].includes(engine)) throw new Error('Unknown browser');
    const browser = await engines[engine].launch();
    try {
      const page = await browser.newPage({ viewport: { width: 1440, height: 960 } }),
        errors = [];
      page.on('pageerror', (error) => errors.push(error.message));
      // Google Analytics loads only once a visitor allows it, and stops when they decline.
      const tags = [];
      await page.route('https://www.googletagmanager.com/**', (route) => {
        tags.push(route.request().url());
        return route.fulfill({ contentType: 'text/javascript', body: 'window.tagLoaded = true;' });
      });
      await page.goto(origin);
      const consent = page.locator('.analytics-consent');
      await consent.waitFor();
      await consent.getByRole('button', { name: 'Decline' }).click();
      await consent.waitFor({ state: 'hidden' });
      await page.reload();
      await page.locator('#dashboard-browser').waitFor();
      await page.waitForTimeout(300);
      assert.equal(await consent.count(), 0);
      assert.deepEqual(tags, []);
      await page.getByRole('button', { name: 'Analytics settings' }).click();
      await consent.getByRole('button', { name: 'Allow analytics' }).click();
      await page.waitForFunction(() => window.tagLoaded === true);
      assert.deepEqual(tags, ['https://www.googletagmanager.com/gtag/js?id=G-TEST12345']);
      const config = await page.evaluate(() =>
        window.dataLayer.map((entry) => Array.from(entry)).find((entry) => entry[0] === 'config'),
      );
      assert.deepEqual(config, [
        'config',
        'G-TEST12345',
        { allow_google_signals: false, allow_ad_personalization_signals: false },
      ]);
      // Remembered: the next page loads it without asking.
      await page.reload();
      await page.waitForFunction(() => window.tagLoaded === true);
      assert.equal(await consent.count(), 0);
      await page.locator('#dashboard-browser').waitFor();
      assert.equal(await page.locator('#dashboard-mine').count(), 0);
      await page.getByLabel('Search timelines').fill('history');
      await page.getByRole('button', { name: 'Search', exact: true }).click();
      await page.waitForURL((url) => url.searchParams.get('search') === 'history');
      await page.getByRole('link', { name: 'New timeline' }).click();
      await page.waitForURL(origin + '/editor?new=1');
      const frame = await (
        await page.locator('iframe[title="Timeline editor"]').elementHandle()
      ).contentFrame();
      await frame.waitForFunction(() => document.getElementById('left-bound').value);
      assert.equal(await frame.locator('#dashboard').isVisible(), false);
      await frame.locator('#json-file').setInputFiles({
        name: 'next-browser.ochx',
        mimeType: 'application/json',
        buffer: Buffer.from(
          JSON.stringify({
            format: 'openchronology',
            version: 1,
            title: 'Imported through Next',
            description: '',
            events: [
              { id: 'exact', time: '1/3', metadata: { title: 'An exact moment', notes: '' } },
            ],
          }),
        ),
      });
      await frame.waitForFunction(
        () => document.getElementById('timeline-title').value === 'Imported through Next',
      );
      await frame.waitForFunction(() => document.querySelector('#markers .event-marker'));
      assert.equal(
        await frame.evaluate(() => document.getElementById('left-bound').value.length > 0),
        true,
      );
      for (const viewport of [
        { width: 390, height: 844 },
        { width: 844, height: 390 },
        { width: 1440, height: 960 },
      ]) {
        await page.setViewportSize(viewport);
        await frame.waitForFunction(() => {
          const stage = document.getElementById('timeline-stage'),
            axis = document.getElementById('axis');
          return (
            stage.clientWidth > 96 &&
            // The axis layer is drawn at the content scale, smaller on phones.
            Math.abs(
              parseFloat(axis.style.width) * Number(stage.dataset.uiScale) - stage.clientWidth,
            ) < 1
          );
        });
        assert(
          await frame.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
          'Embedded editor overflows on resize',
        );
        assert(
          await page.evaluate(() => {
            const root = document.documentElement,
              header = document.querySelector('.platform-header').getBoundingClientRect(),
              footer = document.querySelector('.platform-footer'),
              editor = document.querySelector('.editor-frame').getBoundingClientRect();
            return (
              root.scrollHeight <= innerHeight + 1 &&
              root.scrollWidth <= innerWidth + 1 &&
              header.top >= 0 &&
              editor.top >= header.bottom &&
              editor.height > 0 &&
              editor.bottom <= innerHeight + 1 &&
              getComputedStyle(footer).display === 'none'
            );
          }),
          'Editor host must fit its header and frame without a sticky footer or second scrollbar',
        );
      }
      await page.getByRole('link', { name: 'Account', exact: true }).click();
      await page.waitForURL(origin + '/account');
      await page.getByText('Server accounts are unavailable.').waitFor();
      // The header's Download goes to the download page; its commands can be copied.
      await page.getByRole('link', { name: 'Download', exact: true }).click();
      await page.waitForURL(origin + '/download');
      await page.getByRole('heading', { name: 'Download OpenChronology' }).waitFor();
      const copy = page.locator('[data-server="debian13"] .copy-command button');
      await copy.click();
      await page.waitForFunction(
        () =>
          document.querySelector('[data-server="debian13"] .copy-command button').textContent !==
          'Copy',
      );
      assert(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
        'The download page overflows',
      );
      assert.deepEqual(errors, [], 'Next pages or embedded editor raised browser errors');
      console.log(
        'PASS Next.js ' +
          engine +
          ' search navigation, initial editor render, orientation changes, JSON import and account page.',
      );
    } finally {
      await browser.close();
    }
  }
  console.log(
    'PASS Next.js production dashboard, routing, nonce CSP, editor isolation, session API and access boundaries.',
  );
} catch (error) {
  console.error(logs);
  throw error;
} finally {
  github.close();
  if (!exited) {
    const closed = new Promise((done) => child.once('exit', done));
    child.kill('SIGTERM');
    await Promise.race([closed, delay(5000)]);
    if (!exited) child.kill('SIGKILL');
  }
}
