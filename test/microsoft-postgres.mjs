// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// Microsoft sign-in (server/oauth.mjs, #292) through the HTTP API and PostgreSQL, with
// Microsoft's endpoints answered by a stand-in that signs ID tokens with a test key: the
// authorization request names the tenant and carries PKCE and a nonce; a first sign-in makes an
// account, which confirms an email before it has a session; a later sign-in by the same
// tenant and object ID reaches the same account whatever else the token says; a personal
// account is refused under `organizations`; a Microsoft account links to a password account,
// is refused for a second account, and unlinks again.
import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import pg from 'pg';
import { createApplication } from '../server/http.mjs';
import { flushMail } from '../server/mail.mjs';
import { passwordHash } from '../server/auth.mjs';
import { MICROSOFT_CONSUMERS, pkce, providersFromEnv } from '../server/oauth.mjs';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const school = '7d1c3a5e-0b2f-4c6d-8e9a-1b2c3d4e5f60';
const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'ms-test', use: 'sig' };
// What the stand-in token endpoint signs next: the person, and the nonce of the flow (read from
// the authorization URL the test was given).
let person = null,
  nonce = null,
  verifier = null;
const idToken = (claims) => {
  const now = Math.floor(Date.now() / 1000);
  const data = [
    Buffer.from(JSON.stringify({ alg: 'RS256', kid: 'ms-test', typ: 'JWT' })).toString('base64url'),
    Buffer.from(
      JSON.stringify({
        aud: 'ms-client',
        iss: `https://login.microsoftonline.com/${claims.tid}/v2.0`,
        nonce,
        iat: now,
        nbf: now,
        exp: now + 3600,
        sub: 'pairwise-' + claims.oid.slice(0, 8),
        ...claims,
      }),
    ).toString('base64url'),
  ].join('.');
  return data + '.' + sign('RSA-SHA256', Buffer.from(data), privateKey).toString('base64url');
};
const calls = [];
const fetcher = async (url, options = {}) => {
  url = String(url);
  calls.push(url);
  if (url === 'https://login.microsoftonline.com/organizations/discovery/v2.0/keys')
    return new Response(JSON.stringify({ keys: [jwk] }));
  if (url === 'https://login.microsoftonline.com/organizations/oauth2/v2.0/token') {
    const form = new URLSearchParams(options.body);
    assert.equal(form.get('client_id'), 'ms-client');
    assert.equal(form.get('client_secret'), 'ms-secret');
    assert.equal(form.get('grant_type'), 'authorization_code');
    assert.equal(form.get('code'), 'mock-code');
    assert.match(form.get('redirect_uri'), /\/api\/auth\/microsoft\/callback$/);
    // The verifier the server kept matches the challenge it sent.
    verifier = form.get('code_verifier');
    // Only an ID token: no access token is needed for the identity.
    return new Response(JSON.stringify({ id_token: idToken(person), token_type: 'Bearer' }));
  }
  throw new Error('Unexpected provider request ' + url);
};

