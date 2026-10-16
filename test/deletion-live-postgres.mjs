// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// Deleting what is yours in a live browser (#166): a comment from its pull request, then the
// account from Account, which signs out and leaves the owner's timeline without the comments.
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
const port = Number(process.env.PLATFORM_TEST_PORT ?? 5194),
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
  password = 'deletion-browser-password-2026',
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
async function account(name) {
  const id = randomUUID(),
    username = `${name}_${suffix}`;
  ids.push(id);
  await pool.query(
    'INSERT INTO oc_users(id,username,email_verified_at,password_hash,quota_bypass) VALUES($1,$2,now(),$3,true)',
    [id, username, await passwordHash(password)],
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
    leaving = await account('leaving');
  // The owner's public timeline; the leaving account's pull request on it, with two comments,
  // and a timeline of its own.
  const { PostgresStore } = await import('../server/store.mjs');
  const { Collaboration } = await import('../server/collaboration.mjs');
  const { validateDocument } = await import('../dist/core.mjs');
  const store = new PostgresStore(pool),
    doc = (title) =>
      validateDocument({
        format: 'openchronology',
        version: 1,
        title,
        description: '',
        events: [{ id: 'm1', time: '0/1', metadata: { title: 'A moment' } }],
      });
  const created = await store.create(owner.id, doc('Commented on ' + suffix));
  await pool.query("UPDATE oc_timelines SET visibility='public' WHERE id=$1", [created.id]);
  const own = await store.create(leaving.id, doc('Leaving with its account ' + suffix));
  const collaboration = new Collaboration(store);
  const proposal = await collaboration.create(created.id, leaving.id, {
    title: 'A proposal ' + suffix,
    body: '',
    baseRevision: created.revision,
    document: doc('Proposed'),
  });
  await collaboration.comment(created.id, proposal.id, leaving.id, { body: 'Regretted remark' });
  await collaboration.comment(created.id, proposal.id, leaving.id, { body: 'Second thought' });

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
    tab.on('dialog', (d) => d.accept());
    return tab;
  };
  const pull = `${origin}/timelines/${created.id}/pulls/${proposal.id}`;

  // The owner sees the comments, with no Delete on someone else's.
  const ownerTab = await page(await signIn(owner.username));
  await ownerTab.goto(pull);
  await ownerTab.getByText('Regretted remark').waitFor();
  assert.equal(await ownerTab.getByRole('button', { name: 'Delete', exact: true }).count(), 0);

  // Its author deletes one of theirs.
  const tab = await page(await signIn(leaving.username));
  await tab.goto(pull);
  const comment = tab.locator('article', { hasText: 'Regretted remark' });
  await comment.getByRole('button', { name: 'Delete', exact: true }).click();
  await comment.waitFor({ state: 'detached' });
  await tab.getByText('Second thought').waitFor();
  await ownerTab.reload();
  await ownerTab.getByText('Second thought').waitFor();
  assert.equal(await ownerTab.getByText('Regretted remark').count(), 0);

  // Then the account, from Account: the username must be typed, and the password given.
  await tab.goto(`${origin}/account`);
  const form = tab.locator('form', { has: tab.getByRole('button', { name: 'Delete my account' }) });
  await form.getByLabel('Type your username to confirm').fill('not-' + leaving.username);
  await form.getByLabel(/Current password/).fill(password);
  await form.getByRole('button', { name: 'Delete my account' }).click();
  await tab.getByText('Type your username to confirm.', { exact: true }).waitFor();
  await form.getByLabel('Type your username to confirm').fill(leaving.username);
  await form.getByRole('button', { name: 'Delete my account' }).click();
  await tab.waitForURL(`${origin}/`);
  const session = await tab.evaluate(() => fetch('/api/session').then((r) => r.json()));
  assert.equal(session.user ?? null, null, 'Signed out.');
  assert.equal(
    (await pool.query('SELECT count(*) FROM oc_users WHERE id=$1', [leaving.id])).rows[0].count,
    '0',
  );
  assert.equal((await tab.goto(`${origin}/timelines/${own.id}`)).status(), 404);
  assert.equal((await tab.goto(`${origin}/users/${leaving.username}`)).status(), 404);
  // The owner's timeline stays; the pull request and its comments are gone.
  assert.equal((await ownerTab.goto(`${origin}/timelines/${created.id}`)).status(), 200);
  assert.equal((await ownerTab.goto(pull)).status(), 404);

  assert.deepEqual(errors, []);
  console.log(
    'PASS deletion in a browser: a comment from its pull request; an account from Account.',
  );
} finally {
  await browser?.close();
  child.kill();
  await pool.query('DELETE FROM oc_timelines WHERE owner_id=ANY($1::uuid[])', [ids]);
  await pool.query('DELETE FROM oc_users WHERE id=ANY($1::uuid[])', [ids]);
  await pool.end();
}
