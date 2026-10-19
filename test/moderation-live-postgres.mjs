// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// Reporting and moderation in a live browser (#115): a signed-out reader reports a timeline and
// a moment in it, an administrator restricts it from the review queue, and its owner sees why
// and asks for a review.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { readFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { chromium } from 'playwright';
import { passwordHash } from '../server/auth.mjs';
if (!process.env.DATABASE_URL) throw new Error('Use a dedicated PostgreSQL test database.');
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
await pool.query(await readFile(new URL('../server/schema.sql', import.meta.url), 'utf8'));
const port = Number(process.env.PLATFORM_TEST_PORT ?? 5196),
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
  password = 'moderation-browser-password-2026',
  ids = [];
/** Signs in over the API; the session's cookies, as [name, value] pairs. */
async function signIn(username) {
  const cookies = new Map();
  let csrf;
  for (const [path, data] of [['/api/session'], ['/api/auth/login', { username, password }]]) {
    const res = await fetch(origin + path, {
      method: data ? 'POST' : 'GET',
      headers: {
        Origin: origin,
        ...(cookies.size ? { Cookie: [...cookies].map(([k, v]) => `${k}=${v}`).join('; ') } : {}),
        ...(csrf ? { 'X-CSRF-Token': csrf } : {}),
        ...(data ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(data ? { body: JSON.stringify(data) } : {}),
    });
    for (const header of res.headers.getSetCookie()) {
      const [key, value] = header.split(';')[0].split('=');
      if (value) cookies.set(key, value);
      else cookies.delete(key);
    }
    const value = await res.json();
    assert(res.ok, `${path}: ${JSON.stringify(value)}`);
    csrf = value.csrf ?? csrf;
  }
  return [...cookies];
}
async function account(name, admin = false) {
  const id = randomUUID(),
    username = `${name}_${suffix}`;
  ids.push(id);
  await pool.query(
    'INSERT INTO oc_users(id,username,email_verified_at,password_hash,is_admin,quota_bypass) VALUES($1,$2,now(),$3,$4,true)',
    [id, username, await passwordHash(password), admin],
  );
  return { id, username };
}
let browser;
try {
  for (let i = 0; i < 100 && !exited; i++) {
    try {
      if ((await fetch(origin + '/healthz', { signal: AbortSignal.timeout(500) })).ok) break;
    } catch {}
    await delay(200);
  }
  assert(!exited, logs);
  const owner = await account('owner'),
    admin = await account('moderator', true);
  // A public timeline with a moment, written as the platform would store it.
  const { PostgresStore } = await import('../server/store.mjs');
  const { validateDocument } = await import('../dist/core.mjs');
  const created = await new PostgresStore(pool).create(
    owner.id,
    validateDocument({
      format: 'openchronology',
      version: 1,
      title: 'Reported in a browser ' + suffix,
      description: '',
      events: [
        { id: 'm1', time: '0/1', metadata: { title: 'The reported moment' } },
        { id: 'm2', time: '86400/1', metadata: { title: 'Another moment' } },
      ],
    }),
  );
  await pool.query("UPDATE oc_timelines SET visibility='public' WHERE id=$1", [created.id]);

  browser = await chromium.launch(
    process.env.BROWSER_EXECUTABLE ? { executablePath: process.env.BROWSER_EXECUTABLE } : {},
  );
  const errors = [];
  const page = async (cookies = []) => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    if (cookies.length)
      await context.addCookies(cookies.map(([name, value]) => ({ name, value, url: origin })));
    const tab = await context.newPage();
    tab.on('pageerror', (e) => errors.push(e.message));
    return tab;
  };

  // A signed-out reader reports the timeline from its page…
  const reader = await page();
  await reader.goto(`${origin}/timelines/${created.id}`);
  const editor = reader.frameLocator('iframe.editor-frame');
  await editor.getByRole('button', { name: 'Report', exact: true }).click();
  const dialog = reader.getByRole('dialog', { name: 'Report' });
  await dialog.waitFor();
  await dialog.getByRole('button', { name: 'Send report' }).click();
  await dialog.getByText('Choose what is wrong.').waitFor();
  await dialog.getByLabel('Sexually explicit content').check();
  await dialog.getByLabel('Details (optional)').fill('Explicit images throughout.');
  await dialog.getByRole('button', { name: 'Send report' }).click();
  await dialog.getByText('The site’s administrators will review your report.').waitFor();
  // Like the editor's dialogs, it closes on a click outside it, through its exit animation.
  await reader.evaluate(() => {
    const element = document.querySelector('dialog.report-dialog');
    window.closing = false;
    new MutationObserver(() => {
      if (element.hasAttribute('data-dialog-closing')) window.closing = true;
    }).observe(element, { attributes: true });
  });
  await reader.mouse.click(12, 450);
  await dialog.waitFor({ state: 'hidden' });
  assert(await reader.evaluate(() => window.closing), 'The dialog animates closed.');
  // …and a moment in it, from the reader (#233).
  await reader.goto(`${origin}/timelines/${created.id}/moments/m1`);
  await editor.locator('#reader-report').click();
  await dialog.waitFor();
  assert.equal(await dialog.locator('.share-title').textContent(), 'The reported moment');
  await dialog.getByLabel('Graphic violence or gore').check();
  await dialog.getByRole('button', { name: 'Send report' }).click();
  await dialog.getByText('The site’s administrators will review your report.').waitFor();
  const reports = (
    await pool.query(
      "SELECT r.category,r.entity_id FROM oc_reports r JOIN oc_moderation_cases mc ON mc.id=r.case_id WHERE mc.target_kind='timeline' AND mc.target_id=$1 ORDER BY r.created_at",
      [created.id],
    )
  ).rows;
  assert.deepEqual(reports, [
    { category: 'sexual', entity_id: null },
    { category: 'violence', entity_id: 'm1' },
  ]);

  // The owner sees no Report button on their own timeline.
  const ownerTab = await page(await signIn(owner.username));
  await ownerTab.goto(`${origin}/timelines/${created.id}`);
  const ownerEditor = ownerTab.frameLocator('iframe.editor-frame');
  await ownerEditor.getByRole('link', { name: 'Sharing & settings' }).waitFor();
  assert.equal(await ownerEditor.getByRole('button', { name: 'Report', exact: true }).count(), 0);

  // An administrator restricts it from the review queue.
  const adminTab = await page(await signIn(admin.username));
  await adminTab.goto(`${origin}/admin`);
  await adminTab.getByLabel('Manage').selectOption('reports');
  const item = adminTab.locator('.report-case', { hasText: 'Reported in a browser ' + suffix });
  await item.waitFor();
  await item.getByText('Explicit images throughout.').waitFor();
  await item.getByRole('link', { name: 'moment m1' }).waitFor();
  await adminTab.getByLabel('Current password').fill(password);
  await item.getByLabel(/Reason, sent to the owner/).fill('Sexually explicit images.');
  await item.getByRole('button', { name: 'Restrict' }).click();
  await item.waitFor({ state: 'detached' });
  await adminTab.getByLabel('Show').selectOption('restricted');
  await adminTab.locator('.report-case', { hasText: 'Reported in a browser ' + suffix }).waitFor();

  // The reader can no longer open it; the owner sees why and asks for a review.
  const gone = await reader.goto(`${origin}/timelines/${created.id}`);
  assert.equal(gone.status(), 404);
  await ownerTab.goto(`${origin}/timelines/${created.id}`);
  await ownerTab
    .getByText('Moderators restricted this timeline: Sexually explicit images.')
    .waitFor();
  await ownerTab.getByRole('link', { name: 'Ask for a review' }).click();
  await ownerTab.waitForURL(`${origin}/account#moderation`);
  const decision = ownerTab.locator('#moderation');
  await decision.getByText('Sexually explicit images.').waitFor();
  await decision.getByLabel('Why should this be reviewed?').fill('These are classical paintings.');
  await decision.getByRole('button', { name: 'Ask for a review' }).click();
  await decision.getByText('It awaits a decision.').waitFor();

  // The review is in the queue; the administrator lifts the restriction.
  await adminTab.getByLabel('Show').selectOption('open');
  const appeal = adminTab.locator('.report-case', { hasText: 'These are classical paintings.' });
  await appeal.waitFor();
  await appeal.getByRole('button', { name: 'Lift the restriction' }).click();
  await appeal.waitFor({ state: 'detached' });
  assert.equal((await reader.goto(`${origin}/timelines/${created.id}`)).status(), 200);
  await ownerTab.reload();
  await ownerTab
    .locator('#moderation')
    .getByText('The administrators lifted the restriction.')
    .waitFor();

  // Accounts can be reported from their profile, but not one's own.
  await reader.goto(`${origin}/users/${owner.username}`);
  await reader.getByRole('button', { name: 'Report' }).waitFor();
  await ownerTab.goto(`${origin}/users/${owner.username}`);
  await ownerTab.getByRole('heading', { name: '@' + owner.username }).waitFor();
  assert.equal(await ownerTab.getByRole('button', { name: 'Report' }).count(), 0);

  assert.deepEqual(errors, []);
  console.log('PASS moderation in a browser: reporting, the review queue, restriction and review.');
} finally {
  await browser?.close();
  child.kill();
  await pool.query(
    'DELETE FROM oc_moderation_cases WHERE owner_id=ANY($1::uuid[]) OR target_id=ANY($1::text[])',
    [ids],
  );
  await pool.query('DELETE FROM oc_admin_audit WHERE actor_id=ANY($1::uuid[])', [ids]);
  await pool.query('DELETE FROM oc_timelines WHERE owner_id=ANY($1::uuid[])', [ids]);
  await pool.query('DELETE FROM oc_users WHERE id=ANY($1::uuid[])', [ids]);
  await pool.end();
}
