// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// Account security against PostgreSQL: verified registration, browser binding, encrypted MFA
// and recovery codes, replay and attempt limits, and password resets ending sessions.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import pg from 'pg';
import { createApplication } from '../server/http.mjs';
import { flushMail } from '../server/mail.mjs';
import { totp, unseal } from '../server/security-crypto.mjs';
import { POLICY_VERSION } from '../server/policies.mjs';
if (!process.env.DATABASE_URL) throw new Error('Use a dedicated PostgreSQL test database.');
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
await pool.query(await readFile(new URL('../server/schema.sql', import.meta.url), 'utf8'));
const key = Buffer.alloc(32, 23),
  messages = [],
  mailer = {
    async send(message) {
      messages.push(message);
    },
  };
const app = createApplication({
  pool,
  mailer,
  securityKey: key,
  passwordCheck: async () => {},
  trustProxy: true,
});
await new Promise((resolve) => app.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${app.address().port}`,
  suffix = Date.now().toString(36),
  username = 'secure_' + suffix,
  email = username + '@example.test',
  password = 'a unique security testing passphrase';
let uid,
  n = 0;
function client() {
  const cookies = new Map(),
    ip = '198.51.100.' + ++n;
  let csrf;
  return {
    async request(path, data, status = 200) {
      const method = data === undefined ? 'GET' : 'POST';
      const response = await fetch(origin + '/api/' + path, {
        method,
        headers: {
          'X-Forwarded-For': ip,
          Cookie: [...cookies].map(([k, v]) => `${k}=${v}`).join('; '),
          ...(csrf ? { 'X-CSRF-Token': csrf } : {}),
          ...(data ? { 'Content-Type': 'application/json' } : {}),
        },
        ...(data ? { body: JSON.stringify(data) } : {}),
      });
      for (const h of response.headers.getSetCookie()) {
        const [pair] = h.split(';'),
          [k, v] = pair.split('=');
        if (v) cookies.set(k, v);
        else cookies.delete(k);
      }
      const value = await response.json();
      assert.equal(response.status, status, JSON.stringify(value));
      if (value.csrf) csrf = value.csrf;
      return value;
    },
  };
}
async function link(kind) {
  await flushMail(pool, mailer, key);
  return messages
    .findLast((m) => m.to === email && m.text.includes('#' + kind + '='))
    .text.match(new RegExp('#' + kind + '=([a-f0-9]{64})'))[1];
}
const owner = client(),
  stranger = client();
try {
  await owner.request('session');
  await stranger.request('session');
  await owner.request(
    'auth/register',
    {
      username,
      email,
      password,
      passwordConfirmation: 'mismatch',
      birthYear: 1990,
      acceptTerms: POLICY_VERSION,
    },
    400,
  );
  // Profiles are at /<username> (#148): not names the site's own pages use.
  const reserved = await owner.request(
    'auth/register',
    {
      username: 'Login',
      email,
      password,
      passwordConfirmation: password,
      birthYear: 1990,
      acceptTerms: POLICY_VERSION,
    },
    400,
  );
  assert.equal(reserved.error, 'That username is taken. Choose another.');
  // Nor names that would pass for the site or its staff (#184).
  for (const name of ['root', 'Admin_1', 'openchronology-team'])
    assert.equal(
      (
        await owner.request(
          'auth/register',
          {
            username: name,
            email,
            password,
            passwordConfirmation: password,
            birthYear: 1990,
            acceptTerms: POLICY_VERSION,
          },
          400,
        )
      ).error,
      'That username is taken. Choose another.',
    );
  const pending = await owner.request('auth/register', {
    username,
    email,
    password,
    passwordConfirmation: password,
    birthYear: 1990,
    acceptTerms: POLICY_VERSION,
  });
  assert(pending.verificationRequired);
  assert.equal(pending.user, undefined);
  assert.equal(
    (await pool.query('SELECT id FROM oc_users WHERE username=$1', [username])).rows.length,
    0,
  );
  const verify = await link('verify');
  await stranger.request('auth/email/verify', { token: verify }, 400);
  await owner.request('auth/email/verify', { token: verify });
  await owner.request('auth/email/verify', { token: verify }, 400);
  const logged = await owner.request('auth/login', { username, password });
  uid = logged.user.id;
  const second = client();
  await second.request('session');
  await second.request('auth/login', { username, password });
  // An email change to another account's address sends no link, which could never be
  // confirmed; the answer is the same as for a free address (#193).
  const takenEmail = 'taken_' + email,
    freeEmail = 'free_' + email;
  await pool.query(
    'INSERT INTO oc_users(id,username,email,email_verified_at,terms_version) VALUES(gen_random_uuid(),$1,$2,now(),oc_policy_version())',
    ['taken_' + suffix, takenEmail],
  );
  const changes = async () =>
    (
      await pool.query("SELECT email FROM oc_email_tokens WHERE user_id=$1 AND purpose='change'", [
        uid,
      ])
    ).rows.map((r) => r.email);
  const toTaken = await owner.request('auth/email/change', {
    password,
    email: takenEmail.toUpperCase(),
  });
  assert.deepEqual(await changes(), []);
  const toFree = await owner.request('auth/email/change', { password, email: freeEmail });
  assert.equal(toTaken.message, toFree.message);
  assert.deepEqual(await changes(), [freeEmail]);
  await flushMail(pool, mailer, key);
  assert(!messages.some((m) => m.to === takenEmail));
  assert(messages.some((m) => m.to === freeEmail && m.text.includes('#verify=')));
  const setup = await owner.request('auth/mfa/setup', { password });
  const stored = (await pool.query('SELECT secret FROM oc_mfa_setups WHERE user_id=$1', [uid]))
    .rows[0].secret;
  assert.notEqual(stored, setup.secret);
  assert.equal(unseal(stored, key, 'setup:' + uid), setup.secret);
  const enabled = await owner.request('auth/mfa/enable', {
    password,
    code: totp(setup.secret, Math.floor(Date.now() / 30000)),
  });
  assert.equal(enabled.recoveryCodes.length, 10);
  assert.equal((await second.request('session')).user, null);
  let account = await owner.request('auth/account');
  assert(account.security.mfa_enabled);
  assert.equal(account.security.recovery_remaining, 10);
  await owner.request('auth/logout', {});
  await owner.request('session');
  const challenge = await owner.request('auth/login', { username, password });
  assert.equal(challenge.challenge, 'mfa');
  assert.equal(challenge.user, undefined);
  await owner.request('auth/account', undefined, 401);
  // Enrollment consumed this TOTP step; a recovery code must still work exactly once.
  await owner.request('auth/mfa/complete', { code: enabled.recoveryCodes[0] });
  account = await owner.request('auth/account');
  assert.equal(account.security.recovery_remaining, 9);
  const blocked = client();
  await blocked.request('session');
  await blocked.request('auth/login', { username, password });
  await blocked.request('auth/mfa/complete', { code: enabled.recoveryCodes[0] }, 401);
  for (let i = 0; i < 4; i++) await blocked.request('auth/mfa/complete', { code: 'invalid' }, 401);
  assert.equal((await blocked.request('session')).challenge, null);
  await blocked.request('auth/mfa/complete', { code: enabled.recoveryCodes[1] }, 401);
  // Email recovery cannot remove MFA or keep old application sessions alive.
  const pendingDevice = client();
  const device = await pendingDevice.request('auth/device/start', {});
  await owner.request('auth/device/approve', { userCode: device.userCode });
  const recovery = client();
  await recovery.request('session');
  // An address kept with capitals (as the bootstrap administrator's may be) resets too (#177).
  await pool.query('UPDATE oc_users SET email=$2 WHERE id=$1', [uid, email.toUpperCase()]);
  await recovery.request('auth/password/forgot', { email });
  const reset = await link('reset'),
    newPassword = 'another unique testing passphrase';
  await recovery.request('auth/password/reset', {
    token: reset,
    password: newPassword,
    passwordConfirmation: newPassword,
  });
  assert.equal((await owner.request('session')).user, null);
  await pendingDevice.request('auth/device/poll', { deviceCode: device.deviceCode }, 400);
  await pool.query('UPDATE oc_users SET email=$2 WHERE id=$1', [uid, email]);
  assert.equal(
    (await pool.query('SELECT mfa_enabled FROM oc_users WHERE id=$1', [uid])).rows[0].mfa_enabled,
    true,
  );
  await recovery.request(
    'auth/password/reset',
    { token: reset, password: newPassword, passwordConfirmation: newPassword },
    400,
  );
  const afterReset = client();
  await afterReset.request('session');
  assert.equal(
    (await afterReset.request('auth/login', { username, password: newPassword })).challenge,
    'mfa',
  );
  await afterReset.request('auth/mfa/complete', { code: enabled.recoveryCodes[1] });
  // Disabling MFA requires both primary proof and a fresh second factor.
  await afterReset.request('auth/mfa/disable', { password: newPassword, code: 'invalid' }, 401);
  await afterReset.request('auth/mfa/disable', {
    password: newPassword,
    code: enabled.recoveryCodes[2],
  });
  assert.equal((await afterReset.request('auth/account')).security.mfa_enabled, false);
  // The password confirms a security change at any time in a live session: no need to sign in
  // again first, however long ago the session began.
  const age = (interval) =>
    pool.query(`UPDATE oc_sessions SET created_at=now()-interval '${interval}' WHERE user_id=$1`, [
      uid,
    ]);
  await age('1 hour');
  const keyInput = { name: 'Old session', days: 1, scopes: ['timelines:read'] };
  await afterReset.request('auth/api-keys', { ...keyInput, password: 'wrong' }, 401);
  assert(
    (await afterReset.request('auth/api-keys', { ...keyInput, password: newPassword }, 201)).token,
  );
  assert(
    (await afterReset.request('auth/api-keys', { ...keyInput, password: newPassword }, 201)).token,
  );
  // An account with no password (signed up through a provider) has nothing to re-enter, so it
  // still needs a sign-in within five minutes.
  await pool.query('UPDATE oc_users SET password_hash=NULL WHERE id=$1', [uid]);
  assert.match(
    (await afterReset.request('auth/api-keys', keyInput, 403)).error,
    /more than five minutes old/,
  );
  await age('1 minute');
  assert((await afterReset.request('auth/api-keys', keyInput, 201)).token);
  console.log(
    'PostgreSQL account security: verified registration, browser binding, encrypted MFA, recovery/replay, attempt limits, reset/session revocation, password confirmation passed.',
  );
} finally {
  if (uid) await pool.query('DELETE FROM oc_users WHERE id=$1', [uid]);
  await pool.query('DELETE FROM oc_users WHERE username=$1', ['taken_' + suffix]);
  await pool.query('DELETE FROM oc_registrations WHERE username=$1', [username]);
  await new Promise((resolve) => app.close(resolve));
  await pool.end();
}
