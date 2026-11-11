// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// A server timeline's settings are kept by the editor's saves in a live browser: changing its
// time display, and saving edits after the editor has followed someone else's save, keep its
// measures (#572) and image as they are, where both used to leave them out.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { readFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { chromium } from 'playwright';
import { Auth } from '../server/auth.mjs';
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
  id = randomUUID();
const MEASURES = { cost: { type: 'mpz', label: 'Cost' } };
const IMAGE = { url: 'https://images.example/kept.png', alt: 'Kept' };
let browser;
try {
  for (let i = 0; i < 100 && !exited; i++) {
    try {
      if ((await fetch(origin + '/healthz', { signal: AbortSignal.timeout(500) })).ok) break;
    } catch {}
    await delay(200);
  }
  assert(!exited, logs);
  await pool.query(
    'INSERT INTO oc_users(id,username,email_verified_at,terms_version) VALUES($1,$2,now(),oc_policy_version())',
    [id, 'kept_' + suffix],
  );
  const { PostgresStore } = await import('../server/store.mjs');
  const { validateDocument } = await import('../dist/core.mjs');
  const store = new PostgresStore(pool);
  const created = await store.create(
    id,
    validateDocument({
      format: 'openchronology',
      version: 1,
      title: 'Kept settings ' + suffix,
      description: '',
      measures: MEASURES,
      image: IMAGE,
      events: [
        { id: 'first', time: '10/1', metadata: { title: 'First', measures: { cost: '1250' } } },
        { id: 'second', time: '60/1', metadata: { title: 'Second' } },
      ],
    }),
  );
  const row = async () =>
    (
      await pool.query(
        'SELECT revision,measures,image,presentation FROM oc_timelines WHERE id=$1',
        [created.id],
      )
    ).rows[0];
  const kept = async (label) => {
    const t = await row();
    assert.deepEqual(t.measures, MEASURES, `${label}: measures`);
    assert.equal(t.image?.url, IMAGE.url, `${label}: image`);
    return t;
  };

  browser = await chromium.launch(
    process.env.BROWSER_EXECUTABLE ? { executablePath: process.env.BROWSER_EXECUTABLE } : {},
  );
  const errors = [];
  const user = (await pool.query('SELECT * FROM oc_users WHERE id=$1', [id])).rows[0];
  const [name, value] = (await new Auth(pool, origin).issue(user)).cookie.split(';')[0].split('=');
  const owner = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await owner.addCookies([{ name, value, url: origin }]);
  const page = await owner.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${origin}/timelines/${created.id}`);
  const frame = page.frameLocator('iframe.editor-frame');
  await frame.locator('.event-marker[aria-label="First"]').waitFor();

  // The time display, saved on the server at once: the rest of the settings stay.
  const before = (await row()).revision;
  await frame.locator('#presentation-button').click();
  await frame.locator('#presentation-mode').selectOption('float');
  await frame.locator('#presentation-save').click();
  await frame.locator('#presentation-dialog').waitFor({ state: 'hidden' });
  const shown = await kept('time display');
  assert.equal(shown.presentation.mode, 'float');
  assert.notEqual(shown.revision, before);

  // Someone else saves; the editor follows, then saves an edit of its own.
  const t = await store.access(created.id, id);
  const { document: current } = await store.snapshot(created.id, id);
  await store.save(created.id, id, t.revision, undefined, {
    settings: { ...current, events: [], durations: undefined, relationships: undefined },
    changes: [{ id: 'later', event: { id: 'later', time: '90/1', metadata: { title: 'Later' } } }],
    durationChanges: [],
    relationshipChanges: [],
  });
  // Later lies past the view: the count says the editor has it.
  await frame.locator('#event-count').filter({ hasText: '3 moments' }).waitFor({ timeout: 30000 });
  await frame.locator('.event-marker[aria-label="Second"]').click();
  await frame.locator('#event-title').fill('Second, renamed');
  await frame.locator('#event-edit-status').filter({ hasText: 'Shown on the timeline' }).waitFor();
  await frame.locator('#event-save').click();
  await frame.locator('#inspector').waitFor({ state: 'hidden' });
  const following = (await row()).revision;
  await frame.locator('#publish-button').click();
  for (let i = 0; i < 100 && (await row()).revision === following; i++) await delay(200);
  assert.notEqual((await row()).revision, following, 'The edit was saved.');
  await kept('an edit after following another save');
  const { document: saved } = await store.snapshot(created.id, id);
  assert.equal(saved.events.find((e) => e.id === 'second').metadata.title, 'Second, renamed');
  assert.deepEqual(saved.events.find((e) => e.id === 'first').metadata.measures, { cost: '1250' });

  assert.deepEqual(errors, []);
  console.log(
    'PASS kept settings: time display saves and saves after following another keep measures and images.',
  );
} finally {
  await browser?.close();
  child.kill();
  await pool.query('DELETE FROM oc_timelines WHERE owner_id=$1', [id]);
  await pool.query('DELETE FROM oc_users WHERE id=$1', [id]);
  await pool.end();
}
