// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// Saved views (#550) on a live server: an API key (as a script or an AI assistant would) makes a
// view with disjoins and unions; its owner opens it in the Views dialog, saves another from what
// is shown and shares it; a reader of the timeline sees the public one, forks it, and opens a
// link to it; the timeline's default view follows the view as it changes. SCREENSHOT_DIR, when
// set, keeps screenshots.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { mkdir, readFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import pg from 'pg';
import { chromium } from 'playwright';
import { Auth } from '../server/auth.mjs';
if (!process.env.DATABASE_URL) throw new Error('Use a dedicated PostgreSQL test database.');
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
await pool.query(await readFile(new URL('../server/schema.sql', import.meta.url), 'utf8'));
const port = Number(process.env.PLATFORM_TEST_PORT ?? 5195),
  origin = `http://127.0.0.1:${port}`;
const env = {
  ...process.env,
  NODE_ENV: 'production',
  APP_ORIGIN: origin,
  OCH_APP_ROOT: process.cwd(),
  NEXT_TELEMETRY_DISABLED: '1',
  PORT: String(port),
  HOSTNAME: '127.0.0.1',
};
for (const key of Object.keys(env))
  if (key.startsWith('OAUTH_') || ['PLUGIN_LIBRARY', 'FEATURED_TIMELINES'].includes(key))
    delete env[key];
const child = spawn(
  process.execPath,
  [resolve(process.env.PLATFORM_TEST_SERVER ?? 'platform/.next/standalone/platform/server.cjs')],
  { env, stdio: ['ignore', 'pipe', 'pipe'] },
);
let logs = '',
  exited = false;
for (const s of [child.stdout, child.stderr])
  s.on('data', (c) => (logs = (logs + c).slice(-12000)));
child.on('exit', () => (exited = true));

const suffix = Date.now().toString(36),
  ownerId = randomUUID(),
  readerId = randomUUID(),
  ownerName = 'viewowner_' + suffix,
  readerName = 'viewreader_' + suffix;
