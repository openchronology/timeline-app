// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
/**
 * Signed-in browser drafts: an old whole-document draft still restores and is converted to
 * per-record storage; later edits store only their own records and survive a reload.
 */
export async function checkDrafts(browser) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await context.route('http://localhost:5173/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/session')
      return route.fulfill({
        json: {
          user: { id: 'drafter', username: 'drafter' },
          csrf: 'csrf',
          server: true,
          dashboard: false,
        },
      });
    if (path.startsWith('/api/'))
      return route.fulfill({ json: { timelines: [], page: 1, pages: 0, total: 0 } });
    if (path === '/blank')
      return route.fulfill({ body: '<!doctype html>', contentType: 'text/html' });
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
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const stored = () =>
    page.evaluate(
      () =>
        new Promise((done, fail) => {
          const request = indexedDB.open('openchronology');
          request.onerror = () => fail(request.error);
          request.onsuccess = () => {
            const db = request.result;
            const names = [...db.objectStoreNames];
            const tx = db.transaction(names);
            const counts = {};
            for (const name of names) {
              const r = tx.objectStore(name).getAllKeys();
              r.onsuccess = () => (counts[name] = r.result);
            }
            tx.oncomplete = () => {
              db.close();
              done(counts);
            };
          };
        }),
    );
  const saved = () =>
    page.waitForFunction(
      () => document.getElementById('save-status').textContent === 'Saved in this browser',
    );
  try {
    // A draft stored by an earlier version: one whole document under "drafts/current".
    await page.goto('http://localhost:5173/blank');
    await page.evaluate(
      (doc) =>
        new Promise((done, fail) => {
          const request = indexedDB.open('openchronology', 1);
          request.onupgradeneeded = () => request.result.createObjectStore('drafts');
          request.onerror = () => fail(request.error);
          request.onsuccess = () => {
            const tx = request.result.transaction('drafts', 'readwrite');
            tx.objectStore('drafts').put(doc, 'current');
            tx.oncomplete = () => {
              request.result.close();
              done();
            };
          };
        }),
      {
        format: 'openchronology',
        version: 1,
        title: 'Legacy draft',
        description: '',
        events: [
          { id: 'a', time: '0/1', metadata: { title: 'First' } },
          { id: 'b', time: '10/1', metadata: { title: 'Second' } },
          { id: 'c', time: '20/1', metadata: { title: 'Third' } },
        ],
        durations: [{ id: 'span', start: { moment: 'a' }, end: '5/1', metadata: {} }],
        relationships: [{ a: { moment: 'a' }, b: { moment: 'c' } }],
      },
    );
    await page.goto('http://localhost:5173/');
    await page.waitForFunction(
      () => document.getElementById('timeline-title').value === 'Legacy draft',
    );
    assert.match(await page.locator('#event-count').textContent(), /3 events/);
    // Opening stores the draft record by record and drops the old whole document.
    await saved();
    let keys = await stored();
    assert.deepEqual(keys.drafts.sort(), ['settings']);
    assert.deepEqual(keys['draft-moments'].sort(), ['a', 'b', 'c']);
    assert.deepEqual(keys['draft-durations'], ['span']);
    assert.equal(keys['draft-links'].length, 1);
    // Edits store only their own records.
    await page.locator('#save-status').evaluate((node) => (node.textContent = ''));
    await page.locator('#add-button').click();
    await page.locator('#event-title').fill('Added in a draft');
    await page.locator('#event-time').fill('15/1');
    await page.waitForFunction(() =>
      document.getElementById('event-edit-status').textContent.startsWith('Applied to timeline'),
    );
    await page.keyboard.press('Escape');
    await page.locator('#inspector').waitFor({ state: 'hidden' });
    await page.locator('#timeline-title').fill('Edited draft');
    await page.locator('#timeline-title').press('Tab');
    await saved();
    keys = await stored();
    assert.equal(keys['draft-moments'].length, 4);
    // The edits survive a reload.
    await page.reload();
    await page.waitForFunction(
      () => document.getElementById('timeline-title').value === 'Edited draft',
    );
    assert.match(await page.locator('#event-count').textContent(), /4 events/);
    await page.getByRole('button', { name: 'Added in a draft', exact: true }).waitFor();
    assert.deepEqual(errors, []);
    console.log('PASS drafts: legacy drafts convert; edits store their own records and reload.');
  } finally {
    await context.close();
  }
}
