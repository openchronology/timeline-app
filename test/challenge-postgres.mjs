// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import pg from 'pg';
import { createApplication } from '../server/http.mjs';
import { passwordHash } from '../server/auth.mjs';
if (!process.env.DATABASE_URL) throw new Error('Use a dedicated PostgreSQL test database.');
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
await pool.query(await readFile(new URL('../server/schema.sql', import.meta.url), 'utf8'));
const app = createApplication({
  pool,
  mailer: { async send() {} },
  securityKey: Buffer.alloc(32, 41),
  passwordCheck: async () => {},
  trustProxy: true,
  challenges: { provider: 'pow', difficulty: 2000 },
});
await new Promise((resolve) => app.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${app.address().port}`,
  suffix = Date.now().toString(36),
  password = 'a unique challenge testing passphrase';
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
const answer = (c) =>
  Buffer.from(JSON.stringify({ provider: 'pow', ...c, number: solve(c) })).toString('base64url');
let n = 0;
function client() {
  const cookies = new Map(),
    // Failures are remembered per address for 15 minutes, so each run uses fresh ones.
    ip = `198.${(Date.now() >> 8) & 255}.${n >> 8}.${++n & 255}`;
  let csrf;
  return {
    /** Sends a request; a 428 is answered once, like the browser clients do. */
    async request(path, data, status = 200, { method, solveChallenge = true } = {}) {
      const send = async (challenge) => {
        const response = await fetch(origin + '/api/' + path, {
          method: method ?? (data === undefined ? 'GET' : 'POST'),
          headers: {
            'X-Forwarded-For': ip,
            Cookie: [...cookies].map(([k, v]) => `${k}=${v}`).join('; '),
            ...(csrf ? { 'X-CSRF-Token': csrf } : {}),
            ...(data ? { 'Content-Type': 'application/json' } : {}),
            ...(challenge ? { 'X-Challenge': challenge } : {}),
          },
          ...(data ? { body: JSON.stringify(data) } : {}),
        });
        for (const h of response.headers.getSetCookie()) {
          const [pair] = h.split(';'),
            [k, v] = pair.split('=');
          if (v) cookies.set(k, v);
          else cookies.delete(k);
        }
        return { status: response.status, value: await response.json() };
      };
      let reply = await send();
      const challenged = reply.status === 428;
      if (challenged && solveChallenge) reply = await send(answer(reply.value.challenge));
      assert.equal(reply.status, status, JSON.stringify(reply.value));
      if (reply.value.csrf) csrf = reply.value.csrf;
      return { ...reply.value, challenged };
    },
  };
}
const created = [];
/** A verified account, created directly so each check starts from a known state. */
async function account(name, { admin = false, age = '0 days' } = {}) {
  const id = randomUUID(),
    username = name + '_' + suffix;
  await pool.query(
    `INSERT INTO oc_users(id,username,password_hash,email,email_verified_at,is_admin,created_at)
    VALUES($1,$2,$3,$4,now(),$5,now()-$6::interval)`,
    [id, username, await passwordHash(password), username + '@example.test', admin, age],
  );
  created.push(id);
  const c = client();
  await c.request('session');
  await c.request('auth/login', { username, password });
  return { id, username, client: c };
}
try {
  // Sign-up and email sending always ask; an answer is spent once.
  const visitor = client();
  await visitor.request('session');
  const signup = {
    username: 'newcomer_' + suffix,
    email: 'newcomer_' + suffix + '@example.test',
    password,
    passwordConfirmation: password,
  };
  const refused = await visitor.request('auth/register', signup, 428, { solveChallenge: false });
  assert.equal(refused.challenge.provider, 'pow');
  assert.equal(refused.challenge.purpose, 'register');
  const registered = await visitor.request('auth/register', signup);
  assert(registered.challenged && registered.verificationRequired);
  const forgot = await visitor.request('auth/password/forgot', { email: signup.email });
  assert(forgot.challenged);

  // Sign-in asks only after three failures for the account (or from the address).
  const member = await account('member');
  const signer = client();
  await signer.request('session');
  for (let i = 0; i < 3; i++) {
    const failed = await signer.request(
      'auth/login',
      { username: member.username, password: 'wrong' },
      401,
    );
    assert(!failed.challenged);
  }
  // Another address is challenged too: the account has been targeted.
  const elsewhere = client();
  await elsewhere.request('session');
  await elsewhere.request('auth/login', { username: member.username, password }, 428, {
    solveChallenge: false,
  });
  assert(
    (await elsewhere.request('auth/login', { username: member.username, password })).challenged,
  );

  // Contributions: a new account posting to someone else's timeline is asked; members,
  // owners, administrators and established accounts are not.
  const owner = await account('owner', { age: '30 days' });
  const timeline = await owner.client.request(
    'timelines',
    { format: 'openchronology', version: 1, title: 'Challenged', description: '', events: [] },
    201,
  );
  await owner.client.request(`timelines/${timeline.id}/settings`, { visibility: 'public' }, 200, {
    method: 'PATCH',
  });
  await pool.query("INSERT INTO oc_members(timeline_id,user_id,role) VALUES($1,$2,'contributor')", [
    timeline.id,
    member.id,
  ]);
  const newcomer = await account('stranger');
  const veteran = await account('veteran', { age: '30 days' });
  const admin = await account('admin', { admin: true });
  const proposals = `timelines/${timeline.id}/proposals`;
  // An answered request goes on to validate the (empty) proposal, so 400 means it got past.
  const posted = await newcomer.client.request(proposals, {}, 400);
  assert(posted.challenged);
  for (const trusted of [owner, member, veteran, admin])
    assert(!(await trusted.client.request(proposals, {}, 400)).challenged, trusted.username);

  // Publishing a plugin always asks, except for administrators.
  await pool.query('UPDATE oc_users SET quota_bypass=true WHERE id=ANY($1)', [
    [veteran.id, admin.id],
  ]);
  assert((await veteran.client.request('plugins/publish', {}, 400)).challenged);
  assert(!(await admin.client.request('plugins/publish', {}, 400)).challenged);
  console.log(
    'PASS challenges: sign-up and email, sign-in after failures, contributions by new accounts, plugin publishing.',
  );
} finally {
  // Other suites share this database; an extra administrator would change their results.
  await pool.query('DELETE FROM oc_timelines WHERE owner_id=ANY($1)', [created]);
  await pool.query('DELETE FROM oc_users WHERE id=ANY($1)', [created]);
  await new Promise((resolve) => app.close(resolve));
  await pool.end();
}
