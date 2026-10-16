// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// Accounts are for people 13 and older (#115): the year of birth at password sign-up and at
// a social sign-in's email step (where an under-13 account is closed before it can be used);
// minors always see sensitive-content warnings and browse no labelled timelines; adults may
// turn the warnings off.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomBytes, randomUUID } from 'node:crypto';
import pg from 'pg';
import { Auth, passwordHash, minor } from '../server/auth.mjs';
import { birthYear } from '../server/account-security.mjs';
import { createApplication } from '../server/http.mjs';
import { searchTimelines } from '../server/collaboration.mjs';
import { sweepStanding } from '../server/standing.mjs';
import { digest } from '../server/security-crypto.mjs';
if (!process.env.DATABASE_URL) throw new Error('Use a dedicated PostgreSQL test database.');
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
await pool.query(await readFile(new URL('../server/schema.sql', import.meta.url), 'utf8'));
const year = new Date().getUTCFullYear(),
  suffix = randomUUID().slice(0, 8),
  password = 'unique ages testing passphrase',
  ids = [],
  sent = [];
const app = createApplication({
  pool,
  mailer: {
    async send(message) {
      sent.push(message);
    },
  },
  securityKey: Buffer.alloc(32, 43),
  passwordCheck: async () => {},
});
await new Promise((resolve) => app.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${app.address().port}`,
  auth = new Auth(pool, origin);
let n = 0;
/** A browser: its cookies and CSRF token, from a distinct address. */
function client() {
  const cookies = new Map(),
    ip = `203.0.${(Date.now() >> 8) & 255}.${++n}`;
  let csrf;
  return {
    cookies,
    async request(path, method = 'GET', data, expected = 200) {
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
      for (const header of response.headers.getSetCookie()) {
        const [key, value] = header.split(';')[0].split('=');
        if (value) cookies.set(key, value);
        else cookies.delete(key);
      }
      const value = await response.json();
      assert.equal(response.status, expected, `${method} ${path}: ${JSON.stringify(value)}`);
      if (value.csrf) csrf = value.csrf;
      return value;
    },
  };
}
/** A signed-in account born in `born`. */
async function account(name, born) {
  const id = randomUUID();
  ids.push(id);
  await pool.query(
    `INSERT INTO oc_users(id,username,email,email_verified_at,password_hash,birth_year,quota_bypass,created_at)
    VALUES($1,$2,$3,now(),$4,$5,true,now()-interval '40 days')`,
    [id, `${name}_${suffix}`, `${name}_${suffix}@example.test`, await passwordHash(password), born],
  );
  const issued = await auth.issue(
    (await pool.query('SELECT * FROM oc_users WHERE id=$1', [id])).rows[0],
  );
  const c = client();
  const [cookie, value] = issued.cookie.split(';')[0].split('=');
  c.cookies.set(cookie, value);
  await c.request('session');
  return { id, client: c };
}
try {
  // Counted from the end of the year of birth.
  assert.throws(
    () => birthYear(year - 12),
    (e) => e.status === 403,
  );
  assert.throws(
    () => birthYear(year - 13 + 1),
    (e) => e.status === 403,
  );
  assert.equal(birthYear(year - 13), year - 13);
  assert.throws(
    () => birthYear('soon'),
    (e) => e.status === 400,
  );
  assert.throws(
    () => birthYear(year + 1),
    (e) => e.status === 400,
  );
  assert(minor(year - 17) && !minor(year - 18) && !minor(null));

  // Password sign-up: a year of birth is required, and under 13 refused.
  const visitor = client();
  await visitor.request('session');
  const signup = {
    username: 'young_' + suffix,
    email: `young_${suffix}@example.test`,
    password,
    passwordConfirmation: password,
  };
  await visitor.request('auth/register', 'POST', signup, 400);
  const refused = await visitor.request(
    'auth/register',
    'POST',
    { ...signup, birthYear: year - 10 },
    403,
  );
  // Neutral: it does not say what age would do (the FTC's guidance on age screens).
  assert.doesNotMatch(refused.error, /\d/);
  // Going back to give another year in the same browser is refused too, for a day.
  await visitor.request('auth/register', 'POST', { ...signup, birthYear: year - 15 }, 403);
  const another = client();
  await another.request('session');
  await another.request('auth/register', 'POST', { ...signup, birthYear: year - 15 });
  const registration = (
    await pool.query('SELECT birth_year FROM oc_registrations WHERE username=$1', [
      'young_' + suffix,
    ])
  ).rows[0];
  assert.equal(registration.birth_year, year - 15);
  await pool.query('DELETE FROM oc_registrations WHERE username=$1', ['young_' + suffix]);

  // A social sign-in's new account gives it at the email step, before it can sign in.
  const social = async (born, expected) => {
    const id = randomUUID();
    await pool.query('INSERT INTO oc_users(id,username,password_hash) VALUES($1,$2,NULL)', [
      id,
      `github_${randomBytes(8).toString('hex')}`,
    ]);
    ids.push(id);
    const c = client();
    await c.request('session');
    const token = randomBytes(32).toString('hex');
    await pool.query(
      "INSERT INTO oc_auth_challenges(token_hash,user_id,browser_hash,purpose,kind,return_to,expires_at) VALUES($1,$2,$3,'email','web','/',now()+interval '5 minutes')",
      [digest(token), id, digest(c.cookies.get('oc_login'))],
    );
    c.cookies.set('oc_challenge', token);
    const email = `social_${id.slice(0, 8)}@example.test`;
    await c.request(
      'auth/email/enroll',
      'POST',
      { email, ...(born ? { birthYear: born } : {}) },
      expected,
    );
    return (await pool.query('SELECT birth_year FROM oc_users WHERE id=$1', [id])).rows[0];
  };
  assert.equal((await social(null, 400)).birth_year, null);
  assert.equal(await social(year - 9, 403), undefined, 'Closed: deleted, holding nothing.');
  assert.equal((await social(year - 30, 200)).birth_year, year - 30);

  // Minors always see warnings; adults may turn them off.
  const teen = await account('teen', year - 15),
    adult = await account('adult', year - 30),
    earlier = await account('earlier', null);
  assert.deepEqual(
    [
      (await teen.client.request('session')).user.minor,
      (await adult.client.request('session')).user.minor,
    ],
    [true, false],
  );
  assert.equal(
    (await earlier.client.request('session')).user.minor,
    false,
    'Made under 18+ terms.',
  );
  await teen.client.request('auth/profile', 'PATCH', { showSensitive: true }, 403);
  await adult.client.request('auth/profile', 'PATCH', { showSensitive: 'yes' }, 400);
  await adult.client.request('auth/profile', 'PATCH', { showSensitive: true });
  assert.equal((await adult.client.request('session')).user.showSensitive, true);
  assert.equal((await adult.client.request('auth/account')).profile.showSensitive, true);
  assert.equal((await teen.client.request('auth/account')).profile.minor, true);

  // Minors browse no labelled timelines; adults do.
  const tag = 'ages-' + suffix;
  for (const [title, labels] of [
    ['Plain ' + suffix, []],
    ['Labelled ' + suffix, ['violence']],
  ])
    await pool.query(
      "INSERT INTO oc_timelines(id,owner_id,title,visibility,tags,content_labels,featured) VALUES($1,$2,$3,'public',$4,$5,true)",
      [randomUUID(), adult.id, title, [tag], labels],
    );
  // The owner is established (#103), so browsing lists its timelines.
  await sweepStanding(pool);
  const browse = async (account) =>
    (await searchTimelines(pool, account?.id ?? null, { scope: 'public', tag })).timelines
      .map((t) => t.title)
      .sort();
  assert.deepEqual(await browse(teen), ['Plain ' + suffix]);
  assert.deepEqual(await browse(null), ['Plain ' + suffix]);
  assert.deepEqual(await browse(adult), ['Labelled ' + suffix, 'Plain ' + suffix]);
  console.log(
    'PASS ages: 13 and older at sign-up and social sign-in; minors warned; adults choose.',
  );
} finally {
  await pool.query('DELETE FROM oc_timelines WHERE owner_id=ANY($1::uuid[])', [ids]);
  await pool.query('DELETE FROM oc_users WHERE id=ANY($1::uuid[])', [ids]);
  app.close();
  await pool.end();
}
