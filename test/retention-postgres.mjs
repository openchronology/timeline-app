// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// Data expiration and quick deletion (#91): a calendar timeline keeping its last year
// expires older moments and durations and prunes older history, keeping what newer history
// needs, in saves of a bounded size (also on forks, and when other saves interleave);
// writers delete a range at once; owners set retention in the timeline's units.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import pg from 'pg';
import { PostgresStore } from '../server/store.mjs';
import { createApplication } from '../server/http.mjs';
import { Auth } from '../server/auth.mjs';
import { expire, expireDue, deleteWhere } from '../server/retention.mjs';
import { Versioning } from '../server/versioning.mjs';
if (!process.env.DATABASE_URL) throw new Error('Use a dedicated PostgreSQL test database.');
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
await pool.query(await readFile(new URL('../server/schema.sql', import.meta.url), 'utf8'));
const store = new PostgresStore(pool);
const users = [],
  timelines = [];
let app;
const YEAR = 31556952,
  DAY = 86400;
const calendar = {
  version: 1,
  mode: 'gregorian',
  significantDigits: 6,
  unit: '',
  scale: '1/1',
  origin: '0/1',
  offsetMinutes: 0,
};
try {
  const account = async (name) => {
    const id = randomUUID();
    await pool.query('INSERT INTO oc_users(id,username,email_verified_at) VALUES($1,$2,now())', [
      id,
      `${name}_${id.slice(0, 8)}`,
    ]);
    users.push(id);
    return id;
  };
  const owner = await account('keeper'),
    writer = await account('writer'),
    stranger = await account('stranger');
  // "Now", two years ahead: everything saved during the test is old history by then.
  const now = Date.now() + 2 * YEAR * 1000,
    at = (secondsAgo) => `${Math.floor(now / 1000) - secondsAgo}/1`;
  const created = await store.create(owner, {
    format: 'openchronology',
    version: 1,
    title: 'Server logs',
    description: '',
    presentation: calendar,
    events: [
      { id: 'ancient', time: at(2 * YEAR), metadata: { title: 'Two years ago' } },
      { id: 'old', time: at(YEAR + 30 * DAY), metadata: { title: 'Thirteen months ago' } },
      { id: 'recent', time: at(30 * DAY), metadata: { title: 'A month ago' } },
      { id: 'newest', time: at(DAY), metadata: { title: 'Yesterday' } },
    ],
    durations: [
      { id: 'over', start: at(2 * YEAR), end: at(YEAR + 180 * DAY), metadata: {} },
      { id: 'crossing', start: { moment: 'old' }, end: { moment: 'recent' }, metadata: {} },
    ],
    relationships: [{ a: { moment: 'old' }, b: { moment: 'recent' } }],
  });
  timelines.push(created.id);
  const id = created.id;
  await pool.query("INSERT INTO oc_members(timeline_id,user_id,role) VALUES($1,$2,'writer')", [
    id,
    writer,
  ]);
  // A few saves of history: small ones are stored as patches against the one before.
  const settings = {
    format: 'openchronology',
    version: 1,
    title: 'Server logs',
    description: '',
    presentation: calendar,
    events: [],
  };
  let revision = created.revision;
  for (let i = 0; i < 3; i++) {
    const saved = await store.save(id, owner, revision, null, {
      settings,
      changes: [{ id: 'log' + i, event: { id: 'log' + i, time: at(10 * DAY - i), metadata: {} } }],
      durationChanges: [],
      relationshipChanges: [],
    });
    revision = saved.revision;
  }
  // A whole-document save stores a snapshot: history before it is no longer needed to read
  // newer revisions (as a busy timeline stores one every 1,000 saves, or once patches add up).
  const head = async () => {
    const { head_revision_id } = (
      await pool.query('SELECT head_revision_id FROM oc_timelines WHERE id=$1', [id])
    ).rows[0];
    return store.revisionDocument(pool, head_revision_id);
  };
  revision = (await store.save(id, owner, revision, await head())).revision;
  const revisions = async () =>
    Number(
      (await pool.query('SELECT count(*) FROM oc_revisions WHERE timeline_id=$1', [id])).rows[0]
        .count,
    );
  const used = async () =>
    BigInt(
      (await pool.query('SELECT used_bytes FROM oc_users WHERE id=$1', [owner])).rows[0].used_bytes,
    );
  const before = { revisions: await revisions(), used: await used() };
  assert(before.revisions >= 4);

  // Without retention nothing expires.
  assert.equal(await expire(store, id, now), null);

  // Owners set retention in the timeline's own units, over HTTP.
  app = createApplication({ pool });
  await new Promise((resolve) => app.listen(0, '127.0.0.1', resolve));
  const origin = 'http://127.0.0.1:' + app.address().port,
    auth = new Auth(pool, origin);
  const as = async (userId) => {
    const issued = await auth.issue(
      (await pool.query('SELECT * FROM oc_users WHERE id=$1', [userId])).rows[0],
    );
    return async (path, method, data) => {
      const res = await fetch(origin + '/api/timelines/' + id + path, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Cookie: issued.cookie.split(';')[0],
          'X-CSRF-Token': issued.csrf,
        },
        body: JSON.stringify(data),
      });
      return { status: res.status, body: await res.json() };
    };
  };
  const ownerRequest = await as(owner),
    writerRequest = await as(writer),
    strangerRequest = await as(stranger);
  assert.equal((await writerRequest('/settings', 'PATCH', { retention: '1 year' })).status, 403);
  const tooShort = await ownerRequest('/settings', 'PATCH', { retention: '30 min' });
  assert.equal(tooShort.status, 400);
  assert.match(tooShort.body.error, /at least an hour/);
  const set = await ownerRequest('/settings', 'PATCH', { retention: '1 year' });
  assert.equal(set.status, 200, JSON.stringify(set.body));
  assert.equal(set.body.retention, '1 year');
  assert.equal(set.body.retention_seconds, String(YEAR) + '/1');

  // Expiring: moments and durations from before the year go, as one save; durations that
  // followed an expired moment keep its time, and its links go.
  const result = await expire(store, id, now);
  assert.equal(result.moments, 2);
  assert.equal(result.durations, 1);
  assert(result.history >= 1, 'older history is pruned');
  const document = await head();
  assert.deepEqual(document.events.map((e) => e.id).sort(), [
    'log0',
    'log1',
    'log2',
    'newest',
    'recent',
  ]);
  assert.deepEqual(
    document.durations.map((d) => d.id),
    ['crossing'],
  );
  assert.equal(document.durations[0].start, at(YEAR + 30 * DAY));
  assert.equal(document.relationships, undefined);
  // History before the year is gone, apart from what newer history is stored against; every
  // revision left can still be read.
  const left = await pool.query('SELECT id FROM oc_revisions WHERE timeline_id=$1', [id]);
  assert(left.rows.length < before.revisions + 1, `${left.rows.length} revisions left`);
  for (const { id: revisionId } of left.rows) await store.revisionDocument(pool, revisionId);
  assert((await used()) < before.used, 'expiring frees storage');
  const row = (
    await pool.query(
      'SELECT retention_applied_at,retention_removed FROM oc_timelines WHERE id=$1',
      [id],
    )
  ).rows[0];
  assert(row.retention_applied_at);
  assert.equal(Number(row.retention_removed), 3);
  // Applied within the hour, it is not due again. Expiring again removes no entries; the
  // revision that was the head before the expiry's own save is now older history too.
  await expireDue(store, now);
  const again = await expire(store, id, now);
  assert.deepEqual({ ...again, history: 0 }, { history: 0, moments: 0, durations: 0 });
  assert(again.history <= 1);
  assert.deepEqual(await expire(store, id, now), { history: 0, moments: 0, durations: 0 });

  // Quick deletion: everything in a range, by a writer, as one save.
  const meta = await store.access(id, owner);
  assert.equal(
    (
      await strangerRequest('/delete-range', 'POST', {
        revision: meta.revision,
        lower: at(11 * DAY),
        upper: at(9 * DAY),
      })
    ).status,
    404,
  );
  assert.equal(
    (
      await writerRequest('/delete-range', 'POST', {
        revision: meta.revision,
        lower: at(9 * DAY),
        upper: at(11 * DAY),
      })
    ).status,
    400,
    'lower after upper',
  );
  assert.equal(
    (
      await writerRequest('/delete-range', 'POST', {
        revision: '1',
        lower: at(11 * DAY),
        upper: at(9 * DAY),
      })
    ).status,
    409,
    'a stale revision',
  );
  const deleted = await writerRequest('/delete-range', 'POST', {
    revision: meta.revision,
    lower: at(11 * DAY),
    upper: at(9 * DAY),
  });
  assert.equal(deleted.status, 200, JSON.stringify(deleted.body));
  assert.deepEqual(deleted.body.removed, { moments: 3, durations: 0 });
  assert.deepEqual((await head()).events.map((e) => e.id).sort(), ['newest', 'recent']);

  // A long expiry: deleted in several saves, each a transaction of its own, and retried when
  // another save got in first; a moment exactly at the cutoff stays. Found through the
  // timeline's trees, so a fork (reading through to its source) expires the same.
  const busyDocument = {
    ...settings,
    title: 'Busy',
    events: [
      ...Array.from({ length: 23 }, (_, i) => ({
        id: 'e' + String(i).padStart(2, '0'),
        time: at(YEAR + 1000 + i * 7),
        metadata: { title: 'Expired ' + i },
      })),
      { id: 'edge', time: `${now - YEAR * 1000}/1000`, metadata: { title: 'At the cutoff' } },
      { id: 'kept', time: at(DAY), metadata: { title: 'Kept' } },
    ],
    durations: [{ id: 'gone', start: at(YEAR + 500), end: at(YEAR + 100), metadata: {} }],
  };
  const busy = await store.create(owner, busyDocument);
  timelines.push(busy.id);
  const busyFork = await new Versioning(store).copy(busy.id, owner, { revision: busy.revision });
  timelines.push(busyFork.id);
  for (const timeline of [busy.id, busyFork.id])
    await pool.query('UPDATE oc_timelines SET retention_seconds=$2 WHERE id=$1', [
      timeline,
      `${YEAR}/1`,
    ]);
  const savesOf = async (timeline) =>
    Number(
      (
        await pool.query("SELECT count(*) FROM oc_revisions WHERE timeline_id=$1 AND kind='save'", [
          timeline,
        ])
      ).rows[0].count,
    );
  const ids = async (timeline) =>
    (await store.snapshot(timeline, owner)).document.events.map((e) => e.id).sort();
  const save = store.save;
  let interrupted = false;
  store.save = async function (timeline, ...rest) {
    // Someone else saves just before retention's first save.
    if (!interrupted && timeline === busy.id) {
      interrupted = true;
      const current = await store.access(busy.id, owner);
      await save.call(this, busy.id, owner, current.revision, null, {
        settings: { ...settings, title: 'Busy' },
        changes: [{ id: 'late', event: { id: 'late', time: at(2 * DAY), metadata: {} } }],
        durationChanges: [],
        relationshipChanges: [],
      });
    }
    return save.call(this, timeline, ...rest);
  };
  for (const timeline of [busy.id, busyFork.id]) {
    const saves = await savesOf(timeline);
    const expired = await expire(store, timeline, now, { save: 5 });
    assert.deepEqual({ ...expired, history: 0 }, { history: 0, moments: 23, durations: 1 });
    // 23 moments, 5 at a time (and the interrupting save).
    assert.equal(await savesOf(timeline), saves + 5 + (timeline === busy.id ? 1 : 0));
    assert.deepEqual(
      await ids(timeline),
      timeline === busy.id ? ['edge', 'kept', 'late'] : ['edge', 'kept'],
    );
    assert.equal((await store.snapshot(timeline, owner)).document.durations, undefined);
  }
  store.save = save;
  assert(interrupted);
  // A range deletion takes at most its limit, the first moments in time order, and says
  // when the range holds more.
  const ranged = await store.create(owner, busyDocument);
  timelines.push(ranged.id);
  const partial = await deleteWhere(
    store,
    await store.access(ranged.id, owner),
    owner,
    ranged.revision,
    { lower: at(YEAR + 1000 + 22 * 7), upper: at(YEAR + 1000) },
    { limit: 4 },
  );
  assert.deepEqual(partial.removed, { moments: 4, durations: 0 });
  assert.equal(partial.more, true);
  assert.deepEqual(
    (await ids(ranged.id)).filter((id) => /^e\d/.test(id)),
    [
      'e00',
      'e01',
      'e02',
      'e03',
      'e04',
      'e05',
      'e06',
      'e07',
      'e08',
      'e09',
      'e10',
      'e11',
      'e12',
      'e13',
      'e14',
      'e15',
      'e16',
      'e17',
      'e18',
    ],
    'the oldest four went',
  );
  // Walking the moment tree a few moments at a time finds the same.
  const walked = await deleteWhere(
    store,
    await store.access(ranged.id, owner),
    owner,
    (await store.access(ranged.id, owner)).revision,
    { before: `${now - YEAR * 1000}/1000` },
    { limit: 10, walk: 3 },
  );
  assert.deepEqual(walked.removed, { moments: 10, durations: 1 });
  assert.equal(walked.more, true);
  assert.deepEqual(
    (await ids(ranged.id)).filter((id) => /^e\d/.test(id)),
    ['e00', 'e01', 'e02', 'e03', 'e04', 'e05', 'e06', 'e07', 'e08'],
    'the oldest ten more went, and the duration before the cutoff',
  );

  // Clearing retention, and timelines without a calendar cannot have one.
  assert.equal(
    (await ownerRequest('/settings', 'PATCH', { retention: null })).body.retention,
    null,
  );
  await pool.query(
    'UPDATE oc_timelines SET presentation=presentation||\'{"mode":"rational"}\' WHERE id=$1',
    [id],
  );
  const rational = await ownerRequest('/settings', 'PATCH', { retention: '1 year' });
  assert.equal(rational.status, 400);
  assert.match(rational.body.error, /calendar/);
  console.log(
    'PASS retention: calendar timelines expire old moments, durations and history (keeping what newer history needs, freeing storage); range deletion by writers; retention set by owners in the timeline’s units.',
  );
} finally {
  if (app) await new Promise((resolve) => app.close(resolve));
  for (const id of timelines) {
    await store.transaction(async (c) => {
      await c.query('DELETE FROM oc_timelines WHERE id=$1', [id]);
      await store.removeHistory(c, id);
    });
  }
  await pool.query('DELETE FROM oc_users WHERE id=ANY($1::uuid[])', [users]);
  await pool.end();
}
