// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  base32,
  totp,
  matchingStep,
  seal,
  unseal,
  encryptionKey,
  newSecret,
  recoveryCodes,
  recoveryHash,
  emailAddress,
  newPassword,
  checkPasswordBreach,
} from '../server/security-crypto.mjs';
import { mailFromEnv, queueMail, flushMail } from '../server/mail.mjs';
import { AccountSecurity } from '../server/account-security.mjs';
test('authenticator implementation matches RFC 6238 and rejects replay and expired codes', () => {
  const secret = base32(Buffer.from('12345678901234567890'));
  for (const [time, code] of [
    [59, '94287082'],
    [1111111109, '07081804'],
    [1111111111, '14050471'],
    [1234567890, '89005924'],
    [2000000000, '69279037'],
    [20000000000, '65353130'],
  ])
    assert.equal(totp(secret, Math.floor(time / 30), 8), code);
  const now = 300000,
    code = totp(secret, 10);
  assert.equal(matchingStep(secret, code, -1, now), 10);
  assert.equal(matchingStep(secret, code, 10, now), null);
  assert.equal(matchingStep(secret, code, -1, now + 90000), null);
  assert.equal(matchingStep(secret, 'bad'), null);
  assert.match(newSecret(), /^[A-Z2-7]{32}$/);
});
test('encrypted MFA and mail data authenticate their owner, key, and contents', () => {
  const key = encryptionKey('ab'.repeat(32)),
    sealed = seal('private-secret', key, 'mfa:user');
  assert(!sealed.includes('private-secret'));
  assert.equal(unseal(sealed, key, 'mfa:user'), 'private-secret');
  assert.throws(() => unseal(sealed, key, 'mfa:other'));
  assert.throws(() => unseal(sealed, Buffer.alloc(32), 'mfa:user'));
  const parts = sealed.split('.');
  parts[1] = Buffer.alloc(16).toString('base64url');
  assert.throws(() => unseal(parts.join('.'), key, 'mfa:user'));
  assert.throws(() => encryptionKey('bad'));
  assert.equal(encryptionKey(''), null);
  const codes = recoveryCodes();
  assert.equal(new Set(codes).size, 10);
  assert.equal(recoveryHash(codes[0]), recoveryHash(codes[0].toUpperCase()));
  assert.equal(recoveryHash('123456'), null);
});
test('registration requires confirmed long passwords and normalized safe email', () => {
  assert.equal(emailAddress(' Person@Example.COM '), 'person@example.com');
  for (const email of ['a@b', 'a@b.com\r\nBcc:x@example.com', 'a..b@example.com'])
    assert.throws(() => emailAddress(email));
  assert.throws(() => newPassword('short', 'short'));
  assert.throws(() => newPassword('a unique lengthy password', 'different'));
  assert.throws(() => newPassword('password123456789', 'password123456789'));
  assert.equal(newPassword('💚'.repeat(15), '💚'.repeat(15)), '💚'.repeat(15));
});
test('breached password lookup sends only padded hash prefix, fails closed, and ignores padding zero counts', async () => {
  const password = 'unique-test-passphrase',
    hash = createHash('sha1').update(password).digest('hex').toUpperCase();
  const check = async (count) =>
    checkPasswordBreach(password, async (url, options) => {
      assert.equal(url, 'https://api.pwnedpasswords.com/range/' + hash.slice(0, 5));
      assert.equal(options.headers['Add-Padding'], 'true');
      assert.equal(options.redirect, 'error');
      assert(!JSON.stringify(options).includes(password));
      return new Response(hash.slice(5) + ':' + count + '\r\n');
    });
  await check(0);
  await assert.rejects(check(7), { status: 400 });
  await assert.rejects(
    checkPasswordBreach(password, async () => new Response('invalid')),
    { status: 503 },
  );
  await assert.rejects(
    checkPasswordBreach(password, async () => {
      throw new Error('network');
    }),
    { status: 503 },
  );
});
test('Resend uses fixed HTTPS endpoint, idempotency, plaintext messages and generic errors', async () => {
  assert.equal(mailFromEnv({}), null);
  assert.throws(() => mailFromEnv({ RESEND_API_KEY: 'secret' }));
  const mailer = mailFromEnv(
    { RESEND_API_KEY: 'secret', AUTH_EMAIL_FROM: 'accounts@example.com' },
    async (url, options) => {
      assert.equal(url, 'https://api.resend.com/emails');
      assert.equal(options.redirect, 'error');
      assert.equal(options.headers['Idempotency-Key'], 'job-id');
      assert.deepEqual(JSON.parse(options.body), {
        from: 'accounts@example.com',
        to: ['person@example.com'],
        subject: 'Confirm',
        text: 'content',
      });
      return new Response('{}');
    },
  );
  await mailer.send({ to: 'person@example.com', subject: 'Confirm', text: 'content' }, 'job-id');
  const failed = mailFromEnv(
    { RESEND_API_KEY: 'secret', AUTH_EMAIL_FROM: 'a@example.com' },
    async () => new Response('private-provider-error', { status: 500 }),
  );
  await assert.rejects(failed.send({}, 'id'), { message: 'Email delivery unavailable.' });
});
test('durable email outbox encrypts payloads and retries using the same idempotency key', async () => {
  const key = Buffer.alloc(32, 9),
    queries = [];
  let row = null,
    released = false,
    fail = true;
  const client = {
    async query(sql, args) {
      queries.push(sql);
      if (sql.startsWith('INSERT INTO oc_mail_outbox'))
        row = { id: args[0], payload: args[1], attempts: 0 };
      if (sql.startsWith('SELECT * FROM oc_mail_outbox')) return { rows: row ? [row] : [] };
      if (sql.startsWith('DELETE FROM oc_mail_outbox WHERE id')) row = null;
      return { rows: [] };
    },
    release() {
      released = true;
    },
  };
  const message = { to: 'a@example.com', subject: 'Confirm', text: 'secret-link' };
  await queueMail(client, key, message);
  assert(!row.payload.includes('secret-link'));
  const id = row.id;
  const mailer = {
    async send(value, job) {
      assert.deepEqual(value, message);
      assert.equal(job, id);
      if (fail) throw new Error();
    },
  };
  await flushMail({ connect: async () => client }, mailer, key, 1);
  assert(row);
  assert(queries.some((sql) => sql.startsWith('UPDATE oc_mail_outbox SET attempts')));
  assert(released);
  fail = false;
  await flushMail({ connect: async () => client }, mailer, key, 1);
  assert.equal(row, null);
});
test('MFA challenges bind to the requesting browser and invalid attempts commit rather than roll back', async () => {
  const login = 'a'.repeat(64),
    token = 'b'.repeat(64),
    queries = [],
    user = { id: 'user', email_verified_at: new Date(), mfa_enabled: true };
  const challenge = {
    token_hash: 'hash',
    user_id: 'user',
    purpose: 'mfa',
    kind: 'web',
    return_to: '/',
  };
  const client = {
    async query(sql) {
      queries.push(sql);
      return {
        rows: sql.includes('FROM oc_auth_challenges')
          ? [challenge]
          : sql.includes('FROM oc_users')
            ? [user]
            : [],
      };
    },
    release() {},
  };
  const auth = {
    pool: { connect: async () => client, query: client.query },
    readCookie(req, name) {
      return req.headers[name];
    },
    secure: false,
    rateLimit: async () => {},
    issue: async () => {
      throw new Error('must not issue');
    },
  };
  const security = new AccountSecurity(auth, {}, Buffer.alloc(32), async () => {});
  security.factor = async () => false;
  assert.equal(await security.pending({ headers: { oc_login: login } }), null);
  await assert.rejects(
    security.complete({ headers: { oc_login: login, oc_challenge: token } }, 'wrong', 'ip'),
    { status: 401 },
  );
  assert(queries.includes('COMMIT'));
  assert(!queries.includes('ROLLBACK'));
  assert(queries.some((sql) => sql.includes('attempts=attempts+1')));
  const userLock = queries.findIndex((sql) => sql.includes('FROM oc_users'));
  const challengeLock = queries.findIndex((sql) => sql.includes('SELECT token_hash'));
  assert(userLock < challengeLock);
});
test('security changes require a valid recent primary authentication', async () => {
  const security = new AccountSecurity({}, null, null, async () => {});
  for (const session of [
    null,
    { created_at: 'invalid' },
    { created_at: new Date(Date.now() - 6 * 60000) },
  ])
    await assert.rejects(security.fresh({}, {}, session, {}), { status: 403 });
  await security.fresh({ query: async () => ({ rows: [{}] }) }, {}, { created_at: new Date() }, {});
  await assert.rejects(
    security.fresh({ query: async () => ({ rows: [] }) }, {}, { created_at: new Date() }, {}),
    { status: 403 },
  );
});
