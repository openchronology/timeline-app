// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// Passkeys in a live browser (#372), with Chromium's virtual authenticator (the DevTools
// protocol's WebAuthn domain): adding one under Account → Security (recovery codes shown),
// answering the two-factor step of a password sign-in with it, signing in with it alone, and
// removing it, confirmed with the passkey. PASSKEY_SCREENSHOTS names a directory to save
// screenshots of the security settings in, light and dark.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { join, resolve } from 'node:path';
import { mkdir, readFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { randomBytes, randomUUID } from 'node:crypto';
import pg from 'pg';
import { chromium } from 'playwright';
import { passwordHash } from '../server/auth.mjs';
import { POLICY_VERSION } from '../server/policies.mjs';
if (!process.env.DATABASE_URL) throw new Error('Use a dedicated PostgreSQL test database.');
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
await pool.query(await readFile(new URL('../server/schema.sql', import.meta.url), 'utf8'));
// WebAuthn needs a host name for its RP ID (not an IP address): localhost, which browsers
// treat as a secure context over plain HTTP.
const port = Number(process.env.PLATFORM_TEST_PORT ?? 5198),
  origin = `http://localhost:${port}`,
  shots = process.env.PASSKEY_SCREENSHOTS;
const env = {
  ...process.env,
  NODE_ENV: 'production',
  APP_ORIGIN: origin,
  OCH_APP_ROOT: process.cwd(),
  NEXT_TELEMETRY_DISABLED: '1',
  PORT: String(port),
  HOSTNAME: '127.0.0.1',
  // Account security needs email and an encryption key configured. The accounts here have no
  // address, so nothing is sent.
  RESEND_API_KEY: 're_test_passkeys',
  AUTH_EMAIL_FROM: 'OpenChronology <accounts@example.test>',
  AUTH_ENCRYPTION_KEY: randomBytes(32).toString('hex'),
  CHALLENGE_PROVIDER: 'off',
};
delete env.PASSKEY_SIGN_IN;
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
  username = 'passkeys_' + Date.now().toString(36),
  password = 'passkey-browser-password-2026';
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
  const context = await browser.newContext({
    viewport: { width: 1280, height: 1000 },
    colorScheme: 'light',
  });
  const tab = await context.newPage();
  const errors = [];
  tab.on('pageerror', (e) => errors.push(e.message));
  // A platform authenticator that holds discoverable passkeys and verifies the person (as a
  // fingerprint reader would), answering at once.
  const cdp = await context.newCDPSession(tab);
  await cdp.send('WebAuthn.enable');
  const { authenticatorId } = await cdp.send('WebAuthn.addVirtualAuthenticator', {
    options: {
      protocol: 'ctap2',
      transport: 'internal',
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
    },
  });
  const held = async () =>
    (await cdp.send('WebAuthn.getCredentials', { authenticatorId })).credentials;
  const security = tab.locator('#security');
  /** Signs in with the password on /login; lands on `/` unless a step follows. */
  async function passwordSignIn() {
    await tab.goto(origin + '/login');
    await tab.getByLabel('Username').fill(username);
    await tab.getByLabel('Password', { exact: true }).fill(password);
    await tab.getByRole('button', { name: 'Sign in', exact: true }).click();
  }
  const signedIn = async () =>
    (await tab.evaluate(() => fetch('/api/session').then((r) => r.json()))).user?.username;
  async function signOut() {
    await tab.goto(origin + '/account');
    await tab
      .getByRole('navigation', { name: 'Account' })
      .getByRole('button', { name: 'Sign out' })
      .click();
    await tab.waitForFunction(() =>
      fetch('/api/session')
        .then((r) => r.json())
        .then((s) => !s.user),
    );
  }

  // Adding a passkey: the password confirms it, the browser makes it, recovery codes show.
  await passwordSignIn();
  await tab.waitForURL(origin + '/');
  await tab.goto(origin + '/account');
  await security.getByText('Add a passkey').click();
  const add = security.locator('form').filter({ hasText: 'cannot be phished' });
  await add.getByLabel('Name').fill('This laptop');
  await add.getByLabel('Current password').fill(password);
  await add.getByRole('button', { name: 'Continue' }).click();
  await tab.getByRole('heading', { name: 'Save your recovery codes' }).waitFor();
  const codes = (await tab.locator('.notice pre').textContent()).trim().split('\n');
  assert.equal(codes.length, 10);
  await security
    .getByText('Passkey added. Two-factor authentication is on.', { exact: false })
    .waitFor();
  assert.equal((await held()).length, 1);
  assert.equal((await held())[0].isResidentCredential, true);
  const row = (
    await pool.query('SELECT name,credential_id,sign_count FROM oc_passkeys WHERE user_id=$1', [id])
  ).rows[0];
  assert.equal(row.name, 'This laptop');
  assert.equal(
    row.credential_id,
    Buffer.from((await held())[0].credentialId, 'base64').toString('base64url'),
  );
  await tab.getByRole('button', { name: 'I have stored these codes' }).click();
  await security.getByText('This laptop', { exact: true }).waitFor();
  await security.getByText('Two-factor authentication', { exact: true }).waitFor();
  if (shots) {
    await mkdir(shots, { recursive: true });
    for (const scheme of ['light', 'dark']) {
      await tab.emulateMedia({ colorScheme: scheme });
      await delay(200);
      await security.screenshot({ path: join(shots, `account-security-${scheme}.png`) });
    }
    await tab.emulateMedia({ colorScheme: 'light' });
  }

  // The two-factor step of a password sign-in, answered with the passkey.
  await signOut();
  await passwordSignIn();
  await tab.getByRole('heading', { name: 'Two-factor authentication' }).waitFor();
  if (shots)
    await tab.locator('.auth-card').screenshot({ path: join(shots, 'two-factor-step-light.png') });
  await tab.getByRole('button', { name: 'Use a passkey instead' }).click();
  await tab.waitForURL(origin + '/');
  assert.equal(await signedIn(), username);

  // Signing in with the passkey alone.
  await signOut();
  await tab.goto(origin + '/login');
  const button = tab.getByRole('button', { name: 'Sign in with a passkey' });
  await button.waitFor();
  if (shots) {
    for (const scheme of ['light', 'dark']) {
      await tab.emulateMedia({ colorScheme: scheme });
      await delay(200);
      await tab.locator('.auth-card').screenshot({ path: join(shots, `sign-in-${scheme}.png`) });
    }
    await tab.emulateMedia({ colorScheme: 'light' });
  }
  await button.click();
  await tab.waitForURL(origin + '/');
  assert.equal(await signedIn(), username);
  assert(
    (await pool.query('SELECT last_used_at FROM oc_passkeys WHERE user_id=$1', [id])).rows[0]
      .last_used_at,
  );

  // Removing it, confirmed with the password and the passkey itself.
  await tab.goto(origin + '/account');
  const passkeyRow = security.locator('li.passkey-row').filter({ hasText: 'This laptop' });
  await passkeyRow.getByText('Remove', { exact: true }).click();
  const remove = passkeyRow.locator('form').filter({ hasText: 'only second factor' });
  // A wrong password is refused, and the passkey's answer, used once, is dropped with it: the
  // form asks for the passkey again rather than resending a spent answer.
  await remove.getByLabel('Current password').fill('not the password');
  await remove.getByRole('button', { name: 'Use a passkey' }).click();
  await remove.getByText('Confirmed with a passkey.').waitFor();
  await remove.getByRole('button', { name: 'Remove This laptop' }).click();
  await remove.getByText('Current password is incorrect.').waitFor();
  await remove.getByRole('button', { name: 'Use a passkey' }).waitFor();
  await remove.getByLabel('Current password').fill(password);
  await remove.getByRole('button', { name: 'Use a passkey' }).click();
  await remove.getByText('Confirmed with a passkey.').waitFor();
  await remove.getByRole('button', { name: 'Remove This laptop' }).click();
  await passkeyRow.waitFor({ state: 'detached' });
  const account = (
    await pool.query(
      'SELECT mfa_enabled,(SELECT count(*)::int FROM oc_passkeys WHERE user_id=$1) AS passkeys FROM oc_users WHERE id=$1',
      [id],
    )
  ).rows[0];
  assert.deepEqual(account, { mfa_enabled: false, passkeys: 0 });
  // The authenticator still holds it, but it signs in no more.
  await signOut();
  await tab.goto(origin + '/login');
  await tab.getByRole('button', { name: 'Sign in with a passkey' }).click();
  await tab.getByText('That passkey was not recognized.', { exact: false }).waitFor();
  assert.equal(await signedIn(), undefined);
  assert.deepEqual(errors, []);
  console.log(
    'PASS passkeys in a browser: adding one, the two-factor step, signing in alone, and removing it.',
  );
} finally {
  await browser?.close();
  child.kill();
  await pool.query('DELETE FROM oc_users WHERE id=$1', [id]);
  // The sign-ins above were counted by address; leave no limits behind.
  await pool.query('DELETE FROM oc_auth_attempts');
  await pool.end();
}
