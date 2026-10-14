// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// Optional saved history (#136): a timeline that stops keeping saved history forgets its past
// revisions' content and is refunded it, apart from what forks and pull requests still read;
// its saves then record revisions without content, charged nothing; its head stays readable.
// Copies inherit the setting; syncing and pull requests that would need a forgotten revision
// say why they cannot. Starting history again records the current state as a new revision,
// with one copy. Migrations leave timelines without history alone.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import pg from 'pg';
import { PostgresStore, HISTORY_OFF } from '../server/store.mjs';
import { startHistory } from '../server/history.mjs';
import { Versioning, SYNC_UNAVAILABLE } from '../server/versioning.mjs';
import {
  Collaboration,
  PULLS_UNAVAILABLE,
  FORK_PULLS_UNAVAILABLE,
} from '../server/collaboration.mjs';
import { validateDocument } from '../dist/core.mjs';
if (!process.env.DATABASE_URL) throw new Error('Use a dedicated PostgreSQL test database.');
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL }),
  store = new PostgresStore(pool),
  versions = new Versioning(store),
  pulls = new Collaboration(store);
const owner = randomUUID(),
  timelines = [];
const order = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const normal = (d) => ({
  ...d,
  events: [...d.events].sort((a, b) => order(a.id, b.id)),
});
const snapshot = async (id) => normal((await store.snapshot(id, owner)).document);
const saved = async (revisionId) => normal(await store.revisionDocument(pool, revisionId));
/** History versions (and overrides) a timeline holds. */
const versionsOf = async (id) => {
  let n = 0;
  for (const table of [
    'oc_history_moments',
    'oc_history_durations',
    'oc_history_relationships',
    'oc_history_settings',
    'oc_history_moment_overrides',
  ])
    n += Number(
      (await pool.query(`SELECT count(*) AS n FROM ${table} WHERE timeline_id=$1`, [id])).rows[0].n,
    );
  return n;
};
const used = async () =>
  BigInt(
    (await pool.query('SELECT used_bytes FROM oc_users WHERE id=$1', [owner])).rows[0].used_bytes,
  );
/** What a revision is charged. */
const charged = async (revisionId) =>
  Number(
    (
      await pool.query(
        "SELECT coalesce(sum(bytes),0) AS n FROM oc_storage_entries WHERE kind='oc_revisions' AND entry_id=$1",
        [revisionId],
      )
    ).rows[0].n,
  );
/** Turns timeline `id`'s saved history off or on, as its settings do. */
const keep = (id, on) =>
  store.transaction(async (c) => {
    await c.query('SELECT id FROM oc_timelines WHERE id=$1 FOR UPDATE', [id]);
    if (on) await store.startHistory(c, id, owner);
    else await store.stopHistory(c, id);
  });
const moment = (i, title = 'Moment ' + i) => ({
  id: 'm' + i,
  time: `${i}/1`,
  metadata: { title, description: 'Notes '.repeat(20) },
});
const document = validateDocument({
  format: 'openchronology',
  version: 1,
  title: 'Optional history',
  description: '',
  events: Array.from({ length: 300 }, (_, i) => moment(i)),
  durations: [{ id: 'd', start: { moment: 'm1' }, end: '5/1', metadata: { title: 'Span' } }],
  relationships: [{ a: { moment: 'm2' }, b: { moment: 'm3' } }],
});
const settings = { ...document, events: [], durations: undefined, relationships: undefined };
/** Saves `count` moments from `from` with a new title, in place. */
const edit = (t, from, count, title) =>
  store.save(t.id, owner, t.revision, undefined, {
    settings,
    changes: Array.from({ length: count }, (_, i) => ({
      id: 'm' + (from + i),
      event: moment(from + i, title),
    })),
  });
