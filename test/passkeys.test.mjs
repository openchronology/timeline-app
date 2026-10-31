// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// Passkeys (#372): verifying registrations and assertions (webauthn.mjs) for each algorithm,
// and refusing a wrong origin or RP ID, a missing user verification, a counter that went
// backwards (a copied credential), a forged signature and malformed answers; challenges used
// once (passkeys.mjs); and the PASSKEY_SIGN_IN setting.
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import {
  verifyRegistration,
  verifyAssertion,
  decodeCbor,
  coseKey,
  userHandle,
} from '../server/webauthn.mjs';
import { Passkeys, passkeySignIn, passkeyAnswer } from '../server/passkeys.mjs';
import { digest } from '../server/security-crypto.mjs';
import { softAuthenticator, encodeCbor } from './webauthn-authenticator.mjs';
import { recoveryCodesOnly } from '../platform/lib/second-factor.js';

const origin = 'https://timescale.info',
  rpId = 'timescale.info';
const challenge = () => randomBytes(32).toString('base64url');
const expected = (c) => ({ challenge: c, origin, rpId });
const creation = (c) => ({ challenge: c, rp: { id: rpId } });
const request = (c) => ({ challenge: c, rpId });
/** A registered passkey of `authenticator`, as stored. */
function registered(authenticator) {
  const c = challenge();
  const r = verifyRegistration(authenticator.create(creation(c), { origin }), expected(c));
  return { publicKey: r.publicKey, signCount: r.signCount, algorithm: r.algorithm };
}

test('passkeys of each algorithm register and then sign in', () => {
  for (const algorithm of [-7, -8, -257]) {
    const authenticator = softAuthenticator({ algorithm }),
      c = challenge();
    const r = verifyRegistration(authenticator.create(creation(c), { origin }), expected(c));
    assert.equal(r.algorithm, algorithm);
    assert.equal(r.credentialId, authenticator.id);
    assert.equal(r.aaguid, '0123456789abcdef0123456789abcdef');
    assert.deepEqual(r.transports, ['internal', 'hybrid']);
    assert.equal(r.signCount, 0);
    // The stored key is the COSE key, which reads back as the same algorithm.
    assert.equal(coseKey(r.publicKey).algorithm, algorithm);
    const c2 = challenge();
    const result = verifyAssertion(
      authenticator.get(request(c2), { origin }),
      { publicKey: r.publicKey, signCount: r.signCount },
      expected(c2),
    );
    assert.equal(result.signCount, 0);
  }
});

test('a registration is refused for another origin, RP ID, challenge or step, or without verification', () => {
  const authenticator = softAuthenticator();
  const refused = (options, reason, c = challenge(), wanted = c) =>
    assert.throws(
      () => verifyRegistration(authenticator.create(creation(c), options), expected(wanted)),
      (e) => e.reason === reason && e.status === 401,
      reason,
    );
  refused({ origin: 'https://timescale.info.evil.example' }, 'origin');
  refused({ origin: 'http://timescale.info' }, 'origin');
  refused({ origin, client: { crossOrigin: true } }, 'origin');
  refused({ origin, rpId: 'evil.example' }, 'rp-id');
  refused({ origin, flags: 0x01 }, 'user-verified');
  refused({ origin, flags: 0x04 }, 'user-present');
  refused({ origin, flags: 0x15 }, 'backup');
  refused({ origin, type: 'webauthn.get' }, 'type');
  refused({ origin }, 'challenge', challenge(), challenge());
  // The credential ID must be the one in the authenticator data.
  const c = challenge(),
    answer = authenticator.create(creation(c), { origin });
  answer.rawId = randomBytes(32).toString('base64url');
  assert.throws(() => verifyRegistration(answer, expected(c)), { reason: 'credential-id' });
  // Garbage instead of CBOR.
  answer.rawId = answer.id;
  answer.response.attestationObject = Buffer.from([0xa1, 0xff]).toString('base64url');
  assert.throws(() => verifyRegistration(answer, expected(c)), { reason: 'cbor' });
  assert.throws(() => verifyRegistration(null, expected(c)), { reason: 'shape' });
});

