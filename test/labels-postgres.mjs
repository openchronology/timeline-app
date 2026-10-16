// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// Sensitive-content labels on timelines (#115): its owner's, and moderators' from a report,
// which its owner cannot remove; what browsing, featuring and readers are given.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { Auth, passwordHash } from '../server/auth.mjs';
import { createApplication } from '../server/http.mjs';
import { searchTimelines } from '../server/collaboration.mjs';
import { sweepStanding } from '../server/standing.mjs';
if (!process.env.DATABASE_URL) throw new Error('Use a dedicated PostgreSQL test database.');
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
await pool.query(await readFile(new URL('../server/schema.sql', import.meta.url), 'utf8'));
const suffix = randomUUID().slice(0, 8),
  tag = 'labels-' + suffix,
  password = 'unique labels testing passphrase';
const ids = [],
  sent = [];
const app = createApplication({
  pool,
  mailer: {
    async send(message) {
      sent.push(message);
    },
  },
  securityKey: Buffer.alloc(32, 37),
  passwordCheck: async () => {},
});
await new Promise((resolve) => app.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${app.address().port}`,
  auth = new Auth(pool, origin);
async function request(path, method = 'GET', data, headers = {}, expected = 200) {
  const response = await fetch(origin + '/api/' + path, {
    method,
    headers: { ...headers, ...(data ? { 'Content-Type': 'application/json' } : {}) },
    ...(data ? { body: JSON.stringify(data) } : {}),
  });
  const value = await response.json();
  assert.equal(response.status, expected, `${method} ${path}: ${JSON.stringify(value)}`);
  return value;
}
/** An established account (40 days old, or an administrator). */
async function user(name, admin = false) {
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
    email: `${name}_${suffix}@example.test`,
    headers: { Cookie: issued.cookie.split(';')[0], 'X-CSRF-Token': issued.csrf },
  };
}
const titles = (list) => list.timelines.map((t) => t.title);
try {
  const owner = await user('owner'),
    reader = await user('reader'),
    admin = await user('moderator', true);
  const make = async (title) => {
    const t = await request(
      'timelines',
      'POST',
      { format: 'openchronology', version: 1, title, description: '', events: [] },
      owner.headers,
      201,
    );
    await request(`timelines/${t.id}/settings`, 'PATCH', { visibility: 'public' }, owner.headers);
    await pool.query('UPDATE oc_timelines SET tags=$2,featured=true WHERE id=$1', [t.id, [tag]]);
    return t;
  };
  const war = await make('War ' + suffix),
    calm = await make('Calm ' + suffix);
  await sweepStanding(pool);

  // The owner labels it; only known labels, only the owner.
  await request(`timelines/${war.id}/settings`, 'PATCH', { labels: ['gore'] }, owner.headers, 400);
  await request(
    `timelines/${war.id}/settings`,
    'PATCH',
    { labels: ['violence', 'violence'] },
    owner.headers,
    400,
  );
  await request(
    `timelines/${war.id}/settings`,
    'PATCH',
    { labels: ['violence'] },
    reader.headers,
    403,
  );
  const labelled = await request(
    `timelines/${war.id}/settings`,
    'PATCH',
    { labels: ['violence'] },
    owner.headers,
  );
  assert.deepEqual(labelled.content_labels, ['violence']);
  assert.deepEqual((await request(`timelines/${war.id}`)).labels, ['violence']);

  // Signed out, browsing leaves it out; search still finds it. Signed in, it is listed, with
  // its labels. A labelled timeline is never featured.
  const browse = (userId, extra = {}) =>
    searchTimelines(pool, userId, { scope: 'public', tag, sort: 'featured', ...extra });
  assert.deepEqual(titles(await browse(null)), ['Calm ' + suffix]);
  assert.deepEqual(titles(await browse(null, { search: suffix })).sort(), [
    'Calm ' + suffix,
    'War ' + suffix,
  ]);
  const signedIn = await browse(reader.id);
  const listed = signedIn.timelines.find((t) => t.id === war.id);
  assert.deepEqual(listed.labels, ['violence']);
  assert.equal(listed.featured, false);
  assert.equal(signedIn.timelines.find((t) => t.id === calm.id).featured, true);
  assert.equal(signedIn.timelines[0].id, calm.id, 'Featured first: the unlabelled one.');

  // Moderators label a reported timeline; its owner cannot remove their labels, and is told.
  await request(
    'reports',
    'POST',
    { target: { kind: 'timeline', timeline: calm.id }, category: 'sexual' },
    reader.headers,
    201,
  );
  const caseId = (
    await pool.query(
      "SELECT id FROM oc_moderation_cases WHERE target_kind='timeline' AND target_id=$1",
      [calm.id],
    )
  ).rows[0].id;
  const decide = (value, expected = 200) =>
    request(`admin/reports/${caseId}`, 'PATCH', { ...value, password }, admin.headers, expected);
  await decide({ action: 'label', reason: 'Classical nudes.' }, 400);
  await decide({ action: 'label', reason: 'Classical nudes.', labels: ['bogus'] }, 400);
  await decide({ action: 'label', labels: ['nudity'] }, 400);
  await decide({ action: 'label', reason: 'Classical nudes.', labels: ['nudity'] });
  assert.deepEqual((await request(`timelines/${calm.id}`)).labels, ['nudity']);
  const settings = await request(
    `timelines/${calm.id}/settings`,
    'PATCH',
    { labels: ['disturbing'] },
    owner.headers,
  );
  assert.deepEqual(settings.moderator_labels, ['nudity']);
  assert.deepEqual((await request(`timelines/${calm.id}`)).labels, ['nudity', 'disturbing']);
  assert.deepEqual(titles(await browse(null)), [], 'Both are labelled now.');
  for (let i = 0; i < 50 && !sent.some((m) => m.to === owner.email); i++)
    await new Promise((done) => setTimeout(done, 50));
  assert.match(
    sent.find((m) => m.to === owner.email)?.text ?? '',
    /labelled your timeline .* as containing nudity[\s\S]*Reason: Classical nudes\.[\s\S]*cannot remove these labels/,
  );
  // The owner may ask for a review; the decision is in force until lifted.
  const mine = await request('moderation', 'GET', undefined, owner.headers);
  assert.deepEqual(
    mine.decisions.map((d) => [d.status, d.labels]),
    [['labelled', ['nudity']]],
  );
  await request(
    `moderation/${caseId}/appeal`,
    'POST',
    { appeal: 'They are museum paintings.' },
    owner.headers,
  );
  const queue = await request('admin/reports', 'GET', undefined, admin.headers);
  assert(queue.items.some((item) => item.id === caseId && item.status === 'labelled'));
  await decide({ action: 'lift' });
  const lifted = await request(`timelines/${calm.id}`);
  assert.deepEqual(lifted.labels, ['disturbing'], 'Only the moderators’ labels go.');
  assert.deepEqual(lifted.moderator_labels, []);
  // Only timelines are labelled.
  await request(
    'reports',
    'POST',
    { target: { kind: 'user', id: `owner_${suffix}` }, category: 'spam' },
    reader.headers,
    201,
  );
  const userCase = (
    await pool.query(
      "SELECT id FROM oc_moderation_cases WHERE target_kind='user' AND target_id=$1",
      [owner.id],
    )
  ).rows[0].id;
  await request(
    `admin/reports/${userCase}`,
    'PATCH',
    { action: 'label', reason: 'x', labels: ['nudity'], password },
    admin.headers,
    400,
  );
  console.log(
    'PASS labels: owners’ and moderators’ labels, browsing, featuring, notices and reviews.',
  );
} finally {
  await pool.query(
    'DELETE FROM oc_moderation_cases WHERE owner_id=ANY($1::uuid[]) OR target_id=ANY($1::text[])',
    [ids],
  );
  await pool.query('DELETE FROM oc_admin_audit WHERE actor_id=ANY($1::uuid[])', [ids]);
  await pool.query('DELETE FROM oc_timelines WHERE owner_id=ANY($1::uuid[])', [ids]);
  await pool.query('DELETE FROM oc_users WHERE id=ANY($1::uuid[])', [ids]);
  app.close();
  await pool.end();
}
