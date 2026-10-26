// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// Agreeing to the terms in a live browser (#277): an account that has not agreed sees the
// panel under the header, ticks the box and presses Agree, and the panel is gone and the
// agreement recorded.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { readFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { chromium } from 'playwright';
import { passwordHash } from '../server/auth.mjs';
import { POLICY_VERSION } from '../server/policies.mjs';
if (!process.env.DATABASE_URL) throw new Error('Use a dedicated PostgreSQL test database.');
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
await pool.query(await readFile(new URL('../server/schema.sql', import.meta.url), 'utf8'));
const port = Number(process.env.PLATFORM_TEST_PORT ?? 5197),
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

const id = randomUUID(),
  username = 'terms_' + Date.now().toString(36),
  password = 'terms-browser-password-2026';
/** Signs in over the API; the session's cookies, as [name, value] pairs. */
async function signIn() {
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
let browser;
try {
  for (let i = 0; i < 100 && !exited; i++) {
    try {
      if ((await fetch(origin + '/healthz', { signal: AbortSignal.timeout(500) })).ok) break;
    } catch {}
    await delay(200);
  }
  assert(!exited, logs);
  // An account from before the terms took effect: it has agreed to nothing.
  await pool.query(
    'INSERT INTO oc_users(id,username,email_verified_at,password_hash) VALUES($1,$2,now(),$3)',
    [id, username, await passwordHash(password)],
  );
  browser = await chromium.launch(
    process.env.BROWSER_EXECUTABLE ? { executablePath: process.env.BROWSER_EXECUTABLE } : {},
  );
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await context.addCookies((await signIn()).map(([name, value]) => ({ name, value, url: origin })));
  const tab = await context.newPage();
  const errors = [];
  tab.on('pageerror', (e) => errors.push(e.message));
  await tab.goto(origin + '/');
  const prompt = tab.getByRole('region', { name: 'Terms of service' });
  await prompt.getByText('Please review the terms.').waitFor();
  // The box must be ticked first.
  await prompt.getByRole('button', { name: 'Agree' }).click();
  assert.equal(await prompt.getByRole('checkbox').evaluate((box) => box.validity.valid), false);
  await prompt.getByRole('checkbox').check();
  await prompt.getByRole('button', { name: 'Agree' }).click();
  // Agreeing reloads the page without the panel, having shown no error.
  await prompt.waitFor({ state: 'detached' });
  assert.equal(await tab.locator('.terms-prompt').count(), 0);
  const { rows } = await pool.query(
    'SELECT terms_version,terms_accepted_at FROM oc_users WHERE id=$1',
    [id],
  );
  assert.equal(rows[0].terms_version, POLICY_VERSION);
  assert(rows[0].terms_accepted_at);
  assert.deepEqual(errors, []);
  console.log('PASS agreeing to the terms in a browser: the panel, its checkbox and Agree.');
} finally {
  await browser?.close();
  child.kill();
  await pool.query('DELETE FROM oc_users WHERE id=$1', [id]);
  await pool.end();
}
