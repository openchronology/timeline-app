// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// A large fork or duplicate is answered at once and its index copied afterwards (#145):
// until then it refuses reads and writes of its index but shows its metadata; once ready it
// holds exactly the revision it was copied from, even when its source saved, changed a lot
// or was deleted meanwhile; deleting it while preparing is fine; a restart resumes.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import pg from 'pg';
import { PostgresStore } from '../server/store.mjs';
import { Versioning } from '../server/versioning.mjs';
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

  // A large one is answered at once; until ready it shows its metadata only.
  let fork = await heldFork(source);
  assert.equal(fork.title, source.title);
  assert.equal((await store.metadata(fork.id, user)).preparing, true);
  for (const attempt of [
    () => store.snapshot(fork.id, user),
    () => store.save(fork.id, user, fork.revision, undefined, { settings, changes: [] }),
    () => versions.copy(fork.id, user, { revision: fork.revision }),
    () => versions.sync(fork.id, user, { revision: fork.revision }),
  ])
    await assert.rejects(attempt, (e) => e.status === 409 && /being prepared/.test(e.message));
  assert.equal(await prepared(fork.id), 0, 'copied, not rebuilt');
  assert.equal(await preparing(fork.id), null);
  assert.equal((await store.access(fork.id, user)).preparing, false);
  assert.deepEqual(await snapshot(fork.id), original, 'the copy holds the revision copied');
  // Prepared once: preparing again does nothing.
  await store.prepare(fork.id);

  // The source saving before the copy is made: the copy is brought back to the fork point.
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
  assert.equal(await prepared(fork.id), 0, 'brought back in place');
  assert.deepEqual(await snapshot(fork.id), original, 'brought back to the revision copied');
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

  // The source changing too much to bring back in place: the copy is rebuilt from the
  // revision copied.
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
  assert.equal(await prepared(fork.id), 1, 'rebuilt');
  assert.deepEqual(await snapshot(fork.id), base, 'rebuilt as the revision copied');

  // The source deleted before the copy is made: rebuilt from the revision copied.
  const doomed = await store.create(user, generateTimeline(21000));
  const doomedDocument = await snapshot(doomed.id);
  const orphan = await heldFork(doomed);
  await store.transaction(async (c) => {
    await c.query('DELETE FROM oc_timelines WHERE id=$1', [doomed.id]);
    await store.removeHistory(c, doomed.id);
  });
  assert.equal(await prepared(orphan.id), 1, 'rebuilt');
  assert.deepEqual(await snapshot(orphan.id), doomedDocument, 'rebuilt without its source');

  // Deleting a copy before it is prepared: nothing is left to prepare.
  const abandoned = await heldFork(source);
  await store.transaction(async (c) => {
    await c.query('DELETE FROM oc_timelines WHERE id=$1', [abandoned.id]);
    await store.removeHistory(c, abandoned.id);
  });
  await store.prepare(abandoned.id);
  assert.equal(
    (await pool.query('SELECT count(*) AS n FROM oc_moments WHERE timeline_id=$1', [abandoned.id]))
      .rows[0].n,
    '0',
  );

  // Copies left unprepared (a restart) are prepared when the server starts.
  const left = await heldFork(source);
  const leftDocument = await snapshot(source.id);
  await store.prepareStale();
  assert.equal(await preparing(left.id), null);
  assert.deepEqual(await snapshot(left.id), leftDocument);
  console.log(
    'PASS preparing copies: large forks answer at once, refuse their index until ready, and hold exactly the revision copied (source saved, rewritten or deleted meantime); deletion and restarts are handled.',
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
