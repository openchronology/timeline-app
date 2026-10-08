import { checkIssues } from './issues-browser.mjs';
// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
import assert from 'node:assert/strict';
import { closeMomentDetails, checkMomentDialog } from './moment-dialog-browser.mjs';
import { checkZoomHelp } from './zoom-help-browser.mjs';
import { checkWheelPrecision } from './viewport-browser.mjs';
import { checkPresentation } from './presentation-browser.mjs';
import { checkRuler } from './ruler-browser.mjs';
import { checkSelection } from './selection-browser.mjs';
import { checkLabelMotion } from './label-motion-browser.mjs';
import { checkPlugins } from './plugins-browser.mjs';
import { checkCommunity } from './community-browser.mjs';
import { checkAccounts } from './accounts-browser.mjs';
import { checkRemoteCache } from './remote-cache-browser.mjs';
import { checkFollowLatest } from './follow-browser.mjs';
import { checkComparison } from './comparison-browser.mjs';
import { checkDesktopCache } from './desktop-cache-browser.mjs';
import { checkResponsiveTimeline } from './layout-browser.mjs';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium, firefox, webkit } from 'playwright';
import { Q, validateDocument, demo } from '../dist/core.mjs';

const engine = process.env.BROWSER ?? 'chromium';
if (!['chromium', 'firefox', 'webkit'].includes(engine)) throw new Error('Unknown BROWSER');
const browser = await { chromium, firefox, webkit }[engine].launch({
  timeout: 30000,
  ...(process.env.BROWSER_EXECUTABLE ? { executablePath: process.env.BROWSER_EXECUTABLE } : {}),
});
const context = await browser.newContext({
  viewport: { width: 1440, height: 960 },
  hasTouch: engine === 'chromium',
  acceptDownloads: true,
});
const errors = [];
// Serve the actual built application through Playwright interception. This also tests static-only deployment.
await context.route('http://localhost:5173/**', async (route) => {
  const url = new URL(route.request().url());
  if (url.pathname === '/api/session')
    return route.fulfill({ json: { user: null, csrf: null, server: false } });
  if (url.pathname.startsWith('/api/'))
    return route.fulfill({ status: 503, json: { error: 'Server storage is not configured.' } });
  const name = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
  if (!/^(index\.html|app\.(js|css)(\.map)?)$/.test(name))
    return route.fulfill({ status: 404, body: 'Not found' });
  return route.fulfill({
    body: await readFile(resolve('dist', name)),
    contentType: name.endsWith('.css')
      ? 'text/css'
      : name.endsWith('.html')
        ? 'text/html'
        : 'text/javascript',
  });
});
const page = await context.newPage();
page.on('pageerror', (error) => errors.push(error.message));
page.on('dialog', (dialog) => dialog.accept());
const input = (id) => page.locator('#' + id),
  markers = page.locator('.event-marker');
