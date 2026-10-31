// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// Administration against PostgreSQL: the first administrator, CSRF and permissions, quotas under
// concurrent saves, scoped and revoked API keys, profiles, migration and suspension.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { Auth, passwordHash, passwordMatches } from '../server/auth.mjs';
import { bootstrapInstallation } from '../server/administration.mjs';
import { createApplication } from '../server/http.mjs';
import { validateDocument } from '../dist/core.mjs';
import { POLICY_VERSION } from '../server/policies.mjs';
if (!process.env.DATABASE_URL) throw new Error('Use a dedicated PostgreSQL test database.');
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const schema = await readFile(new URL('../server/schema.sql', import.meta.url), 'utf8');
await pool.query(schema);
const original = (await pool.query('SELECT * FROM oc_site_settings')).rows[0];
const suffix = randomUUID().slice(0, 8),
  password = 'unique administration testing passphrase';
const ids = [],
  tids = [];
const app = createApplication({
  pool,
  mailer: { async send() {} },
  securityKey: Buffer.alloc(32, 17),
  passwordCheck: async () => {},
});
await new Promise((resolve) => app.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${app.address().port}`,
  auth = new Auth(pool, origin);
async function request(path, method = 'GET', data, credentials = {}, expected = 200) {
  const response = await fetch(origin + '/api/' + path, {
    method,
    headers: { ...credentials, ...(data ? { 'Content-Type': 'application/json' } : {}) },
    ...(data ? { body: JSON.stringify(data) } : {}),
  });
  const value = await response.json();
  assert.equal(response.status, expected, JSON.stringify(value));
  return value;
}
async function user(name) {
  const id = randomUUID();
  ids.push(id);
  await pool.query(
    'INSERT INTO oc_users(id,username,password_hash,email_verified_at,terms_version) VALUES($1,$2,$3,now(),oc_policy_version())',
    [id, name + '_' + suffix, await passwordHash(password)],
  );
  const u = (await pool.query('SELECT * FROM oc_users WHERE id=$1', [id])).rows[0];
  return { u, headers: await login(u) };
}
async function login(u) {
  const issued = await auth.issue(u);
  return { Cookie: issued.cookie.split(';')[0], 'X-CSRF-Token': issued.csrf };
}
const document = validateDocument({
  format: 'openchronology',
  version: 1,
  title: 'Quota fixture',
  description: '',
  events: [{ id: randomUUID(), time: '1/3', title: 'Exact', notes: 'test', metadata: {} }],
});
async function create(headers, expected = 201) {
  const r = await request('timelines', 'POST', document, headers, expected);
  if (r.id) tids.push(r.id);
  return r;
}
try {
  // Temporarily exercise bootstrap in an isolated test installation; restore policy below.
  await pool.query('UPDATE oc_site_settings SET bootstrap_admin_id=NULL,initialized=false');
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    await bootstrapInstallation(c, {
      ADMIN_USERNAME: 'admin_' + suffix,
      ADMIN_INITIAL_PASSWORD: password,
      DEFAULT_USER_STORAGE_BYTES: '104857600',
    });
    await c.query('COMMIT');
  } catch (e) {
    await c.query('ROLLBACK');
    throw e;
  } finally {
    c.release();
  }
  const adminUser = (
    await pool.query('SELECT * FROM oc_users WHERE username=$1', ['admin_' + suffix])
  ).rows[0];
  ids.push(adminUser.id);
  await bootstrapInstallation(pool, {
    ADMIN_USERNAME: 'admin_' + suffix,
    ADMIN_INITIAL_PASSWORD: 'a different initial password',
  });
  assert(
    await passwordMatches(
      password,
      (await pool.query('SELECT password_hash FROM oc_users WHERE id=$1', [adminUser.id])).rows[0]
        .password_hash,
    ),
  );
  assert.equal(
    (await pool.query('SELECT default_quota_bytes FROM oc_site_settings')).rows[0]
      .default_quota_bytes,
    '104857600',
  );
  // Set in the environment file, the default quota applies at every start.
  await bootstrapInstallation(pool, { DEFAULT_USER_STORAGE_BYTES: '50MiB' });
  assert.equal(
    (await pool.query('SELECT default_quota_bytes FROM oc_site_settings')).rows[0]
      .default_quota_bytes,
    '52428800',
  );
  await bootstrapInstallation(pool, { DEFAULT_USER_STORAGE_BYTES: '104857600' });
  const admin = await login(adminUser),
    owner = await user('owner'),
    stranger = await user('stranger'),
    concurrent = await user('concurrent');
  await request('admin/users', 'GET', undefined, owner.headers, 403);
  await request('admin/users', 'GET', undefined, admin);
  // The installation's first administrator has agreed to nothing yet: asked on first sign-in
  // like anyone (#277), it may read but not change settings until it agrees.
  assert.equal((await request('session', 'GET', undefined, admin)).user.termsRequired, true);
  await request('admin/settings', 'PATCH', { default_quota_bytes: '0', password }, admin, 403);
  await request('auth/terms', 'POST', { acceptTerms: POLICY_VERSION }, admin);
  await request(
    'admin/settings',
    'PATCH',
    { default_quota_bytes: '0', password },
    { ...admin, 'X-CSRF-Token': 'wrong' },
    403,
  );
  await request(
    'admin/settings',
    'PATCH',
    { default_quota_bytes: '0', password: 'wrong' },
    admin,
    401,
  );
  await request(
    'admin/users/' + adminUser.id,
    'PATCH',
    { is_disabled: true, password },
    admin,
    409,
  );
  const timeline = await create(owner.headers);
  const sum = async (uid) =>
    (
      await pool.query(
        'SELECT u.used_bytes,coalesce(sum(e.bytes),0)::text AS ledger FROM oc_users u LEFT JOIN oc_storage_entries e ON e.user_id=u.id WHERE u.id=$1 GROUP BY u.id',
        [uid],
      )
    ).rows[0];
  let counted = await sum(owner.u.id);
  assert.equal(counted.used_bytes, counted.ledger);
  assert(BigInt(counted.used_bytes) > BigInt(Buffer.byteLength(JSON.stringify(document))));
  await request('admin/users/' + owner.u.id, 'PATCH', { quota_bytes: '1', password }, admin);
  await request(
    'timelines/' + timeline.id,
    'PUT',
    { revision: timeline.revision, document: { ...document, title: 'More storage' } },
    owner.headers,
    413,
  );
  assert.equal(
    (await request('timelines/' + timeline.id, 'GET', undefined, owner.headers)).revision,
    timeline.revision,
  );
  await request('admin/settings', 'PATCH', { default_quota_bytes: '0', password }, admin);
  await create(stranger.headers, 403);
  await request('admin/users/' + owner.u.id, 'PATCH', { quota_bypass: true, password }, admin);
  const added = await create(owner.headers);
  const readKey = await request(
    'auth/api-keys',
    'POST',
    { name: 'Reader', password },
    owner.headers,
    201,
  );
  const bearer = { Authorization: 'Bearer ' + readKey.token };
  await request('timelines/' + timeline.id, 'GET', undefined, bearer);
  await request(
    'timelines/' + timeline.id + '/query',
    'POST',
    { kind: 'overview', lower: '0/1', upper: '1/1', threshold: '0/1' },
    bearer,
  );
  await request(
    'timelines/' + timeline.id,
    'PUT',
    { revision: timeline.revision, document },
    bearer,
    403,
  );
  await request('admin/users', 'GET', undefined, bearer, 403);
  await request('auth/account', 'GET', undefined, bearer, 403);
  await request('timelines/' + timeline.id, 'GET', undefined, stranger.headers, 404);
  // Revision polling, which an open page does on its own, is not activity: it leaves the
  // session's last-seen time alone, so an open tab does not keep an idle session alive.
  const seen = async () =>
    (
      await pool.query(
        "SELECT last_seen_at<now()-interval '23 hours' AS idle FROM oc_sessions WHERE user_id=$1",
        [owner.u.id],
      )
    ).rows.every((row) => row.idle);
  await pool.query(
    "UPDATE oc_sessions SET last_seen_at=now()-interval '23 hours' WHERE user_id=$1",
    [owner.u.id],
  );
  await request('timelines/' + timeline.id + '/revision', 'GET', undefined, owner.headers);
  assert.equal(await seen(), true);
  await request('timelines/' + timeline.id, 'GET', undefined, owner.headers);
  assert.equal(await seen(), false);
  // An administrator sees every timeline, but their API key has only its scopes: someone
  // else's private timeline is unavailable through it, to read, check or change.
  await request('timelines/' + timeline.id, 'GET', undefined, admin);
  const adminKey = await request(
    'auth/api-keys',
    'POST',
    { name: 'Administrator', scopes: ['timelines:read', 'timelines:write'], password },
    admin,
    201,
  );
  const adminBearer = { Authorization: 'Bearer ' + adminKey.token };
  await request('timelines/' + timeline.id, 'GET', undefined, adminBearer, 404);
  await request('timelines/' + timeline.id + '/revision', 'GET', undefined, adminBearer, 404);
  await request(
    'timelines/' + timeline.id,
    'PUT',
    { revision: timeline.revision, document: { ...document, title: 'Not theirs' } },
    adminBearer,
    404,
  );
  await request('timelines/' + timeline.id, 'DELETE', undefined, adminBearer, 404);
  const writeKey = await request(
    'auth/api-keys',
    'POST',
    { name: 'Writer', scopes: ['timelines:read', 'timelines:write'], password },
    owner.headers,
    201,
  );
  const writeBearer = { Authorization: 'Bearer ' + writeKey.token };
  await create(writeBearer);
  await request(
    'timelines/' + added.id,
    'PUT',
    { revision: added.revision, document: { ...document, title: 'Automated update' } },
    writeBearer,
  );
  const keyRows = (await request('auth/api-keys', 'GET', undefined, owner.headers)).keys;
  assert(keyRows.every((k) => !('token' in k) && !('token_hash' in k)));
  assert.notEqual(
    (await pool.query('SELECT token_hash FROM oc_api_keys WHERE id=$1', [readKey.id])).rows[0]
      .token_hash,
    readKey.token,
  );
  await request('auth/api-keys/' + readKey.id, 'POST', {}, stranger.headers, 404);
  await request('auth/api-keys/' + readKey.id, 'POST', {}, owner.headers);
  await request('timelines/' + timeline.id, 'GET', undefined, bearer, 401);
  await pool.query("UPDATE oc_api_keys SET expires_at=now()-interval '1 second' WHERE id=$1", [
    writeKey.id,
  ]);
  await request('timelines/' + timeline.id, 'GET', undefined, writeBearer, 401);
  await request(
    'auth/profile',
    'PATCH',
    { avatarUrl: 'data:image/svg+xml;base64,PHN2Zz4=' },
    owner.headers,
    400,
  );
  await request(
    'auth/profile',
    'PATCH',
    { avatarUrl: 'https://example.test/avatar.png' },
    owner.headers,
  );
  assert.equal(
    (await request('auth/account', 'GET', undefined, owner.headers)).profile.avatarUrl,
    'https://example.test/avatar.png',
  );
  // Two transactions racing for a one-document quota cannot both succeed.
  const logical = Buffer.byteLength(JSON.stringify(document));
  await pool.query('UPDATE oc_users SET quota_bytes=$2 WHERE id=$1', [
    concurrent.u.id,
    logical * 3,
  ]);
  const responses = await Promise.all(
    [1, 2].map(() =>
      fetch(origin + '/api/timelines', {
        method: 'POST',
        headers: { ...concurrent.headers, 'Content-Type': 'application/json' },
        body: JSON.stringify(document),
      }),
    ),
  );
  assert.deepEqual(responses.map((r) => r.status).sort(), [201, 413]);
  for (const response of responses) {
    const value = await response.json();
    if (value.id) tids.push(value.id);
  }
  assert.equal((await sum(concurrent.u.id)).used_bytes, (await sum(concurrent.u.id)).ledger);
  const beforeMigration = (await sum(owner.u.id)).used_bytes;
  await pool.query(schema);
  assert.equal((await sum(owner.u.id)).used_bytes, beforeMigration);
  // An account must retain a working login method when unlinking providers.
  const social = await user('social');
  await pool.query('UPDATE oc_users SET password_hash=NULL WHERE id=$1', [social.u.id]);
  await pool.query("INSERT INTO oc_identities(provider,subject,user_id) VALUES('github',$1,$2)", [
    suffix,
    social.u.id,
  ]);
  await request('auth/identities/unlink', 'POST', { provider: 'github' }, social.headers, 409);
  await pool.query("INSERT INTO oc_identities(provider,subject,user_id) VALUES('google',$1,$2)", [
    suffix,
    social.u.id,
  ]);
  await request('auth/identities/unlink', 'POST', { provider: 'github' }, social.headers);
  assert.equal(
    (await pool.query('SELECT count(*) AS n FROM oc_identities WHERE user_id=$1', [social.u.id]))
      .rows[0].n,
    '1',
  );
  const passwordKey = await request(
    'auth/api-keys',
    'POST',
    { name: 'Password revocation', password },
    stranger.headers,
    201,
  );
  const newPassword = 'changed unique administration passphrase';
  await request(
    'auth/password/change',
    'POST',
    { password, newPassword, passwordConfirmation: newPassword },
    stranger.headers,
  );
  assert.equal(
    (
      await pool.query('SELECT revoked_at IS NOT NULL AS revoked FROM oc_api_keys WHERE id=$1', [
        passwordKey.id,
      ])
    ).rows[0].revoked,
    true,
  );
  await request(
    'timelines/' + timeline.id,
    'GET',
    undefined,
    { Authorization: 'Bearer ' + passwordKey.token },
    401,
  );

  // Disable immediately revokes both interactive sessions and automation access.
  const activeKey = await request(
    'auth/api-keys',
    'POST',
    { name: 'Suspension fixture', password },
    owner.headers,
    201,
  );
  await request('admin/users/' + owner.u.id, 'PATCH', { is_disabled: true, password }, admin);
  await request(
    'timelines/' + timeline.id,
    'GET',
    undefined,
    { Authorization: 'Bearer ' + activeKey.token },
    401,
  );
  assert.equal((await request('session', 'GET', undefined, owner.headers)).user, null);
  assert.equal(
    (await pool.query('SELECT count(*) AS n FROM oc_sessions WHERE user_id=$1', [owner.u.id]))
      .rows[0].n,
    '0',
  );
  // Re-enabling the account lifts a moderation restriction on it too, deciding a pending
  // review (#193).
  const caseId = randomUUID();
  await pool.query(
    "INSERT INTO oc_moderation_cases(id,target_kind,target_id,owner_id,status,appeal,appealed_at) VALUES($1,'user',$2,$3,'restricted','Please review.',now())",
    [caseId, owner.u.id, owner.u.id],
  );
  await request('admin/users/' + owner.u.id, 'PATCH', { is_disabled: false, password }, admin);
  assert.deepEqual(
    (
      await pool.query(
        'SELECT status,appeal_outcome,appeal_decided_at IS NOT NULL AS decided FROM oc_moderation_cases WHERE id=$1',
        [caseId],
      )
    ).rows[0],
    { status: 'lifted', appeal_outcome: 'lifted', decided: true },
  );
  await request('admin/users/' + owner.u.id, 'PATCH', { is_disabled: true, password }, admin);
  const audit = (
    await pool.query('SELECT changes FROM oc_admin_audit WHERE actor_id=$1', [adminUser.id])
  ).rows;
  assert(
    audit.every((a) => !JSON.stringify(a.changes).includes(password) && !('password' in a.changes)),
  );
  console.log(
    'Admin bootstrap, CSRF, permissions, concurrent quotas, scoped/revoked/expired API keys, profile validation, migration and suspension passed.',
  );
} finally {
  await new Promise((resolve) => app.close(resolve));
  await pool.query(
    'UPDATE oc_site_settings SET bootstrap_admin_id=$1,initialized=$2,default_quota_bytes=$3',
    [original.bootstrap_admin_id, original.initialized, original.default_quota_bytes],
  );
  await pool.query('DELETE FROM oc_timelines WHERE owner_id=ANY($1::uuid[])', [ids]);
  await pool.query(
    'DELETE FROM oc_revision_parents WHERE revision_id IN (SELECT id FROM oc_revisions WHERE author_id=ANY($1::uuid[])) OR parent_id IN (SELECT id FROM oc_revisions WHERE author_id=ANY($1::uuid[]))',
    [ids],
  );
  await pool.query('DELETE FROM oc_revisions WHERE author_id=ANY($1::uuid[])', [ids]);
  await pool.query('DELETE FROM oc_admin_audit WHERE actor_id=ANY($1::uuid[])', [ids]);
  await pool.query('DELETE FROM oc_users WHERE id=ANY($1::uuid[])', [ids]);
  await pool.end();
}