test('an assertion is refused for another origin, RP ID or challenge, without verification, or forged', () => {
  const authenticator = softAuthenticator(),
    stored = registered(authenticator);
  const refused = (options, reason, c = challenge(), wanted = c) =>
    assert.throws(
      () => verifyAssertion(authenticator.get(request(c), options), stored, expected(wanted)),
      (e) => e.reason === reason && e.status === 401,
      reason,
    );
  refused({ origin: 'https://phish.example' }, 'origin');
  refused({ origin, rpId: 'phish.example' }, 'rp-id');
  refused({ origin, flags: 0x01 }, 'user-verified');
  refused({ origin, flags: 0x00 }, 'user-present');
  refused({ origin, type: 'webauthn.create' }, 'type');
  refused({ origin }, 'challenge', challenge(), challenge());
  refused({ origin, tamper: true }, 'signature');
  // Another passkey's key does not verify this one's signature.
  const c = challenge();
  assert.throws(
    () =>
      verifyAssertion(
        authenticator.get(request(c), { origin }),
        registered(softAuthenticator()),
        expected(c),
      ),
    { reason: 'signature' },
  );
});

test('a signature counter that does not advance is refused as a copied passkey', () => {
  const authenticator = softAuthenticator({ counter: 5 }),
    stored = registered(authenticator);
  assert.equal(stored.signCount, 5);
  let c = challenge();
  const next = verifyAssertion(authenticator.get(request(c), { origin }), stored, expected(c));
  assert.equal(next.signCount, 6);
  // The same count again (a copy that signed in elsewhere, or a replay) is refused.
  c = challenge();
  assert.throws(
    () =>
      verifyAssertion(
        authenticator.get(request(c), { origin }),
        { ...stored, signCount: 7 },
        expected(c),
      ),
    { reason: 'clone' },
  );
  // A lower count too.
  c = challenge();
  authenticator.state.counter = 2;
  assert.throws(
    () =>
      verifyAssertion(
        authenticator.get(request(c), { origin }),
        { ...stored, signCount: 6 },
        expected(c),
      ),
    { reason: 'clone' },
  );
  // A counter falling to zero after counting.
  c = challenge();
  authenticator.state.counter = 0;
  assert.throws(
    () =>
      verifyAssertion(
        authenticator.get(request(c), { origin }),
        { ...stored, signCount: 6 },
        expected(c),
      ),
    { reason: 'clone' },
  );
  // Authenticators that keep no counter (0 and 0) are not checked.
  const synced = softAuthenticator(),
    kept = registered(synced);
  for (let i = 0; i < 3; i++) {
    c = challenge();
    assert.equal(
      verifyAssertion(synced.get(request(c), { origin }), kept, expected(c)).signCount,
      0,
    );
  }
});

test('CBOR and COSE keys are read strictly', () => {
  assert.deepEqual(decodeCbor(encodeCbor(new Map([[1, -7]])))[0], new Map([[1, -7]]));
  assert.throws(() => decodeCbor(Buffer.from([0x5f])), { reason: 'cbor' }); // indefinite bytes
  assert.throws(() => decodeCbor(Buffer.from([0xa2, 1, 1, 1, 2])), { reason: 'cbor' }); // repeated key
  assert.throws(() => decodeCbor(Buffer.from([0x43, 1])), { reason: 'cbor' }); // truncated
  let nested = Buffer.from([1]);
  for (let i = 0; i < 40; i++) nested = Buffer.concat([Buffer.from([0x81]), nested]);
  assert.throws(() => decodeCbor(nested), { reason: 'cbor' });
  // An unsupported algorithm (ES384) and a short RSA key.
  assert.throws(
    () =>
      coseKey(
        encodeCbor(
          new Map([
            [1, 2],
            [3, -35],
            [-1, 2],
          ]),
        ),
      ),
    { reason: 'key' },
  );
  assert.throws(
    () =>
      coseKey(
        encodeCbor(
          new Map([
            [1, 3],
            [3, -257],
            [-1, randomBytes(128)],
            [-2, Buffer.from([1, 0, 1])],
          ]),
        ),
      ),
    { reason: 'key' },
  );
  assert.equal(userHandle('00112233-4455-6677-8899-aabbccddeeff'), 'ABEiM0RVZneImaq7zN3u_w');
  assert.deepEqual(passkeyAnswer('{"id":"x"}'), { id: 'x' });
  assert.equal(passkeyAnswer('not json'), null);
  assert.equal(passkeyAnswer(null), null);
  assert.equal(passkeyAnswer('[1]'), null);
});

