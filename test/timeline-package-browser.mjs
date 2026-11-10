// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// The @openchronology/timeline element (packages/timeline, built by scripts/timeline-package.mjs)
// in a page with a content security policy like an AI chat's artifacts: a timeline given inline
// opens with its default view, in view mode when asked, in a sandboxed frame; one set by script
// replaces it; one that is not a timeline says so.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { chromium, firefox, webkit } from 'playwright';

const engine = process.env.BROWSER ?? 'chromium';
const script = await readFile('packages/timeline/dist/timeline.js');
// Only what matters, as a model would write it: the element fills in the format, version and
// description, and the Gregorian display's settings. Times are seconds from 1970.
const timeline = {
  title: 'Moon landings',
  presentation: 'gregorian',
  events: [
    { id: 'l9', time: '-123379200/1', metadata: { title: 'Luna 9 lands', tags: ['robotic'] } },
    { id: 'a11', time: '-14182940/1', metadata: { title: 'Apollo 11 lands', tags: ['crewed'] } },
    { id: 'a12', time: '-11819760/1', metadata: { title: 'Apollo 12 lands', tags: ['crewed'] } },
    { id: 'a17', time: '93422100/1', metadata: { title: 'Apollo 17 lands', tags: ['crewed'] } },
    { id: 'c3', time: '1387121160/1', metadata: { title: "Chang'e 3 lands", tags: ['robotic'] } },
  ],
  view: { separation: { separations: [{ tags: ['crewed'] }] } },
};
const page = (body) => `<!doctype html><html><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; frame-src 'self'">
<script src="/timeline.js"></script></head><body>${body}</body></html>`;
const pages = {
  '/inline': page(
    `<och-timeline mode="view" theme="dark" height="500"><script type="application/json">${JSON.stringify(timeline).replace(/</g, '\\u003c')}</script></och-timeline>`,
  ),
  '/broken': page(
    `<och-timeline><script type="application/json">{ not json</script></och-timeline>`,
  ),
};
const server = createServer((request, response) => {
  if (request.url === '/timeline.js') {
    response.writeHead(200, { 'content-type': 'text/javascript' });
    return response.end(script);
  }
  const html = pages[request.url];
  response.writeHead(html ? 200 : 404, { 'content-type': 'text/html' });
  response.end(html ?? '');
});
await new Promise((done) => server.listen(0, '127.0.0.1', done));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await { chromium, firefox, webkit }[engine].launch();
try {
  const tab = await browser.newPage({ viewport: { width: 1100, height: 800 } });
  const errors = [];
  tab.on('pageerror', (error) => {
    // WebKit reports the sandbox check below refusing the parent, as it should, as an error.
    if (!/lacks the "allow-same-origin" flag/.test(error.message)) errors.push(error.message);
  });
  await tab.goto(`${origin}/inline`);
  const frame = tab.frameLocator('och-timeline iframe');
  await frame.locator('#timeline-title').waitFor();
  const inner = () => tab.frames().find((f) => f !== tab.mainFrame());
  await inner().waitForFunction(
    () => document.getElementById('timeline-title').value === 'Moon landings',
  );
  // Its default view: the crewed landings on a track of their own.
  await inner().waitForFunction(() =>
    [...document.querySelectorAll('.comparison-axis-title')].some(
      (t) => t.textContent === 'Tagged crewed',
    ),
  );
  assert.equal(await frame.locator('#view-mode').isChecked(), true);
  // Shown as dates: the ruler counts years, not seconds.
  await inner().waitForFunction(() =>
    /19[67]0/.test(document.getElementById('timeline-stage').textContent),
  );
  assert.equal(await inner().evaluate(() => document.documentElement.dataset.theme), 'dark');
  assert.equal((await tab.locator('och-timeline').boundingBox()).height, 500);
  // Sandboxed in an origin of its own: the page around it is out of its reach.
  assert.equal(
    await tab.evaluate(
      () =>
        document.querySelector('och-timeline').shadowRoot.querySelector('iframe').contentDocument,
    ),
    null,
  );
  assert.equal(
    await inner().evaluate(() => {
      try {
        return !!window.parent.document;
      } catch {
        return false;
      }
    }),
    false,
  );
  // Another timeline, set by script.
  await tab.evaluate((doc) => (document.querySelector('och-timeline').timeline = doc), {
    ...timeline,
    title: 'Mars landings',
    view: undefined,
  });
  await tab.waitForFunction(() => {
    const f = document.querySelector('och-timeline').shadowRoot.querySelector('iframe');
    return f && f.title === 'Mars landings';
  });
  const mars = tab.frames().find((f) => f !== tab.mainFrame());
  await mars.waitForFunction(
    () => document.getElementById('timeline-title')?.value === 'Mars landings',
  );
  assert.deepEqual(errors, []);
  // Not a timeline: said in place of the frame.
  await tab.goto(`${origin}/broken`);
  await tab.locator('och-timeline p').waitFor();
  assert.match(await tab.locator('och-timeline p').textContent(), /could not be opened/);
} finally {
  await browser.close();
  server.close();
}
console.log(
  'PASS timeline package: an inline timeline opened with its default view in view mode, in a sandboxed frame under an artifact-like policy; replaced by script; a broken one reported.',
);