try {
  await pool.query(await readFile(new URL('../server/schema.sql', import.meta.url), 'utf8'));
  await pool.query(
    'INSERT INTO oc_users(id,username,email_verified_at,quota_bypass) VALUES($1,$2,now(),true)',
    [owner, 'optional_' + owner.slice(0, 8)],
  );
  let t = await store.create(owner, document);
  timelines.push(t.id);
  assert.equal(t.keep_history, true, 'kept by default');
  t = await edit(t, 0, 5, 'First');
  t = await edit(t, 10, 5, 'Second');
  const firstEdits = await snapshot(t.id);
  // A fork reads through to this revision; a pull request is based on the next.
  let fork = await versions.copy(t.id, owner, { revision: t.revision });
  timelines.push(fork.id);
  const forkBase = fork.fork_base_revision_id;
  t = await edit(t, 20, 5, 'Third');
  const proposed = { ...(await snapshot(t.id)), description: 'Proposed' };
  const proposal = await pulls.create(t.id, owner, {
    title: 'A change',
    body: '',
    baseRevision: t.revision,
    document: proposed,
  });
  const proposalBase = t.head_revision_id;
  t = await edit(t, 30, 5, 'Fourth');
  const before = await versions.history(t.id, owner);
  const past = before.revisions.find(
    (r) => ![forkBase, proposalBase, t.head_revision_id].includes(r.id),
  );
  assert(before.revisions.every((r) => r.available));
  const usedBefore = await used();
  const freed = await store.historyBytes(pool, t.id);
  assert(freed > 0);

  // Turning it off forgets what nothing else reads, refunding exactly that.
  await keep(t.id, false);
  t = await store.access(t.id, owner);
  assert.equal(t.keep_history, false);
  assert.equal(t.history_since, null);
  assert.equal(usedBefore - (await used()), BigInt(freed), 'refunded what it freed');
  assert.equal(await store.historyBytes(pool, t.id), 0);
  const after = await versions.history(t.id, owner);
  assert.equal(after.keepHistory, false);
  assert.deepEqual(
    after.revisions.map((r) => r.id),
    before.revisions.map((r) => r.id),
    'every revision keeps its place',
  );
  assert.deepEqual(
    after.revisions
      .filter((r) => r.available)
      .map((r) => r.id)
      .sort(),
    [forkBase, proposalBase, t.head_revision_id].sort(),
    'only the head and what forks and pull requests read stay readable',
  );
  assert.equal(await charged(past.id), 0);
  await assert.rejects(
    versions.historical(t.id, past.id, owner),
    (e) => e.status === 409 && e.message === HISTORY_OFF,
  );
  assert.deepEqual(
    normal((await versions.historical(t.id, t.head_revision_id, owner)).document),
    await snapshot(t.id),
    'the head is read from the live index',
  );
  assert.deepEqual(await saved(forkBase), firstEdits, 'what the fork reads through to stays');
  assert.deepEqual(await snapshot(fork.id), firstEdits);
  assert.deepEqual(await saved(fork.head_revision_id), firstEdits);
  assert((await pulls.get(t.id, proposal.id, owner)).changes, 'the pull request still compares');
  // Turning it off again changes nothing.
  await keep(t.id, false);

  // The pull request made before still rebases onto the head and merges.
  const rebased = await pulls.resolve(t.id, proposal.id, owner, {
    action: 'rebase',
    revision: proposal.revision,
  });
  const merged = await pulls.resolve(t.id, proposal.id, owner, {
    action: 'merge',
    revision: rebased.revision,
  });
  assert.equal(merged.status, 'merged');
  t = await store.access(t.id, owner);
  assert.equal((await snapshot(t.id)).description, 'Proposed');

  // Saves record revisions without content, charged nothing, and write no versions.
  const kept = await versionsOf(t.id);
  const headBefore = t.head_revision_id;
  t = await edit(t, 40, 5, 'Off');
  t = await store.save(t.id, owner, t.revision, { ...(await snapshot(t.id)), title: 'Whole' });
  assert.equal(await versionsOf(t.id), kept, 'no versions written');
  const { rows: latest } = await pool.query(
    `SELECT r.id,r.history_rows,r.snapshot_id,r.patch,r.stored_bytes,
    (SELECT array_agg(parent_id) FROM oc_revision_parents WHERE revision_id=r.id) AS parents
    FROM oc_revisions r WHERE r.timeline_id=$1 AND r.number IS NOT NULL ORDER BY r.number DESC LIMIT 2`,
    [t.id],
  );
  for (const r of latest) {
    assert.equal(r.history_rows, false);
    assert.equal(r.snapshot_id ?? r.patch ?? r.stored_bytes, null);
    assert.equal(await charged(r.id), 0);
    assert.equal(r.parents.length, 1, 'ancestry is kept');
  }
  assert.equal(latest[1].parents[0], headBefore);
  await assert.rejects(store.revisionDocument(pool, latest[1].id), (e) => e.status === 409);
  assert.equal((await saved(t.head_revision_id)).title, 'Whole');

  // Pull requests into it say why they cannot be opened.
  await assert.rejects(
    pulls.create(t.id, owner, {
      title: 'Another',
      body: '',
      baseRevision: t.revision,
      document: await snapshot(t.id),
    }),
    (e) => e.status === 409 && e.message === PULLS_UNAVAILABLE,
  );

  // A copy inherits the setting and reads the same; it syncs while upstream has not moved,
  // then says why it cannot.
  let copy = await versions.copy(t.id, owner, { revision: t.revision });
  timelines.push(copy.id);
  assert.equal(copy.keep_history, false);
  assert.deepEqual(await snapshot(copy.id), await snapshot(t.id));
  assert.equal(await versionsOf(copy.id), 0);
  assert.equal(
    (await pool.query('SELECT 1 FROM oc_history_bases WHERE timeline_id=$1', [copy.id])).rows
      .length,
    0,
  );
  assert.equal(await versions.syncBlocked(copy.id, owner), null);
  copy = await versions.sync(copy.id, owner, { revision: copy.revision });
  t = await edit(t, 50, 5, 'Upstream moved');
  assert.equal(await versions.syncBlocked(copy.id, owner), SYNC_UNAVAILABLE);
  await assert.rejects(
    versions.sync(copy.id, owner, { revision: copy.revision }),
    (e) => e.status === 409 && e.message === SYNC_UNAVAILABLE,
  );
  // The fork made while history was kept still syncs from the revision kept for it.
  fork = await store.access(fork.id, owner);
  assert.equal(await versions.syncBlocked(fork.id, owner), null);
  fork = await versions.sync(fork.id, owner, { revision: fork.revision });
  assert.deepEqual(await snapshot(fork.id), await snapshot(t.id), 'synced');

  // A fork that keeps no history cannot propose its changes.
  let upstream = await store.create(owner, document);
  timelines.push(upstream.id);
  let quiet = await versions.copy(upstream.id, owner, { revision: upstream.revision });
  timelines.push(quiet.id);
  await keep(quiet.id, false);
  quiet = await edit(await store.access(quiet.id, owner), 0, 3, 'Quiet');
  await assert.rejects(
    pulls.create(upstream.id, owner, {
      title: 'From a fork',
      body: '',
      sourceTimelineId: quiet.id,
      sourceRevisionId: quiet.head_revision_id,
    }),
    (e) => e.status === 409 && e.message === FORK_PULLS_UNAVAILABLE,
  );
  // Nothing read its history, so its link to upstream's history went too.
  assert.equal(await versionsOf(quiet.id), 0);
  assert.equal(
    (await pool.query('SELECT 1 FROM oc_history_bases WHERE timeline_id=$1', [quiet.id])).rows
      .length,
    0,
  );

  // Migrating leaves timelines without saved history alone.
  await startHistory(pool);
  assert.equal(await versionsOf(copy.id), 0);
  assert.equal((await store.access(copy.id, owner)).history_since, null);

  // Starting it again records the current state as a new revision, with one copy.
  const usedOff = await used();
  const current = await snapshot(t.id);
  await keep(t.id, true);
  t = await store.access(t.id, owner);
  assert.equal(t.keep_history, true);
  const { rows: baseline } = await pool.query(
    'SELECT kind,history_rows,stored_bytes FROM oc_revisions WHERE id=$1',
    [t.head_revision_id],
  );
  assert.equal(baseline[0].kind, 'baseline');
  assert.equal(baseline[0].history_rows, true);
  assert(Number(baseline[0].stored_bytes) > 0);
  assert.equal((await used()) - usedOff, BigInt(baseline[0].stored_bytes), 'charged the copy');
  const started = t.head_revision_id;
  t = await edit(t, 60, 2, 'On again');
  assert.deepEqual(await saved(started), current, 'the copy reads as the state it started from');
  assert.deepEqual(await saved(t.head_revision_id), await snapshot(t.id));
  assert(
    (await charged(t.head_revision_id)) < Number(baseline[0].stored_bytes) / 20,
    'later saves are charged what they change',
  );
  await assert.rejects(store.revisionDocument(pool, latest[1].id), (e) => e.status === 409);
  // Pull requests work again.
  await pulls.create(t.id, owner, {
    title: 'Again',
    body: '',
    baseRevision: t.revision,
    document: { ...(await snapshot(t.id)), description: 'Again' },
  });

  // A copy whose history others still read through to: turning it off keeps that, and
  // turning it on again compares what it holds with what it reads through to.
  let middle = await versions.copy(upstream.id, owner, { revision: upstream.revision });
  timelines.push(middle.id);
  middle = await edit(middle, 0, 4, 'Middle');
  middle = await store.save(middle.id, owner, middle.revision, undefined, {
    settings,
    changes: [{ id: 'm5', event: null }],
  });
  const leaf = await versions.copy(middle.id, owner, { revision: middle.revision });
  timelines.push(leaf.id);
  const leafDocument = await snapshot(leaf.id);
  middle = await edit(middle, 10, 4, 'Middle later');
  await keep(middle.id, false);
  assert.deepEqual(await snapshot(leaf.id), leafDocument);
  assert.deepEqual(await saved(leaf.head_revision_id), leafDocument);
  middle = await store.save(
    middle.id,
    owner,
    (await store.access(middle.id, owner)).revision,
    undefined,
    {
      settings,
      changes: [
        { id: 'm6', event: null },
        { id: 'm20', event: moment(20, 'Off in the middle') },
      ],
    },
  );
  await keep(middle.id, true);
  middle = await store.access(middle.id, owner);
  const restarted = middle.head_revision_id;
  const restartedDocument = await snapshot(middle.id);
  assert.deepEqual(await saved(restarted), restartedDocument);
  middle = await edit(middle, 30, 2, 'After restart');
  assert.deepEqual(await saved(restarted), restartedDocument, 'removed moments stay removed');
  assert.deepEqual(await saved(middle.head_revision_id), await snapshot(middle.id));
  assert.deepEqual(await saved(leaf.head_revision_id), leafDocument);

  // Deleting timelines without history leaves nothing behind.
  for (const id of [...timelines].reverse())
    await store.transaction(async (c) => {
      await c.query('DELETE FROM oc_timelines WHERE id=$1', [id]);
      await store.removeHistory(c, id);
    });
  for (const id of timelines) {
    assert.equal(await versionsOf(id), 0);
    assert.equal(
      (await pool.query('SELECT 1 FROM oc_revisions WHERE timeline_id=$1', [id])).rows.length,
      0,
    );
  }
  timelines.length = 0;
  console.log(
    'PASS optional history: turning it off forgets and refunds past revisions apart from what forks and pull requests read; saves without it record revisions without content, charged nothing; copies inherit it; sync and pull requests say why they cannot; starting it again copies the current state once; migrations leave it off.',
  );
} finally {
  await store.idle();
  for (const id of timelines.reverse())
    await store.transaction(async (c) => {
      await c.query('DELETE FROM oc_timelines WHERE id=$1', [id]);
      await store.removeHistory(c, id);
    });
  await pool.query('DELETE FROM oc_proposals WHERE author_id=$1', [owner]);
  await pool.query('DELETE FROM oc_storage_entries WHERE user_id=$1', [owner]);
  await pool.query('DELETE FROM oc_users WHERE id=$1', [owner]);
  await pool.end();
}