test('an RSA key is measured by its modulus, not by the bytes it is sent in', () => {
  // A 1024-bit modulus sent as 256 bytes (128 of them leading zeros) is still 1024 bits.
  const short = softAuthenticator({ algorithm: -257, modulusLength: 1024, pad: 128 }),
    c = challenge();
  assert.throws(() => verifyRegistration(short.create(creation(c), { origin }), expected(c)), {
    reason: 'key',
  });
  // A 2048-bit one with a leading zero byte is fine.
  const padded = softAuthenticator({ algorithm: -257, pad: 1 });
  assert.equal(registered(padded).algorithm, -257);
});

test('the account page asks for a factor when only recovery codes answer two-factor', () => {
  const key = { id: 'k', name: 'Key' };
  // As a reset leaves an account whose passkeys were its only factor.
  assert.equal(recoveryCodesOnly({ mfa_enabled: true, totp_enabled: false, passkeys: [] }), true);
  assert.equal(recoveryCodesOnly({ mfa_enabled: true, totp_enabled: false }), true);
  // An app, a passkey, or two-factor off: nothing to ask.
  assert.equal(recoveryCodesOnly({ mfa_enabled: true, totp_enabled: true, passkeys: [] }), false);
  assert.equal(
    recoveryCodesOnly({ mfa_enabled: true, totp_enabled: false, passkeys: [key] }),
    false,
  );
  assert.equal(recoveryCodesOnly({ mfa_enabled: false, totp_enabled: false, passkeys: [] }), false);
  assert.equal(recoveryCodesOnly(undefined), false);
});

test('PASSKEY_SIGN_IN allows signing in with a passkey unless turned off', () => {
  for (const value of [undefined, '', '1', 'true', 'YES', 'on'])
    assert.equal(passkeySignIn(value), true);
  for (const value of ['0', 'false', 'No', 'off']) assert.equal(passkeySignIn(value), false);
  assert.throws(() => passkeySignIn('sometimes'), /PASSKEY_SIGN_IN/);
});

/**
 * Passkeys with an in-memory stand-in for PostgreSQL: the challenges table and one account's
 * passkeys, enough for issuing and answering challenges.
 */
function memoryPasskeys() {
  const challenges = new Map(),
    passkeys = [];
  const pool = {
    async query(sql, params = []) {
      if (sql.startsWith('DELETE FROM oc_passkey_challenges WHERE expires_at')) return { rows: [] };
      if (sql.startsWith('INSERT INTO oc_passkey_challenges')) {
        const [hash, purpose, user, binding] = params;
        challenges.set(hash, { purpose, user, binding });
        return { rows: [] };
      }
      if (sql.startsWith('DELETE FROM oc_passkey_challenges')) {
        const [hash, purpose, binding, user] = params,
          row = challenges.get(hash);
        if (!row || row.purpose !== purpose || row.binding !== binding || row.user !== user)
          return { rows: [] };
        challenges.delete(hash);
        return { rows: [{ challenge_hash: hash }] };
      }
      if (sql.startsWith('SELECT credential_id,transports'))
        return { rows: passkeys.map((p) => ({ credential_id: p.credential_id, transports: [] })) };
      if (sql.startsWith('SELECT * FROM oc_passkeys'))
        return { rows: passkeys.filter((p) => p.credential_id === params[1]) };
      if (sql.startsWith('UPDATE oc_passkeys SET sign_count')) {
        passkeys.find((p) => p.id === params[0]).sign_count = params[1];
        return { rows: [] };
      }
      throw new Error('Unexpected query ' + sql);
    },
  };
  const security = { auth: { origin }, pool };
  return { passkeys: new Passkeys(security, { signIn: true }), store: passkeys, challenges };
}

