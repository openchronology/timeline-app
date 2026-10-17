// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// A fork or duplicate that would read through to more levels than a fork may (INDEX_LEVELS)
// copies what it reads of the nearest ones (#145); when that is a lot, it is answered at once
// and copied afterwards: until then it refuses reads and writes of its index but shows its
// metadata; once ready it holds exactly the revision it was copied from, even when its source
// saved, was rewritten or was deleted meanwhile (its pin keeps that revision's rows), and
// nothing stays pinned for it; deleting it while preparing is fine; a restart resumes; a copy
// left by an earlier version is rebuilt.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import pg from 'pg';
import { PostgresStore } from '../server/store.mjs';
import { Versioning } from '../server/versioning.mjs';
import { VERSIONED_TABLES } from '../server/index-versions.mjs';
import { setEntryLimit, validateDocument } from '../dist/core.mjs';
import { generateTimeline } from '../bench/generate.mjs';
if (!process.env.DATABASE_URL) throw new Error('Use a dedicated PostgreSQL test database.');
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL }),
  store = new PostgresStore(pool),
  versions = new Versioning(store);
const user = randomUUID(),
  created = [];
const order = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const key = (r) => JSON.stringify([r.a, r.b]);
/** Documents compare independent of the order of their entities. */
const normal = (d) => ({
  ...d,
  events: [...d.events].sort((a, b) => order(a.id, b.id)),
  ...(d.durations ? { durations: [...d.durations].sort((a, b) => order(a.id, b.id)) } : {}),
  ...(d.relationships
    ? { relationships: [...d.relationships].sort((a, b) => order(key(a), key(b))) }
    : {}),
});
const snapshot = async (id) => normal((await store.snapshot(id, user)).document);
const preparing = async (id) =>
  (await pool.query('SELECT preparing_revision_id FROM oc_timelines WHERE id=$1', [id])).rows[0]
    ?.preparing_revision_id ?? null;
