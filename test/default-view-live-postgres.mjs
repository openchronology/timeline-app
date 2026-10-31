// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// A timeline's default view in a live browser (#416): a server timeline saved with a default
// separation opens separated for a guest, an embed and its owner, who can still Rejoin; a link
// to a moment opens it whole; the owner makes a relationship separation the default and saves it;
// a deleted entity opens it whole; duplicates keep it. SCREENSHOT_DIR, when set, keeps screenshots.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { mkdir, readFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { randomUUID } from 'node:crypto';
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
  id = randomUUID(),
  username = 'views_' + suffix;
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
    [id, username],
  );
  const { PostgresStore } = await import('../server/store.mjs');
  const { Versioning } = await import('../server/versioning.mjs');
  const { validateDocument } = await import('../dist/core.mjs');
  const store = new PostgresStore(pool);
  // Saved to open separated by "war": Siege and Battle above, Market and Harvest below.
  const created = await store.create(
    id,
    validateDocument({
      format: 'openchronology',
      version: 1,
      title: 'Default view ' + suffix,
      description: '',
      view: { separation: { tags: [' War '] } },
      events: [
        { id: 'siege', time: '10/1', metadata: { title: 'Siege', tags: ['war'] } },
        { id: 'market', time: '30/1', metadata: { title: 'Market' } },
        { id: 'battle', time: '60/1', metadata: { title: 'Battle', tags: ['war'] } },
        { id: 'harvest', time: '85/1', metadata: { title: 'Harvest' } },
      ],
      relationships: [{ a: { moment: 'harvest' }, b: { moment: 'market' } }],
    }),
  );
  await pool.query("UPDATE oc_timelines SET visibility='public' WHERE id=$1", [created.id]);
  const column = async (timeline = created.id) =>
    (await pool.query('SELECT view FROM oc_timelines WHERE id=$1', [timeline])).rows[0].view;
  // Stored normalized, in the timeline's settings and its saved document.
  assert.deepEqual(await column(), { separation: { tags: ['war'] } });
  assert.deepEqual((await store.snapshot(created.id, id)).document.view, {
    separation: { tags: ['war'] },
  });
  const metadata = await (await fetch(`${origin}/api/timelines/${created.id}`)).json();
  assert.deepEqual(metadata.view, { separation: { tags: ['war'] } });

  browser = await chromium.launch(
    process.env.BROWSER_EXECUTABLE ? { executablePath: process.env.BROWSER_EXECUTABLE } : {},
  );
  const errors = [];
  const watch = (page) => page.on('pageerror', (e) => errors.push(e.message));
  /** Waits until the editor `scope` shows the whole timeline or a separation, settled. */
  const separated = async (scope, expected) => {
    await scope.locator('.event-marker').first().waitFor();
    if (expected) {
      await scope.locator('#separation-settings').waitFor({ state: 'visible' });
      assert.equal(await scope.locator('#separation-tags').textContent(), expected);
    } else {
      // Long enough for a default view to have been applied, had there been one.
      await delay(1500);
      assert.equal(await scope.locator('#separation-settings').isVisible(), false);
    }
  };
  const above = async (scope, upper, lower) => {
    const y = async (name) =>
      (await scope.locator(`.event-marker[aria-label="${name}"]`).first().boundingBox()).y;
    for (let i = 0; i < 40; i++) {
      if ((await y(upper)) < (await y(lower)) - 100) return;
      await delay(100);
    }
    assert.fail(`${upper} is not above ${lower}`);
  };

  // A guest's shared link opens it separated, and says it is the default; they can Rejoin.
  const guest = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  let page = await guest.newPage();
  watch(page);
  await page.goto(`${origin}/timelines/${created.id}`);
  let frame = page.frameLocator('iframe.editor-frame');
  await separated(frame, 'war');
  await above(frame, 'Siege', 'Market');
  assert.match(
    await frame.locator('#separation-default-note').textContent(),
    /default view: it opens this way for everyone/,
  );
  assert.equal(await frame.locator('#separation-default').isVisible(), false);
  assert.equal(await frame.locator('#separation-default-clear').isVisible(), false);
  // Its own title, not a comparison's.
  assert.equal(await frame.locator('#timeline-title').inputValue(), 'Default view ' + suffix);
  assert.equal(
    await frame.locator('html').evaluate(() => document.title),
    `Default view ${suffix} · OpenChronology`,
  );
  if (process.env.SCREENSHOT_DIR) {
    await mkdir(process.env.SCREENSHOT_DIR, { recursive: true });
    await page.screenshot({ path: resolve(process.env.SCREENSHOT_DIR, 'default-view-guest.png') });
  }
  await frame.locator('#separation-rejoin').click();
  await frame.locator('#separation-settings').waitFor({ state: 'hidden' });
  // A reload in this tab keeps it rejoined.
  await page.reload();
  frame = page.frameLocator('iframe.editor-frame');
  await separated(frame, null);
  // A link to a moment opens the whole timeline at it.
  page = await guest.newPage();
  watch(page);
  await page.goto(`${origin}/timelines/${created.id}/moments/market`);
  frame = page.frameLocator('iframe.editor-frame');
  await frame.locator('#inspector').waitFor({ state: 'visible' });
  await separated(frame, null);
  // An embed opens it separated.
  page = await guest.newPage();
  watch(page);
  await page.goto(`${origin}/embed/${created.id}`);
  await separated(page, 'war');
  await guest.close();

  // The owner opens it separated too, and can clear the default or make another.
  const user = (await pool.query('SELECT * FROM oc_users WHERE id=$1', [id])).rows[0];
  const [name, value] = (await new Auth(pool, origin).issue(user)).cookie.split(';')[0].split('=');
  const owner = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await owner.addCookies([{ name, value, url: origin }]);
  page = await owner.newPage();
  watch(page);
  await page.goto(`${origin}/timelines/${created.id}`);
  frame = page.frameLocator('iframe.editor-frame');
  await separated(frame, 'war');
  await frame.locator('#separation-default-clear').waitFor({ state: 'visible' });
  assert.equal(await frame.locator('#separation-default').isVisible(), false);
  // Separate what is related to Market, and make that the default.
  await frame.locator('#separation-rejoin').click();
  await frame.locator('#separation-settings').waitFor({ state: 'hidden' });
  await frame.locator('.event-marker[aria-label="Market"]').click({ force: true });
  await frame
    .locator('#event-related')
    .getByRole('button', { name: 'Separate related', exact: true })
    .click();
  await frame.locator('#separation-settings').waitFor({ state: 'visible' });
  assert.equal(await frame.locator('#separation-tags').textContent(), 'Market');
  await frame.locator('#separation-default').click();
  await frame.locator('#separation-default-clear').waitFor({ state: 'visible' });
  assert.match(
    await frame.locator('#separation-default-note').textContent(),
    /default view once saved/,
  );
  if (process.env.SCREENSHOT_DIR)
    await page.screenshot({ path: resolve(process.env.SCREENSHOT_DIR, 'default-view-owner.png') });
  // A setting like the others: saved with the timeline, after rejoining.
  await frame.locator('#separation-rejoin').click();
  await frame.locator('#separation-settings').waitFor({ state: 'hidden' });
  await frame.locator('#toast').evaluate((toast) => (toast.textContent = ''));
  await frame.locator('#publish-button').click();
  await frame.locator('#toast', { hasText: 'Timeline saved' }).waitFor({ timeout: 30000 });
  assert.deepEqual(await column(), {
    separation: { related: { moment: 'market' }, depth: 'direct' },
  });
  // Saved history keeps the earlier one.
  assert.deepEqual((await store.revisionDocument(pool, created.head_revision_id)).view, {
    separation: { tags: ['war'] },
  });
  // The Separate dialog says what it opens separated by, and can clear it.
  await frame.locator('#separate-button').click();
  await frame.locator('#separate-default').waitFor({ state: 'visible' });
  assert.match(
    await frame.locator('#separate-default-text').textContent(),
    /opens with an event and the events related to it separated above/,
  );
  await frame.locator('#separate-default-clear').waitFor({ state: 'visible' });
  await frame.locator('#separate-dialog [data-close="separate-dialog"]').first().click();
  await owner.close();

  // A new guest opens it separated by Market's relations.
  const second = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  page = await second.newPage();
  watch(page);
  await page.goto(`${origin}/timelines/${created.id}`);
  frame = page.frameLocator('iframe.editor-frame');
  await separated(frame, 'Market');
  assert.equal(await frame.locator('#separation-heading').textContent(), 'Separated: related to');
  await above(frame, 'Harvest', 'Battle');
  await second.close();

  // A duplicate keeps it.
  const saved = (await pool.query('SELECT revision FROM oc_timelines WHERE id=$1', [created.id]))
    .rows[0];
  const copy = await new Versioning(store).copy(created.id, id, { revision: saved.revision }, true);
  assert.deepEqual(await column(copy.id), {
    separation: { related: { moment: 'market' }, depth: 'direct' },
  });

  // With Market deleted, the timeline opens whole, quietly.
  const t = await store.access(created.id, id);
  const { document: current } = await store.snapshot(created.id, id);
  await store.save(created.id, id, t.revision, undefined, {
    settings: { ...current, events: [], durations: undefined, relationships: undefined },
    changes: [{ id: 'market', event: null }],
    durationChanges: [],
    relationshipChanges: [],
  });
  assert.deepEqual(await column(), {
    separation: { related: { moment: 'market' }, depth: 'direct' },
  });
  const third = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  page = await third.newPage();
  watch(page);
  await page.goto(`${origin}/timelines/${created.id}`);
  frame = page.frameLocator('iframe.editor-frame');
  await separated(frame, null);
  assert.equal(await frame.locator('#toast').isVisible(), false, 'Nothing is said.');
  await third.close();

  assert.deepEqual(errors, []);
  console.log(
    'PASS default view in a browser: guests, embeds and owners open it separated and can rejoin; reloads keep the tab’s choice; moment links open it whole; set, saved, described and cleared by its owner; kept by duplicates; a deleted entity opens it whole.',
  );
} finally {
  await browser?.close();
  child.kill();
  await pool.query('DELETE FROM oc_timelines WHERE owner_id=$1', [id]);
  await pool.query('DELETE FROM oc_users WHERE id=$1', [id]);
  await pool.end();
}
