// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// Passkeys against PostgreSQL (#372), with a software authenticator: enrolling one (after the
// password, revoking other sessions, giving recovery codes the first time, and notifying),
// answering a sign-in's two-factor step and a security change with one, each challenge once,
// signing in with one alone (and not when the site turns it off), refusing a copied passkey
// by its counter, an administrator's change confirmed with one, living beside an
// authenticator app, and removing them.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { createApplication } from '../server/http.mjs';
import { flushMail } from '../server/mail.mjs';
import { passwordHash } from '../server/auth.mjs';
import { totp } from '../server/security-crypto.mjs';
import { POLICY_VERSION } from '../server/policies.mjs';
import { softAuthenticator } from './webauthn-authenticator.mjs';
if (!process.env.DATABASE_URL) throw new Error('Use a dedicated PostgreSQL test database.');
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
await pool.query(await readFile(new URL('../server/schema.sql', import.meta.url), 'utf8'));
const key = Buffer.alloc(32, 29),
  messages = [],
  mailer = {
    async send(message) {
      messages.push(message);
    },
  };
// The site's address, which passkeys are made for (its host is the RP ID).
const site = 'http://localhost:5173';
const start = async (options) => {
  const app = createApplication({
    pool,
    mailer,
    securityKey: key,
    passwordCheck: async () => {},
    trustProxy: true,
    origin: site,
    ...options,
  });
  await new Promise((resolve) => app.listen(0, '127.0.0.1', resolve));
  return app;
};
// The servers, by name: `main` is replaced midway (fresh), as by a restart.
const servers = { main: await start(), closed: await start({ passkeys: { signIn: false } }) };
/**
 * A new process in place of the main server, with its in-memory throttles empty and the
 * database's cleared, so the rest of the test is not held to the per-minute limits the first
 * half used up. Sessions live in the database and carry over.
 */
async function fresh() {
  const old = servers.main;
  await pool.query('DELETE FROM oc_auth_attempts');
  servers.main = await start();
  await new Promise((resolve) => old.close(resolve));
}
const suffix = Date.now().toString(36),
  username = 'passkey_' + suffix,
  email = username + '@example.test',
  password = 'a unique passkey testing passphrase',
  soloId = randomUUID(),
  // A pool with one connection, for a server that must not need two at once.
  tight = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1 }),
  userHandleOf = (id) => Buffer.from(id.replace(/-/g, ''), 'hex').toString('base64url'),
  uid = randomUUID(),
  adminId = randomUUID();
let n = 0;
/**
 * A browser: its own cookies, address and CSRF token, against the server named `server`
 * (which it may change: sessions live in the database, so any server knows them). A request
 * that does not answer within twenty seconds fails rather than waiting forever.
 */
