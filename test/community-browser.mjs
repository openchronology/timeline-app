// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
import assert from 'node:assert/strict';
import { closeMomentDetails } from './moment-dialog-browser.mjs';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { MOMENT_SHAPES, PLUGIN_EXAMPLE, TimelineIndex, Viewport, Q } from '../dist/core.mjs';
export async function checkCommunity(browser) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } }),
    errors = [];
  const id = '11111111-1111-4111-8111-111111111111',
    pid = '22222222-2222-4222-8222-222222222222';
  const document = {
    format: 'openchronology',
    version: 1,
    title: 'Featured timeline',
    description: 'A star map',
    tags: ['astronomy'],
    plugins: [{ manifest: MOMENT_SHAPES, enabled: true }],
    events: [{ id: 'first', time: '0/1', metadata: { title: 'First observation' } }],
  };
  const info = {
    id,
    title: document.title,
    description: document.description,
    tags: document.tags,
    plugins: document.plugins,
    revision: '1',
    visibility: 'public',
    canEdit: true,
    canWrite: false,
    canPropose: true,
    canShare: false,
    owner: 'custodian',
    event_count: '1',
    first: '0/1',
    last: '0/1',
  };
  let proposal = null,
    guest = true,
    storage = true,
    oversizedFork = false,
    comments = [],
    searches = [],
    requests = [];
  await context.addInitScript(() => {
    window.idbOpens = 0;
    const open = IDBFactory.prototype.open;
    IDBFactory.prototype.open = function (...args) {
      window.idbOpens++;
      return open.apply(this, args);
    };
  });
  await context.route('http://localhost:5173/**', async (route) => {
    const url = new URL(route.request().url()),
      path = url.pathname,
      method = route.request().method(),
      value = method === 'POST' || method === 'PUT' ? route.request().postDataJSON() : null;
    if (path === '/api/session')
      return route.fulfill({
        json: {
          server: storage,
          dashboard: true,
          user: guest ? null : { id: '33333333-3333-4333-8333-333333333333', username: 'alice' },
          csrf: guest ? null : 'test-csrf',
        },
      });
    if (path === '/api/timelines')
      return route.fulfill({
        json: {
          timelines: [{ id, title: 'My private timeline', visibility: 'private', role: 'owner' }],
        },
      });
    if (path === '/api/timelines/search') {
      assert(!guest || value.scope === 'public', 'Guests must not request owned timelines');
      searches.push(value);
      const mine = value.scope === 'mine';
      const page = value.page ?? 1;
      return route.fulfill({
        json: {
          timelines: [
            {
              ...info,
              title: mine
                ? 'My private timeline'
                : page === 1
                  ? 'Featured timeline'
                  : 'Another timeline',
              description: 'A star map',
              featured: !mine && page === 1,
              visibility: mine ? 'private' : 'public',
              tags: ['astronomy'],
            },
          ],
          page,
          pages: 2,
          total: 14,
        },
      });
    }
    if (path === `/api/timelines/${id}/revision`)
      return route.fulfill({ json: { id, revision: info.revision } });
    if (path === `/api/timelines/${id}`)
      return route.fulfill({ json: { ...info, canEdit: !guest, canPropose: !guest } });
    if (path === `/api/timelines/${id}/browser-fork`)
      return oversizedFork
        ? route.fulfill({
            status: 413,
            json: {
              error:
                'This timeline exceeds the browser fork limit (5,000 moments or 4 MiB). Nothing was copied or truncated.',
            },
          })
        : route.fulfill({ json: { document } });
    if (path === `/api/timelines/${id}/document`)
      return route.fulfill({ json: { timeline: info, document } });
    if (path === `/api/timelines/${id}/query`) {
      if (value.kind === 'events')
        return route.fulfill({
          json: { events: document.events, next: null, revision: info.revision },
        });
      const view = new Viewport(
        Q.parse(value.lower),
        Q.parse(value.upper).sub(Q.parse(value.lower)),
      );
      return route.fulfill({
        json: {
          ...new TimelineIndex(document).frame(
            view,
            1000,
            Q.parse(value.threshold).div(view.span).toApproximateNumber() * 1000,
          ),
          revision: info.revision,
        },
      });
    }
    const prefix = `/api/timelines/${id}/proposals`;
    if (path === prefix && method === 'POST') {
      requests.push(value);
      proposal = {
        ...value,
        id: pid,
        author: 'alice',
        author_id: '33333333-3333-4333-8333-333333333333',
        status: 'open',
        revision: '1',
        base_revision: value.baseRevision,
        base_document: document,
        canMerge: false,
        canUpdate: true,
        canClose: true,
        upstreamRevision: '1',
      };
      return route.fulfill({ status: 201, json: proposal });
    }
    if (path === prefix + '/search')
      return route.fulfill({
        json: { proposals: proposal ? [proposal] : [], total: proposal ? 1 : 0, pages: 1, page: 1 },
      });
    if (path === prefix + '/' + pid) return route.fulfill({ json: proposal });
    if (path === prefix + '/' + pid + '/comments/search')
      return route.fulfill({ json: { comments, next: null } });
    if (path === prefix + '/' + pid + '/comments') {
      comments.push({
        id: String(comments.length + 1),
        author: 'alice',
        body: value.body,
        created_at: '2026-10-06T00:00:00Z',
      });
      return route.fulfill({ status: 201, json: { id: String(comments.length) } });
    }
    if (path.startsWith('/api/'))
      return route.fulfill({ status: 404, json: { error: 'Unexpected API ' + path } });
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
  page.on('dialog', (dialog) => dialog.accept());
  try {
    await page.goto('http://localhost:5173/');
    await page
      .locator('#dashboard-browser-list')
      .getByRole('link', { name: 'Featured timeline' })
      .waitFor();
    assert(await page.locator('#dashboard').isVisible());
    assert(await page.locator('.app-layout').isHidden());
    assert(await page.locator('#dashboard-mine').isHidden());
    assert(await page.locator('#dashboard-signin').isVisible());
    assert(searches.length > 0 && searches.every((s) => s.scope === 'public'));
    await page.locator('#dashboard-new').click();
    await page.locator('#timeline-title').fill('Guest local draft');
    await page.locator('#timeline-title').blur();
    await page.waitForFunction(() => document.getElementById('memory-notice').hidden === false);
    await page.reload();
    await page
      .locator('#dashboard-browser-list')
      .getByRole('link', { name: 'Featured timeline' })
      .waitFor();
    assert(await page.locator('.app-layout').isHidden());
    assert(await page.locator('#dashboard-mine').isHidden());
    await page
      .locator('#dashboard-browser-list')
      .getByRole('link', { name: 'Fork in browser' })
      .first()
      .click();
    await page.waitForFunction(() =>
      document.getElementById('guest-fork-status').textContent.includes('Browser fork ready'),
    );
    assert(await page.locator('#memory-notice').isVisible());
    assert(await page.locator('#publish-button').isHidden());
    await page.getByRole('button', { name: 'First observation', exact: true }).click();
    await page.locator('#event-title').fill('Guest changed observation');
    await page.waitForFunction(() =>
      document.querySelector('.event-marker[aria-label="Guest changed observation"]'),
    );
    const downloading = page.waitForEvent('download');
    await closeMomentDetails(page);
    await page.locator('#export-button').click();
    const exported = JSON.parse(await readFile(await (await downloading).path(), 'utf8'));
    assert.equal(exported.events[0].metadata.title, 'Guest changed observation');
    assert.equal(exported.events[0].time, '0/1');
    assert.deepEqual(exported.plugins, document.plugins);
    assert.equal(await page.evaluate(() => window.idbOpens), 0);
    // Over-budget copying leaves the original bounded, read-only view in place.
    await page.goto('http://localhost:5173/#timeline/' + id);
    await page.locator('#guest-fork-button').waitFor({ state: 'visible' });
    oversizedFork = true;
    await page.locator('#guest-fork-button').click();
    await page.waitForFunction(() =>
      document.getElementById('guest-fork-status').textContent.includes('Nothing was copied'),
    );
    assert(await page.locator('#memory-notice').isHidden());
    assert.equal(await page.locator('#timeline-title').inputValue(), document.title);
    assert(await page.locator('#guest-fork-original').isVisible());
    assert.equal(await page.evaluate(() => window.idbOpens), 0);
    await page.goto('http://localhost:5173/');
    storage = false;
    await page.reload();
    await page.waitForFunction(() =>
      document
        .getElementById('dashboard-browser-status')
        .textContent.includes('server is unavailable'),
    );
    assert(await page.locator('#dashboard').isVisible());
    assert(await page.locator('.app-layout').isHidden());
    assert(await page.locator('#dashboard-mine').isHidden());
    storage = true;
    guest = false;
    await page.reload();
    await page
      .locator('#dashboard-mine-list')
      .getByRole('link', { name: 'My private timeline' })
      .waitFor();
    assert(await page.locator('.app-layout').isHidden());
    await page
      .locator('#dashboard-browser-list')
      .getByRole('link', { name: 'Featured timeline' })
      .waitFor({ state: 'visible' });
    await page.locator('#dashboard-browser-next').click();
    await page
      .locator('#dashboard-browser-list')
      .getByRole('link', { name: 'Another timeline' })
      .waitFor();
    await page.locator('#dashboard-search').fill('star map');
    await page.waitForFunction(() =>
      document.getElementById('dashboard-browser-status').textContent.includes('Page 1'),
    );
    assert(searches.some((s) => s.search === 'star map' && s.page === 1));
    await page
      .locator('#dashboard-browser-list')
      .getByRole('button', { name: 'astronomy', exact: true })
      .click();
    await page.waitForTimeout(100);
    assert.equal(await page.locator('#dashboard-tag').inputValue(), 'astronomy');
    await page
      .locator('#dashboard-browser-list')
      .getByRole('link', { name: 'Featured timeline' })
      .click();
    await page.locator('#timeline-title').waitFor();
    assert.equal(await page.locator('#publish-button').textContent(), 'Submit pull request');
    assert(await page.locator('#share-button').isHidden());
    await page.locator('#timeline-title').fill('Proposed title');
    await page.locator('#timeline-title').blur();
    await page.locator('#timeline-tags').fill('astronomy, science');
    await page.locator('#timeline-tags').blur();
    await page.locator('#publish-button').click();
    await page.locator('#proposal-title').fill('Improve title and tags');
    await page.locator('#proposal-body').fill('This is a suggested change.');
    await page.locator('#proposal-submit').click();
    await page.locator('#pull-detail-dialog').waitFor();
    assert.equal(requests[0].document.title, 'Proposed title');
    assert.deepEqual(requests[0].document.tags, ['astronomy', 'science']);
    assert.equal(document.title, 'Featured timeline');
    assert(await page.locator('#pull-merge').isHidden());
    assert(await page.locator('#pull-edit').isVisible());
    await page.locator('#pull-comment').fill('<script>plain text</script>');
    await page
      .locator('#pull-comment-form')
      .getByRole('button', { name: 'Add comment', exact: true })
      .click();
    await page
      .locator('#pull-comments')
      .getByText('<script>plain text</script>', { exact: true })
      .waitFor();
    assert.equal(await page.locator('#pull-comments script').count(), 0);
    await page.locator('#pull-view').click();
    await page.locator('#timeline-title').waitFor();
    assert(await page.locator('#timeline-title').isDisabled());
    assert.equal(await page.locator('#timeline-title').inputValue(), 'Proposed title');
    assert.deepEqual(errors, []);
  } finally {
    await context.close();
  }
}
