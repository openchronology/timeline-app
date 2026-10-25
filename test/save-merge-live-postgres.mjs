// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// Saving edits while someone else saves the same timeline, in a live browser (#165): the
// editor follows the latest revision with its edits staged, saving merges them, and a
// conflict is settled by keeping one's own version or taking the saved one.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { readFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { chromium } from 'playwright';
import { passwordHash } from '../server/auth.mjs';
import { PostgresStore } from '../server/store.mjs';
import { validateDocument } from '../dist/core.mjs';
if (!process.env.DATABASE_URL) throw new Error('Use a dedicated PostgreSQL test database.');
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
await pool.query(await readFile(new URL('../server/schema.sql', import.meta.url), 'utf8'));
const port = Number(process.env.PLATFORM_TEST_PORT ?? 5193),
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

const owner = randomUUID(),
  username = 'merger_' + owner.slice(0, 8),
  password = 'save-merge-browser-password-2026';
/** A signed-in session over the API: its cookies, and requests made with them. */
async function session() {
  const cookies = new Map();
  let csrf;
  const request = async (path, method = 'GET', data) => {
    const res = await fetch(origin + '/api/' + path, {
      method,
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
    assert(res.ok, `${method} ${path}: ${JSON.stringify(value)}`);
    csrf = value.csrf ?? csrf;
    return value;
  };
  await request('session');
  await request('auth/login', 'POST', { username, password });
  return { cookies, request };
}
let browser, timeline;
try {
  for (let i = 0; i < 100 && !exited; i++) {
    try {
      if ((await fetch(origin + '/healthz', { signal: AbortSignal.timeout(500) })).ok) break;
    } catch {}
    await delay(200);
  }
  assert(!exited, logs);
  await pool.query(
    'INSERT INTO oc_users(id,username,email_verified_at,password_hash,quota_bypass,terms_version) VALUES($1,$2,now(),$3,true,oc_policy_version())',
    [owner, username, await passwordHash(password)],
  );
  const day = 86400;
  timeline = await new PostgresStore(pool).create(
    owner,
    validateDocument({
      format: 'openchronology',
      version: 1,
      title: 'Saved by two',
      description: '',
      events: ['Alpha', 'Beta', 'Gamma'].map((title, i) => ({
        id: title.toLowerCase(),
        time: `${i * 10 * day}/1`,
        metadata: { title },
      })),
    }),
  );
  const editor = await session(),
    writer = await session();
  /** Another session's save of moment changes (it sees the latest revision). */
  const save = async (changes) => {
    const t = await writer.request(`timelines/${timeline.id}`);
    return writer.request(`timelines/${timeline.id}/changes`, 'PUT', {
      revision: t.revision,
      settings: {
        format: 'openchronology',
        version: 1,
        title: t.title,
        description: t.description,
      },
      changes,
    });
  };
  const titles = async () =>
    Object.fromEntries(
      (
        await pool.query(
          "SELECT id,event->'metadata'->>'title' AS title FROM oc_moments WHERE timeline_id=$1",
          [timeline.id],
        )
      ).rows.map((r) => [r.id, r.title]),
    );
  const event = (id, title) => ({
    id,
    time: `${{ alpha: 0, beta: 10, gamma: 20, delta: 5 }[id] * day}/1`,
    metadata: { title },
  });

  browser = await chromium.launch(
    process.env.BROWSER_EXECUTABLE ? { executablePath: process.env.BROWSER_EXECUTABLE } : {},
  );
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await context.addCookies(
    [...editor.cookies].map(([name, value]) => ({ name, value, url: origin })),
  );
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${origin}/timelines/${timeline.id}`);
  const frame = page.frameLocator('iframe.editor-frame');
  const marker = (title) => frame.locator(`.event-marker[aria-label="${title}"]`);
  const status = () => frame.locator('#save-status').textContent();
  /** Edits moment `title`'s title in the editor, unsaved on the server. */
  const rename = async (title, to) => {
    await marker(title).click();
    await frame.locator('#event-title').fill(to);
    await frame.locator('#event-save').click();
    await frame.locator('#inspector').waitFor({ state: 'hidden' });
    await marker(to).waitFor();
  };
  // Saving, and waiting for this save's notice (not an earlier one still shown).
  const publish = async () => {
    await frame.locator('#toast').evaluate((toast) => (toast.textContent = ''));
    await frame.locator('#publish-button').click();
  };
  const saved = () =>
    frame.locator('#toast', { hasText: 'Timeline saved' }).waitFor({ timeout: 30000 });
  await marker('Alpha').waitFor();

  // Edits merge with what another session saved meanwhile, which the editor shows at once.
  await rename('Alpha', 'Alpha, mine');
  await save([
    { id: 'beta', event: event('beta', 'Beta, theirs') },
    { id: 'delta', event: event('delta', 'Delta') },
  ]);
  await marker('Delta').waitFor({ timeout: 30000 });
  await marker('Beta, theirs').waitFor();
  await marker('Alpha, mine').waitFor();
  assert.match(await status(), /Unsaved/);
  await publish();
  await saved();
  assert.deepEqual(await titles(), {
    alpha: 'Alpha, mine',
    beta: 'Beta, theirs',
    gamma: 'Gamma',
    delta: 'Delta',
  });
  // Saved and current again: later saves by others show as before.
  await save([{ id: 'delta', event: event('delta', 'Delta, renamed') }]);
  await marker('Delta, renamed').waitFor({ timeout: 30000 });

  // A conflict: both renamed Gamma. Keeping one's own version replaces theirs.
  await rename('Gamma', 'Gamma, mine');
  await save([{ id: 'gamma', event: event('gamma', 'Gamma, theirs') }]);
  await publish();
  const dialog = frame.locator('#conflict-dialog');
  await dialog.waitFor();
  await dialog.getByText('The moment “Gamma, mine”').waitFor();
  await frame.locator('#toast').evaluate((toast) => (toast.textContent = ''));
  await frame.locator('#conflict-mine').click();
  await saved();
  assert.equal((await titles()).gamma, 'Gamma, mine');

  // Taking the saved version drops one's own.
  await rename('Beta, theirs', 'Beta, mine');
  await save([{ id: 'beta', event: event('beta', 'Beta, theirs again') }]);
  await publish();
  await dialog.waitFor();
  await frame.locator('#conflict-theirs').click();
  await marker('Beta, theirs again').waitFor({ timeout: 30000 });
  assert.equal((await titles()).beta, 'Beta, theirs again');
  assert.equal(await marker('Beta, mine').count(), 0);

  assert.deepEqual(errors, []);
  console.log(
    'PASS save merging in a browser: following saves, merging, keeping and taking versions.',
  );
} finally {
  await browser?.close();
  child.kill();
  await pool.query('DELETE FROM oc_timelines WHERE owner_id=$1', [owner]);
  await pool.query('DELETE FROM oc_users WHERE id=$1', [owner]);
  await pool.end();
}
