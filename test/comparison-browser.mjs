// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
import assert from 'node:assert/strict';
import { closeMomentDetails } from './moment-dialog-browser.mjs';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Q, TimelineIndex, Viewport, DEFAULT_PRESENTATION } from '../dist/core.mjs';
import { localEvents } from '../dist/comparison.mjs';
export async function checkComparison(browser) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1050 } }),
    errors = [],
    queries = [];
  const ids = ['11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222'];
  const savedId = '33333333-3333-4333-8333-333333333333';
  const documents = ids.map((id, i) => ({
    format: 'openchronology',
    version: 1,
    title: 'Compare source ' + i,
    description: '',
    presentation: { ...DEFAULT_PRESENTATION, mode: i ? 'float' : 'rational' },
    events: [
      {
        id: 'shared',
        time: '10/1',
        metadata: { title: 'Moment ' + i, description: 'Read-only details' },
      },
    ],
  }));
  const indexes = documents.map((d) => new TimelineIndex(d)),
    revisions = ['1', '1'];
  await context.addInitScript(() => {
    window.liveStreams = [];
    class FakeSource extends EventTarget {
      static OPEN = 1;
      readyState = 1;
      constructor(url) {
        super();
        window.liveStreams.push(this);
      }
      close() {
        this.readyState = 2;
      }
    }
    window.EventSource = FakeSource;
  });
  await context.route('http://localhost:5173/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/session')
      return route.fulfill({ json: { user: null, csrf: null, server: true, dashboard: false } });
    if (path === '/api/timelines/search')
      return route.fulfill({
        json: {
          timelines: ids.map((id, i) => ({ id, title: documents[i].title, owner: 'seed' })),
          page: 1,
          pages: 1,
          total: 2,
        },
      });
    if (path === '/api/timelines/' + savedId)
      return route.fulfill({
        json: {
          id: savedId,
          title: 'World War II',
          description: 'European and Pacific campaigns',
          comparison: { sources: ids, combined: false },
          presentation: DEFAULT_PRESENTATION,
          revision: '1',
          owner: 'seed',
          visibility: 'public',
          canEdit: false,
          event_count: '0',
        },
      });
    const position = ids.findIndex((id) => path.startsWith('/api/timelines/' + id));
    if (position >= 0) {
      const document = documents[position],
        index = indexes[position];
      if (path.endsWith('/query')) {
        const query = route.request().postDataJSON();
        queries.push(query);
        // Opening a moment also lists its relationships.
        if (query.kind === 'related')
          return route.fulfill({ json: { related: [], next: null, reachable: 0, direct: 0 } });
        if (query.kind === 'events')
          return route.fulfill({
            json: localEvents(index, query.lower, query.upper, query.after, query.limit),
          });
        const view = new Viewport(
          Q.parse(query.lower),
          Q.parse(query.upper).sub(Q.parse(query.lower)),
        );
        const frame = index.frame(
          view,
          1000,
          Q.parse(query.threshold).div(view.span).toApproximateNumber() * 1000,
        );
        return route.fulfill({ json: frame });
      }
      return route.fulfill({
        json: {
          id: ids[position],
          title: document.title,
          description: '',
          revision: revisions[position],
          presentation: document.presentation,
          owner: 'seed',
          visibility: 'public',
          canEdit: false,
          event_count: '1',
          first: index.points.minKey().toString(),
          last: index.points.maxKey().toString(),
        },
      });
    }
    if (path === '/editor/frame')
      return route.fulfill({
        contentType: 'text/html',
        body: (await readFile(resolve('dist/index.html'), 'utf8'))
          .replace('./app.js', '/app.js')
          .replace('./app.css', '/app.css'),
      });
    if (path.endsWith('.js') || path.endsWith('.css'))
      return route.fulfill({
        contentType: path.endsWith('.js') ? 'text/javascript' : 'text/css',
        body: await readFile(resolve('dist', path.slice(1))),
      });
    return route.fulfill({ status: 404, json: { error: 'Unexpected request: ' + path } });
  });
  const page = await context.newPage();
  page.on('pageerror', (error) => errors.push(error.message));
  try {
    await page.goto('http://localhost:5173/editor/frame#compare/' + ids.join(','));
    await page.locator('#compare-format-dialog').waitFor({ state: 'visible' });
    await page.locator('#compare-format-dialog button[value="apply"]').click();
    await page.locator('#comparison-settings').waitFor({ state: 'visible' });
    await page.waitForFunction(() => document.querySelectorAll('.event-marker').length === 2);
    assert.equal(await page.locator('#add-button').isVisible(), false);
    const y = await page
      .locator('.event-marker')
      .evaluateAll((nodes) => nodes.map((n) => n.getBoundingClientRect().y));
    assert(Math.abs(y[0] - y[1]) > 40);
    const scale = page.getByRole('textbox', { name: 'Scale for Compare source 1' });
    await scale.fill('2');
    await page
      .locator('.comparison-track')
      .nth(1)
      .getByRole('button', { name: 'Apply alignment' })
      .click();
    await page.locator('#fit-button').click();
    await page.waitForFunction(() =>
      [...document.querySelectorAll('.event-marker')].some((n) => n.dataset.first === '20/1'),
    );
    await page.locator('#compare-combined').check();
    await page.waitForFunction(
      () =>
        new Set(
          [...document.querySelectorAll('.event-marker')].map((n) => n.getBoundingClientRect().y),
        ).size === 1,
    );
    await page.locator('.event-marker').first().click();
    await page.waitForFunction(() => document.getElementById('event-time').disabled);
    assert(await page.locator('#event-title').isDisabled());
    await closeMomentDetails(page);
    await page.locator('#compare-combined').uncheck();
    assert(await page.locator('#comparison-settings').isVisible());
    documents[0].events = [{ id: 'new', time: '15/1', metadata: { title: 'New live moment' } }];
    indexes[0] = new TimelineIndex(documents[0]);
    revisions[0] = '2';
    await page.evaluate(
      (id) =>
        window.liveStreams
          .at(-1)
          .dispatchEvent(
            new MessageEvent('revision', { data: JSON.stringify({ id, revision: '2' }) }),
          ),
      ids[0],
    );
    await page
      .getByRole('button', { name: 'New live moment', exact: true })
      .waitFor({ state: 'visible' });
    await page.waitForFunction(
      () =>
        ![...document.querySelectorAll('.event-marker')].some(
          (n) => n.getAttribute('aria-label') === 'Moment 0',
        ),
    );
    assert(queries.some((query) => query.revision === '2' && query.kind === 'overview'));
    assert(queries.every((query) => query.kind !== 'events' || query.limit <= 25));
    // Named saved comparisons use the ordinary public timeline route, without materializing a document.
    await page.goto('http://localhost:5173/editor/frame#timeline/' + savedId);
    await page.locator('#comparison-settings').waitFor({ state: 'visible' });
    await page.waitForFunction(() => document.querySelectorAll('.event-marker').length === 2);
    assert.equal(await page.locator('#timeline-title').inputValue(), 'World War II');
    assert.equal(await page.locator('#add-button').isVisible(), false);
    assert.equal(await page.locator('#guest-fork-button').isVisible(), false);
    await page.locator('#compare-format-dialog').waitFor({ state: 'hidden' });
    assert.equal(await page.locator('.comparison-track').count(), 2);
    assert.match(await page.locator('#event-count').textContent(), /Read-only comparison/);
    assert.equal(errors.length, 0, errors.join('\n'));
  } finally {
    await context.close();
  }
}