function client(server = 'main') {
  const cookies = new Map(),
    ip = '203.0.113.' + ++n;
  let csrf;
  return {
    server,
    async request(path, data, status = 200, method = data === undefined ? 'GET' : 'POST') {
      const origin = `http://127.0.0.1:${servers[this.server].address().port}`;
      const response = await fetch(origin + '/api/' + path, {
        method,
        signal: AbortSignal.timeout(20000),
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
      assert.equal(response.status, status, `${path}: ${JSON.stringify(value)}`);
      if (value.csrf) csrf = value.csrf;
      return value;
    },
  };
}
/** Signs `browser` in with the password; the answer (a session, or the `mfa` step). */
async function signIn(browser, name = username) {
  await browser.request('session');
  return browser.request('auth/login', { username: name, password });
}
/** Adds a passkey of `authenticator` named `name`, confirmed with `confirm`. */
async function enroll(browser, authenticator, name, confirm = { password }) {
  const { publicKey } = await browser.request('auth/passkeys/register/options', confirm);
  return browser.request('auth/passkeys/register', {
    name,
    credential: authenticator.create(publicKey, { origin: site }),
  });
}
/** A passkey's answer confirming a change in `browser`'s session. */
async function confirmWith(browser, authenticator, options = {}) {
  const { publicKey } = await browser.request('auth/passkeys/confirm/options', {});
  return authenticator.get(publicKey, { origin: site, ...options });
}
const mail = async () => {
  await flushMail(pool, mailer, key);
  return messages.filter((m) => m.to === email).map((m) => m.text);
};
try {
  const hash = await passwordHash(password);
  await pool.query(
    'INSERT INTO oc_users(id,username,email,email_verified_at,password_hash,terms_version,terms_accepted_at) VALUES($1,$2,$3,now(),$4,$5,now())',
    [uid, username, email, hash, POLICY_VERSION],
  );
  const owner = client(),
    other = client();
  await signIn(owner);
  await signIn(other);
  // The site offers passkeys, to sign in alone too; the other server does not.
  const offered = await client().request('session');
  assert.equal(offered.security.passkeys, true);
  assert.equal(offered.security.passkeySignIn, true);
  assert.equal((await client('closed').request('session')).security.passkeySignIn, false);

  // Enrolling needs the password, and the challenge goes to this session only.
  await owner.request('auth/passkeys/register/options', { password: 'wrong' }, 401);
  const laptop = softAuthenticator({ algorithm: -7, counter: 1 });
  const { publicKey: creation } = await owner.request('auth/passkeys/register/options', {
    password,
  });
  assert.equal(creation.rp.id, 'localhost');
  assert.equal(creation.authenticatorSelection.userVerification, 'required');
  assert.equal(creation.attestation, 'none');
  assert.deepEqual(
    creation.pubKeyCredParams.map((p) => p.alg),
    [-8, -7, -257],
  );
  // Answered from another site, or without verifying the person: refused, and the challenge
  // is used up either way.
  await owner.request(
    'auth/passkeys/register',
    { name: 'Laptop', credential: laptop.create(creation, { origin: 'https://evil.example' }) },
    401,
  );
  await owner.request(
    'auth/passkeys/register',
    { name: 'Laptop', credential: laptop.create(creation, { origin: site }) },
    400,
  );
  const first = await enroll(owner, laptop, 'Laptop');
  assert.equal(first.recoveryCodes.length, 10);
  // Other sessions end; the account is told.
  assert.equal((await other.request('session')).user, null);
  assert.match(
    (await mail()).at(-1),
    /passkey \("Laptop"\) was added.*Two-factor authentication is now on/s,
  );
  let account = await owner.request('auth/account');
  assert.equal(account.security.mfa_enabled, true);
  assert.equal(account.security.totp_enabled, false);
  assert.equal(account.security.recovery_remaining, 10);
  assert.deepEqual(
    account.security.passkeys.map((p) => [p.name, p.last_used_at]),
    [['Laptop', null]],
  );
  const stored = (
    await pool.query(
      'SELECT credential_id,sign_count,transports,aaguid,algorithm FROM oc_passkeys WHERE user_id=$1',
      [uid],
    )
  ).rows[0];
  assert.deepEqual(stored, {
    credential_id: laptop.id,
    sign_count: '1',
    transports: ['internal', 'hybrid'],
    aaguid: '0123456789abcdef0123456789abcdef',
    algorithm: -7,
  });
  // The same credential cannot be registered twice.
  await owner.request(
    'auth/passkeys/register',
    {
      name: 'Again',
      credential: laptop.create(
        (
          await owner.request('auth/passkeys/register/options', {
            password,
            passkey: await confirmWith(owner, laptop),
          })
        ).publicKey,
        { origin: site },
      ),
    },
    409,
  );

  // A second passkey needs a second factor now: a passkey answers it.
  const phone = softAuthenticator({ algorithm: -8 });
  await owner.request('auth/passkeys/register/options', { password }, 401);
  const added = await enroll(owner, phone, 'Phone', {
    password,
    passkey: await confirmWith(owner, laptop),
  });
  assert.equal(added.recoveryCodes, undefined);
  account = await owner.request('auth/account');
  assert.equal(account.security.passkeys.length, 2);
  assert(account.security.passkeys.find((p) => p.name === 'Laptop').last_used_at);

  // Signing in: the password, then the two-factor step answered by a passkey.
  const browser = client();
  assert.equal((await signIn(browser)).challenge, 'mfa');
  // The step says a passkey can answer it.
  assert.equal((await browser.request('session')).challengePasskey, true);
  const { publicKey: factor } = await browser.request('auth/passkeys/factor/options', {});
  assert.deepEqual(factor.allowCredentials.map((c) => c.id).sort(), [laptop.id, phone.id].sort());
  const answer = phone.get(factor, { origin: site });
  // Not without the user verified, and the challenge it answered cannot be used twice.
  const { publicKey: unverified } = await browser.request('auth/passkeys/factor/options', {});
  await browser.request(
    'auth/mfa/complete',
    { passkey: phone.get(unverified, { origin: site, flags: 0x01 }) },
    401,
  );
  const signedIn = await browser.request('auth/mfa/complete', { passkey: answer });
  assert.equal(signedIn.user.username, username);
  assert.equal(
    (
      await pool.query(
        'SELECT mfa_verified FROM oc_sessions WHERE user_id=$1 ORDER BY created_at DESC LIMIT 1',
        [uid],
      )
    ).rows[0].mfa_verified,
    true,
  );
  const replay = client();
  await signIn(replay);
  await replay.request('auth/mfa/complete', { passkey: answer }, 401);
  // Without a sign-in step there is nothing to answer.
  await client()
    .request('session')
    .then(() => {});
  const stranger = client();
  await stranger.request('session');
  await stranger.request('auth/passkeys/factor/options', {}, 401);

  // Signing in with a passkey alone: any passkey the browser holds for the site.
  const alone = client();
  await alone.request('session');
  const { publicKey: discover } = await alone.request('auth/passkeys/sign-in/options', {});
  assert.deepEqual(discover.allowCredentials, []);
  assert.equal(discover.rpId, 'localhost');
  laptop.state.userHandle = Buffer.from(uid.replace(/-/g, ''), 'hex').toString('base64url');
  const assertion = laptop.get(discover, { origin: site });
  const session = await alone.request('auth/passkeys/sign-in', { credential: assertion });
  assert.equal(session.user.id, uid);
  assert.equal((await alone.request('auth/account')).security.mfa_enabled, true);
  // The same answer again: refused (its challenge is gone).
  const again = client();
  await again.request('session');
  await again.request('auth/passkeys/sign-in/options', {});
  await again.request('auth/passkeys/sign-in', { credential: assertion }, 401);
  // Another account's user handle with this passkey: refused.
  const { publicKey: wrongUser } = await again.request('auth/passkeys/sign-in/options', {});
  laptop.state.userHandle = Buffer.alloc(16, 1).toString('base64url');
  await again.request(
    'auth/passkeys/sign-in',
    { credential: laptop.get(wrongUser, { origin: site }) },
    401,
  );
  laptop.state.userHandle = Buffer.from(uid.replace(/-/g, ''), 'hex').toString('base64url');
  // A copy of the passkey, whose counter is behind the original's: refused as copied.
  const { publicKey: cloned } = await again.request('auth/passkeys/sign-in/options', {});
  laptop.state.counter = 1;
  assert.match(
    (
      await again.request(
        'auth/passkeys/sign-in',
        { credential: laptop.get(cloned, { origin: site }) },
        401,
      )
    ).error,
    /copied/,
  );
  laptop.state.counter = 100;
  // Not where the site turns it off.
  const off = client('closed');
  await off.request('session');
  await off.request('auth/passkeys/sign-in/options', {}, 404);
  // A sign-in needs the sign-in page's token.
  await client().request('auth/passkeys/sign-in/options', {}, 403);

  // Renaming needs only the session; removing is confirmed as any security change.
  const phoneId = account.security.passkeys.find((p) => p.name === 'Phone').id;
  await owner.request('auth/passkeys/' + phoneId, { name: '  Pocket\u0007 phone ' }, 200, 'PATCH');
  await owner.request('auth/passkeys/' + phoneId, { name: '' }, 400, 'PATCH');
  await other.request('session');
  await signIn(other).then((r) => assert.equal(r.challenge, 'mfa'));
  await other.request('auth/passkeys/' + phoneId, { name: 'Mine' }, 401, 'PATCH');
  account = await owner.request('auth/account');
  assert(account.security.passkeys.some((p) => p.name === 'Pocket phone'));

  await fresh();
  // An authenticator app beside passkeys keeps the recovery codes.
  const setup = await owner.request('auth/mfa/setup', {
    password,
    passkey: await confirmWith(owner, phone),
  });
  const app2 = await owner.request('auth/mfa/enable', {
    password,
    code: totp(setup.secret, Math.floor(Date.now() / 30000)),
  });
  assert.equal(app2.recoveryCodes, undefined);
  assert.equal(app2.enabled, true);
  account = await owner.request('auth/account');
  assert.equal(account.security.totp_enabled, true);
  assert.equal(account.security.recovery_remaining, 10);

  // An administrator's change, confirmed with a passkey instead of a code.
  await pool.query(
    'INSERT INTO oc_users(id,username,email_verified_at,password_hash,is_admin,terms_version,terms_accepted_at) VALUES($1,$2,now(),$3,true,$4,now())',
    [adminId, 'pkadmin_' + suffix, hash, POLICY_VERSION],
  );
  const admin = client();
  await signIn(admin, 'pkadmin_' + suffix);
  const security = softAuthenticator();
  await enroll(admin, security, 'Key');
  await admin.request(
    'admin/users/' + uid,
    { quota_bypass: true, password, code: 'invalid' },
    401,
    'PATCH',
  );
  await admin.request(
    'admin/users/' + uid,
    { quota_bypass: true, password, passkey: await confirmWith(admin, security) },
    200,
    'PATCH',
  );
  // Another account's passkey does not confirm this session's change.
  await admin.request(
    'admin/users/' + uid,
    { quota_bypass: false, password, passkey: await confirmWith(owner, phone) },
    401,
    'PATCH',
  );

  // Removing the authenticator app leaves the passkeys answering two-factor authentication.
  await owner.request('auth/mfa/disable', { password, passkey: await confirmWith(owner, phone) });
  account = await owner.request('auth/account');
  assert.equal(account.security.mfa_enabled, true);
  assert.equal(account.security.totp_enabled, false);
  assert.equal(account.security.recovery_remaining, 10);
  // Removing the passkeys: the last one turns two-factor authentication off.
  const laptopId = account.security.passkeys.find((p) => p.name === 'Laptop').id;
  await owner.request('auth/passkeys/' + laptopId, { password }, 401, 'DELETE');
  await owner.request(
    'auth/passkeys/' + laptopId,
    { password, passkey: await confirmWith(owner, phone) },
    200,
    'DELETE',
  );
  const last = await owner.request(
    'auth/passkeys/' + phoneId,
    { password, code: first.recoveryCodes[0] },
    200,
    'DELETE',
  );
  assert.match(last.message, /Two-factor authentication is off/);
  account = await owner.request('auth/account');
  assert.equal(account.security.mfa_enabled, false);
  assert.equal(account.security.recovery_remaining, 0);
  assert.deepEqual(account.security.passkeys, []);
  assert.match((await mail()).at(-1), /passkey \("Pocket phone"\) was removed.*now off/s);
  // A removed passkey signs in no more.
  const gone = client();
  await gone.request('session');
  const { publicKey: after } = await gone.request('auth/passkeys/sign-in/options', {});
  await gone.request(
    'auth/passkeys/sign-in',
    { credential: laptop.get(after, { origin: site }) },
    401,
  );
  // And the password alone signs in again.
  assert.equal((await signIn(client())).user.id, uid);

  // An account without a password (made through a provider): its enrollment, confirmed by a
  // recent sign-in, may finish after that sign-in is five minutes old, as the browser's
  // ceremony can take a while.
  await pool.query(
    'INSERT INTO oc_users(id,username,email_verified_at,password_hash,terms_version,terms_accepted_at) VALUES($1,$2,now(),$3,$4,now())',
    [soloId, 'pksolo_' + suffix, hash, POLICY_VERSION],
  );
  const solo = client(),
    soloKey = softAuthenticator({ userHandle: userHandleOf(soloId) });
  await signIn(solo, 'pksolo_' + suffix);
  await pool.query('UPDATE oc_users SET password_hash=NULL WHERE id=$1', [soloId]);
  const { publicKey: late } = await solo.request('auth/passkeys/register/options', {});
  await pool.query(
    "UPDATE oc_sessions SET created_at=now()-interval '10 minutes' WHERE user_id=$1",
    [soloId],
  );
  const soloFirst = await solo.request('auth/passkeys/register', {
    name: 'Solo',
    credential: soloKey.create(late, { origin: site }),
  });
  assert.equal(soloFirst.recoveryCodes.length, 10);
  // Signed in already, a passkey sign-in works as a password one does: bound to the session
  // open, which it then replaces.
  const before = (
    await pool.query('SELECT token_hash FROM oc_sessions WHERE user_id=$1', [soloId])
  ).rows.map((r) => r.token_hash);
  const { publicKey: again2 } = await solo.request('auth/passkeys/sign-in/options', {});
  const replaced = await solo.request('auth/passkeys/sign-in', {
    credential: soloKey.get(again2, { origin: site }),
  });
  assert.equal(replaced.user.id, soloId);
  const after2 = (
    await pool.query('SELECT token_hash FROM oc_sessions WHERE user_id=$1', [soloId])
  ).rows.map((r) => r.token_hash);
  assert.equal(after2.length, 1);
  assert(!before.includes(after2[0]));
  assert.equal((await solo.request('auth/account')).security.passkeys.length, 1);
  // On a server whose pool has a single connection, a passkey still confirms a change: the
  // challenge is used up on a connection of its own, not one the change's transaction holds.
  servers.tight = await start({ pool: tight });
  solo.server = 'tight';
  const spare = await confirmWith(solo, soloKey);
  await confirmWith(solo, soloKey);
  const soloPasskey = (await solo.request('auth/account')).security.passkeys[0].id;
  await solo.request('auth/passkeys/' + soloPasskey, { passkey: spare }, 200, 'DELETE');
  // The change ended the account's other challenges too.
  assert.equal(
    (
      await pool.query('SELECT count(*)::int AS n FROM oc_passkey_challenges WHERE user_id=$1', [
        soloId,
      ])
    ).rows[0].n,
    0,
  );
  assert.equal((await solo.request('auth/account')).security.mfa_enabled, false);
  console.log(
    'PostgreSQL passkeys: enrolling, two-factor sign-in, confirmation, single-use challenges, sign-in alone, copied-passkey refusal, administration, beside an authenticator app, removal passed.',
  );
} finally {
  await pool.query('DELETE FROM oc_users WHERE id=ANY($1)', [[uid, adminId, soloId]]);
  // The sign-in attempts this test counted (by hashed address and name).
  await pool.query('DELETE FROM oc_auth_attempts');
  for (const server of Object.values(servers)) {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
  await tight.end();
  await pool.end();
}
