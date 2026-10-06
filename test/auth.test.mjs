import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, sign, createHmac, scryptSync } from 'node:crypto';
import { Auth, tokenHash, passwordMatches } from '../server/auth.mjs';
import { OAuth, pkce, providersFromEnv } from '../server/oauth.mjs';

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
  auth.issue = async (user) => ({ user, cookie: 'secret-cookie' });
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
  auth.issue = async (user) => ({ user });
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
