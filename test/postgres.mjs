import pg from 'pg';
import { readFile } from 'node:fs/promises';
import { createApplication } from '../server/http.mjs';
import { tokenHash } from '../server/auth.mjs';
import assert from 'node:assert/strict';
import { demo, validateDocument, DEFAULT_PRESENTATION, CUSTOM_EXAMPLE } from '../dist/core.mjs';
if (!process.env.DATABASE_URL)
  throw new Error('DATABASE_URL must refer to a dedicated test database.');
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
await pool.query(await readFile(new URL('../server/schema.sql', import.meta.url), 'utf8'));
let providerSubject = 42001;
const providers = { github: { clientId: 'test-client', clientSecret: 'test-secret' } };
const app = createApplication({
  pool,
  providers,
  trustProxy: true,
  fetcher: async (url, options) => {
    if (String(url).endsWith('/access_token')) {
      assert.equal(new URLSearchParams(options.body).get('client_secret'), 'test-secret');
      return new Response(JSON.stringify({ access_token: 'test-provider-token' }));
    }
    assert.equal(String(url), 'https://api.github.com/user');
    assert.equal(options.headers.Authorization, 'Bearer test-provider-token');
    return new Response(JSON.stringify({ id: providerSubject, email: 'same@example.com' }));
  },
});
await new Promise((resolve, reject) => {
  app.once('error', reject);
  app.listen(0, '127.0.0.1', resolve);
});
const origin = `http://127.0.0.1:${app.address().port}`,
  suffix = Date.now().toString(36),
  accounts = [],
  timelines = [];
let clientNumber = 0;
const clientAddresses = [];
function client(bearer) {
  const cookies = new Map(),
    ip = `192.0.2.${++clientNumber}`;
  clientAddresses.push(ip);
  let csrf = '';
  return {
    async request(path, method = 'GET', data, expected = 200, withCsrf = true, binary = false) {
      const res = await fetch(origin + '/api/' + path, {
        method,
        redirect: 'manual',
        headers: {
          'X-Forwarded-For': ip,
          ...(cookies.size ? { Cookie: [...cookies].map(([k, v]) => `${k}=${v}`).join('; ') } : {}),
          ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}),
          ...(data !== undefined
            ? {
                'Content-Type': binary
                  ? 'application/vnd.openchronology.sqlite'
                  : 'application/json',
              }
            : {}),
          ...(csrf && withCsrf ? { 'X-CSRF-Token': csrf } : {}),
        },
        ...(data !== undefined ? { body: binary ? data : JSON.stringify(data) } : {}),
      });
      for (const cookie of res.headers.getSetCookie()) {
        const part = cookie.split(';')[0],
          at = part.indexOf('=');
        if (part.slice(at + 1)) cookies.set(part.slice(0, at), part.slice(at + 1));
        else cookies.delete(part.slice(0, at));
      }
      const value =
        res.status === 303
          ? { location: res.headers.get('location') }
          : res.headers.get('content-type')?.startsWith('application/vnd.openchronology.sqlite')
            ? Buffer.from(await res.arrayBuffer())
            : await res.json();
      assert.equal(
        res.status,
        expected,
        Buffer.isBuffer(value) ? 'SQLite response' : JSON.stringify(value),
      );
      if (value.csrf) csrf = value.csrf;
      return value;
    },
  };
}
const owner = client(),
  viewer = client(),
  editor = client(),
  anonymous = client();
