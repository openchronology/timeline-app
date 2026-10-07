// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
import assert from 'node:assert/strict';
import { checkZoomHelp } from './zoom-help-browser.mjs';
import { checkWheelPrecision } from './viewport-browser.mjs';
import { checkPresentation } from './presentation-browser.mjs';
import { checkRuler } from './ruler-browser.mjs';
import { checkSelection } from './selection-browser.mjs';
import { checkLabelMotion } from './label-motion-browser.mjs';
import { checkPlugins } from './plugins-browser.mjs';
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium, firefox, webkit } from 'playwright';
import { Q, validateDocument, demo } from '../dist/core.mjs';

const engine = process.env.BROWSER ?? 'chromium';
if (!['chromium', 'firefox', 'webkit'].includes(engine)) throw new Error('Unknown BROWSER');
const browser = await { chromium, firefox, webkit }[engine].launch({
  timeout: 30000,
  ...(process.env.BROWSER_EXECUTABLE ? { executablePath: process.env.BROWSER_EXECUTABLE } : {}),
});
const directory = await mkdtemp(join(tmpdir(), 'openchronology-file-'));
const filename = join(directory, 'timeline.html');
await copyFile(resolve('dist/openchronology-offline.html'), filename);
const url = pathToFileURL(filename).href;
const context = await browser.newContext({
  viewport: { width: 1440, height: 960 },
  acceptDownloads: true,
  offline: true,
});
// Observe attempted API calls as well as requests. CSP alone must not mask a reconnect attempt.
await context.addInitScript(() => {
  // Some file:// browser contexts expose getRandomValues without randomUUID.
  Object.defineProperty(crypto, 'randomUUID', { value: undefined, configurable: true });
  window.__networkCalls = [];
  for (const name of [
    'fetch',
    'XMLHttpRequest',
    'WebSocket',
    'EventSource',
    'Worker',
    'SharedWorker',
  ]) {
    window[name] = function (...args) {
      window.__networkCalls.push(name);
      throw new Error('Offline code attempted ' + name);
    };
  }
  navigator.sendBeacon = function () {
    window.__networkCalls.push('sendBeacon');
    return false;
  };
});
const page = await context.newPage(),
  errors = [],
  requests = [];
page.on('pageerror', (error) => errors.push(error.message));
page.on('request', (request) => requests.push(request.url()));
page.on('dialog', (dialog) => dialog.accept());
const input = (id) => page.locator('#' + id),
  markers = page.locator('.event-marker');
