// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// Browser drafts in the editor (#188): restored, stored per record, one per timeline.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
/**
 * Signed-in browser drafts: an old whole-document draft still restores and is converted to
 * per-record storage; later edits store only their own records and survive a reload. Each
 * timeline started is a draft of its own (#188): listed on the dashboard, opened by address,
 * deleted there, gone once saved to the server, and only its account's.
 */
export async function checkDrafts(browser) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  // Who is signed in, and whether the server shows its dashboard.
  const account = { id: 'drafter', dashboard: false };
  await context.route('http://localhost:5173/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/session')
      return route.fulfill({
        json: {
          user: { id: account.id, username: account.id },
          csrf: 'csrf',
          server: true,
          dashboard: account.dashboard,
        },
      });
    // Saving a draft to the server.
    if (path === '/api/timelines' && route.request().method() === 'POST') {
      const document = route.request().postDataJSON();
      return route.fulfill({
        status: 201,
        json: {
          id: '00000000-0000-0000-0000-0000000000aa',
          title: document.title,
          description: document.description,
          revision: '1',
          event_count: String(document.events.length),
          owner: account.id,
          slug: null,
          visibility: 'private',
          canEdit: true,
          canWrite: true,
          canShare: true,
        },
      });
    }
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
  const poll = async (predicate) => {
    for (let i = 0; i < 100; i++) {
      if (await predicate()) return;
      await page.waitForTimeout(100);
    }
    throw new Error('Timed out');
  };
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
    assert.match(await page.locator('#event-count').textContent(), /3 moments/);
    // Opening stores the draft record by record and drops the old whole document.
    await saved();
    let keys = await stored();
    assert.deepEqual(keys.drafts.sort(), ['registry', 'settings']);
    assert.deepEqual(keys['draft-moments'].sort(), ['a', 'b', 'c']);
    assert.deepEqual(keys['draft-durations'], ['span']);
    assert.equal(keys['draft-links'].length, 1);
    // Edits store only their own records.
    await page.locator('#save-status').evaluate((node) => (node.textContent = ''));
    await page.locator('#add-button').click();
    await page.locator('#event-title').fill('Added in a draft');
    await page.locator('#event-time').fill('15/1');
    await page.waitForFunction(() =>
      document.getElementById('event-edit-status').textContent.startsWith('Not on the timeline'),
    );
    await page.locator('#event-save').click();
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
    assert.match(await page.locator('#event-count').textContent(), /4 moments/);
    await page.getByRole('button', { name: 'Added in a draft', exact: true }).waitFor();

    // Another timeline is a draft of its own: the first is kept, so nothing asks.
    const asked = [];
    page.on('dialog', (dialog) => {
      asked.push(dialog.message());
      void dialog.accept();
    });
    const list = () =>
      page.evaluate(
        () =>
          new Promise((done, fail) => {
            const request = indexedDB.open('openchronology');
            request.onerror = () => fail(request.error);
            request.onsuccess = () => {
              const tx = request.result.transaction('drafts');
              const read = tx.objectStore('drafts').get('registry');
              tx.oncomplete = () => {
                request.result.close();
                done((read.result ?? []).map((d) => `${d.title}:${d.moments}:${d.owner}`).sort());
              };
            };
          }),
      );
    await page.locator('#new-button').click();
    await page.waitForFunction(
      () => document.getElementById('timeline-title').value === 'Untitled timeline',
    );
    assert.deepEqual(asked, [], 'Starting a timeline asked about the draft');
    // An untouched new timeline is not a draft yet; edited, it is.
    assert.deepEqual(await list(), ['Edited draft:4:drafter']);
    await page.locator('#timeline-title').fill('Second draft');
    await page.locator('#timeline-title').press('Tab');
    await saved();
    await poll(async () => (await list()).length === 2);
    assert.deepEqual(await list(), ['Edited draft:4:drafter', 'Second draft:0:drafter']);
    // An imported file is a draft at once; the sample, untouched, is not.
    await page.locator('#json-file').setInputFiles({
      name: 'imported.ochx',
      mimeType: 'application/json',
      buffer: Buffer.from(
        JSON.stringify({
          format: 'openchronology',
          version: 1,
          title: 'Imported draft',
          description: '',
          events: [{ id: 'i', time: '1/1', metadata: { title: 'Imported' } }],
        }),
      ),
    });
    await poll(async () => (await list()).includes('Imported draft:1:drafter'));
    await page.locator('#dashboard-demo').evaluate((button) => button.click());
    await page.waitForFunction(
      () => document.getElementById('timeline-title').value !== 'Imported draft',
    );
    await page.waitForTimeout(1000);
    assert.equal((await list()).length, 3);
    assert.deepEqual(asked, []);

    // The dashboard lists them, newest first, to open or delete.
    account.dashboard = true;
    await page.goto('http://localhost:5173/');
    const drafts = page.locator('#dashboard-drafts');
    await drafts.waitFor();
    assert.deepEqual(await drafts.locator('.draft-open').allTextContents(), [
      'Imported draft',
      'Second draft',
      'Edited draft',
    ]);
    assert.match(await drafts.locator('article').first().textContent(), /1 moment · edited /);
    await drafts.getByRole('button', { name: 'Second draft', exact: true }).click();
    await page.waitForFunction(
      () => document.getElementById('timeline-title').value === 'Second draft',
    );
    await page.goto('http://localhost:5173/');
    await drafts.waitFor();
    await drafts.getByRole('button', { name: 'Delete the draft “Imported draft”' }).click();
    await poll(async () => (await drafts.locator('.draft-open').count()) === 2);
    assert.match(asked.at(-1), /Delete the draft “Imported draft” from this browser for good\?/);
    assert.equal((await list()).length, 2);
    // Opened by address (the website's dashboard links to /editor?draft=…).
    account.dashboard = false;
    const registry = await page.evaluate(
      () =>
        new Promise((done) => {
          const request = indexedDB.open('openchronology');
          request.onsuccess = () => {
            const tx = request.result.transaction('drafts');
            const read = tx.objectStore('drafts').get('registry');
            tx.oncomplete = () => {
              request.result.close();
              done(read.result);
            };
          };
        }),
    );
    const edited = registry.find((d) => d.title === 'Edited draft');
    await page.goto('http://localhost:5173/?draft=' + edited.id);
    await page.waitForFunction(
      () => document.getElementById('timeline-title').value === 'Edited draft',
    );
    // Saved to the server, a draft is a draft no more.
    await page.locator('#publish-button').click();
    await page.waitForFunction(
      () => document.getElementById('save-status').textContent === 'Saved on the server',
    );
    await poll(async () => (await list()).length === 1);
    assert.deepEqual(await list(), ['Second draft:0:drafter']);
    // Another account in this browser sees none of them.
    account.id = 'someone-else';
    account.dashboard = true;
    await page.goto('http://localhost:5173/');
    await page.locator('#dashboard').waitFor();
    await page.waitForTimeout(500);
    assert(await drafts.isHidden());
    assert.deepEqual(errors, []);
    console.log(
      'PASS drafts: legacy drafts convert; edits store their own records and reload; each timeline is a draft of its own, listed, opened, deleted, gone once saved, and only its account’s.',
    );
  } finally {
    await context.close();
  }
}
