import assert from 'node:assert/strict';
import { checkWheelPrecision } from './viewport-browser.mjs';
import { checkPresentation } from './presentation-browser.mjs';
import { checkRuler } from './ruler-browser.mjs';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium, firefox, webkit } from 'playwright';
import { Q, validateDocument } from '../dist/core.mjs';

const engine = process.env.BROWSER ?? 'chromium';
if (!['chromium', 'firefox', 'webkit'].includes(engine)) throw new Error('Unknown BROWSER');
const browser = await { chromium, firefox, webkit }[engine].launch({
  timeout: 30000,
  ...(process.env.BROWSER_EXECUTABLE ? { executablePath: process.env.BROWSER_EXECUTABLE } : {}),
});
const context = await browser.newContext({
  viewport: { width: 1440, height: 960 },
  hasTouch: true,
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
  await poll(async () => (await markers.count()) > 0);
  assert.match(await input('event-count').textContent(), /10 events/);
  await page.locator('.event-marker:not(.group)').first().click();
  await input('event-title').fill('A renamed moment');
  await input('event-save').click();
  assert.equal(await input('event-title').inputValue(), 'A renamed moment');
  await input('undo-button').click();
  assert(!(await page.getByRole('button', { name: 'A renamed moment', exact: true }).count()));
  await input('add-button').click();
  await input('event-title').fill('A new exact event');
  await input('event-time').fill('-17/23');
  await input('event-save').click();
  assert.match(await input('event-count').textContent(), /11 events/);
  await input('undo-button').click();
  const stage = input('timeline-stage'),
    box = await stage.boundingBox(),
    before = await input('left-bound').inputValue();
  // Mouse drag must pan, while a subsequent point click must still select.
  await page.mouse.move(box.x + 300, box.y + 60);
  await page.mouse.down();
  await page.mouse.move(box.x + 380, box.y + 60, { steps: 5 });
  await page.mouse.up();
  await poll(async () => (await input('left-bound').inputValue()) !== before);
  await page.locator('.event-marker:not(.group)').first().click();
  assert(await input('event-form').isVisible());
  const oldSpan = await span();
  await page.mouse.move(box.x + 350, box.y + 130);
  await page.mouse.wheel(0, -120);
  await poll(async () => (await span()).compare(oldSpan) < 0);
  await checkWheelPrecision(page);

  await input('dense-demo').click();
  await poll(async () => (await input('event-count').textContent()).includes('20,010'));
  const dense = page.locator('.event-marker').filter({ hasText: '20k' });
  await poll(async () => (await dense.count()) === 1);
  await dense.click();
  assert.match(await input('group-title').textContent(), /20,001/);
  await input('group-zoom').click();
  await poll(async () => (await markers.count()) > 5);
  assert((await markers.count()) < 200);
  await input('group-more').click();
  assert((await input('group-events').getByRole('button').count()) <= 100);
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
  await input('json-file').setInputFiles({
    name: 'exact.ochx',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(document)),
  });
  await poll(async () => (await input('timeline-title').inputValue()) === document.title);
  await poll(async () => (await markers.count()) === 3);
  assert((await page.locator('.tick-label').first().textContent()).length > 0);
  const downloadPromise = page.waitForEvent('download');
  await input('export-button').click();
  const download = await downloadPromise;
  assert.match(download.suggestedFilename(), /\.octimeline\.json$/);
  const exported = validateDocument(JSON.parse(await readFile(await download.path(), 'utf8')));
  assert.deepEqual(exported, document);
  await checkPresentation(page, document);
  await checkRuler(page, document);

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
    await input('fit-button').click();
    await poll(async () => (await markers.count()) === 3);
    const m = await markers.first().boundingBox();
    await page.touchscreen.tap(m.x + m.width / 2, m.y + m.height / 2);
    await poll(() => input('event-form').isVisible());
    assert.equal(await input('event-title').inputValue(), 'First');
  }
  // Browser draft persistence must preserve rational strings without number conversion.
  await new Promise((r) => setTimeout(r, 900));
  await page.reload();
  await poll(async () => (await input('timeline-title').inputValue()) === document.title);
  await input('fit-button').click();
  await mkdir('artifacts', { recursive: true });
  await page.screenshot({ path: `artifacts/timeline-${engine}.png`, fullPage: true });
  assert.deepEqual(errors, []);
  console.log(
    `PASS ${engine}: editing, pan/zoom, dense summaries, exact JSON, draft persistence${engine === 'chromium' ? ', touch pan/pinch/tap' : ''}.`,
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
