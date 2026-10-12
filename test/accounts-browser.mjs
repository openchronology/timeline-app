// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { MOMENT_ICONS } from '../dist/core.mjs';
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
  // Firefox's interception API omits Blob request bodies; inspect the actual fetch
  // input as well, without substituting a different upload implementation.
  await context.addInitScript(() => {
    const fetch = window.fetch.bind(window);
    window.fetch = async (url, options) => {
      if (String(url).endsWith('/api/files/import') && options?.body instanceof Blob)
        window.importHeader = Array.from(
          new Uint8Array(await options.body.slice(0, 16).arrayBuffer()),
        );
      return fetch(url, options);
    };
  });
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
      const bytes =
        request.postDataBuffer() ??
        Buffer.from(await request.frame().evaluate(() => window.importHeader));
      assert(bytes.subarray(0, 16).equals(Buffer.from('SQLite format 3\0')));
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
      await page.locator(`[data-provider="${provider}"]`).waitFor({ state: 'visible' });
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
  // The native process keeps one connection per server, each with its own sign-in (#85).
  const desktop = await browser.newContext();
  await desktop.addInitScript((plugin) => {
    window.nativeCalls = [];
    let servers = ['https://timescale.info'];
    const users = {};
    let serverDocument;
    const second = 'https://second.example',
      secondTimeline = '00000000-0000-0000-0000-000000000002';
    window.__TAURI__ = {
      core: {
        async invoke(command, args) {
          window.nativeCalls.push({ command, args });
          if (command === 'desktop_servers') return [...servers];
          if (command === 'desktop_connect') {
            const origin = new URL(args.origin).origin;
            servers = [origin, ...servers.filter((s) => s !== origin)];
            return;
          }
          if (command === 'desktop_disconnect') {
            servers = servers.filter((s) => s !== args.origin);
            delete users[args.origin];
            return;
          }
          if (!['desktop_save'].includes(command) && !servers.includes(args.server))
            throw new Error('Connect to this server first');
          if (command === 'desktop_auth_start')
            return {
              userCode: 'ABCDEFGH23',
              verificationUri: args.server + '/#desktop/ABCDEFGH23',
              expiresIn: 600,
              browserOpened: true,
            };
          if (command === 'desktop_auth_poll') {
            users[args.server] =
              args.server === second
                ? { id: 'v', username: 'elsewhere' }
                : { id: 'u', username: 'account' };
            return { user: users[args.server], csrf: 'test-csrf' };
          }
          if (command === 'desktop_save')
            return {
              path: '/tmp/local.och',
              generation: 1,
              event_count: String(args.document.events.length),
              document: { ...args.document, events: [] },
            };
          if (command === 'desktop_request') {
            const { server, path, method, data } = args;
            const user = users[server] ?? null;
            const metadata = (id, title) => ({
              id,
              title,
              description: '',
              revision: '1',
              event_count: '0',
              owner: user?.username,
              visibility: 'private',
              canEdit: true,
              canShare: true,
            });
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
                : path === 'auth/logout'
                  ? ((users[server] = null), { ok: true })
                  : path === 'timelines/search'
                    ? {
                        timelines:
                          data.scope === 'mine' && user
                            ? [
                                {
                                  id:
                                    server === second
                                      ? secondTimeline
                                      : '00000000-0000-0000-0000-000000000001',
                                  title:
                                    server === second
                                      ? 'Second server notes'
                                      : 'First server notes',
                                  description: '',
                                  owner: user.username,
                                  featured: false,
                                  visibility: 'private',
                                  event_count: '0',
                                },
                              ]
                            : [],
                        pages: data.scope === 'mine' && user ? 1 : 0,
                        total: data.scope === 'mine' && user ? 1 : 0,
                      }
                    : path === 'plugins/search'
                      ? { plugins: [plugin], total: 1, pages: 1, page: 1 }
                      : path === 'timelines' && method === 'GET'
                        ? {
                            timelines:
                              server === second && user
                                ? [
                                    {
                                      id: secondTimeline,
                                      title: 'Second server notes',
                                      visibility: 'private',
                                      role: 'owner',
                                    },
                                  ]
                                : [],
                          }
                        : path === 'timelines'
                          ? {
                              ...metadata('00000000-0000-0000-0000-000000000001', data.title),
                              description: data.description,
                              presentation: data.presentation,
                              event_count: String(data.events.length),
                            }
                          : path === 'timelines/' + secondTimeline && server === second
                            ? metadata(secondTimeline, 'Second server notes')
                            : path.endsWith('/revision')
                              ? { id: path.split('/')[1], revision: '1' }
                              : path.endsWith('/document')
                                ? {
                                    document:
                                      server === second
                                        ? {
                                            format: 'openchronology',
                                            version: 1,
                                            title: 'Second server notes',
                                            description: '',
                                            events: [],
                                          }
                                        : serverDocument,
                                  }
                                : path.endsWith('/query')
                                  ? { groups: [], visitedNodes: 0 }
                                  : path.endsWith('/members')
                                    ? { members: [] }
                                    : null;
            if (!body) throw new Error('Unexpected native API ' + server + ' ' + path);
            return { status: method === 'POST' ? 201 : 200, body };
          }
          throw new Error('Unexpected native command ' + command);
        },
      },
    };
  }, MOMENT_ICONS);
  await desktop.route(origin + '/**', async (route) => {
    assert(
      !new URL(route.request().url()).pathname.startsWith('/api/'),
      'Desktop attempted browser HTTP',
    );
    await assets(route);
  });
  const nativePage = await desktop.newPage();
  nativePage.on('pageerror', (error) => errors.push(error.message));
  const requestsTo = (server) =>
    nativePage.evaluate(
      (server) =>
        window.nativeCalls
          .filter((c) => c.command === 'desktop_request' && c.args.server === server)
          .map((c) => c.args.path),
      server,
    );
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
    await poll(() => nativePage.locator('#publish-button').isEnabled());
    await nativePage.locator('#share-button').click();
    assert.equal(
      await nativePage.locator('#sharing-link').textContent(),
      'https://timescale.info/timelines/00000000-0000-0000-0000-000000000001',
    );
    await nativePage.locator('[data-close="sharing-dialog"]').click();
    await nativePage.locator('#sharing-dialog').waitFor({ state: 'hidden' });
    // With one server, nothing says which server items come from.
    assert(await nativePage.locator('#timeline-server').isHidden());
    await nativePage.locator('#timeline-title').fill('Edited locally and remotely');
    await nativePage.locator('#timeline-title').dispatchEvent('change');
    await nativePage.locator('#sqlite-save').click();
    await poll(() =>
      nativePage.evaluate(() => window.nativeCalls.some((c) => c.command === 'desktop_save')),
    );
    assert.equal(await nativePage.locator('#save-status').textContent(), 'Unsaved server changes');

    // A second server, signed in to as well: the first keeps its sign-in.
    await nativePage.locator('#server-button').click();
    const official = nativePage.locator('.server-row[data-server="https://timescale.info"]');
    assert.match(await official.textContent(), /In use · @account/);
    // The open timeline is the server in use's, so that one stays in use.
    await nativePage.locator('#server-origin').fill('https://second.example');
    await nativePage.locator('#connection-form [type="submit"]').click();
    const secondRow = nativePage.locator('.server-row[data-server="https://second.example"]');
    await poll(async () => /Not signed in/.test(await secondRow.textContent()));
    assert(await secondRow.locator('[data-action="use"]').isDisabled());
    await secondRow.locator('[data-action="sign-in"]').click();
    await poll(async () => /@elsewhere/.test(await secondRow.textContent()));
    assert.match(await official.textContent(), /In use · @account/);
    assert.equal(
      await nativePage.locator('#account-button').textContent(),
      '@account · timescale.info',
    );
    assert.equal(await nativePage.locator('#server-button').textContent(), 'Servers (2)');
    assert.equal(await nativePage.locator('#timeline-server').textContent(), 'timescale.info');
    await nativePage.locator('[data-close="connection-dialog"]').click();
    // The dashboard lists the timelines of every server signed in to, each with its server.
    // Replacing the edited timeline asks first.
    nativePage.on('dialog', (dialog) => dialog.accept());
    await nativePage.locator('#dashboard-home').click();
    const mine = nativePage.locator('#dashboard-mine-list article');
    await poll(async () => (await mine.count()) === 2);
    const listed = mine.filter({ hasText: 'Second server notes' }),
      first = mine.filter({ hasText: 'First server notes' });
    assert.equal(await listed.locator('.server-chip').textContent(), 'second.example');
    assert.equal(await first.locator('.server-chip').textContent(), 'timescale.info');
    assert.equal(
      await nativePage.locator('#dashboard-mine-status').textContent(),
      '2 timelines · Page 1 of 1',
    );
    // Comparisons are of the server in use's timelines.
    assert(await first.locator('input[type="checkbox"]').isEnabled());
    assert(await listed.locator('input[type="checkbox"]').isDisabled());
    // Opening one there uses that server: its requests go there, with its own sign-in.
    await nativePage.evaluate(() => {
      window.nativeCalls = [];
    });
    await listed.locator('a', { hasText: 'Second server notes' }).click();
    await poll(
      async () =>
        (await nativePage.locator('#timeline-title').inputValue()) === 'Second server notes',
    );
    assert.match(
      await nativePage.evaluate(() => location.hash),
      /^#server\/https%3A%2F%2Fsecond\.example\/timeline\/00000000-0000-0000-0000-000000000002$/,
    );
    assert.equal(await nativePage.locator('#timeline-server').textContent(), 'second.example');
    assert.equal(
      await nativePage.locator('#account-button').textContent(),
      '@elsewhere · second.example',
    );
    assert.deepEqual(await requestsTo('https://timescale.info'), []);
    assert(
      (await requestsTo('https://second.example')).includes(
        'timelines/00000000-0000-0000-0000-000000000002',
      ),
    );
    // Each server's plugin library, its plugins marked with their server.
    await nativePage.locator('#plugins-button').click();
    await nativePage.locator('#plugins-add').click();
    const pluginServer = nativePage.locator('#plugin-server');
    assert(await pluginServer.isVisible());
    assert.equal(await pluginServer.inputValue(), 'https://second.example');
    const chip = nativePage.locator('#plugin-library-results .server-chip');
    await chip.waitFor();
    assert.equal(await chip.textContent(), 'second.example');
    await pluginServer.selectOption('https://timescale.info');
    await poll(async () => (await chip.textContent()) === 'timescale.info');
    assert((await requestsTo('https://timescale.info')).includes('plugins/search'));
    await nativePage.locator('[data-close="plugin-library-dialog"]').click();
    await nativePage.locator('[data-close="plugins-dialog"]').click();

    // Signing out of one server leaves the other signed in.
    await nativePage.locator('#server-button').click();
    await official.locator('[data-action="sign-out"]').click();
    await poll(async () => /Not signed in/.test(await official.textContent()));
    assert.match(await secondRow.textContent(), /In use · @elsewhere/);
    // Disconnecting the server in use keeps its timeline as a local copy and uses the other.
    await secondRow.locator('[data-action="disconnect"]').click();
    await poll(async () => (await nativePage.locator('.server-row').count()) === 1);
    await poll(
      async () =>
        (await nativePage.evaluate(() => document.documentElement.dataset.storage)) === 'memory',
    );
    assert.equal(await nativePage.locator('#timeline-title').inputValue(), 'Second server notes');
    assert.equal(await nativePage.locator('#server-button').textContent(), 'Server connection');
    assert.equal(await nativePage.locator('#account-button').textContent(), 'Sign in');
    assert(await nativePage.locator('#timeline-server').isHidden());
    assert.equal(await nativePage.locator('#timeline-list .server-chip').count(), 0);
    // And with none left, local files go on working.
    await official.locator('[data-action="disconnect"]').click();
    await poll(async () => await nativePage.locator('#publish-button').isHidden());
    assert.equal(await nativePage.locator('#timeline-title').inputValue(), 'Second server notes');
    assert(await nativePage.locator('#account-button').isDisabled());
    assert.deepEqual(errors, []);
  } finally {
    await desktop.close();
  }
  console.log(
    'PASS account UI: providers, CSRF, revocation, server-mediated .och exchange, native sign-in/transport, independent local/cloud saves, and several servers signed in at once with their items marked.',
  );
}