// Every copy here reads through to nothing, so it copies its source's index whole
// (fork-read-through-postgres.mjs covers a copy past INDEX_LEVELS).
store.indexLevels = 0;
/** Rows timelines `ids` hold in their index (live and retired). */
async function rowsOf(ids) {
  let count = 0;
  for (const table of VERSIONED_TABLES)
    for (const name of [table, table + '_retired'])
      count += Number(
        (
          await pool.query(`SELECT count(*) AS n FROM ${name} WHERE timeline_id=ANY($1::uuid[])`, [
            ids,
          ])
        ).rows[0].n,
      );
  return count;
}
/** Once prepared, a copy reads through to nothing, and nothing stays pinned for it. */
async function ready(id, source) {
  assert.equal(await preparing(id), null);
  const { rows } = await pool.query('SELECT index_bases FROM oc_timelines WHERE id=$1', [id]);
  assert.deepEqual(rows[0].index_bases, [], 'reads through to nothing');
  const pinned = await pool.query('SELECT index_pinned FROM oc_timelines WHERE id=$1', [source]);
  assert.equal(pinned.rows[0]?.index_pinned ?? null, null, 'its source is released');
}
// Holds copies back from being prepared, so a test can change things first.
const prepare = store.prepare;
const hold = () => (store.prepare = () => Promise.resolve());
const release = () => (store.prepare = prepare);
// Counts rebuilds from documents (the copy is brought back in place when it can be).
let rebuilds = 0;
const replace = store.replace;
store.replace = function (...args) {
  rebuilds++;
  return replace.apply(this, args);
};
/** Prepares a held copy, returning how many rebuilds that took. */
async function prepared(id) {
  rebuilds = 0;
  await store.prepare(id);
  return rebuilds;
}
/** A fork of `timeline` whose index is left for later, not yet prepared. */
async function heldFork(timeline) {
  hold();
  const fork = await versions.copy(timeline.id, user, { revision: timeline.revision });
  release();
  created.push(fork.id);
  assert(fork.preparing, 'answered before its index is copied');
  assert(await preparing(fork.id));
  return fork;
}
try {
  await pool.query(await readFile(new URL('../server/schema.sql', import.meta.url), 'utf8'));
  await pool.query(
    'INSERT INTO oc_users(id,username,email_verified_at,quota_bypass) VALUES($1,$2,now(),true)',
    [user, 'preparing_' + user.slice(0, 8)],
  );
  setEntryLimit(Infinity);
  const document = generateTimeline(25000);
  let source = await store.create(user, document);
  created.push(source.id);
  const original = await snapshot(source.id);
  const settings = { ...document, events: [], durations: undefined, relationships: undefined };

  // A small copy is ready when answered.
  const small = await store.create(user, generateTimeline(1000));
  created.push(small.id);
  const smallFork = await versions.copy(small.id, user, { revision: small.revision });
  created.push(smallFork.id);
  assert.equal(smallFork.preparing, false);
  // A copy of a fork that hides some of what it reads through to: it copies both levels,
  // and drops the hidden rows once it reads through to nothing.
  delete store.indexLevels;
  let reader = await versions.copy(small.id, user, { revision: small.revision });
  created.push(reader.id);
  const smallDocument = await snapshot(small.id);
  reader = await store.save(reader.id, user, reader.revision, undefined, {
    settings: { ...smallDocument, events: [], durations: undefined, relationships: undefined },
    changes: smallDocument.events.slice(0, 20).map((e) => ({ id: e.id, event: null })),
  });
  store.indexLevels = 0;
  const { rows: hiding } = await pool.query(
    'SELECT count(*) AS n FROM oc_moments WHERE timeline_id=$1 AND hidden',
    [reader.id],
  );
  assert.equal(hiding[0].n, '20');
  const copyOfReader = await versions.copy(reader.id, user, { revision: reader.revision });
  created.push(copyOfReader.id);
  assert.equal(copyOfReader.preparing, false);
  assert.deepEqual(await snapshot(copyOfReader.id), await snapshot(reader.id));
  for (const table of VERSIONED_TABLES)
    assert.equal(
      (
        await pool.query(`SELECT count(*) AS n FROM ${table} WHERE timeline_id=$1 AND hidden`, [
          copyOfReader.id,
        ])
      ).rows[0].n,
      '0',
      `no hidden ${table} rows`,
    );
  await ready(copyOfReader.id, reader.id);

  // A large one is answered at once; until ready it shows its metadata only.
  let fork = await heldFork(source);
  assert.equal(fork.title, source.title);
  assert.equal((await store.metadata(fork.id, user)).preparing, true);
  const stillPreparing = (e) => e.status === 409 && /being prepared/.test(e.message);
  hold();
  for (const attempt of [
    () => store.snapshot(fork.id, user),
    () => store.save(fork.id, user, fork.revision, undefined, { settings, changes: [] }),
    () => versions.copy(fork.id, user, { revision: fork.revision }),
    () => versions.sync(fork.id, user, { revision: fork.revision }),
  ])
    await assert.rejects(attempt, stillPreparing);
  release();
  // A request refused while the copy is being prepared starts its preparation again, in
  // case one skipped it (SKIP LOCKED) and left it for the next start (#193).
  await assert.rejects(store.snapshot(fork.id, user), stillPreparing);
  assert(store.preparing.has(fork.id), 'the refused request tries again');
  assert.equal(await prepared(fork.id), 0, 'copied, not rebuilt');
  await ready(fork.id, source.id);
  assert.equal((await store.access(fork.id, user)).preparing, false);
  assert.deepEqual(await snapshot(fork.id), original, 'the copy holds the revision copied');
  // Prepared once: preparing again does nothing.
  await store.prepare(fork.id);

  // The source saving before the copy is made: the copy is of the revision forked.
  fork = await heldFork(source);
  const edited = (from, count, title) =>
    document.events
      .slice(from, from + count)
      .map((e) => ({ id: e.id, event: { ...e, time: e.time + '1', metadata: { title } } }));
  source = await store.save(source.id, user, source.revision, undefined, {
    settings: { ...settings, title: 'Changed after forking' },
    changes: [
      ...edited(100, 50, 'Moved'),
      { id: document.events[500].id, event: null },
      { id: 'new-moment', event: { id: 'new-moment', time: '5/1', metadata: { title: 'New' } } },
    ],
    durationChanges: [{ id: document.durations[0].id, duration: null }],
    relationshipChanges: [{ ...document.relationships[0], related: false }],
  });
  assert.equal(await prepared(fork.id), 0, 'copied, not rebuilt');
  await ready(fork.id, source.id);
  assert.deepEqual(await snapshot(fork.id), original, 'the revision copied');
  // It saves like any timeline from there.
  fork = await store.access(fork.id, user);
  fork = await store.save(fork.id, user, fork.revision, undefined, {
    settings,
    changes: edited(2000, 10, 'Fork edit'),
  });
  assert.equal(
    (await snapshot(fork.id)).events.filter((e) => e.metadata.title === 'Fork edit').length,
    10,
  );

  // The source rewritten whole meanwhile: still the revision copied.
  const base = await snapshot(source.id);
  fork = await heldFork(source);
  source = await store.save(
    source.id,
    user,
    source.revision,
    validateDocument({
      ...document,
      events: document.events.map((e, i) =>
        i % 4 ? e : { ...e, metadata: { title: 'Rewritten' } },
      ),
    }),
  );
  assert.equal(await prepared(fork.id), 0, 'copied, not rebuilt');
  await ready(fork.id, source.id);
  assert.deepEqual(await snapshot(fork.id), base, 'the revision copied');
  assert.equal(
    (
      await pool.query('SELECT count(*) AS n FROM oc_moments_retired WHERE timeline_id=$1', [
        source.id,
      ])
    ).rows[0].n,
    '0',
    'what the source kept for it is released',
  );

  // The source deleted meanwhile: its rows are kept until the copy is made, then go.
  const doomed = await store.create(user, generateTimeline(21000));
  const doomedDocument = await snapshot(doomed.id);
  const orphan = await heldFork(doomed);
  await store.transaction(async (c) => {
    await c.query('DELETE FROM oc_timelines WHERE id=$1', [doomed.id]);
    await store.removeHistory(c, doomed.id);
  });
  assert(await rowsOf([doomed.id]), 'kept for the copy');
  assert.equal(await prepared(orphan.id), 0, 'copied, not rebuilt');
  await ready(orphan.id, doomed.id);
  assert.deepEqual(await snapshot(orphan.id), doomedDocument, 'copied without its source');
  assert.equal(await rowsOf([doomed.id]), 0, 'released once copied');

  // Deleting a copy before it is prepared: nothing is left to prepare or pinned.
  const abandoned = await heldFork(source);
  await store.transaction(async (c) => {
    await c.query('DELETE FROM oc_timelines WHERE id=$1', [abandoned.id]);
    await store.removeHistory(c, abandoned.id);
  });
  await store.prepare(abandoned.id);
  assert.equal(await rowsOf([abandoned.id]), 0);
  assert.equal(
    (await pool.query('SELECT index_pinned FROM oc_timelines WHERE id=$1', [source.id])).rows[0]
      .index_pinned,
    null,
  );

  // Copies left unprepared (a restart) are prepared when the server starts.
  const left = await heldFork(source);
  const leftDocument = await snapshot(source.id);
  await store.prepareStale();
  await ready(left.id, source.id);
  assert.deepEqual(await snapshot(left.id), leftDocument);

  // A copy an earlier version left to prepare (its index not written, reading through to
  // nothing) is rebuilt from the revision it copies.
  const legacy = await heldFork(source);
  await store.transaction(async (c) => {
    const { rows } = await c.query(
      'SELECT index_bases,index_clocks FROM oc_timelines WHERE id=$1',
      [legacy.id],
    );
    await c.query("UPDATE oc_timelines SET index_bases='{}',index_clocks='{}' WHERE id=$1", [
      legacy.id,
    ]);
    await c.query('SELECT oc_release_index($1::uuid[],$2::bigint[])', [
      rows[0].index_bases,
      rows[0].index_clocks,
    ]);
  });
  assert.equal(await prepared(legacy.id), 1, 'rebuilt');
  await ready(legacy.id, source.id);
  assert.deepEqual(await snapshot(legacy.id), leftDocument);
  console.log(
    'PASS preparing copies: large forks answer at once, refuse their index until ready, and hold exactly the revision copied (source saved, rewritten or deleted meantime), releasing it; deletion, restarts and copies left by earlier versions are handled.',
  );
} finally {
  release();
  await store.idle();
  for (const id of created.reverse()) {
    await pool.query('DELETE FROM oc_timelines WHERE id=$1', [id]);
    await store.transaction((c) => store.removeHistory(c, id)).catch(() => {});
  }
  await pool.query('DELETE FROM oc_storage_entries WHERE user_id=$1', [user]);
  await pool.query('DELETE FROM oc_users WHERE id=$1', [user]);
  await pool.end();
}