try {
  for (const [c, prefix] of [
    [owner, 'owner'],
    [viewer, 'viewer'],
    [editor, 'editor'],
  ]) {
    await c.request('session');
    await c.request(
      'auth/register',
      'POST',
      { username: `${prefix}_${suffix}`, password: 'testing exact rational timelines' },
      403,
      false,
    );
    const r = await c.request('auth/register', 'POST', {
      username: `${prefix}_${suffix}`,
      password: 'testing exact rational timelines',
    });
    accounts.push(r.user.id);
  }
  const document = demo(true);
  document.presentation = { ...DEFAULT_PRESENTATION, mode: 'custom', source: CUSTOM_EXAMPLE };
  const t = await owner.request('timelines', 'POST', document, 201);
  timelines.push(t.id);
  assert.equal(t.visibility, 'private');
  await anonymous.request(`timelines/${t.id}`, 'GET', undefined, 404);
  await viewer.request(`timelines/${t.id}`, 'GET', undefined, 404);
  await owner.request(`timelines/${t.id}/members`, 'POST', {
    username: `viewer_${suffix}`,
    role: 'viewer',
  });
  await owner.request(`timelines/${t.id}/members`, 'POST', {
    username: `editor_${suffix}`,
    role: 'editor',
  });
  const viewed = await viewer.request(`timelines/${t.id}`);
  assert.equal(viewed.canEdit, false);
  assert.deepEqual(viewed.presentation, document.presentation);
  const editing = await editor.request(`timelines/${t.id}`);
  assert.equal(editing.canEdit, true);
  const frame = await viewer.request(`timelines/${t.id}/query`, 'POST', {
    kind: 'overview',
    lower: '10',
    upper: '11',
    threshold: '1',
  });
  assert.equal(frame.groups[0].count, '20001');
  assert(frame.visitedNodes < 50);
  await viewer.request(`timelines/${t.id}`, 'PUT', { revision: t.revision, document }, 403);
  await owner.request(`timelines/${t.id}`, 'PUT', { revision: t.revision, document }, 403, false);
  const updated = await editor.request(`timelines/${t.id}`, 'PUT', {
    revision: t.revision,
    document: { ...document, title: 'An editor changed this' },
  });
  assert.equal(updated.revision, '2');
  await owner.request(`timelines/${t.id}`, 'PUT', { revision: t.revision, document }, 409);
  const snapshot = await viewer.request(`timelines/${t.id}/document`);
  assert.equal(validateDocument(snapshot.document).events.length, 20010);
  assert.deepEqual(snapshot.document.presentation, document.presentation);
  const page = await viewer.request(`timelines/${t.id}/query`, 'POST', {
    kind: 'events',
    lower: '10',
    upper: '11',
    limit: 5,
  });
  assert.equal(page.events.length, 5);
  assert(page.next);
  const next = await viewer.request(`timelines/${t.id}/query`, 'POST', {
    kind: 'events',
    lower: '10',
    upper: '11',
    limit: 5,
    after: page.next,
  });
  assert(!next.events.some((e) => page.events.some((p) => p.id === e.id)));
  await editor.request(`timelines/${t.id}/settings`, 'PATCH', { visibility: 'public' }, 403);
  await owner.request(`timelines/${t.id}/settings`, 'PATCH', { visibility: 'public' });
  const publicView = await anonymous.request(`timelines/${t.id}`);
  assert.equal(publicView.canEdit, false);
  assert.deepEqual(publicView.presentation, document.presentation);
  await anonymous.request(
    `timelines/${t.id}`,
    'PUT',
    { revision: publicView.revision, document },
    401,
  );
  await owner.request(`timelines/${t.id}/members`, 'DELETE', { username: `editor_${suffix}` });
  await editor.request(
    `timelines/${t.id}`,
    'PUT',
    { revision: publicView.revision, document },
    403,
  );
  // Browser-bound state, one-use callbacks and provider subject identity.
  const social = client();
  await social.request('session');
  const started = await social.request('auth/github/start', 'POST', {});
  const state = new URL(started.url).searchParams.get('state');
  await client().request(`auth/github/callback?state=${state}&code=mock`, 'GET', undefined, 400);
  await social.request(`auth/github/callback?state=${state}&code=mock`, 'GET', undefined, 303);
  await social.request(`auth/github/callback?state=${state}&code=mock`, 'GET', undefined, 400);
  const socialUser = (await social.request('session')).user;
  accounts.push(socialUser.id);
  assert.deepEqual((await social.request('auth/account')).identities, ['github']);
  for (const differentSubject of [false, true]) {
    if (differentSubject) providerSubject++;
    const other = client();
    await other.request('session');
    const url = new URL((await other.request('auth/github/start', 'POST', {})).url);
    await other.request(
      `auth/github/callback?state=${url.searchParams.get('state')}&code=mock`,
      'GET',
      undefined,
      303,
    );
    const user = (await other.request('session')).user;
    if (differentSubject) {
      assert.notEqual(user.id, socialUser.id);
      accounts.push(user.id);
    } else assert.equal(user.id, socialUser.id);
  }
  providerSubject++;
  const link = new URL((await owner.request('auth/github/start', 'POST', { link: true })).url);
  await owner.request(
    `auth/github/callback?state=${link.searchParams.get('state')}&code=mock`,
    'GET',
    undefined,
    303,
  );
  assert.deepEqual((await owner.request('auth/account')).identities, ['github']);
  providerSubject = 42001;
  const conflict = new URL((await owner.request('auth/github/start', 'POST', { link: true })).url);
  await owner.request(
    `auth/github/callback?state=${conflict.searchParams.get('state')}&code=mock`,
    'GET',
    undefined,
    409,
  );
  const staleLink = new URL((await owner.request('auth/github/start', 'POST', { link: true })).url);
  await owner.request('auth/login', 'POST', {
    username: `owner_${suffix}`,
    password: 'testing exact rational timelines',
  });
  await owner.request(
    `auth/github/callback?state=${staleLink.searchParams.get('state')}&code=mock`,
    'GET',
    undefined,
    403,
  );

  // Native approval requires an authenticated browser and cannot be replayed.
  const deviceClient = client(),
    challenge = await deviceClient.request('auth/device/start', 'POST', {});
  assert.match(challenge.verificationUri, /\/#desktop\/[A-Z2-9]{10}$/);
  assert.deepEqual(
    await deviceClient.request('auth/device/poll', 'POST', { deviceCode: challenge.deviceCode }),
    { pending: true },
  );
  await anonymous.request('auth/device/approve', 'POST', { userCode: challenge.userCode }, 401);
  await owner.request('auth/device/approve', 'POST', { userCode: challenge.userCode }, 403, false);
  await owner.request('auth/device/approve', 'POST', { userCode: challenge.userCode });
  await owner.request('auth/device/approve', 'POST', { userCode: challenge.userCode }, 400);
  await pool.query(
    "UPDATE oc_device_logins SET last_poll_at=now()-interval '4 seconds' WHERE user_code=$1",
    [challenge.userCode],
  );
  const nativeSession = await deviceClient.request('auth/device/poll', 'POST', {
    deviceCode: challenge.deviceCode,
  });
  await deviceClient.request('auth/device/poll', 'POST', { deviceCode: challenge.deviceCode }, 400);
  const nativeClient = client(nativeSession.token);
  assert.equal((await nativeClient.request('session')).user.id, accounts[0]);
  assert((await owner.request('auth/account')).sessions.some((s) => s.kind === 'desktop'));
  const hash = tokenHash(nativeSession.token);
  assert.equal(
    (await pool.query('SELECT token_hash FROM oc_sessions WHERE token_hash=$1', [hash])).rows
      .length,
    1,
  );
  await pool.query(
    "UPDATE oc_sessions SET last_seen_at=now()-interval '2 days' WHERE token_hash=$1",
    [hash],
  );
  assert.equal((await nativeClient.request('session')).user, null);
  await pool.query(
    'UPDATE oc_sessions SET last_seen_at=now(),expires_at=now() WHERE token_hash=$1',
    [hash],
  );
  assert.equal((await nativeClient.request('session')).user, null);
  await pool.query("UPDATE oc_sessions SET expires_at=now()+interval '1 day' WHERE token_hash=$1", [
    hash,
  ]);
  assert((await nativeClient.request('session')).user);
  await owner.request('auth/revoke-others', 'POST', {});
  await nativeClient.request('timelines', 'GET', undefined, 401);
  const expired = await deviceClient.request('auth/device/start', 'POST', {});
  await pool.query('UPDATE oc_device_logins SET expires_at=now() WHERE user_code=$1', [
    expired.userCode,
  ]);
  await deviceClient.request('auth/device/poll', 'POST', { deviceCode: expired.deviceCode }, 400);
  await owner.request('auth/device/approve', 'POST', { userCode: expired.userCode }, 400);
  await pool.query('DELETE FROM oc_device_logins WHERE user_code=$1', [expired.userCode]);

  // Real server-mediated SQLite exchange, with access and CSRF checks.
  assert.equal((await owner.request('session')).fileExchange, true);
  const small = validateDocument({ ...document, events: document.events.slice(0, 10) });
  await anonymous.request('files/export', 'POST', small, 401);
  await owner.request('files/export', 'POST', small, 403, false);
  const sqlite = await owner.request('files/export', 'POST', small);
  assert.equal(sqlite.subarray(0, 16).toString(), 'SQLite format 3\0');
  assert.deepEqual(
    (await owner.request('files/import', 'POST', sqlite, 200, true, true)).document,
    small,
  );
  await owner.request('files/import', 'POST', Buffer.from('not sqlite'), 400, true, true);
  const fileTimeline = await owner.request('timelines', 'POST', small, 201);
  timelines.push(fileTimeline.id);
  await viewer.request(`timelines/${fileTimeline.id}/file`, 'GET', undefined, 404);
  assert(Buffer.isBuffer(await owner.request(`timelines/${fileTimeline.id}/file`)));
  await owner.request(`timelines/${fileTimeline.id}/settings`, 'PATCH', { visibility: 'public' });
  assert(Buffer.isBuffer(await anonymous.request(`timelines/${fileTimeline.id}/file`)));
  await owner.request('auth/logout', 'POST', {});
  await owner.request('timelines', 'GET', undefined, 401);
  console.log(
    'PASS PostgreSQL HTTP: accounts, private/public access, viewer/editor roles, CSRF, atomic revision conflicts, bounded pages, cached overviews, OAuth replay/identity/linking, native approval, expiry/revocation and real SQLite file exchange.',
  );
} finally {
  const throttleKeys = [
    ...clientAddresses.flatMap((ip) => [ip, 'file-download:' + ip]),
    ...accounts.map((id) => 'files:' + id),
  ].map(tokenHash);
  await pool.query('DELETE FROM oc_auth_attempts WHERE key=ANY($1::text[])', [throttleKeys]);
  await pool.query('DELETE FROM oc_timelines WHERE id=ANY($1::uuid[])', [timelines]);
  await pool.query('DELETE FROM oc_users WHERE id=ANY($1::uuid[])', [accounts]);
  await new Promise((resolve) => app.close(resolve));
  await pool.end();
}
