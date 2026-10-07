// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
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
  assert.match(html, /releases\/latest\/download\/openchronology-offline\.html/);
  assert.match(html, /releases\/latest\/download\/openchronology-desktop-linux-amd64\.deb/);
  assert.match(html, /id="dashboard-browser"/);
  assert.match(html, /Sort timelines/);
  assert.doesNotMatch(html, /id="dashboard-favorites"/);
  assert.doesNotMatch(html, /id="dashboard-mine"/);
  assert.doesNotMatch(html, /id="timeline-stage"/);
  assert.match(html, /href="\/editor\?new=1"/);
  const csp = dashboard.headers.get('content-security-policy');
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
    '/legal',
    '/editor',
    '/?search=history&page=2',
    '/?owner=seed&search=history&page=2',
  ]) {
    const r = await fetch(origin + path);
    assert.equal(r.status, 200, path);
  }
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
      await page.goto(origin);
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
            stage.clientWidth > 96 && Math.abs(parseFloat(axis.style.width) - stage.clientWidth) < 1
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
  if (!exited) {
    const closed = new Promise((done) => child.once('exit', done));
    child.kill('SIGTERM');
    await Promise.race([closed, delay(5000)]);
    if (!exited) child.kill('SIGKILL');
  }
}
