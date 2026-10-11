// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
import assert from 'node:assert/strict';
import { closeMomentDetails } from './moment-dialog-browser.mjs';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Q, Viewport, TimelineIndex } from '../dist/core.mjs';
export async function checkRemoteCache(browser) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const id = '11111111-1111-4111-8111-111111111111';
  let document = {
    format: 'openchronology',
    version: 1,
    title: 'Cached server timeline',
    description: '',
    events: [
      ...Array.from({ length: 10000 }, (_, i) => ({
        id: 'dense-' + i,
        time: Q.from(BigInt(i), 100000n).toString(),
        metadata: { title: 'Dense ' + i },
      })),
      {
        id: 'near',
        time: '10/1',
        metadata: { title: 'Nearby moment', description: 'Notes fetched on selection' },
      },
      { id: 'far', time: '10000/1', metadata: { title: 'Far away' } },
    ],
  };
  let index = new TimelineIndex(document),
    revision = '1',
    documentReads = 0;
  let reportedCount = null;
  let holdOverview = false,
    releaseOverview;
  // Windows fetched ahead of the reader wait until the test lets them through.
  let holdPrefetch = true;
  const prefetches = [],
    heldPrefetches = [];
  // When a prefetch was last asked for or answered. WebKit lets this mock answer requests
  // the page aborted, so prefetches are awaited by their going quiet rather than counted.
  let prefetchActivity = 0;
  const overviews = [],
    details = [],
    saves = [],
    errors = [];
  const info = () => ({
    id,
    title: document.title,
    description: '',
    revision,
    owner: 'alice',
    visibility: 'private',
    canEdit: true,
    canWrite: true,
    canPropose: true,
    canShare: true,
    event_count: reportedCount ?? String(document.events.length),
    first: '0/1',
    last: '10000/1',
  });
  await context.route('http://localhost:5173/**', async (route) => {
    const path = new URL(route.request().url()).pathname,
      method = route.request().method();
    const data = ['POST', 'PUT'].includes(method) ? route.request().postDataJSON() : null;
    if (path === '/api/session')
      return route.fulfill({
        json: {
          user: { id: 'user', username: 'alice' },
          csrf: 'csrf',
          server: true,
          dashboard: false,
        },
      });
    if (path === '/api/timelines/search' || path === '/api/timelines')
      return route.fulfill({ json: { timelines: [], page: 1, pages: 0, total: 0 } });
    if (path === `/api/timelines/${id}/revision`) return route.fulfill({ json: { id, revision } });
    if (path === `/api/timelines/${id}`) return route.fulfill({ json: info() });
    if (path === `/api/timelines/${id}/document`) {
      documentReads++;
      return route.fulfill({ json: { timeline: info(), document } });
    }
    if (path === `/api/timelines/${id}/query`) {
      // Opening a moment also lists its relationships.
      if (data.kind === 'related')
        return route.fulfill({ json: { related: [], next: null, reachable: 0, direct: 0 } });
      if (data.kind === 'events') {
        details.push(data);
        return route.fulfill({
          json: { events: index.eventsBetween(data.lower, data.upper, 100), next: null, revision },
        });
      }
      if (data.prefetch) {
        prefetches.push(data);
        prefetchActivity = Date.now();
        if (holdPrefetch) await new Promise((resolve) => heldPrefetches.push(resolve));
      } else overviews.push(data);
      if (holdOverview && !data.prefetch)
        await new Promise((resolve) => {
          releaseOverview = resolve;
        });
      const view = new Viewport(Q.parse(data.lower), Q.parse(data.upper).sub(Q.parse(data.lower)));
      const frame = index.frame(
        view,
        1000,
        Q.parse(data.threshold).div(view.span).toApproximateNumber() * 1000,
      );
      // An aborted prefetch may be released after the page stopped waiting for it.
      return route
        .fulfill({ json: { ...frame, revision } })
        .then(() => {
          if (data.prefetch) prefetchActivity = Date.now();
        })
        .catch((error) => {
          if (!data.prefetch) throw error;
        });
    }
    if (path === `/api/timelines/${id}/changes`) {
      saves.push(data);
      const events = new Map(document.events.map((e) => [e.id, e]));
      for (const c of data.changes) {
        if (c.event) events.set(c.id, c.event);
        else events.delete(c.id);
      }
      document = { ...data.settings, events: [...events.values()] };
      index = new TimelineIndex(document);
      revision = '2';
      return route.fulfill({ json: info() });
    }
    if (path.startsWith('/api/'))
      return route.fulfill({ json: { error: 'Unused route' }, status: 404 });
    const name = path === '/' ? 'index.html' : path.slice(1);
    return route.fulfill({
      body: await readFile(resolve('dist', name)),
      contentType: name.endsWith('.html')
        ? 'text/html'
        : name.endsWith('.css')
          ? 'text/css'
          : 'text/javascript',
    });
  });
  const page = await context.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  const bounds = async (left, right) => {
    await page.locator('#left-bound').fill(left);
    await page.locator('#right-bound').fill(right);
    await page.locator('#apply-bounds').click();
    // Rendering (which shows the loading notice on a miss) waits for an animation frame.
    await page.evaluate(
      () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))),
    );
    await page.waitForFunction(() => document.getElementById('loading-window').hidden);
  };
  try {
    await page.goto(`http://localhost:5173/#timeline/${id}`);
    await page.waitForFunction(
      () =>
        document.getElementById('timeline-title').value === 'Cached server timeline' &&
        document.getElementById('loading-window').hidden &&
        document.querySelector('.event-marker'),
    );
    assert.equal(documentReads, 0);
    assert.equal(details.length, 0);
    assert(overviews.length >= 1);
    // Server timelines of ordinary size get no capacity advice.
    assert(await page.locator('#capacity-notice').isHidden());
    assert((await page.locator('.event-marker.group').count()) > 0);
    await bounds('0', '20');
    await page.getByRole('button', { name: 'Nearby moment', exact: true }).waitFor();
    const fetched = overviews.length;
    await bounds('1', '21');
    // Rendering is scheduled on the next animation frame; wait without polling network counters.
    await page.evaluate(
      () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))),
    );
    assert.equal(overviews.length, fetched); // within the prefetch margin
    // Hold a different-resolution response and rapidly navigate. The existing
    // singleton DOM node must survive both misses until a confirmed result arrives.
    await page.getByRole('button', { name: 'Nearby moment', exact: true }).evaluate((node) => {
      window.cachedNearby = node;
    });
    holdOverview = true;
    await page.locator('#left-bound').fill('0');
    await page.locator('#right-bound').fill('40');
    await page.locator('#apply-bounds').click();
    await page.waitForFunction(() => !document.getElementById('loading-window').hidden);
    assert(await page.getByRole('button', { name: 'Nearby moment', exact: true }).isVisible());
    await page.locator('#right-bound').fill('80');
    await page.locator('#apply-bounds').click();
    await page.waitForFunction(() => !document.getElementById('loading-window').hidden);
    assert(await page.getByRole('button', { name: 'Nearby moment', exact: true }).isVisible());
    assert(
      await page.evaluate(
        () => document.querySelector('[aria-label="Nearby moment"]') === window.cachedNearby,
      ),
    );
    holdOverview = false;
    releaseOverview?.();
    await page.waitForFunction(() => document.getElementById('loading-window').hidden);
    assert(
      await page.evaluate(
        () => document.querySelector('[aria-label="Nearby moment"]') === window.cachedNearby,
      ),
    );
    await bounds('1', '21');
    await page.getByRole('button', { name: 'Nearby moment', exact: true }).click();
    await page.locator('#event-description').waitFor({ state: 'visible' });
    assert.equal(
      await page.locator('#event-description').inputValue(),
      'Notes fetched on selection',
    );
    assert.equal(details.length, 1);
    assert.equal(documentReads, 0);
    await page.locator('#event-title').fill('Edited nearby moment');
    await page.waitForFunction(() =>
      document.querySelector('.event-marker[aria-label="Edited nearby moment"]'),
    );
    await closeMomentDetails(page);
    // A cached coarser window can show the far moment before that view's own answer arrives.
    const near = overviews.length;
    await bounds('9000', '11000');
    for (let i = 0; i < 200 && overviews.length === near; i++) await page.waitForTimeout(25);
    await page.waitForFunction(() => document.getElementById('loading-window').hidden);
    await page.getByRole('button', { name: 'Far away', exact: true }).waitFor();
    assert.equal(await page.locator('.event-marker[aria-label="Edited nearby moment"]').count(), 0);
    // The running cache kept the earlier window: returning needs no request.
    const away = overviews.length;
    await bounds('0', '20');
    await page.getByRole('button', { name: 'Edited nearby moment', exact: true }).waitFor();
    assert(away > fetched);
    assert.equal(overviews.length, away);
    // Once the view settles, windows ahead of the reader are fetched one at a time: around
    // the view, then one level coarser and one finer. Pans and zooms into them need no request.
    holdPrefetch = false;
    prefetchActivity = Date.now();
    for (const release of heldPrefetches.splice(0)) release();
    await page.waitForFunction(() => document.getElementById('loading-window').hidden);
    // Each prediction follows the previous answer within 50 ms: a quiet second means the
    // view's three (around it, one level coarser, one finer) are in.
    const released = prefetches.length;
    for (let i = 0; i < 300 && Date.now() - prefetchActivity < 1000; i++)
      await page.waitForTimeout(50);
    assert(prefetches.length > released, 'windows were fetched ahead of the reader');
    assert(prefetches.every((q) => q.kind === 'overview' && q.revision === '1'));
    await page.waitForTimeout(100);
    const predicted = overviews.length;
    for (const [left, right] of [
      ['30', '50'],
      ['-30', '-10'],
      ['0', '40'],
      ['5', '15'],
    ]) {
      await bounds(left, right);
      assert.equal(overviews.length, predicted, `${left}..${right} was predicted`);
    }
    assert.equal(documentReads, 0);
    await page.locator('#publish-button').click();
    await page.waitForFunction(
      () => document.getElementById('save-status').textContent === 'Saved on the server',
    );
    assert.equal(saves.length, 1);
    assert.equal(saves[0].changes.length, 1);
    assert.equal(saves[0].settings.events, undefined);
    assert.equal(documentReads, 0);
    assert.equal(document.events.length, 10002);
    assert(document.events.some((e) => e.id === 'far'));
    assert.deepEqual(errors, []);
    // Near the per-timeline limit, even the platform warns (it cannot lift the limit).
    reportedCount = '160000';
    await page.reload();
    await page.locator('#capacity-notice').waitFor();
    assert.match(
      await page.locator('#capacity-text').textContent(),
      /This timeline has 160,000 moments; a timeline holds at most 200,000\./,
    );
    assert.equal(await page.locator('#capacity-actions').locator('button, a').count(), 0);
  } finally {
    await context.close();
  }
}