let app;
try {
  await pool.query(await readFile(new URL('../server/schema.sql', import.meta.url), 'utf8'));
  await pool.query('DELETE FROM oc_auth_attempts');
  const key = Buffer.alloc(32, 43),
    messages = [],
    mailer = {
      async send(message) {
        messages.push(message);
      },
    };
  app = createApplication({
    pool,
    mailer,
    securityKey: key,
    passwordCheck: async () => {},
    trustProxy: true,
    fetcher,
    providers: providersFromEnv({
      OAUTH_MICROSOFT_CLIENT_ID: 'ms-client',
      OAUTH_MICROSOFT_CLIENT_SECRET: 'ms-secret',
      OAUTH_MICROSOFT_LABEL: 'School account',
    }),
  });
  await new Promise((resolve) => app.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${app.address().port}`;
  let n = 0;
  const client = () => {
    const cookies = new Map(),
      ip = '203.0.113.' + ++n;
    let csrf;
    return {
      async request(path, data, status = 200) {
        const response = await fetch(origin + '/api/' + path, {
          method: data === undefined ? 'GET' : 'POST',
          redirect: 'manual',
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
            at = pair.indexOf('=');
          if (pair.slice(at + 1)) cookies.set(pair.slice(0, at), pair.slice(at + 1));
          else cookies.delete(pair.slice(0, at));
        }
        const value =
          response.status === 303
            ? { location: response.headers.get('location') }
            : await response.json();
        assert.equal(response.status, status, path + ' ' + JSON.stringify(value));
        if (value.csrf) csrf = value.csrf;
        return value;
      },
    };
  };
  const confirm = async (browser, email) => {
    await flushMail(pool, mailer, key);
    const token = messages
      .findLast((m) => m.to === email && m.text.includes('#verify='))
      .text.match(/#verify=([a-f0-9]{64})/)[1];
    await browser.request('auth/email/verify', { token });
  };
  // Starts a Microsoft sign-in (or a link) and comes back from Microsoft as `who`.
  const signIn = async (browser, who, input = {}, status = 303) => {
    const { url } = await browser.request('auth/microsoft/start', input);
    const authorize = new URL(url);
    assert.equal(
      authorize.origin + authorize.pathname,
      'https://login.microsoftonline.com/organizations/oauth2/v2.0/authorize',
    );
    assert.equal(authorize.searchParams.get('client_id'), 'ms-client');
    assert.equal(authorize.searchParams.get('scope'), 'openid profile');
    assert.equal(authorize.searchParams.get('response_type'), 'code');
    assert.equal(authorize.searchParams.get('code_challenge_method'), 'S256');
    assert.match(authorize.searchParams.get('nonce'), /^[a-f0-9]{64}$/);
    nonce = authorize.searchParams.get('nonce');
    person = who;
    const back = await browser.request(
      `auth/microsoft/callback?state=${authorize.searchParams.get('state')}&code=mock-code`,
      undefined,
      status,
    );
    if (status === 303) assert.equal(pkce(verifier), authorize.searchParams.get('code_challenge'));
    return back;
  };

  // The sign-in page offers it, under its label.
  const browser = client();
  const session = await browser.request('session');
  assert.deepEqual(session.providers, ['microsoft']);
  assert.deepEqual(session.providerLabels, { microsoft: 'School account' });

  // A first sign-in makes an account, which must give and confirm an email (and a year of birth)
  // before it has a session.
  const ana = { tid: school, oid: '0a1b2c3d-4e5f-4061-8273-94a5b6c7d8e9', name: 'Ana López' };
  const first = await signIn(browser, ana);
  assert.match(first.location, /^\/login\?step=email/);
  const pending = await browser.request('session');
  assert.equal(pending.user, null);
  assert.equal(pending.challenge, 'email');
  const identity = (
    await pool.query("SELECT subject,user_id FROM oc_identities WHERE provider='microsoft'")
  ).rows.find((r) => r.subject === `${school}:${ana.oid}`);
  assert(identity, 'the identity is the tenant and object IDs');
  const anaEmail = `ana-${Date.now().toString(36)}@school.example`;
  await browser.request('auth/email/enroll', {
    email: anaEmail,
    birthYear: 1985,
    // The terms agreement (#277) where this server asks for it.
    ...(pending.terms ? { acceptTerms: pending.terms } : {}),
  });
  await confirm(browser, anaEmail);
  // Confirmed, the account signs in with Microsoft again to have its session.
  await browser.request('session');
  await signIn(browser, ana);
  const signedIn = await browser.request('session');
  assert.equal(signedIn.user.id, identity.user_id);
  assert.match(signedIn.user.username, /^microsoft_[a-f0-9]{16}$/);
  // Nothing from the token but the identifier was kept: not the name, nor the token itself.
  const stored = JSON.stringify(
    (await pool.query('SELECT * FROM oc_users WHERE id=$1', [identity.user_id])).rows,
  );
  assert(!stored.includes('López'), 'the name is not kept');

  // Signing in again, with a different name, email and pairwise sub, reaches the same account.
  const again = client();
  await again.request('session');
  await signIn(again, { ...ana, name: 'Ana', email: 'ana@other.example', sub: 'changed' });
  assert.equal((await again.request('session')).user.id, identity.user_id);

  // The same object ID in another tenant is another person: a new account.
  const elsewhere = client();
  await elsewhere.request('session');
  await signIn(elsewhere, { ...ana, tid: '11111111-2222-4333-8444-555555555555' });
  assert.equal((await elsewhere.request('session')).user, null);
  assert.equal(
    (await pool.query("SELECT count(*) FROM oc_identities WHERE provider='microsoft'")).rows[0]
      .count,
    '2',
  );

  // Under `organizations`, a personal Microsoft account is refused, as is a token whose issuer
  // names another tenant than its own.
  const personal = client();
  await personal.request('session');
  await signIn(personal, { tid: MICROSOFT_CONSUMERS, oid: ana.oid }, {}, 502);
  await signIn(
    personal,
    { ...ana, iss: 'https://login.microsoftonline.com/11111111-2222-4333-8444-555555555555/v2.0' },
    {},
    502,
  );
  await signIn(personal, { ...ana, aud: 'another-app' }, {}, 502);

  // A password account links a Microsoft account, after signing in, and unlinks it again.
  const ownerName = 'msowner_' + Date.now().toString(36),
    ownerPassword = 'an ordinary account passphrase';
  await pool.query(
    'INSERT INTO oc_users(id,username,password_hash,email,email_verified_at,birth_year) VALUES(gen_random_uuid(),$1,$2,$3,now(),1980)',
    [ownerName, await passwordHash(ownerPassword), ownerName + '@example.test'],
  );
  // Agreed to the terms (#277), where this server records agreement.
  if ((await pool.query("SELECT to_regproc('oc_policy_version') AS f")).rows[0].f)
    await pool.query('UPDATE oc_users SET terms_version=oc_policy_version() WHERE username=$1', [
      ownerName,
    ]);
  const owner = client();
  await owner.request('session');
  await owner.request('auth/login', { username: ownerName, password: ownerPassword });
  // Ana's Microsoft account belongs to her account already.
  await signIn(owner, ana, { link: true }, 409);
  const bea = { tid: school, oid: 'f0e1d2c3-b4a5-4697-8879-6a5b4c3d2e1f' };
  const linked = await signIn(owner, bea, { link: true, returnTo: '/account' });
  assert.equal(linked.location, '/account');
  const account = await owner.request('auth/account');
  assert(account.identities.includes('microsoft'));
  // Bea now signs in to the owner's account.
  const bea2 = client();
  await bea2.request('session');
  await signIn(bea2, bea);
  assert.equal((await bea2.request('session')).user.username, ownerName);
  await owner.request('auth/identities/unlink', {
    provider: 'microsoft',
    password: ownerPassword,
  });
  assert(!(await owner.request('auth/account')).identities.includes('microsoft'));

  // Ana's account has only its Microsoft sign-in: unlinking it is refused.
  await browser.request('auth/identities/unlink', { provider: 'microsoft' }, 409);

  // The keys were fetched once and kept.
  assert.equal(calls.filter((u) => u.endsWith('/discovery/v2.0/keys')).length, 1);
  console.log(
    'PASS Microsoft sign-in: tenant, PKCE and nonce; tid:oid accounts; refused tenants and audiences; linking and unlinking.',
  );
} finally {
  await pool.query(
    "DELETE FROM oc_users WHERE username LIKE 'msowner\\_%' OR id IN (SELECT user_id FROM oc_identities WHERE provider='microsoft')",
  );
  app?.close();
  await pool.end();
}
