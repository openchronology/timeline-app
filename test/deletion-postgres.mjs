// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// Deleting what is yours (#166): your own comments, and your account with what it owns and
// wrote, while what others own survives (their forks of your timelines, changes you merged).
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { Auth, passwordHash } from '../server/auth.mjs';
import { createApplication } from '../server/http.mjs';
if (!process.env.DATABASE_URL) throw new Error('Use a dedicated PostgreSQL test database.');
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
await pool.query(await readFile(new URL('../server/schema.sql', import.meta.url), 'utf8'));
const app = createApplication({
  pool,
  mailer: { async send() {} },
  securityKey: Buffer.alloc(32, 47),
  passwordCheck: async () => {},
});
await new Promise((resolve) => app.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${app.address().port}`,
  auth = new Auth(pool, origin),
  password = 'unique deletion testing passphrase',
  suffix = randomUUID().slice(0, 8),
  ids = [];
async function request(path, method = 'GET', data, headers = {}, expected = 200) {
  const response = await fetch(origin + '/api/' + path, {
    method,
    headers: { ...headers, ...(data ? { 'Content-Type': 'application/json' } : {}) },
    ...(data ? { body: JSON.stringify(data) } : {}),
  });
  const value = await response.json();
  assert.equal(response.status, expected, `${method} ${path}: ${JSON.stringify(value)}`);
  return { value, response };
}
async function account(name, admin = false) {
  const id = randomUUID();
  ids.push(id);
  await pool.query(
    `INSERT INTO oc_users(id,username,email,email_verified_at,password_hash,is_admin,quota_bypass,created_at)
    VALUES($1,$2,$3,now(),$4,$5,true,now()-interval '40 days')`,
    [
      id,
      `${name}_${suffix}`,
      `${name}_${suffix}@example.test`,
      await passwordHash(password),
      admin,
    ],
  );
  const issued = await auth.issue(
    (await pool.query('SELECT * FROM oc_users WHERE id=$1', [id])).rows[0],
  );
  return {
    id,
    username: `${name}_${suffix}`,
    headers: { Cookie: issued.cookie.split(';')[0], 'X-CSRF-Token': issued.csrf },
  };
}
const doc = (title) => ({
  format: 'openchronology',
  version: 1,
  title,
  description: '',
  events: [{ id: 'a', time: '1/1', metadata: { title: 'A' } }],
});
try {
  const leaving = await account('leaving'),
    staying = await account('staying'),
    admin = await account('lastadmin', true);
  // Everyone else's administrators are disabled for this check of the last one.
  const others = (
    await pool.query('SELECT id FROM oc_users WHERE is_admin AND NOT is_disabled AND id<>$1', [
      admin.id,
    ])
  ).rows.map((r) => r.id);
  // What the leaving account owns and wrote.
  const own = (await request('timelines', 'POST', doc('Leaving’s'), leaving.headers, 201)).value;
  const shared = (
    await request(
      `timelines/${own.id}/settings`,
      'PATCH',
      { visibility: 'public' },
      leaving.headers,
    )
  ).value;
  const created = (await request('timelines', 'POST', doc('Staying’s'), staying.headers, 201))
    .value;
  const theirs = (
    await request(
      `timelines/${created.id}/settings`,
      'PATCH',
      { visibility: 'public' },
      staying.headers,
    )
  ).value;
  // The staying account forks the leaving one's timeline: the fork is theirs and survives.
  const fork = (
    await request(
      `timelines/${own.id}/fork`,
      'POST',
      { revision: shared.revision },
      staying.headers,
      201,
    )
  ).value;
  const proposal = (
    await request(
      `timelines/${theirs.id}/proposals`,
      'POST',
      { title: 'From leaving', body: '', baseRevision: theirs.revision, document: doc('Proposed') },
      leaving.headers,
      201,
    )
  ).value;
  const comment = (
    await request(
      `timelines/${theirs.id}/proposals/${proposal.id}/comments`,
      'POST',
      { body: 'One comment' },
      leaving.headers,
      201,
    )
  ).value;
  const second = (
    await request(
      `timelines/${theirs.id}/proposals/${proposal.id}/comments`,
      'POST',
      { body: 'Another comment' },
      leaving.headers,
      201,
    )
  ).value;
  await request(`timelines/${theirs.id}/star`, 'POST', { starred: true }, leaving.headers);

  // Your own comments: you may delete them; nobody else may.
  const comments = async () =>
    (
      await request(
        `timelines/${theirs.id}/proposals/${proposal.id}/comments`,
        'GET',
        undefined,
        staying.headers,
      )
    ).value.comments;
  assert.equal(
    (await comments()).find((c) => c.id === comment.id).mine,
    false,
    'Not the reader’s.',
  );
  await request(
    `timelines/${theirs.id}/proposals/${proposal.id}/comments/${comment.id}`,
    'DELETE',
    undefined,
    staying.headers,
    404,
  );
  await request(
    `timelines/${theirs.id}/proposals/${proposal.id}/comments/${comment.id}`,
    'DELETE',
    undefined,
    {},
    401,
  );
  await request(
    `timelines/${theirs.id}/proposals/${proposal.id}/comments/${comment.id}`,
    'DELETE',
    undefined,
    leaving.headers,
  );
  assert.deepEqual(
    (await comments()).map((c) => c.id),
    [second.id],
  );

  // Your account: confirmed by your username and password.
  await request(
    'auth/account',
    'DELETE',
    { confirm: 'someone else', password },
    leaving.headers,
    400,
  );
  await request(
    'auth/account',
    'DELETE',
    { confirm: leaving.username, password: 'wrong' },
    leaving.headers,
    401,
  );
  const { response } = await request(
    'auth/account',
    'DELETE',
    { confirm: leaving.username, password },
    leaving.headers,
  );
  assert.match(response.headers.get('set-cookie') ?? '', /Max-Age=0/, 'Signed out.');
  const count = async (sql, params) => Number((await pool.query(sql, params)).rows[0].count);
  assert.equal(await count('SELECT count(*) FROM oc_users WHERE id=$1', [leaving.id]), 0);
  assert.equal(await count('SELECT count(*) FROM oc_timelines WHERE id=$1', [own.id]), 0);
  assert.equal(
    await count('SELECT count(*) FROM oc_proposals WHERE author_id=$1', [leaving.id]),
    0,
  );
  assert.equal(
    await count('SELECT count(*) FROM oc_proposal_comments WHERE author_id=$1', [leaving.id]),
    0,
  );
  assert.equal(
    await count('SELECT count(*) FROM oc_timeline_stars WHERE user_id=$1', [leaving.id]),
    0,
  );
  // What others own stays: their timeline, and their fork of the deleted one.
  assert.equal(
    await count('SELECT count(*) FROM oc_timelines WHERE id=ANY($1::uuid[])', [
      [theirs.id, fork.id],
    ]),
    2,
  );
  assert.equal(
    (await request(`timelines/${fork.id}/document`, 'GET', undefined, staying.headers)).value
      .document.events.length,
    1,
  );
  await request('session', 'GET', undefined, leaving.headers);

  // The last administrator cannot leave.
  await pool.query('UPDATE oc_users SET is_disabled=true WHERE id=ANY($1::uuid[])', [others]);
  try {
    await request(
      'auth/account',
      'DELETE',
      { confirm: admin.username, password },
      admin.headers,
      409,
    );
  } finally {
    await pool.query('UPDATE oc_users SET is_disabled=false WHERE id=ANY($1::uuid[])', [others]);
  }
  console.log(
    'PASS deletion: own comments; accounts with what they own and wrote; others’ copies survive.',
  );
} finally {
  await pool.query(
    'DELETE FROM oc_proposals WHERE timeline_id IN (SELECT id FROM oc_timelines WHERE owner_id=ANY($1::uuid[]))',
    [ids],
  );
  await pool.query('DELETE FROM oc_timelines WHERE owner_id=ANY($1::uuid[])', [ids]);
  await pool.query('DELETE FROM oc_users WHERE id=ANY($1::uuid[])', [ids]);
  app.close();
  await pool.end();
}