test('a challenge answers once, for its own session, and not after it is used', async () => {
  const { passkeys, store, challenges } = memoryPasskeys(),
    authenticator = softAuthenticator(),
    user = { id: randomUUID() },
    stored = registered(authenticator);
  store.push({
    id: 'p1',
    credential_id: authenticator.id,
    public_key: stored.publicKey,
    sign_count: 0,
  });
  const session = { id: user.id, token_hash: digest('session') };
  const { publicKey } = await passkeys.confirmOptions(session);
  assert.equal(publicKey.rpId, rpId);
  assert.equal(publicKey.userVerification, 'required');
  assert.deepEqual(publicKey.allowCredentials, [{ type: 'public-key', id: authenticator.id }]);
  const answer = authenticator.get(publicKey, { origin });
  // Another session cannot use it, nor another account.
  assert.equal(await passkeys.answers(pool(passkeys), user, answer, 'session:other'), false);
  // (That attempt did not use it up: it was not this challenge's binding.)
  assert.equal(challenges.size, 1);
  assert.equal(
    await passkeys.answers(
      pool(passkeys),
      { id: randomUUID() },
      answer,
      'session:' + session.token_hash,
    ),
    false,
  );
  assert.equal(
    await passkeys.answers(pool(passkeys), user, answer, 'session:' + session.token_hash),
    true,
  );
  assert.equal(store[0].sign_count, 0);
  // Replayed: the challenge is gone.
  assert.equal(challenges.size, 0);
  assert.equal(
    await passkeys.answers(pool(passkeys), user, answer, 'session:' + session.token_hash),
    false,
  );
  // An answer that fails verification still uses its challenge up.
  const second = await passkeys.confirmOptions(session);
  const forged = authenticator.get(second.publicKey, { origin, tamper: true });
  assert.equal(
    await passkeys.answers(pool(passkeys), user, forged, 'session:' + session.token_hash),
    false,
  );
  assert.equal(challenges.size, 0);
  // Without user verification.
  const third = await passkeys.confirmOptions(session);
  assert.equal(
    await passkeys.answers(
      pool(passkeys),
      user,
      authenticator.get(third.publicKey, { origin, flags: 0x01 }),
      'session:' + session.token_hash,
    ),
    false,
  );
  // An account without passkeys gets no challenge.
  store.length = 0;
  assert.deepEqual(await passkeys.confirmOptions(session), { publicKey: null });
});

/** The pool stands in for the caller's transaction too. */
const pool = (passkeys) => passkeys.pool;

test('signing in alone checks the passkey as it is once locked, not as first read', async () => {
  const authenticator = softAuthenticator({ counter: 3 }),
    stored = registered(authenticator),
    user = { id: randomUUID(), email_verified_at: new Date(), is_disabled: false };
  authenticator.state.userHandle = userHandle(user.id);
  const browser = 'ab'.repeat(32);
  // `row` is what the unlocked lookup finds; `locked`, what the read under the lock finds,
  // which a concurrent removal, or a copy signing in first, has changed meanwhile.
  const attempt = async (locked, account = user) => {
    const challenges = new Map(),
      issued = [];
    const row = { id: 'p1', user_id: user.id, public_key: stored.publicKey, sign_count: '3' };
    const client = {
      async query(sql, params = []) {
        if (sql.startsWith('INSERT INTO oc_passkey_challenges')) {
          challenges.set(params[0], params);
          return { rows: [] };
        }
        if (sql.startsWith('DELETE FROM oc_passkey_challenges WHERE expires_at'))
          return { rows: [] };
        if (sql.startsWith('DELETE FROM oc_passkey_challenges'))
          return { rows: challenges.delete(params[0]) ? [{}] : [] };
        if (sql.startsWith('SELECT user_id FROM oc_passkeys')) return { rows: [row] };
        if (sql.startsWith('SELECT * FROM oc_users')) return { rows: account ? [account] : [] };
        if (sql.startsWith('SELECT * FROM oc_passkeys')) return { rows: locked ? [locked] : [] };
        if (sql.startsWith('UPDATE oc_passkeys')) return { rows: [] };
        throw new Error('Unexpected query ' + sql);
      },
    };
    const security = {
      pool: client,
      auth: {
        origin,
        issue: async (u) => (issued.push(u.id), { user: { id: u.id } }),
      },
      configured() {},
      browser: () => browser,
      transaction: (action) => action(client),
      // Not an account that signs in only through its directory (passkeys-postgres.mjs).
      directoryOnly: async () => false,
    };
    const passkeys = new Passkeys(security, { signIn: true });
    const { publicKey } = await passkeys.signInOptions({});
    const credential = authenticator.get(publicKey, { origin });
    return passkeys.signIn({}, { credential }).then(
      (result) => result.user.id,
      (error) => error,
    );
  };
  const fresh = { id: 'p1', user_id: user.id, public_key: stored.publicKey, sign_count: '3' };
  authenticator.state.counter = 3;
  assert.equal(await attempt(fresh), user.id);
  // Removed between the lookup and the lock.
  authenticator.state.counter = 4;
  assert.equal((await attempt(null)).status, 401);
  // A copy signed in meanwhile, moving the counter on: the locked counter refuses this one.
  authenticator.state.counter = 5;
  assert.equal((await attempt({ ...fresh, sign_count: '9' })).reason, 'clone');
  // The account deleted meanwhile: refused, not a crash.
  authenticator.state.counter = 10;
  assert.equal((await attempt(fresh, null)).status, 401);
});
