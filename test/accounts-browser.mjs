// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const origin = 'http://localhost:5173';
const document = {
  format: 'openchronology',
  version: 1,
  title: 'Imported SQLite',
  description: '',
  events: [{ id: 'imported', time: '1/3', metadata: { title: 'Exact' } }],
};
const poll = async (predicate) => {
  for (let n = 0; n < 100; n++) {
    if (await predicate()) return;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error('Account UI assertion timed out');
};
async function assets(route) {
  const url = new URL(route.request().url()),
    name = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
  assert(
    /^(index\.html|app\.(js|css)(\.map)?)$/.test(name),
    'Unexpected browser resource: ' + name,
  );
  await route.fulfill({
    body: await readFile(resolve('dist', name)),
    contentType: name.endsWith('.html')
      ? 'text/html'
      : name.endsWith('.css')
        ? 'text/css'
        : 'text/javascript',
  });
}
export async function checkAccounts(browser) {
  const context = await browser.newContext({ acceptDownloads: true }),
    errors = [],
    writes = [];
  let user = null;
  await context.route(origin + '/**', async (route) => {
    const request = route.request(),
      path = new URL(request.url()).pathname;
    if (!path.startsWith('/api/')) return assets(route);
    const input = request.headers()['content-type']?.startsWith('application/json')
      ? request.postDataJSON()
      : null;
    if (request.method() === 'POST') {
      assert.equal(request.headers()['x-csrf-token'], 'test-csrf');
      writes.push({ path, input });
    }
    let value;
    if (path === '/api/session')
      value = {
        server: true,
        user,
        csrf: 'test-csrf',
        providers: ['google', 'github', 'facebook'],
        fileExchange: true,
      };
    else if (path === '/api/auth/login') {
      user = { id: 'u', username: 'account' };
      value = { user, csrf: 'test-csrf' };
    } else if (path === '/api/timelines') value = { timelines: [] };
    else if (path === '/api/timelines/search')
      value = { timelines: [], total: 0, page: 1, pages: 0 };
    else if (path === '/api/auth/account')
      value = {
        identities: [],
        sessions: [{ kind: 'web', current: true, created_at: new Date().toISOString() }],
      };
    else if (path === '/api/auth/revoke-others') value = { ok: true };
    else if (path === '/api/auth/google/start') value = { url: origin + '/#provider-test' };
    else if (path === '/api/files/import') {
      assert(request.postDataBuffer().subarray(0, 16).equals(Buffer.from('SQLite format 3\0')));
      value = { document };
    } else if (path === '/api/files/export')
      return route.fulfill({
        body: Buffer.from('SQLite format 3\0test'),
        contentType: 'application/vnd.openchronology.sqlite',
      });
    else throw new Error('Unexpected account UI API: ' + path);
    await route.fulfill({ json: value });
  });
  const page = await context.newPage();
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('dialog', (dialog) => dialog.accept());
  try {
    await page.goto(origin);
    await page.locator('#dashboard-new').click();
    assert(await page.locator('#och-import').isHidden());
    assert.equal(await page.locator('#calendar-mode').count(), 0);
    await page.locator('#account-button').click();
    for (const provider of ['google', 'github', 'facebook'])
      assert(await page.locator(`[data-provider="${provider}"]`).isVisible());
    await page.locator('#account-name').fill('account');
    await page.locator('#account-password').fill('testing account password');
    await page.locator('button[value="login"]').click();
    await poll(async () => (await page.locator('#account-button').textContent()) === '@account');
    assert.equal(await page.locator('#account-password').inputValue(), '');
    await page.locator('#dashboard-new').click();
    await page.locator('#timeline-title').fill('Pending OAuth edits');
    await page.locator('#timeline-title').dispatchEvent('change');
    await page.locator('#account-button').click();
    assert(await page.locator('#password-fields').isHidden());
    await page.locator('#revoke-sessions').click();
    await poll(() => writes.some((w) => w.path === '/api/auth/revoke-others'));
    await page.locator('[data-provider="google"]').click();
    await poll(() => writes.some((w) => w.path === '/api/auth/google/start'));
    assert.equal(writes.find((w) => w.path === '/api/auth/google/start').input.link, true);
    await poll(() => page.url().endsWith('#provider-test'));
    await page.reload();
    await poll(
      async () => (await page.locator('#timeline-title').inputValue()) === 'Pending OAuth edits',
    );
    await page.locator('#och-file').setInputFiles({
      name: 'timeline.och',
      mimeType: 'application/vnd.openchronology.sqlite',
      buffer: Buffer.from('SQLite format 3\0test'),
    });
    await poll(
      async () => (await page.locator('#timeline-title').inputValue()) === 'Imported SQLite',
    );
    const exported = page.waitForEvent('download');
    await page.locator('#och-export').click();
    assert.match((await exported).suggestedFilename(), /\.och$/);
    const json = page.waitForEvent('download');
    await page.locator('#export-button').click();
    assert.match((await json).suggestedFilename(), /\.ochx$/);
    assert.equal(writes.find((w) => w.path === '/api/files/export').input.events[0].time, '1/3');
    assert.deepEqual(errors, []);
  } finally {
    await context.close();
  }
  // Mock only the native boundary: the actual frontend must route all cloud traffic through it.
  const desktop = await browser.newContext();
  await desktop.addInitScript(() => {
    window.nativeCalls = [];
    let user = null;
    let origin = 'https://timescale.info';
    let serverDocument;
    window.__TAURI__ = {
      core: {
        async invoke(command, args) {
          window.nativeCalls.push({ command, args });
          if (command === 'desktop_server') return origin;
          if (command === 'desktop_connect') {
            origin = args.origin;
            user = null;
            return;
          }
          if (command === 'desktop_auth_start')
            return {
              userCode: 'ABCDEFGH23',
              verificationUri: 'https://timescale.info/#desktop/ABCDEFGH23',
              expiresIn: 600,
              browserOpened: true,
            };
          if (command === 'desktop_auth_poll') {
            user = { id: 'u', username: 'account' };
            return { user, csrf: 'test-csrf' };
          }
          if (command === 'desktop_save')
            return {
              path: '/tmp/local.och',
              generation: 1,
              event_count: String(args.document.events.length),
              document: { ...args.document, events: [] },
            };
          if (command === 'desktop_request') {
            const { path, method, data } = args;
            if (path === 'timelines' && method === 'POST') serverDocument = data;
            const body =
              path === 'session'
                ? {
                    server: true,
                    user,
                    csrf: 'test-csrf',
                    providers: ['google', 'github', 'facebook'],
                    fileExchange: true,
                  }
                : path === 'timelines' && method === 'GET'
                  ? { timelines: [] }
                  : path === 'timelines'
                    ? {
                        id: '00000000-0000-0000-0000-000000000001',
                        title: data.title,
                        description: data.description,
                        presentation: data.presentation,
                        revision: '1',
                        event_count: String(data.events.length),
                        owner: 'account',
                        visibility: 'private',
                        canEdit: true,
                        canShare: true,
                      }
                    : path.endsWith('/revision')
                      ? { id: path.split('/')[1], revision: '1' }
                      : path.endsWith('/document')
                        ? { document: serverDocument }
                        : path.endsWith('/query')
                          ? { groups: [], visitedNodes: 0 }
                          : path.endsWith('/members')
                            ? { members: [] }
                            : null;
            if (!body) throw new Error('Unexpected native API ' + path);
            return { status: method === 'POST' ? 201 : 200, body };
          }
          throw new Error('Unexpected native command ' + command);
        },
      },
    };
  });
  await desktop.route(origin + '/**', async (route) => {
    assert(
      !new URL(route.request().url()).pathname.startsWith('/api/'),
      'Desktop attempted browser HTTP',
    );
    await assets(route);
  });
  const nativePage = await desktop.newPage();
  nativePage.on('pageerror', (error) => errors.push(error.message));
  try {
    await nativePage.goto(origin);
    await poll(() => nativePage.locator('#server-button').isVisible());
    await nativePage.locator('#account-button').click();
    assert(await nativePage.locator('#desktop-login').isVisible());
    for (const provider of ['google', 'github', 'facebook'])
      assert(await nativePage.locator(`[data-provider="${provider}"]`).isHidden());
    await nativePage.locator('#desktop-login').click();
    await poll(
      async () => (await nativePage.locator('#account-button').textContent()) === '@account',
    );
    await nativePage.locator('#publish-button').click();
    await poll(
      async () =>
        (await nativePage.locator('#save-status').textContent()) === 'Saved on the server',
    );
    await nativePage.locator('#share-button').click();
    assert.equal(
      await nativePage.locator('#sharing-link').textContent(),
      'https://timescale.info/timelines/00000000-0000-0000-0000-000000000001',
    );
    await nativePage.locator('[data-close="sharing-dialog"]').click();
    await nativePage.locator('#timeline-title').fill('Edited locally and remotely');
    await nativePage.locator('#timeline-title').dispatchEvent('change');
    await nativePage.locator('#sqlite-save').click();
    await poll(() =>
      nativePage.evaluate(() => window.nativeCalls.some((c) => c.command === 'desktop_save')),
    );
    assert.equal(await nativePage.locator('#save-status').textContent(), 'Unsaved server changes');
    await nativePage.locator('#server-button').click();
    assert.equal(await nativePage.locator('#server-origin').inputValue(), 'https://timescale.info');
    await nativePage.locator('#server-disconnect').click();
    await poll(async () => await nativePage.locator('#publish-button').isHidden());
    assert.equal(
      await nativePage.locator('#timeline-title').inputValue(),
      'Edited locally and remotely',
    );
    assert.deepEqual(errors, []);
  } finally {
    await desktop.close();
  }
  console.log(
    'PASS account UI: providers, CSRF, revocation, server-mediated .och exchange, native sign-in/transport and independent local/cloud saves.',
  );
}
