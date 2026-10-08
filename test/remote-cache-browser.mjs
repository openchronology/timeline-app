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
  let holdOverview = false,
    releaseOverview;
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
    event_count: String(document.events.length),
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
      overviews.push(data);
      if (holdOverview)
        await new Promise((resolve) => {
          releaseOverview = resolve;
        });
      const view = new Viewport(Q.parse(data.lower), Q.parse(data.upper).sub(Q.parse(data.lower)));
      const frame = index.frame(
        view,
        1000,
        Q.parse(data.threshold).div(view.span).toApproximateNumber() * 1000,
      );
      return route.fulfill({ json: { ...frame, revision } });
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
    await bounds('9000', '11000');
    await page.getByRole('button', { name: 'Far away', exact: true }).waitFor();
    assert.equal(await page.locator('.event-marker[aria-label="Edited nearby moment"]').count(), 0);
    await bounds('0', '20');
    await page.getByRole('button', { name: 'Edited nearby moment', exact: true }).waitFor();
    assert(overviews.length > fetched);
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
  } finally {
    await context.close();
  }
}
