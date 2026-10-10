// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { Challenges } from '../server/challenge.mjs';

/** Remembers spent answers as the oc_challenge_uses table would. */
const spentAnswers = () => {
  const spent = new Set();
  return {
    async query(sql, [id] = []) {
      if (sql.startsWith('DELETE')) return { rowCount: 0 };
      if (spent.has(id)) return { rowCount: 0 };
      spent.add(id);
      return { rowCount: 1 };
    },
  };
};
const solve = (c) => {
  for (let n = 0; n <= c.maxnumber; n++)
    if (
      createHash('sha256')
        .update(c.salt + n)
        .digest('hex') === c.challenge
    )
      return n;
  throw new Error('unsolved');
};
const header = (value) => ({
  headers: { 'x-challenge': Buffer.from(JSON.stringify(value)).toString('base64url') },
  clientAddress: '203.0.113.9',
});
const refused = async (promise) => {
  const error = await promise.then(
    () => assert.fail('expected a challenge'),
    (e) => e,
  );
  assert.equal(error.status, 428);
  return error.challenge;
};

test('proof of work answers are signed, bound to their purpose, and spent once', async () => {
  const challenges = new Challenges({
    pool: spentAnswers(),
    difficulty: 2000,
    key: Buffer.alloc(32),
  });
  const issued = await refused(challenges.require({ headers: {} }, 'register'));
  assert.equal(issued.provider, 'pow');
  assert.equal(issued.purpose, 'register');
  const answer = { provider: 'pow', ...issued, number: solve(issued) };
  // Another purpose's action does not accept it.
  await refused(challenges.require(header(answer), 'plugin'));
  await challenges.require(header(answer), 'register');
  await refused(challenges.require(header(answer), 'register'));
  // Tampering with the target or forging a signature fails.
  const next = await refused(challenges.require({ headers: {} }, 'register'));
  const forged = { provider: 'pow', ...next, number: solve(next), signature: '0'.repeat(64) };
  await refused(challenges.require(header(forged), 'register'));
  // A challenge signed by another installation's key is refused.
  const other = new Challenges({
    pool: spentAnswers(),
    difficulty: 2000,
    key: Buffer.alloc(32, 1),
  });
  const foreign = await refused(other.require({ headers: {} }, 'register'));
  await refused(
    challenges.require(header({ provider: 'pow', ...foreign, number: solve(foreign) }), 'register'),
  );
  await refused(challenges.require({ headers: { 'x-challenge': 'not base64 json' } }, 'register'));
});

test('expired proof of work is refused', async () => {
  const challenges = new Challenges({ pool: spentAnswers(), difficulty: 2000 });
  const issued = await refused(challenges.require({ headers: {} }, 'email'));
  const realNow = Date.now;
  Date.now = () => realNow() + 11 * 60 * 1000;
  try {
    await refused(
      challenges.require(header({ provider: 'pow', ...issued, number: solve(issued) }), 'email'),
    );
  } finally {
    Date.now = realNow;
  }
});

test('Turnstile answers are verified with Cloudflare for the right action and hostname', async () => {
  const requests = [];
  let result = { success: true, action: 'contribution', hostname: 'timescale.info' };
  const challenges = new Challenges({
    provider: 'turnstile',
    turnstile: { siteKey: 'site', secretKey: 'secret' },
    origin: 'https://timescale.info',
    fetcher: async (url, options) => {
      requests.push([url, Object.fromEntries(options.body)]);
      if (result instanceof Error) throw result;
      return { ok: true, json: async () => result };
    },
  });
  const web = { kind: 'web' };
  assert.deepEqual(await refused(challenges.require({ headers: {} }, 'contribution', web)), {
    provider: 'turnstile',
    purpose: 'contribution',
    siteKey: 'site',
  });
  const answer = header({ provider: 'turnstile', token: 'token' });
  await challenges.require(answer, 'contribution', web);
  assert.deepEqual(requests.at(-1), [
    'https://challenges.cloudflare.com/turnstile/v0/siteverify',
    { secret: 'secret', response: 'token', remoteip: '203.0.113.9' },
  ]);
  result = { ...result, action: 'register' };
  await refused(challenges.require(answer, 'contribution', web));
  result = { success: true, action: 'contribution', hostname: 'evil.example' };
  await refused(challenges.require(answer, 'contribution', web));
  result = new Error('network down');
  const realError = console.error;
  console.error = () => {};
  try {
    await assert.rejects(challenges.require(answer, 'contribution', web), { status: 503 });
  } finally {
    console.error = realError;
  }
  // Desktop and API-key sessions cannot show Cloudflare's widget, so they get proof of work.
  assert.equal(
    (await refused(challenges.require({ headers: {} }, 'contribution', { kind: 'desktop' })))
      .provider,
    'pow',
  );
  // A Turnstile token is not accepted from a session that was asked for proof of work.
  await refused(challenges.require(answer, 'contribution', { kind: 'api' }));
});

test('challenges can be turned off, and settings are validated', async () => {
  const off = new Challenges({ provider: 'off' });
  await off.require({ headers: {} }, 'register');
  assert.equal(await off.signInNeeded('203.0.113.9', 'someone'), false);
  assert.equal(await off.contributionNeeded('u', 't'), false);
  assert.throws(() => new Challenges({ provider: 'captcha' }), /CHALLENGE_PROVIDER/);
  assert.throws(() => new Challenges({ difficulty: 10 }), /CHALLENGE_DIFFICULTY/);
  assert.throws(() => new Challenges({ provider: 'turnstile' }), /TURNSTILE_SITE_KEY/);
  assert.deepEqual(Challenges.settings({}), {
    provider: 'pow',
    difficulty: undefined,
    trustDays: undefined,
    turnstile: undefined,
  });
});