const shots = process.env.SCREENSHOT_DIR;
let browser;
try {
  for (let i = 0; i < 100 && !exited; i++) {
    try {
      if ((await fetch(origin + '/healthz', { signal: AbortSignal.timeout(500) })).ok) break;
    } catch {}
    await delay(200);
  }
  assert(!exited, logs);
  for (const [id, name] of [
    [ownerId, ownerName],
    [readerId, readerName],
  ])
    await pool.query(
      'INSERT INTO oc_users(id,username,email_verified_at,terms_version) VALUES($1,$2,now(),oc_policy_version())',
      [id, name],
    );
  const { PostgresStore } = await import('../server/store.mjs');
  const store = new PostgresStore(pool);
  // A private timeline its owner shares with the reader.
  const created = await store.create(ownerId, {
    format: 'openchronology',
    version: 1,
    title: 'Views ' + suffix,
    description: '',
    events: [
      { id: 'battle', time: '10/1', metadata: { title: 'Battle', tags: ['war'] } },
      { id: 'market', time: '30/1', metadata: { title: 'Market', tags: ['trade'] } },
      { id: 'siege', time: '60/1', metadata: { title: 'Siege', tags: ['war'] } },
      { id: 'harvest', time: '85/1', metadata: { title: 'Harvest' } },
    ],
  });
  await pool.query("INSERT INTO oc_members(timeline_id,user_id,role) VALUES($1,$2,'viewer')", [
    created.id,
    readerId,
  ]);

  // An API key with timelines:write makes a public view: war apart from the battle until the
  // siege, as a script or an AI assistant would.
  const keyId = randomUUID(),
    token = `och_key_${keyId.replaceAll('-', '')}_${randomBytes(32).toString('hex')}`;
  await pool.query(
    "INSERT INTO oc_api_keys(id,user_id,name,prefix,token_hash,scopes,expires_at) VALUES($1,$2,'Views',$3,$4,$5,now()+interval '1 day')",
    [
      keyId,
      ownerId,
      token.slice(0, 20),
      createHash('sha256').update(token).digest('hex'),
      ['timelines:read', 'timelines:write'],
    ],
  );
  const key = async (path, data, method = data ? 'POST' : 'GET') => {
    const res = await fetch(origin + '/api/' + path, {
      method,
      headers: {
        Authorization: 'Bearer ' + token,
        ...(data ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(data ? { body: JSON.stringify(data) } : {}),
    });
    return { status: res.status, body: await res.json() };
  };
  const warApart = {
    separations: [
      {
        tags: ['war'],
        disjoins: [{ from: null, moment: 'battle' }],
        unions: [{ into: null, last: true }],
      },
    ],
  };
  const bad = await key('views', {
    timeline: created.id,
    title: 'Circle',
    separation: {
      separations: [
        { tags: ['war'], disjoins: [{ from: 1, at: '1/1' }] },
        { tags: ['trade'], disjoins: [{ from: 0, at: '1/1' }] },
      ],
    },
  });
  assert.equal(bad.status, 400);
  assert.match(bad.body.error, /circle/);
  const made = await key('views', {
    timeline: created.id,
    title: 'War apart',
    description: 'From the battle to the siege.',
    visibility: 'public',
    separation: warApart,
  });
  assert.equal(made.status, 201, JSON.stringify(made.body));
  const view = made.body;
  assert.deepEqual((await key(`timelines/${created.id}/views`)).body.views.length, 1);
  // Keys still reach nothing else.
  assert.equal((await key('auth/account')).status, 403);

  browser = await chromium.launch(
    process.env.BROWSER_EXECUTABLE ? { executablePath: process.env.BROWSER_EXECUTABLE } : {},
  );
  const errors = [];
  const signedIn = async (id) => {
    const user = (await pool.query('SELECT * FROM oc_users WHERE id=$1', [id])).rows[0];
    const [name, value] = (await new Auth(pool, origin).issue(user)).cookie
      .split(';')[0]
      .split('=');
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    await context.addCookies([{ name, value, url: origin }]);
    const page = await context.newPage();
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('dialog', (d) => d.accept());
    return page;
  };
  const opened = async (page, path) => {
    await page.goto(origin + path);
    const frame = page.frameLocator('iframe.editor-frame');
    await frame.locator('.event-marker').first().waitFor();
    return frame;
  };
  const cards = (frame) => frame.locator('#views-list .view-card strong').allTextContents();

  // The owner lists it, opens it, and saves another view from what is shown.
  let page = await signedIn(ownerId);
  let frame = await opened(page, `/timelines/${created.id}`);
  await frame.locator('#views-button').click();
  const dialog = frame.locator('#views-dialog');
  await frame.locator('#views-list .view-card').first().waitFor();
  assert.deepEqual(await cards(frame), ['War apart']);
  assert.match(await dialog.locator('.view-card').first().textContent(), /Public/);
  await dialog.getByRole('button', { name: 'Open: War apart' }).click();
  await frame.locator('#separation-settings').waitFor({ state: 'visible' });
  assert.equal(await frame.locator('#separation-heading').textContent(), 'View: War apart');
  if (shots) {
    await mkdir(shots, { recursive: true });
    await page.screenshot({ path: resolve(shots, 'view-open.png') });
  }
  await frame.locator('#separation-rejoin').click();
  await frame.locator('#separate-button').click();
  const item = frame.locator('#separate-dialog .separation-item').first();
  if (!(await item.locator('.tag-picker-panel').isVisible()))
    await item.locator('.tag-picker-toggle').click();
  await item.locator('.tag-picker-search').fill('trade');
  await item.locator('.tag-picker-search').press('Enter');
  await frame.locator('#separate-submit').click();
  await frame.locator('#separation-settings').waitFor({ state: 'visible' });
  await frame.locator('#views-button').click();
  await frame.locator('#views-save').click();
  await frame.locator('#view-title').fill('Trade');
  assert.equal(await frame.locator('#view-visibility').isVisible(), true);
  await frame.locator('#view-edit-submit').click();
  await frame.locator('#view-edit-dialog').waitFor({ state: 'hidden' });
  await frame.locator('#views-list .view-card').nth(1).waitFor();
  assert.deepEqual(await cards(frame), ['Trade', 'War apart']);
  // Shared with the reader as an editor.
  await dialog.getByRole('button', { name: 'Share…: Trade' }).click();
  const share = frame.locator('#view-share-dialog');
  await share.waitFor({ state: 'visible' });
  assert.match(await frame.locator('#view-link').inputValue(), /\?view=[0-9a-f-]{36}$/);
  await frame.locator('#view-member-name').fill(readerName);
  await frame.locator('#view-member-role').selectOption('editor');
  await frame.locator('#view-member-add').click();
  await share.locator('.view-members li', { hasText: readerName }).waitFor();
  if (shots) await page.screenshot({ path: resolve(shots, 'view-share.png') });
  await share.locator('.dialog-actions [data-close]').click();
  // Made the default, and saved with the timeline.
  await dialog.getByRole('button', { name: 'Make default: War apart' }).click();
  await dialog.locator('.dialog-actions [data-close]').click();
  await frame.locator('#separation-rejoin').click();
  await frame.locator('#toast').evaluate((toast) => (toast.textContent = ''));
  await frame.locator('#publish-button').click();
  await frame
    .locator('#toast', { hasText: 'Timeline saved' })
    .waitFor({ timeout: 30000 })
    .catch(async (error) => {
      throw new Error(`Not saved: ${await frame.locator('#toast').textContent()}`, {
        cause: error,
      });
    });
  assert.equal(
    (await pool.query('SELECT view FROM oc_timelines WHERE id=$1', [created.id])).rows[0].view.id,
    view.id,
  );
  await page.context().close();

  // The reader sees the public view and the one shared with them, and forks the public one.
  page = await signedIn(readerId);
  frame = await opened(page, `/timelines/${created.id}`);
  // It opens in the default view, named as the view.
  await frame
    .locator('#separation-heading', { hasText: 'View: War apart' })
    .waitFor({ timeout: 15000 });
  await frame.locator('#views-button').click();
  await frame.locator('#views-list .view-card').nth(1).waitFor();
  assert.deepEqual(await cards(frame), ['War apart', 'Trade']);
  const readerDialog = frame.locator('#views-dialog');
  assert.equal(
    await readerDialog.getByRole('button', { name: 'Edit…: War apart' }).count(),
    0,
    'a public view is read-only to readers',
  );
  assert.equal(await readerDialog.getByRole('button', { name: 'Edit…: Trade' }).count(), 1);
  await readerDialog.getByRole('button', { name: 'Fork: War apart' }).click();
  await frame.locator('#views-list .view-card').nth(2).waitFor();
  assert.match(await readerDialog.locator('#views-list').textContent(), /forked from “War apart”/);
  if (shots) await page.screenshot({ path: resolve(shots, 'views-reader.png') });

  // The default view follows the view: changed through the API, the timeline opens the new way.
  const changed = await key(`views/${view.id}`, { separation: { tags: ['trade'] } }, 'PUT');
  assert.equal(changed.status, 200);
  // A new tab: a reload in the same tab shows what it showed before.
  page = await page.context().newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  frame = await opened(page, `/timelines/${created.id}`);
  await frame.locator('#separation-tags', { hasText: 'trade' }).waitFor({ timeout: 15000 });
  // A link to a view opens it.
  const trade = (await key(`timelines/${created.id}/views`)).body.views.find(
    (v) => v.title === 'Trade',
  );
  frame = await opened(page, `/timelines/${created.id}?view=${trade.id}`);
  await frame.locator('#separation-heading', { hasText: 'View: Trade' }).waitFor();
  assert.deepEqual(errors, []);
  console.log(
    'PASS saved views live: made with an API key, opened, saved from what is shown, shared, made the default and followed, forked by a reader, and opened from a link.',
  );
} finally {
  await browser?.close();
  child.kill();
  await pool.query('DELETE FROM oc_timelines WHERE owner_id=ANY($1::uuid[])', [
    [ownerId, readerId],
  ]);
  await pool.query('DELETE FROM oc_users WHERE id=ANY($1::uuid[])', [[ownerId, readerId]]);
  await pool.end();
}
