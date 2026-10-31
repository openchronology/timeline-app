// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// Approving the desktop app's sign-in in a live browser (/connect/desktop/<code>): the page
// shows when and where the request started and the program it named, does not fill in the code
// from its link, approves only once the code is typed as the desktop app shows it, and the
// desktop's poll then gets its session.
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
const port = Number(process.env.PLATFORM_TEST_PORT ?? 5199),
  origin = `http://localhost:${port}`;
const env = {
  ...process.env,
  NODE_ENV: 'production',
  APP_ORIGIN: origin,
  OCH_APP_ROOT: process.cwd(),
  NEXT_TELEMETRY_DISABLED: '1',
  PORT: String(port),
  HOSTNAME: '127.0.0.1',
  CHALLENGE_PROVIDER: 'off',
};
for (const key of Object.keys(env))
  if (key.startsWith('OAUTH_') || key.startsWith('LDAP_') || key === 'PLUGIN_LIBRARY')
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
  username = 'device_' + Date.now().toString(36),
  password = 'device-approval-password-2026',
  program = 'OpenChronology-Desktop/0.1';
let browser;
try {
  for (let i = 0; i < 100 && !exited; i++) {
    try {
      const health = await fetch(`http://127.0.0.1:${port}/healthz`, {
        signal: AbortSignal.timeout(500),
      });
      if (health.ok) break;
    } catch {}
    await delay(200);
  }
  assert(!exited, logs);
  await pool.query(
    'INSERT INTO oc_users(id,username,email_verified_at,password_hash,terms_version,terms_accepted_at) VALUES($1,$2,now(),$3,$4,now())',
    [id, username, await passwordHash(password), POLICY_VERSION],
  );
  browser = await chromium.launch(
    process.env.BROWSER_EXECUTABLE ? { executablePath: process.env.BROWSER_EXECUTABLE } : {},
  );
  const context = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
  const tab = await context.newPage();
  const errors = [];
  tab.on('pageerror', (e) => errors.push(e.message));
  await tab.goto(origin + '/login');
  await tab.getByLabel('Username').fill(username);
  await tab.getByLabel('Password', { exact: true }).fill(password);
  await tab.getByRole('button', { name: 'Sign in', exact: true }).click();
  await tab.waitForURL(origin + '/');

  // The desktop app starts signing in, as the native process does.
  const call = async (path, data) => {
    const response = await fetch(`${origin}/api/auth/device/${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'User-Agent': program, Origin: origin },
      body: JSON.stringify(data),
    });
    return { status: response.status, body: await response.json() };
  };
  const started = (await call('start', {})).body;
  assert.match(started.verificationUri, /\/connect\/desktop\/[A-Z2-9]{10}$/);
  await tab.goto(started.verificationUri);
  const card = tab.locator('.account-card');
  await card
    .getByText('Approve only if you just started signing in on your own computer')
    .waitFor();
  await card.getByText(program, { exact: true }).waitFor();
  await card.getByText('just now', { exact: false }).waitFor();
  // The code is not on the page or in its field; approving waits for it to be typed.
  assert(!(await card.textContent()).includes(started.userCode));
  const field = card.getByLabel('The code your desktop app shows'),
    approve = card.getByRole('button', { name: 'Approve connection' });
  assert.equal(await field.inputValue(), '');
  assert(await approve.isDisabled());
  await field.fill('ABCDEFGH23' === started.userCode ? 'ABCDEFGH24' : 'ABCDEFGH23');
  await card.getByText("That is not this request's code.", { exact: false }).waitFor();
  assert(await approve.isDisabled());
  // Typed as people do: lower case, in two groups.
  await field.fill(
    started.userCode.slice(0, 5).toLowerCase() + ' ' + started.userCode.slice(5).toLowerCase(),
  );
  await approve.click();
  await card.getByText('Approved. Return to the desktop application.').waitFor();
  await pool.query(
    "UPDATE oc_device_logins SET last_poll_at=now()-interval '4 seconds' WHERE user_code=$1",
    [started.userCode],
  );
  const polled = await call('poll', { deviceCode: started.deviceCode });
  assert.equal(polled.status, 200, JSON.stringify(polled.body));
  assert.equal(polled.body.user.username, username);
  assert.match(polled.body.token, /^[a-f0-9]{64}$/);
  assert.deepEqual(errors, []);
  console.log(
    'PASS desktop approval in a browser: request details shown, code typed, desktop signed in.',
  );
} finally {
  await browser?.close();
  child.kill();
  await pool.query('DELETE FROM oc_users WHERE id=$1', [id]);
  await pool.query('DELETE FROM oc_auth_attempts');
  await pool.end();
}
