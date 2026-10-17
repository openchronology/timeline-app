// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// Shifting and scaling a server timeline's times for good, in a live browser (#96): from the
// timeline menu, everything (20,000 moments: rebuilt, a stage at a time) and then what is
// tagged (half: in place, a slice at a time), each as one revision, with its progress shown.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { readFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { chromium } from 'playwright';
import { Auth, passwordHash } from '../server/auth.mjs';
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
  password = 'mapping-browser-password-2026',
  ids = [];
/**
 * A session for `username`, as [name, value] cookie pairs. Issued directly: signing in with a
 * password is rate limited per address, which the live tests run one after another share.
 */
async function signIn(username) {
  const user = (await pool.query('SELECT * FROM oc_users WHERE username=$1', [username])).rows[0];
  const issued = await new Auth(pool, origin).issue(user);
  return [issued.cookie.split(';')[0].split('=')];
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
  const owner = await account('owner');
  const { PostgresStore } = await import('../server/store.mjs');
  const { validateDocument } = await import('../dist/core.mjs');
  const store = new PostgresStore(pool);
  const created = await store.create(
    owner.id,
    validateDocument({
      format: 'openchronology',
      version: 1,
      title: 'Mapped on the server ' + suffix,
      description: '',
      events: Array.from({ length: 20000 }, (_, i) => ({
        id: 'm' + i,
        time: `${i}/1`,
        metadata: { title: 'Moment ' + i, ...(i % 2 ? {} : { tags: ['even'] }) },
      })),
      durations: [{ id: 'span', start: '10/1', end: '30/1', metadata: { title: 'Span' } }],
    }),
  );
  const saved = async () => {
    const { document } = await store.snapshot(created.id, owner.id);
    return {
      times: Object.fromEntries(document.events.map((e) => [e.id, e.time])),
      span: [document.durations[0].start, document.durations[0].end],
    };
  };
  const revisions = async () =>
    Number(
      (await pool.query('SELECT count(*) FROM oc_revisions WHERE timeline_id=$1', [created.id]))
        .rows[0].count,
    );

  browser = await chromium.launch(
    process.env.BROWSER_EXECUTABLE ? { executablePath: process.env.BROWSER_EXECUTABLE } : {},
  );
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await context.addCookies(
    (await signIn(owner.username)).map(([name, value]) => ({ name, value, url: origin })),
  );
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${origin}/timelines/${created.id}`);
  const frame = page.frameLocator('iframe.editor-frame');
  await frame.locator('.event-marker').first().waitFor();
  const dialog = frame.locator('#map-dialog');
  // What the dialog says while it works.
  await frame.locator('#map-status').evaluate((status) => {
    window.mapStatuses = [];
    new MutationObserver(() => window.mapStatuses.push(status.textContent)).observe(status, {
      childList: true,
      characterData: true,
      subtree: true,
    });
  });
  const open = async () => {
    const stage = await frame.locator('#timeline-stage').boundingBox();
    await page.mouse.click(stage.x + stage.width / 2, stage.y + 60, { button: 'right' });
    await frame
      .locator('#timeline-menu')
      .getByRole('menuitem', { name: 'Shift or scale times…' })
      .click();
    await dialog.waitFor();
  };

  // Everything, 1000 later: told ahead it is saved on the server at once.
  await open();
  await frame.locator('#map-offset').fill('1000');
  await frame
    .locator('#map-summary')
    .getByText(
      /This moves all 20,000 moments and all durations\. It is saved on the server at once/,
    )
    .waitFor();
  const before = await revisions();
  await frame.locator('#map-submit').click();
  await dialog.waitFor({ state: 'hidden', timeout: 120000 });
  await frame.locator('#toast', { hasText: 'Moved 20,000 moments and 1 duration.' }).waitFor();
  let now = await saved();
  assert.equal(now.times.m0, '1000/1');
  assert.equal(now.times.m19999, '20999/1');
  assert.deepEqual(now.span, ['1010/1', '1030/1']);
  assert.equal(await revisions(), before + 1, 'One revision.');
  const statuses = await frame.locator('#map-status').evaluate(() => window.mapStatuses);
  assert(statuses.includes('Reading the timeline…'), statuses.join(' | '));
  // Most of a timeline under 200,000 moments: rebuilt, a stage at a time.
  assert(statuses.includes('Rebuilding the timeline: writing moments…'), statuses.join(' | '));
  // The view moved with everything, so the moments are still in it.
  await frame.locator('.event-marker').first().waitFor();

  // What is tagged, 1000 back: half of them.
  await open();
  await frame.locator('input[name=map-scope][value=tagged]').check();
  await frame.locator('#map-tags').fill('even');
  await frame.locator('#map-offset').fill('-1000');
  await frame
    .locator('#map-summary')
    .getByText(/This moves the events selected/)
    .waitFor();
  await frame.locator('#map-status').evaluate(() => (window.mapStatuses = []));
  await frame.locator('#map-submit').click();
  await dialog.waitFor({ state: 'hidden', timeout: 120000 });
  await frame.locator('#toast', { hasText: 'Moved 10,000 moments and 0 durations.' }).waitFor();
  // Half of it: applied in place, a slice at a time.
  const slices = await frame.locator('#map-status').evaluate(() => window.mapStatuses);
  assert(slices.includes('Saving 5,000 of 10,000 changes…'), slices.join(' | '));
  now = await saved();
  assert.equal(now.times.m0, '0/1');
  assert.equal(now.times.m1, '1001/1');
  assert.equal(await revisions(), before + 2);

  assert.deepEqual(errors, []);
  console.log('PASS time mapping in a browser: on the server, as one revision, with progress.');
} finally {
  await browser?.close();
  child.kill();
  await pool.query('DELETE FROM oc_timelines WHERE owner_id=ANY($1::uuid[])', [ids]);
  await pool.query('DELETE FROM oc_users WHERE id=ANY($1::uuid[])', [ids]);
  await pool.end();
}
