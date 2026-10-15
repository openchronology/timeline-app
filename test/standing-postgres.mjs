// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// Account standing and popularity (#103): who is established, what browsing lists, how stars
// and forks count, trending, an administrator's trust, and moderation's effect.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { Auth, passwordHash } from '../server/auth.mjs';
import { createApplication } from '../server/http.mjs';
import { PostgresStore } from '../server/store.mjs';
import { searchTimelines } from '../server/collaboration.mjs';
import { sweepStanding, standingOf } from '../server/standing.mjs';
import { validateDocument } from '../dist/core.mjs';
if (!process.env.DATABASE_URL) throw new Error('Use a dedicated PostgreSQL test database.');
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
await pool.query(await readFile(new URL('../server/schema.sql', import.meta.url), 'utf8'));
const suffix = randomUUID().slice(0, 8),
  tag = 'standing-' + suffix,
  password = 'unique standing testing passphrase';
const ids = [];
const app = createApplication({
  pool,
  mailer: { async send() {} },
  securityKey: Buffer.alloc(32, 29),
  passwordCheck: async () => {},
});
await new Promise((resolve) => app.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${app.address().port}`,
  auth = new Auth(pool, origin),
  store = new PostgresStore(pool);
async function request(path, method, data, headers, expected = 200) {
  const response = await fetch(origin + '/api/' + path, {
    method,
    headers: { ...headers, ...(data ? { 'Content-Type': 'application/json' } : {}) },
    ...(data ? { body: JSON.stringify(data) } : {}),
  });
  const value = await response.json();
  assert.equal(response.status, expected, `${method} ${path}: ${JSON.stringify(value)}`);
  return value;
}
/** An account `days` old, confirmed unless told otherwise, with a public timeline. */
async function account(name, days, { confirmed = true, admin = false } = {}) {
  const id = randomUUID();
  ids.push(id);
  await pool.query(
    `INSERT INTO oc_users(id,username,email,email_verified_at,password_hash,is_admin,quota_bypass,created_at)
    VALUES($1,$2,$3,$4,$5,$6,true,now()-$7::interval)`,
    [
      id,
      `${name}_${suffix}`,
      // Unconfirmed: no address (one awaiting confirmation could not sign in).
      confirmed ? `${name}_${suffix}@example.test` : null,
      confirmed ? new Date() : null,
      await passwordHash(password),
      admin,
      `${days} days`,
    ],
  );
  const u = (await pool.query('SELECT * FROM oc_users WHERE id=$1', [id])).rows[0];
  // Unconfirmed accounts cannot sign in (Auth.issue).
  const issued = confirmed ? await auth.issue(u) : null;
  const timeline = await store.create(
    id,
    validateDocument({
      format: 'openchronology',
      version: 1,
      title: `Standing ${name} ${suffix}`,
      description: '',
      events: [],
    }),
  );
  await pool.query("UPDATE oc_timelines SET visibility='public',tags=$2 WHERE id=$1", [
    timeline.id,
    [tag],
  ]);
  return {
    id,
    timeline: timeline.id,
    headers: issued && { Cookie: issued.cookie.split(';')[0], 'X-CSRF-Token': issued.csrf },
  };
}
const standing = async (account) => (await standingOf(pool, [account.id]))[0].standing;
const stored = async (account) =>
  (await pool.query('SELECT standing FROM oc_account_standing WHERE user_id=$1', [account.id]))
    .rows[0]?.standing ?? 0;
/** What browsing (by this run's tag) lists, in order. */
const browse = async (sort = 'age', extra = {}) =>
  (await searchTimelines(pool, null, { scope: 'public', tag, sort, limit: 50, ...extra }))
    .timelines;
const star = (who, what, starred = true) =>
  request(`timelines/${what.timeline}/star`, 'POST', { starred }, who.headers);
try {
  const veteran = await account('veteran', 40),
    elder = await account('elder', 60),
    newcomer = await account('newcomer', 1),
    middle = await account('middle', 10),
    unconfirmed = await account('unconfirmed', 90, { confirmed: false }),
    admin = await account('admin', 0, { admin: true });
  await sweepStanding(pool);

  // Who is established: confirmed and 30 days old (or 7 and endorsed), or an administrator.
  assert((await stored(veteran)) > 0);
  assert((await stored(elder)) > (await stored(veteran)) - 0.01, 'Standing grows with age.');
  assert.equal(await stored(newcomer), 0);
  assert.equal(await stored(middle), 0);
  assert.equal(await stored(unconfirmed), 0);
  assert.equal(await stored(admin), 1);

  // Browsing lists established owners' timelines; search and profiles find the rest.
  const titles = (list) =>
    list.map((t) => t.title.replace(` ${suffix}`, '').replace('Standing ', ''));
  assert.deepEqual(new Set(titles(await browse())), new Set(['veteran', 'elder', 'admin']));
  const found = titles(await browse('relevance', { search: suffix }));
  assert.equal(found.length, 6);
  assert.deepEqual(new Set(found.slice(0, 3)), new Set(['veteran', 'elder', 'admin']));
  assert.deepEqual(titles(await browse('age', { owner: `newcomer_${suffix}` })), ['newcomer']);
  // A featured timeline is listed whoever owns it.
  await pool.query('UPDATE oc_timelines SET featured=true WHERE id=$1', [newcomer.timeline]);
  assert(titles(await browse()).includes('newcomer'));
  await pool.query('UPDATE oc_timelines SET featured=false WHERE id=$1', [newcomer.timeline]);
  // Standing is not published.
  assert(!('established' in (await browse())[0]) && !('trending' in (await browse())[0]));

  // An established account's star endorses a week-old account at once.
  await star(veteran, middle);
  assert((await stored(middle)) > 0);
  assert(titles(await browse()).includes('middle'));
  // A newcomer's star endorses no one.
  await star(newcomer, unconfirmed);
  assert.equal(await stored(unconfirmed), 0);

  // Popularity: the standing of who starred or forked, never the owner, each account once.
  await star(newcomer, elder);
  await star(elder, elder);
  const popularity = async (account) =>
    (
      await pool.query(
        'SELECT popularity,trending FROM oc_timeline_popularity WHERE timeline_id=$1',
        [account.timeline],
      )
    ).rows[0] ?? { popularity: 0, trending: 0 };
  assert.equal((await popularity(elder)).popularity, 0, 'Newcomers and owners add nothing.');
  await star(veteran, elder);
  await star(admin, elder);
  const weighed = (await popularity(elder)).popularity;
  assert(Math.abs(weighed - ((await stored(veteran)) + 1)) < 1e-4, String(weighed));
  // A public fork counts like a star, once per account.
  const fork = await store.create(
    middle.id,
    validateDocument({
      format: 'openchronology',
      version: 1,
      title: 'Fork',
      description: '',
      events: [],
    }),
  );
  await pool.query("UPDATE oc_timelines SET upstream_id=$2,visibility='public' WHERE id=$1", [
    fork.id,
    veteran.timeline,
  ]);
  await sweepStanding(pool);
  assert(Math.abs((await popularity(veteran)).popularity - (await stored(middle))) < 1e-4);
  // Elder: the veteran's and an administrator's stars; middle: the veteran's; veteran: middle's fork.
  assert.deepEqual(titles(await browse('popularity')).slice(0, 3), ['elder', 'middle', 'veteran']);

  // Trending counts the last 30 days only.
  await pool.query(
    "UPDATE oc_timeline_stars SET created_at=now()-interval '40 days' WHERE timeline_id=$1 AND user_id=$2",
    [elder.timeline, admin.id],
  );
  await sweepStanding(pool);
  const elderScores = await popularity(elder);
  assert(Math.abs(elderScores.popularity - elderScores.trending - 1) < 1e-4);
  // Elder's lead was the administrator's old star: trending, it ties with middle.
  assert(Math.abs(elderScores.trending - (await popularity(middle)).trending) < 1e-4);
  const trending = titles(await browse('trending'));
  assert(
    trending.indexOf('veteran') > Math.max(trending.indexOf('elder'), trending.indexOf('middle')),
  );

  // Unstarring takes the contribution away at once.
  await star(veteran, elder, false);
  assert(Math.abs((await popularity(elder)).popularity - 1) < 1e-4);

  // An administrator's trust overrides; it applies at once.
  await request(
    `admin/users/${newcomer.id}`,
    'PATCH',
    { trust: 'trusted', password },
    admin.headers,
  );
  assert.equal(await stored(newcomer), 1);
  assert(Math.abs((await popularity(elder)).popularity - 2) < 1e-4, 'Their stars now count.');
  await request(
    `admin/users/${veteran.id}`,
    'PATCH',
    { trust: 'untrusted', password },
    admin.headers,
  );
  assert.equal(await stored(veteran), 0);
  assert(!titles(await browse()).includes('veteran'));
  await request(
    `admin/users/${veteran.id}`,
    'PATCH',
    { trust: 'nonsense', password },
    admin.headers,
    400,
  );
  const listed = await request(
    `admin/users?search=${encodeURIComponent('_' + suffix)}`,
    'GET',
    undefined,
    admin.headers,
  );
  const row = (name) => listed.items.find((item) => item.username === `${name}_${suffix}`);
  assert.equal(row('veteran').trust, 'untrusted');
  assert.equal(row('unconfirmed').confirmed, false);
  // Its only endorser, the veteran, is now untrusted; the trusted newcomer now endorses.
  assert.equal(row('middle').endorsers, 0);
  assert.equal(row('elder').endorsers, 2);
  assert.equal(row('newcomer').standing, 1);

  // What an untrusted account endorsed loses that endorsement at once.
  assert.equal(await stored(middle), 0);
  await request(`admin/users/${veteran.id}`, 'PATCH', { trust: null, password }, admin.headers);
  assert((await stored(middle)) > 0);

  // A moderation restriction in force leaves its owner without standing.
  await request(
    'reports',
    'POST',
    { target: { kind: 'timeline', timeline: middle.timeline }, category: 'spam' },
    elder.headers,
    201,
  );
  const caseId = (
    await pool.query(
      "SELECT id FROM oc_moderation_cases WHERE target_kind='timeline' AND target_id=$1",
      [middle.timeline],
    )
  ).rows[0].id;
  await request(
    `admin/reports/${caseId}`,
    'PATCH',
    { action: 'restrict', reason: 'Spam.', password },
    admin.headers,
  );
  assert.equal(await stored(middle), 0);
  assert.equal(await standing(middle), 0);
  await request(`admin/reports/${caseId}`, 'PATCH', { action: 'lift', password }, admin.headers);
  assert((await stored(middle)) > 0);
  console.log(
    'PASS standing: establishment, browsing, popularity, trending, trust and moderation.',
  );
} finally {
  await pool.query('DELETE FROM oc_moderation_cases WHERE owner_id=ANY($1::uuid[])', [ids]);
  await pool.query('DELETE FROM oc_admin_audit WHERE actor_id=ANY($1::uuid[])', [ids]);
  await pool.query('DELETE FROM oc_timelines WHERE owner_id=ANY($1::uuid[])', [ids]);
  await pool.query('DELETE FROM oc_users WHERE id=ANY($1::uuid[])', [ids]);
  app.close();
  await pool.end();
}
