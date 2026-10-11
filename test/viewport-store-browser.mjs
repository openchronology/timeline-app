// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Q, Viewport, TimelineIndex } from '../dist/core.mjs';
/** Server timeline windows survive a reload, are not reused across revisions, and go on sign-out. */
export async function checkViewportStore(browser) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const id = '22222222-2222-4222-8222-222222222222';
  const document = {
    format: 'openchronology',
    version: 1,
    title: 'Stored windows',
    description: '',
    events: [
      { id: 'near', time: '10/1', metadata: { title: 'Nearby moment' } },
      { id: 'far', time: '10000/1', metadata: { title: 'Far away' } },
    ],
  };
  const index = new TimelineIndex(document);
  let revision = '1',
    signedIn = true,
    // While true, overview requests are never answered: only stored windows can be shown.
    offline = false,
    answered = 0;
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
    event_count: '2',
    first: '10/1',
    last: '10000/1',
  });
  await context.route('http://localhost:5173/**', async (route) => {
    const path = new URL(route.request().url()).pathname,
      method = route.request().method();
    const data = ['POST', 'PUT'].includes(method) ? route.request().postDataJSON() : null;
    if (path === '/api/session')
      return route.fulfill({
        json: {
          user: signedIn ? { id: 'alice-id', username: 'alice' } : null,
          csrf: signedIn ? 'csrf' : null,
          server: true,
          dashboard: false,
        },
      });
    if (path === '/api/auth/logout') {
      signedIn = false;
      return route.fulfill({ json: {} });
    }
    if (path === '/api/timelines/search' || path === '/api/timelines')
      return route.fulfill({ json: { timelines: [], page: 1, pages: 0, total: 0 } });
    if (path === `/api/timelines/${id}/revision`) return route.fulfill({ json: { id, revision } });
    if (path === `/api/timelines/${id}`) return route.fulfill({ json: info() });
    if (path === `/api/timelines/${id}/query`) {
      if (data.kind === 'related')
        return route.fulfill({ json: { related: [], next: null, reachable: 0, direct: 0 } });
      if (data.kind === 'events')
        return route.fulfill({
          json: { events: index.eventsBetween(data.lower, data.upper, 100), next: null, revision },
        });
      if (offline) return; // left unanswered
      const view = new Viewport(Q.parse(data.lower), Q.parse(data.upper).sub(Q.parse(data.lower)));
      const frame = index.frame(
        view,
        1000,
        Q.parse(data.threshold).div(view.span).toApproximateNumber() * 1000,
      );
      answered++;
      return route.fulfill({ json: { ...frame, revision } }).catch(() => {});
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
  const stored = (page) =>
    page.evaluate(
      () =>
        new Promise((done) => {
          const open = indexedDB.open('openchronology-viewports');
          open.onsuccess = () => {
            const db = open.result;
            if (!db.objectStoreNames.contains('catalog')) return done([]);
            const tx = db.transaction('catalog'),
              keys = tx.objectStore('catalog').getAllKeys();
            tx.oncomplete = () => {
              db.close();
              done(keys.result);
            };
          };
        }),
    );
  const bounds = async (page, left, right) => {
    await page.locator('#left-bound').fill(left);
    await page.locator('#right-bound').fill(right);
    await page.locator('#apply-bounds').click();
  };
  const open = async () => {
    const page = await context.newPage();
    await page.goto(`http://localhost:5173/#timeline/${id}`);
    await page.waitForFunction(
      () => document.getElementById('timeline-title').value === 'Stored windows',
    );
    return page;
  };
  let page = await open();
  try {
    await bounds(page, '0', '20');
    await page.getByRole('button', { name: 'Nearby moment', exact: true }).waitFor();
    await bounds(page, '9000', '11000');
    await page.getByRole('button', { name: 'Far away', exact: true }).waitFor();
    // Windows are stored two seconds after they arrive.
    for (let i = 0; i < 200 && (await stored(page)).length < 2; i++) await page.waitForTimeout(50);
    const keys = await stored(page);
    assert(keys.length >= 2, `stored ${keys.length} windows`);
    assert(keys.every((key) => key.includes('alice-id') && key.includes(id)));
    // Reopened without a server answer, both earlier views come from storage.
    await page.close();
    offline = true;
    const before = answered;
    page = await open();
    await bounds(page, '0', '20');
    await page.getByRole('button', { name: 'Nearby moment', exact: true }).waitFor();
    await page.waitForFunction(() => document.getElementById('loading-window').hidden);
    await bounds(page, '9000', '11000');
    await page.getByRole('button', { name: 'Far away', exact: true }).waitFor();
    assert.equal(answered, before);
    // Another revision's windows are not shown: the view waits for the server.
    await page.close();
    revision = '2';
    page = await open();
    await bounds(page, '0', '20');
    await page.evaluate(
      () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))),
    );
    await page.waitForTimeout(300);
    assert.equal(await page.getByRole('button', { name: 'Nearby moment', exact: true }).count(), 0);
    assert(await page.locator('#loading-window').isVisible());
    // Once answered, the new revision replaces the old one's windows.
    offline = false;
    await bounds(page, '0', '21');
    await page.getByRole('button', { name: 'Nearby moment', exact: true }).waitFor();
    for (let i = 0; i < 200; i++) {
      const now = await stored(page);
      if (now.length && now.every((key) => key.includes('\u00012\u0001'))) break;
      await page.waitForTimeout(50);
    }
    assert((await stored(page)).every((key) => key.includes('\u00012\u0001')));
    // Signing out leaves no windows behind.
    await page.locator('#account-button').click();
    await page.locator('#logout-button').click();
    for (let i = 0; i < 200 && (await stored(page)).length; i++) await page.waitForTimeout(50);
    assert.deepEqual(await stored(page), []);
  } finally {
    await context.close();
  }
  console.log(
    'PASS stored windows: a reload shows earlier views without the server, revisions are kept apart, sign-out clears them.',
  );
}