const poll = async (predicate) => {
  for (let i = 0; i < 100; i++) {
    if (await predicate()) return;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error('Browser assertion timed out');
};
const span = async () =>
  Q.parse(await input('right-bound').inputValue()).sub(
    Q.parse(await input('left-bound').inputValue()),
  );
try {
  await page.goto('http://localhost:5173/');
  assert.equal(await page.locator('#calendar-mode').count(), 0);
  await poll(async () => (await markers.count()) > 0);
  assert.match(await input('event-count').textContent(), /10 events/);
  await checkResponsiveTimeline(page);
  await page.reload();
  await checkResponsiveTimeline(page);
  await page.locator('.event-marker:not(.group)').first().click();
  await input('event-title').fill('A renamed moment');
  await page.waitForFunction(() =>
    document.getElementById('event-edit-status').textContent.startsWith('Applied to timeline'),
  );
  assert.equal(await input('event-title').inputValue(), 'A renamed moment');
  await closeMomentDetails(page);
  await input('undo-button').click();
  await page
    .getByRole('button', { name: 'A renamed moment', exact: true })
    .waitFor({ state: 'detached' });
  await closeMomentDetails(page);
  await input('add-button').click();
  await input('event-title').fill('A new exact event');
  await input('event-time').fill('-17/23');
  await page.waitForFunction(() =>
    document.getElementById('event-edit-status').textContent.startsWith('Applied to timeline'),
  );
  assert.match(await input('event-count').textContent(), /11 events/);
  await closeMomentDetails(page);
  await input('undo-button').click();
  const stage = input('timeline-stage');
  await stage.scrollIntoViewIfNeeded();
  const box = await stage.boundingBox(),
    before = await input('left-bound').inputValue();
  // Mouse drag must pan, while a subsequent point click must still select.
  await page.mouse.move(box.x + 300, box.y + 60);
  await page.mouse.down();
  await page.mouse.move(box.x + 380, box.y + 60, { steps: 5 });
  await page.mouse.up();
  await poll(async () => (await input('left-bound').inputValue()) !== before);
  await page.locator('.event-marker:not(.group)').first().click();
  assert(await input('event-form').isVisible());
  await closeMomentDetails(page);
  const oldSpan = await span();
  const wheelBox = await stage.boundingBox();
  await page.mouse.move(wheelBox.x + 350, wheelBox.y + 130);
  await page.mouse.wheel(0, -120);
  await poll(async () => (await span()).compare(oldSpan) < 0);
  await checkWheelPrecision(page);
  await checkZoomHelp(page);

  await closeMomentDetails(page);
  await input('json-file').setInputFiles({
    name: 'sample.ochx',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(demo(true))),
  });
  await poll(async () => (await input('event-count').textContent()).includes('20,010'));
  const dense = page.locator('.event-marker').filter({ hasText: '20k' });
  await poll(async () => (await dense.count()) === 1);
  await dense.click();
  assert.match(await input('group-title').textContent(), /20,001/);
  const firstGroupTitle = await input('group-events').getByRole('button').first().textContent();
  assert.equal(await input('group-events').getByRole('button').count(), 25);
  await input('group-more').click();
  await poll(async () => (await input('group-page-status').textContent()).startsWith('Page 2'));
  assert.equal(await input('group-events').getByRole('button').count(), 25);
  assert.notEqual(
    await input('group-events').getByRole('button').first().textContent(),
    firstGroupTitle,
  );
  await input('group-previous').click();
  await poll(async () => (await input('group-page-status').textContent()).startsWith('Page 1'));
  assert.equal(
    await input('group-events').getByRole('button').first().textContent(),
    firstGroupTitle,
  );
  await input('group-events').getByRole('button').first().click();
  assert.equal(await input('group-events').getByRole('button').count(), 0);
  await input('close-inspector').click();
  await closeMomentDetails(page);
  await input('fit-button').click();

  const huge = 10n ** 300n,
    den = 10n ** 200n;
  const document = validateDocument({
    format: 'openchronology',
    version: 1,
    title: 'Exact browser round trip',
    description: '',
    events: [
      { id: 'a', time: Q.from(huge).toString(), metadata: { title: 'First' } },
      { id: 'b', time: Q.from(huge * den + 1n, den).toString(), metadata: { title: 'Second' } },
      { id: 'c', time: Q.from(huge * den + 2n, den).toString(), metadata: { title: 'Third' } },
    ],
  });
  await closeMomentDetails(page);
  await input('json-file').setInputFiles({
    name: 'exact.ochx',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(document)),
  });
  await poll(async () => (await input('timeline-title').inputValue()) === document.title);
  await poll(async () => (await markers.count()) === 3);
  assert((await page.locator('.tick-label').first().textContent()).length > 0);
  const downloadPromise = page.waitForEvent('download');
  await closeMomentDetails(page);
  await input('export-button').click();
  const download = await downloadPromise;
  assert.match(download.suggestedFilename(), /\.ochx$/);
  const exported = validateDocument(JSON.parse(await readFile(await download.path(), 'utf8')));
  assert.deepEqual(exported, document);
  await checkMomentDialog(page, document);
  await checkPresentation(page, document);
  await checkRuler(page, document);
  await checkSelection(page, document);
  await checkLabelMotion(page, document);
  await checkPlugins(page, document);

  // Real multitouch through Chromium's input protocol; the rational gesture math is also unit tested.
  if (engine === 'chromium') {
    const cdp = await context.newCDPSession(page),
      b = await stage.boundingBox(),
      y = b.y + 75;
    const touch = (x, id) => ({ x, y, id, radiusX: 2, radiusY: 2, force: 1 });
    const left = await input('left-bound').inputValue();
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [touch(b.x + 230, 1)],
    });
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [touch(b.x + 280, 1)],
    });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await poll(async () => (await input('left-bound').inputValue()) !== left);
    const s = await span();
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [touch(b.x + 200, 1), touch(b.x + 400, 2)],
    });
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [touch(b.x + 150, 1), touch(b.x + 450, 2)],
    });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await poll(async () => (await span()).compare(s) < 0);
    await closeMomentDetails(page);
    await input('fit-button').click();
    await poll(async () => (await markers.count()) === 3);
    const m = await markers.first().boundingBox();
    await page.touchscreen.tap(m.x + m.width / 2, m.y + m.height / 2);
    await poll(() => input('event-form').isVisible());
    assert.equal(await input('event-title').inputValue(), 'First');
  }
  // Guest edits are ephemeral and explicitly exported; refresh starts a fresh session.
  await new Promise((r) => setTimeout(r, 900));
  await page.reload();
  await poll(async () => (await input('timeline-title').inputValue()) !== document.title);
  assert(await input('memory-notice').isVisible());
  await closeMomentDetails(page);
  await input('fit-button').click();
  await mkdir('artifacts', { recursive: true });
  await page.screenshot({ path: `artifacts/timeline-${engine}.png`, fullPage: true });
  assert.deepEqual(errors, []);
  await checkIssues(page, document);
  await checkAccounts(browser);
  await checkCommunity(browser);
  await checkRemoteCache(browser);
  await checkFollowLatest(browser);
  await checkDesktopCache(browser);
  await checkComparison(browser);
  console.log(
    `PASS ${engine}: editing, pan/zoom, dense summaries, exact JSON, in-memory guest editing${engine === 'chromium' ? ', touch pan/pinch/tap' : ''}.`,
  );
} catch (error) {
  await mkdir('artifacts', { recursive: true });
  await page
    .screenshot({ path: `artifacts/failure-${engine}.png`, fullPage: true })
    .catch(() => {});
  await writeFile(
    `artifacts/failure-${engine}.txt`,
    String(error.stack ?? error) + '\n' + errors.join('\n'),
  );
  throw error;
} finally {
  await browser.close();
}
