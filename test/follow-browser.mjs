// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { demo, Q, TimelineIndex, Viewport } from '../dist/core.mjs';
export async function checkFollowLatest(browser) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const id = '11111111-1111-4111-8111-111111111111';
  let revision = '1',
    generation = '1',
    recentReads = 0;
  let document = {
    ...demo(),
    events: [{ id: 'initial', time: '0/1', metadata: { title: 'Initial' } }],
  };
  let index = new TimelineIndex(document);
  const info = () => ({
    id,
    title: document.title,
    description: '',
    revision,
    event_generation: generation,
    owner: 'seed',
    visibility: 'public',
    canEdit: false,
    canWrite: false,
    event_count: String(document.events.length),
    first: '0/1',
    last: document.events.at(-1).time,
  });
  await context.addInitScript(() => {
    class Stream extends EventTarget {
      readyState = 1;
      constructor() {
        super();
        window.testStream = this;
      }
      close() {
        this.readyState = 2;
      }
    }
    window.EventSource = Stream;
  });
  await context.route('http://localhost:5173/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/session')
      return route.fulfill({ json: { user: null, csrf: null, server: true, dashboard: false } });
    if (path === `/api/timelines/${id}`) return route.fulfill({ json: info() });
    if (path === `/api/timelines/${id}/revision`) return route.fulfill({ json: { id, revision } });
    if (path === `/api/timelines/${id}/recent`) {
      recentReads++;
      return route.fulfill({
        json: {
          revision,
          event_generation: generation,
          times: document.events
            .slice(-8)
            .reverse()
            .map((e) => e.time),
        },
      });
    }
    if (path === `/api/timelines/${id}/query`) {
      const data = route.request().postDataJSON();
      const view = new Viewport(Q.parse(data.lower), Q.parse(data.upper).sub(Q.parse(data.lower)));
      return route.fulfill({
        json: {
          ...index.frame(
            view,
            1000,
            Q.parse(data.threshold).div(view.span).toApproximateNumber() * 1000,
          ),
          revision,
        },
      });
    }
    if (path.startsWith('/api/'))
      return route.fulfill({ status: 404, json: { error: 'Unused route' } });
    const file = path === '/editor/frame' ? 'index.html' : path.slice(1);
    let body = await readFile(resolve('dist', file));
    if (file === 'index.html')
      body = Buffer.from(
        body
          .toString()
          .replace('href="./app.css"', 'href="/app.css"')
          .replace('src="./app.js"', 'src="/app.js"'),
      );
    return route.fulfill({
      body,
      contentType: file.endsWith('.html')
        ? 'text/html'
        : file.endsWith('.css')
          ? 'text/css'
          : 'text/javascript',
    });
  });
  const page = await context.newPage(),
    errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const push = () =>
    page.evaluate(
      ({ id, revision }) =>
        window.testStream.dispatchEvent(
          new MessageEvent('revision', { data: JSON.stringify({ id, revision }) }),
        ),
      { id, revision },
    );
  const bounds = async () => [
    Q.parse(await page.locator('#left-bound').inputValue()),
    Q.parse(await page.locator('#right-bound').inputValue()),
  ];
  // Poll from Node while the browser clock is paused; page RAF polling would freeze.
  const wait = async (predicate) => {
    for (let i = 0; i < 200; i++) {
      if (await page.evaluate(predicate)) return;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    throw new Error('Follow browser state timed out');
  };
  try {
    await page.goto(`http://localhost:5173/editor/frame#timeline/${id}`);
    await page.waitForFunction(() => document.querySelector('.event-marker') && window.testStream);
    await page.locator('#follow-latest').check();
    const initial = await bounds();
    // An external edit alone must not fetch a follow target.
    revision = '2';
    document.events[0].metadata.title = 'Edited';
    index = new TimelineIndex(document);
    await push();
    await page.waitForFunction(
      () => document.querySelector('.event-marker')?.getAttribute('aria-label') === 'Edited',
    );
    assert.equal(recentReads, 0);
    await page.clock.install();
    await page.clock.pauseAt(new Date());
    // An external addition is outside the cached viewport. Navigation postpones it.
    await page.locator('#zoom-in').click();
    revision = '3';
    generation = '2';
    document.events.push(
      ...Array.from({ length: 8 }, (_, i) => ({
        id: 'new-' + i,
        time: `${100 + i}/1`,
        metadata: { title: 'New ' + i },
      })),
    );
    index = new TimelineIndex(document);
    await push();
    await wait(() => document.getElementById('event-count').textContent.includes('9 events'));
    await page.clock.runFor(14000);
    assert.equal(recentReads, 0);
    await page.locator('#zoom-out').click();
    await page.clock.runFor(14999);
    assert.equal(recentReads, 0);
    await page.clock.runFor(1);
    await wait(() => document.getElementById('timeline-stage').dataset.zooming === 'true');
    assert.equal(recentReads, 1);
    await page.clock.runFor(300);
    const [left, right] = await bounds();
    assert(left.compare(Q.parse('100')) < 0 && right.compare(Q.parse('107')) > 0);
    assert(
      right.sub(left).compare(Q.parse('20')) < 0,
      'Frame recent coordinates, not the full history',
    );
    assert(left.compare(initial[0]) > 0);
    assert.deepEqual(errors, []);
  } finally {
    await context.close();
  }
}
