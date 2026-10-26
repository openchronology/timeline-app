// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// Signing in (server/auth.mjs, server/oauth.mjs): provider settings and PKCE, anonymous sign-in,
// session expiry, Google, Microsoft and Facebook token checks, OAuth state, and older password
// hashes.
import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, sign, createHmac, scryptSync } from 'node:crypto';
import { Auth, tokenHash, passwordMatches } from '../server/auth.mjs';
import { MICROSOFT_CONSUMERS, OAuth, pkce, providersFromEnv } from '../server/oauth.mjs';

const rejects = (status) => (error) => error.status === status;
test('provider configuration fails closed and PKCE follows the RFC vector', () => {
  assert.deepEqual(providersFromEnv({}), {});
  assert.throws(() => providersFromEnv({ OAUTH_GITHUB_CLIENT_ID: 'id' }));
  assert.throws(() =>
    providersFromEnv({ OAUTH_FACEBOOK_CLIENT_ID: 'id', OAUTH_FACEBOOK_CLIENT_SECRET: 'secret' }),
  );
  assert.equal(
    providersFromEnv({
      OAUTH_FACEBOOK_CLIENT_ID: 'id',
      OAUTH_FACEBOOK_CLIENT_SECRET: 'secret',
      OAUTH_FACEBOOK_GRAPH_VERSION: 'v23.0',
    }).facebook.version,
    'v23.0',
  );
  // A configured provider can be turned off with OAUTH_<NAME>_ENABLED, and its settings are then
  // not checked; a value that is neither on nor off stops the server.
  const facebook = {
    OAUTH_FACEBOOK_CLIENT_ID: 'id',
    OAUTH_FACEBOOK_CLIENT_SECRET: 'secret',
    OAUTH_FACEBOOK_GRAPH_VERSION: 'v23.0',
  };
  for (const value of ['false', '0', 'off', 'No'])
    assert.deepEqual(providersFromEnv({ ...facebook, OAUTH_FACEBOOK_ENABLED: value }), {});
  assert.deepEqual(
    providersFromEnv({ OAUTH_FACEBOOK_CLIENT_ID: 'id', OAUTH_FACEBOOK_ENABLED: 'false' }),
    {},
  );
  for (const value of ['', 'true', '1', 'on'])
    assert(providersFromEnv({ ...facebook, OAUTH_FACEBOOK_ENABLED: value }).facebook);
  assert.throws(
    () => providersFromEnv({ ...facebook, OAUTH_FACEBOOK_ENABLED: 'maybe' }),
    /ENABLED/,
  );
  // Microsoft: work and school accounts by default; a tenant by name, ID or domain; a label.
  const microsoft = (env) =>
    providersFromEnv({
      OAUTH_MICROSOFT_CLIENT_ID: 'id',
      OAUTH_MICROSOFT_CLIENT_SECRET: 'secret',
      ...env,
    }).microsoft;
  assert.deepEqual(microsoft({}), {
    clientId: 'id',
    clientSecret: 'secret',
    tenant: 'organizations',
    label: 'Microsoft',
  });
  for (const tenant of ['common', 'consumers', 'school.example', 'contoso.onmicrosoft.com'])
    assert.equal(microsoft({ OAUTH_MICROSOFT_TENANT: tenant }).tenant, tenant);
  assert.equal(
    microsoft({ OAUTH_MICROSOFT_TENANT: '7D1C3A5E-0B2F-4C6D-8E9A-1B2C3D4E5F60' }).tenant,
    '7d1c3a5e-0b2f-4c6d-8e9a-1b2c3d4e5f60',
  );
  assert.equal(microsoft({ OAUTH_MICROSOFT_LABEL: ' School account ' }).label, 'School account');
  for (const tenant of ['../common', 'a b', 'localhost', 'https://login.example/x'])
    assert.throws(() => microsoft({ OAUTH_MICROSOFT_TENANT: tenant }), /OAUTH_MICROSOFT_TENANT/);
  assert.throws(() => providersFromEnv({ OAUTH_MICROSOFT_CLIENT_ID: 'id' }));
  assert.equal(
    pkce('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk'),
    'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
  );
});
test('anonymous sign-in requires a browser-bound CSRF nonce', () => {
  const auth = new Auth(null, 'https://timescale.info');
  const nonce = auth.nonce({ headers: {} }, 'login');
  assert.match(nonce, /^[a-f0-9]{64}$/);
  const request = { headers: { cookie: `__Host-oc_login=${nonce}`, 'x-csrf-token': nonce } };
  auth.requireLogin(request);
  assert.throws(() => auth.requireLogin({ headers: { 'x-csrf-token': nonce } }), rejects(403));
  assert.throws(
    () => auth.requireLogin({ headers: { ...request.headers, 'x-csrf-token': 'wrong' } }),
    rejects(403),
  );
  assert.match(auth.nonceCookie('login', nonce), /HttpOnly; SameSite=Lax; Max-Age=600; Secure$/);
});
test('the sign-in throttle limits each key, and a flood of keys forgets the oldest (#193)', () => {
  const auth = new Auth(null, 'https://timescale.info');
  for (let i = 0; i < 10; i++) auth.throttle('ip:victim');
  assert.throws(() => auth.throttle('ip:victim'), rejects(429));
  auth.throttle('ip:known');
  // 10,000 distinct keys: everyone else is still let in, and the map stays bounded.
  for (let i = 0; i < 10000; i++) auth.throttle('ip:flood' + i);
  auth.throttle('ip:newcomer');
  assert.equal(auth.attempts.size, 10000);
  assert(!auth.attempts.has('ip:victim'), 'the oldest key goes first');
});
test('session lookups separate native bearers and web cookies and enforce idle and absolute expiry', async () => {
  const queries = [],
    pool = {
      async query(sql, values) {
        queries.push({ sql, values });
        return {
          rows: sql.startsWith('SELECT')
            ? [{ token_hash: values[0], id: 'user', csrf: 'csrf' }]
            : [],
        };
      },
    };
  const auth = new Auth(pool, 'https://timescale.info'),
    token = 'a'.repeat(64);
  await auth.session({ headers: { authorization: `Bearer ${token}` } });
  assert.deepEqual(queries[0].values, [tokenHash(token), 'desktop']);
  assert.match(queries[0].sql, /expires_at>now\(\).*last_seen_at>now\(\)-interval '1 day'/);
  queries.length = 0;
  await auth.session({ headers: { cookie: `__Host-oc_session=${token}` } });
  assert.equal(queries[0].values[1], 'web');
  queries.length = 0;
  assert.equal(await auth.session({ headers: { authorization: 'Bearer invalid' } }), null);
  assert.equal(queries.length, 0);
  assert.equal(await passwordMatches('anything', null), false);
  const user = { id: 'u', username: 'name' };
  const web = await auth.issue(user),
    desktop = await auth.issue(user, 'desktop');
  assert.equal(web.token, undefined);
  assert.equal(desktop.cookie, undefined);
  assert.match(desktop.token, /^[a-f0-9]{64}$/);
  assert(!queries.at(-1).values.includes(desktop.token));
});
test('Google tokens require the provider signature, issuer, audience, nonce and expiry', async () => {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'test-key' };
  const now = Math.floor(Date.now() / 1000),
    claims = {
      iss: 'https://accounts.google.com',
      aud: 'client',
      sub: '12345',
      nonce: 'nonce',
      iat: now,
      exp: now + 60,
    };
  const oauth = new OAuth(new Auth(null, 'https://timescale.info'), {}, async (url) => {
    assert.equal(url, 'https://www.googleapis.com/oauth2/v3/certs');
    return new Response(JSON.stringify({ keys: [jwk] }));
  });
  const jwt = (changes = {}, header = {}) => {
    const data = [
      Buffer.from(JSON.stringify({ alg: 'RS256', kid: 'test-key', ...header })).toString(
        'base64url',
      ),
      Buffer.from(JSON.stringify({ ...claims, ...changes })).toString('base64url'),
    ].join('.');
    return data + '.' + sign('RSA-SHA256', Buffer.from(data), privateKey).toString('base64url');
  };
  assert.equal(await oauth.googleClaims(jwt(), { clientId: 'client' }, 'nonce'), '12345');
  for (const changed of [
    { iss: 'https://attacker.example' },
    { aud: 'other' },
    { nonce: 'other' },
    { exp: now - 1 },
    { iat: now + 120 },
    { sub: null },
  ])
    await assert.rejects(
      oauth.googleClaims(jwt(changed), { clientId: 'client' }, 'nonce'),
      rejects(502),
    );
  await assert.rejects(
    oauth.googleClaims(jwt({}, { alg: 'none' }), { clientId: 'client' }, 'nonce'),
    rejects(502),
  );
  const good = jwt();
  await assert.rejects(
    oauth.googleClaims(
      good.slice(0, good.lastIndexOf('.') + 1) + 'AAAA',
      { clientId: 'client' },
      'nonce',
    ),
    rejects(502),
  );
  await assert.rejects(
    oauth.googleClaims('bad.bad.bad', { clientId: 'client' }, 'nonce'),
    rejects(502),
  );
});
test('Microsoft tokens require the tenant key signature, issuer, tenant, audience, nonce and times', async () => {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const other = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'ms-key', use: 'sig', x5c: ['…'] };
  const school = '7d1c3a5e-0b2f-4c6d-8e9a-1b2c3d4e5f60',
    another = '11111111-2222-4333-8444-555555555555',
    oid = '0a1b2c3d-4e5f-4061-8273-94a5b6c7d8e9';
  const now = Math.floor(Date.now() / 1000),
    claims = {
      iss: `https://login.microsoftonline.com/${school}/v2.0`,
      tid: school,
      oid,
      sub: 'pairwise',
      aud: 'client',
      nonce: 'nonce',
      iat: now,
      nbf: now,
      exp: now + 60,
    };
  const requests = [];
  const oauth = new OAuth(new Auth(null, 'https://timescale.info'), {}, async (url) => {
    requests.push(String(url));
    if (String(url).endsWith('/v2.0/.well-known/openid-configuration'))
      return new Response(
        JSON.stringify({ issuer: `https://login.microsoftonline.com/${school}/v2.0` }),
      );
    assert.match(
      String(url),
      /^https:\/\/login\.microsoftonline\.com\/[^/]+\/discovery\/v2\.0\/keys$/,
    );
    return new Response(JSON.stringify({ keys: [jwk] }));
  });
  const jwt = (changes = {}, header = {}, key = privateKey) => {
    const data = [
      Buffer.from(JSON.stringify({ alg: 'RS256', kid: 'ms-key', ...header })).toString('base64url'),
      Buffer.from(JSON.stringify({ ...claims, ...changes })).toString('base64url'),
    ].join('.');
    return data + '.' + sign('RSA-SHA256', Buffer.from(data), key).toString('base64url');
  };
  const config = (tenant) => ({ clientId: 'client', tenant });
  // Any work or school tenant: its own issuer, the subject is tenant and object ID.
  assert.equal(
    await oauth.microsoftClaims(jwt(), config('organizations'), 'nonce'),
    `${school}:${oid}`,
  );
  assert.equal(requests[0], 'https://login.microsoftonline.com/organizations/discovery/v2.0/keys');
  // Upper-case IDs are the same IDs, kept in lower case.
  assert.equal(
    await oauth.microsoftClaims(
      jwt({ oid: oid.toUpperCase(), tid: school.toUpperCase() }),
      config('organizations'),
      'nonce',
    ),
    `${school}:${oid}`,
  );
  const another_ = jwt({ tid: another, iss: `https://login.microsoftonline.com/${another}/v2.0` });
  assert.equal(
    await oauth.microsoftClaims(another_, config('common'), 'nonce'),
    `${another}:${oid}`,
  );
  // One tenant only, by ID or by domain (looked up once).
  assert.equal(await oauth.microsoftClaims(jwt(), config(school), 'nonce'), `${school}:${oid}`);
  await assert.rejects(oauth.microsoftClaims(another_, config(school), 'nonce'), rejects(502));
  assert.equal(
    await oauth.microsoftClaims(jwt(), config('school.example'), 'nonce'),
    `${school}:${oid}`,
  );
  await assert.rejects(
    oauth.microsoftClaims(another_, config('school.example'), 'nonce'),
    rejects(502),
  );
  assert.equal(requests.filter((u) => u.includes('openid-configuration')).length, 1);
  // Personal accounts: only under common or consumers.
  const personal = jwt({
    tid: MICROSOFT_CONSUMERS,
    iss: `https://login.microsoftonline.com/${MICROSOFT_CONSUMERS}/v2.0`,
  });
  await assert.rejects(
    oauth.microsoftClaims(personal, config('organizations'), 'nonce'),
    rejects(502),
  );
  assert.equal(
    await oauth.microsoftClaims(personal, config('consumers'), 'nonce'),
    `${MICROSOFT_CONSUMERS}:${oid}`,
  );
  await assert.rejects(oauth.microsoftClaims(jwt(), config('consumers'), 'nonce'), rejects(502));
  assert.equal(
    await oauth.microsoftClaims(personal, config('common'), 'nonce'),
    `${MICROSOFT_CONSUMERS}:${oid}`,
  );
  for (const changed of [
    // An issuer for another tenant than the token's own, or not Microsoft's.
    { iss: `https://login.microsoftonline.com/${another}/v2.0` },
    { iss: 'https://login.microsoftonline.com/{tenantid}/v2.0' },
    { iss: 'https://attacker.example/v2.0' },
    { aud: 'other' },
    { nonce: 'other' },
    { exp: now - 1 },
    { iat: now + 120 },
    { nbf: now + 120 },
    { nbf: 'soon' },
    { oid: undefined },
    { oid: 'not-a-guid' },
    { tid: undefined },
  ])
    await assert.rejects(
      oauth.microsoftClaims(jwt(changed), config('organizations'), 'nonce'),
      rejects(502),
      JSON.stringify(changed),
    );
  // Algorithm confusion, another key, a broken signature and a broken token.
  await assert.rejects(
    oauth.microsoftClaims(jwt({}, { alg: 'none' }), config('organizations'), 'nonce'),
    rejects(502),
  );
  await assert.rejects(
    oauth.microsoftClaims(jwt({}, { alg: 'HS256' }), config('organizations'), 'nonce'),
    rejects(502),
  );
  await assert.rejects(
    oauth.microsoftClaims(jwt({}, {}, other.privateKey), config('organizations'), 'nonce'),
    rejects(502),
  );
  await assert.rejects(
    oauth.microsoftClaims(jwt({}, { kid: 'unknown' }), config('organizations'), 'nonce'),
    rejects(502),
  );
  await assert.rejects(
    oauth.microsoftClaims('bad.bad.bad', config('organizations'), 'nonce'),
    rejects(502),
  );
});
test('authorization state is browser-bound, one-use, provider-bound and never an open redirect', async () => {
  const flows = new Map(),
    pool = {
      async query(sql, args) {
        if (sql.startsWith('INSERT INTO oc_oauth_flows')) {
          flows.set(args[0], {
            state_hash: args[0],
            browser_hash: args[1],
            provider: args[2],
            verifier: args[3],
            nonce: args[4],
            return_to: args[5],
          });
          return { rows: [] };
        }
        if (sql.includes('RETURNING *')) {
          const flow = flows.get(args[0]);
          if (!flow || flow.browser_hash !== args[1] || flow.provider !== args[2])
            return { rows: [] };
          flows.delete(args[0]);
          return { rows: [flow] };
        }
        return { rows: [] };
      },
    };
  const auth = new Auth(pool, 'https://timescale.info');
  auth.rateLimit = async () => {};
  auth.finishPrimary = async (user) => ({ user, cookie: 'secret-cookie' });
  const calls = [],
    oauth = new OAuth(
      auth,
      { github: { clientId: 'id', clientSecret: 'secret' } },
      async (url, options) => {
        calls.push({ url: String(url), options });
        return new Response(
          JSON.stringify(
            String(url).includes('access_token')
              ? { access_token: 'provider-token' }
              : { id: 42, email: 'same@example.com' },
          ),
        );
      },
    );
  oauth.identity = async (provider, subject, link) => {
    assert.equal(provider, 'github');
    assert.equal(subject, '42');
    assert.equal(link, undefined);
    return { id: 'user', username: 'name' };
  };
  const csrf = 'a'.repeat(64),
    req = {
      headers: { cookie: `__Host-oc_login=${csrf}`, 'x-csrf-token': csrf },
      socket: { remoteAddress: '127.0.0.1' },
    };
  await assert.rejects(
    oauth.start(req, 'github', { returnTo: 'https://attacker.example' }, null),
    rejects(400),
  );
  const start = await oauth.start(req, 'github', { returnTo: '/#desktop/ABCDEFGH23' }, null),
    url = new URL(start.url);
  assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
  const query = new URLSearchParams({ state: url.searchParams.get('state'), code: 'code' }),
    bound = { ...req, headers: { cookie: start.cookie.split(';')[0] } };
  await assert.rejects(
    oauth.callback(
      { ...req, headers: { cookie: '__Host-oc_oauth=' + 'b'.repeat(64) } },
      'github',
      query,
    ),
    rejects(400),
  );
  await assert.rejects(oauth.callback(bound, 'google', query), rejects(400));
  assert.equal((await oauth.callback(bound, 'github', query)).returnTo, '/#desktop/ABCDEFGH23');
  assert.equal(new URLSearchParams(calls[0].options.body).get('client_secret'), 'secret');
  assert.equal(calls[1].options.headers.Authorization, 'Bearer provider-token');
  await assert.rejects(oauth.callback(bound, 'github', query), rejects(400));
  assert.equal(calls.length, 2);
});
test('malformed and oversized upstream responses are rejected without reflecting their data', async () => {
  for (const response of [
    new Response('provider-secret malformed'),
    new Response('x', { headers: { 'content-length': '200000' } }),
    new Response(JSON.stringify({ error: 'provider-secret' })),
  ]) {
    const oauth = new OAuth(new Auth(null, 'https://timescale.info'), {}, async () => response);
    await assert.rejects(
      oauth.json('https://provider.example'),
      (e) => e.status === 502 && !e.message.includes('provider-secret'),
    );
  }
});