const poll = async (predicate) => {
  for (let i = 0; i < 100; i++) {
    if (await predicate()) return;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error('Offline browser assertion timed out');
};
try {
  // The fragment deliberately resembles a server link; the standalone file must ignore it.
  await page.goto(url + '#timeline/00000000-0000-0000-0000-000000000001');
  assert.equal(await page.locator('#calendar-mode').count(), 0);
  await poll(async () => (await input('storage-badge').textContent()) === 'Offline HTML');
  assert(await input('memory-notice').isVisible());
  assert.match(await input('memory-notice').textContent(), /Export an .ochx/);
  assert.match(await input('event-count').textContent(), /0 events/);
  for (const id of [
    'account-button',
    'publish-button',
    'share-button',
    'sqlite-open',
    'sqlite-save',
    'server-button',
    'och-import',
    'och-export',
  ])
    assert(await input(id).isHidden());
  await input('add-button').click();
  await input('event-title').fill('An exact offline moment');
  await input('event-time').fill('1/3');
  await page.waitForFunction(() =>
    document.getElementById('event-edit-status').textContent.startsWith('Applied to timeline'),
  );
  assert.match(await input('event-count').textContent(), /1 events/);
  assert.equal(await input('event-exact').inputValue(), '1/3');
  await input('fit-button').click();
  await poll(async () => (await markers.count()) === 1);
  const box = await input('timeline-stage').boundingBox(),
    before = await input('left-bound').inputValue();
  await page.mouse.move(box.x + 300, box.y + 60);
  await page.mouse.down();
  await page.mouse.move(box.x + 370, box.y + 60, { steps: 5 });
  await page.mouse.up();
  await poll(async () => (await input('left-bound').inputValue()) !== before);
  const oldRight = await input('right-bound').inputValue();
  await page.mouse.wheel(0, -100);
  await poll(async () => (await input('right-bound').inputValue()) !== oldRight);
  await checkWheelPrecision(page);
  await checkZoomHelp(page);

  const offset = 10n ** 300n,
    denominator = 10n ** 200n;
  const document = validateDocument({
    format: 'openchronology',
    version: 1,
    title: 'Exact offline timeline',
    description: '',
    events: [
      {
        id: 'a',
        time: Q.from(offset).toString(),
        metadata: {
          title: '<img src="https://example.invalid/tracker">',
          source: 'https://example.invalid/source',
        },
      },
      {
        id: 'b',
        time: Q.from(offset * denominator + 1n, denominator).toString(),
        metadata: { title: 'Second' },
      },
      {
        id: 'c',
        time: Q.from(offset * denominator + 2n, denominator).toString(),
        metadata: { title: 'Third' },
      },
    ],
  });
  await input('json-file').setInputFiles({
    name: 'timeline.ochx',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(document)),
  });
  await poll(async () => (await input('timeline-title').inputValue()) === document.title);
  await poll(async () => (await markers.count()) === 3);
  assert.equal(await page.locator('img').count(), 0);
  await markers.first().click();
  await poll(() => input('event-form').isVisible());
  assert.equal(await input('event-exact').inputValue(), document.events[0].time);
  const downloading = page.waitForEvent('download');
  await input('export-button').click();
  const download = await downloading;
  assert.match(download.suggestedFilename(), /\.ochx$/);
  assert.deepEqual(
    validateDocument(JSON.parse(await readFile(await download.path(), 'utf8'))),
    document,
  );
  await checkPresentation(page, document);
  await checkRuler(page, document);
  await checkSelection(page, document);
  await checkLabelMotion(page, document);
  await checkPlugins(page, document, true);
  await input('json-file').setInputFiles({
    name: 'sample.ochx',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(demo(true))),
  });
  await poll(async () => (await input('event-count').textContent()).includes('20,010'));
  const group = markers.filter({ hasText: '20k' });
  await group.click();
  await input('group-zoom').click();
  await poll(async () => (await markers.count()) > 5);
  assert((await markers.count()) < 200);
  // Reload recreates the spy array, so check the entire editing session first.
  assert.deepEqual(await page.evaluate(() => window.__networkCalls), []);
  await mkdir('artifacts', { recursive: true });
  await page.screenshot({ path: `artifacts/offline-${engine}.png`, fullPage: true });
  await page.reload();
  await poll(async () => (await input('event-count').textContent()) === '0 events');
  assert.deepEqual(await page.evaluate(() => window.__networkCalls), []);
  assert.deepEqual(
    requests.filter((request) => request.split('#')[0] !== url && !/^(blob:|data:)/.test(request)),
    [],
  );
  assert.deepEqual(errors, []);
  console.log(
    `PASS ${engine}: standalone file://, exact editing/JSON, pan/zoom/grouping, and zero network calls or external dependencies.`,
  );
} catch (error) {
  await mkdir('artifacts', { recursive: true });
  await page
    .screenshot({ path: `artifacts/offline-failure-${engine}.png`, fullPage: true })
    .catch(() => {});
  await writeFile(
    `artifacts/offline-failure-${engine}.txt`,
    String(error.stack ?? error) + '\n' + errors.join('\n') + '\n' + requests.join('\n'),
  );
  throw error;
} finally {
  await browser.close();
  await rm(directory, { recursive: true, force: true });
}
