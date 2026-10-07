// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import pg from 'pg';
import { PostgresStore } from '../server/store.mjs';
import { searchTimelines } from '../server/collaboration.mjs';
import { setTimelineStar } from '../server/stars.mjs';
import { createApplication } from '../server/http.mjs';
import { Auth } from '../server/auth.mjs';
const pool = new pg.Pool(
  process.env.DATABASE_URL ? { connectionString: process.env.DATABASE_URL } : {},
);
const ids = [randomUUID(), randomUUID()],
  tids = Array.from({ length: 5 }, () => randomUUID());
const username = 'stars_' + ids[0].slice(0, 8);
let app;
try {
  await pool.query(await readFile(new URL('../server/schema.sql', import.meta.url), 'utf8'));
  for (const [i, id] of ids.entries())
    await pool.query('INSERT INTO oc_users(id,username,email_verified_at) VALUES($1,$2,now())', [
      id,
      username + i,
    ]);
  for (const [i, id] of tids.entries())
    await pool.query(
      `INSERT INTO oc_timelines(id,owner_id,title,visibility,created_at) VALUES($1,$2,$3,$4,now()+$5*interval '1 day')`,
      [
        id,
        ids[0],
        [
          'Zebra galaxy galaxy',
          'Alpha galaxy',
          'Private galaxy',
          'Fork galaxy',
          'Hidden fork galaxy',
        ][i],
        i === 2 || i === 4 ? 'private' : 'public',
        i,
      ],
    );
  await pool.query('UPDATE oc_timelines SET upstream_id=$1 WHERE id=ANY($2::uuid[])', [
    tids[1],
    tids.slice(3),
  ]);
  const store = new PostgresStore(pool);
  await assert.rejects(
    setTimelineStar(pool, store, tids[0], null, { starred: true }),
    (e) => e.status === 401,
  );
  await assert.rejects(
    setTimelineStar(pool, store, tids[2], ids[1], { starred: true }),
    (e) => e.status === 404,
  );
  await Promise.all(
    Array.from({ length: 10 }, () =>
      setTimelineStar(pool, store, tids[0], ids[0], { starred: true }),
    ),
  );
  assert.equal((await store.access(tids[0], ids[0])).star_count, '1');
  assert.equal(
    (await store.access(tids[0], ids[0])).revision,
    '1',
    'Starring must not create a document revision',
  );
  assert.equal((await store.access(tids[0], ids[0])).starred, true);
  await setTimelineStar(pool, store, tids[0], ids[1], { starred: true });
  await setTimelineStar(pool, store, tids[2], ids[0], { starred: true });
  const own = await searchTimelines(pool, ids[0], { scope: 'starred' });
  assert.equal(own.total, 2);
  const profile = await searchTimelines(pool, null, { scope: 'public', starredBy: username + '0' });
  assert.deepEqual(
    profile.timelines.map((t) => t.id),
    [tids[0]],
  );
  const query = { scope: 'public', owner: username + '0' };
  assert.equal(
    (await searchTimelines(pool, null, { ...query, sort: 'stars' })).timelines[0].id,
    tids[0],
  );
  assert.equal(
    (await searchTimelines(pool, null, { ...query, sort: 'alphabetical' })).timelines[0].id,
    tids[1],
  );
  assert.equal(
    (await searchTimelines(pool, null, { ...query, sort: 'age' })).timelines[0].id,
    tids[3],
  );
  assert.equal(
    (await searchTimelines(pool, null, { ...query, search: 'galaxy', sort: 'relevance' }))
      .timelines[0].id,
    tids[0],
  );
  const popular = await searchTimelines(pool, null, { ...query, sort: 'popularity' });
  assert.equal(
    popular.timelines.find((t) => t.id === tids[1]).popularity,
    '1',
    'Private forks must not affect public popularity',
  );
  await pool.query('UPDATE oc_timelines SET featured=true WHERE id=$1', [tids[1]]);
  assert.equal((await searchTimelines(pool, null, query)).timelines[0].id, tids[1]);
  const first = await searchTimelines(pool, null, {
    ...query,
    sort: 'alphabetical',
    limit: 1,
    page: 1,
  });
  const second = await searchTimelines(pool, null, {
    ...query,
    sort: 'alphabetical',
    limit: 1,
    page: 2,
  });
  assert.notEqual(first.timelines[0].id, second.timelines[0].id);
  app = createApplication({ pool });
  await new Promise((resolve) => app.listen(0, '127.0.0.1', resolve));
  const origin = 'http://127.0.0.1:' + app.address().port,
    auth = new Auth(pool, origin);
  const issued = await auth.issue(
    (await pool.query('SELECT * FROM oc_users WHERE id=$1', [ids[0]])).rows[0],
  );
  const endpoint = origin + '/api/timelines/' + tids[1] + '/star';
  const send = (headers, data) =>
    fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(data),
    });
  assert.equal((await send({}, { starred: true })).status, 401);
  assert.equal(
    (await send({ Cookie: issued.cookie.split(';')[0] }, { starred: true })).status,
    403,
  );
  const headers = { Cookie: issued.cookie.split(';')[0], 'X-CSRF-Token': issued.csrf };
  assert.equal((await send(headers, { starred: 'yes' })).status, 400);
  assert.equal((await send(headers, { starred: true })).status, 200);
  assert.equal((await store.access(tids[1], ids[0])).star_count, '1');
  await Promise.all(
    Array.from({ length: 5 }, () =>
      setTimelineStar(pool, store, tids[0], ids[0], { starred: false }),
    ),
  );
  assert.equal((await store.access(tids[0], ids[0])).star_count, '1');
  await pool.query('DELETE FROM oc_users WHERE id=$1', [ids[1]]);
  assert.equal((await store.access(tids[0], ids[0])).star_count, '0');
  await pool.query('DELETE FROM oc_timelines WHERE id=$1', [tids[1]]);
  assert.equal(
    (await pool.query('SELECT * FROM oc_timeline_stars WHERE timeline_id=$1', [tids[1]])).rowCount,
    0,
  );
  console.log(
    'PASS: star authentication, CSRF, concurrent idempotency, exact counts, private favorite protection, sorting, pagination and cascade cleanup.',
  );
} finally {
  if (app) await new Promise((resolve) => app.close(resolve));
  await pool.query('DELETE FROM oc_timelines WHERE id=ANY($1::uuid[])', [tids]);
  await pool.query('DELETE FROM oc_users WHERE id=ANY($1::uuid[])', [ids]);
  await pool.end();
}