test('Facebook verifies provider identity using the configured API version and appsecret proof', async () => {
  const state = 'a'.repeat(64),
    browser = 'b'.repeat(64),
    calls = [];
  const auth = new Auth(
    {
      query: async () => ({
        rows: [{ verifier: 'verifier', nonce: 'nonce', return_to: '/', link_user: null }],
      }),
    },
    'https://timescale.info',
  );
  auth.finishPrimary = async (user) => ({ user });
  const oauth = new OAuth(
    auth,
    { facebook: { clientId: 'id', clientSecret: 'secret', version: 'v23.0' } },
    async (url, options) => {
      calls.push({ url: new URL(url), options });
      return new Response(
        JSON.stringify(calls.length === 1 ? { access_token: 'provider-token' } : { id: '98765' }),
      );
    },
  );
  oauth.identity = async (provider, subject) => {
    assert.equal(provider, 'facebook');
    assert.equal(subject, '98765');
    return { id: 'u', username: 'name' };
  };
  await oauth.callback(
    { headers: { cookie: `__Host-oc_oauth=${browser}` } },
    'facebook',
    new URLSearchParams({ state, code: 'code' }),
  );
  assert.equal(calls[0].url.pathname, '/v23.0/oauth/access_token');
  assert.equal(calls[0].url.searchParams.get('client_secret'), 'secret');
  assert.equal(
    calls[1].url.searchParams.get('appsecret_proof'),
    createHmac('sha256', 'secret').update('provider-token').digest('hex'),
  );
  assert.equal(calls[1].options.headers.Authorization, 'Bearer provider-token');
});
test('legacy salted password hashes remain usable during an upgrade', async () => {
  const salt = '1'.repeat(32),
    password = 'legacy account password';
  const hash = 'scrypt:1:' + salt + ':' + scryptSync(password, salt, 64).toString('hex');
  assert(await passwordMatches(password, hash));
  assert.equal(await passwordMatches('incorrect password', hash), false);
  assert.equal(await passwordMatches(password, 'scrypt:1:bad:bad'), false);
});
