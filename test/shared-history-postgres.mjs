// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// Oracle: forks and duplicates share their source's saved history (server/history.mjs).
// Random saves (sparse and whole-document) and a sync over a chain of copies; every saved
// revision of every copy reads back as the document it saved, while copies are charged only
// what they change, and history is freed once nothing reads through to it.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import pg from 'pg';
import { PostgresStore, applyPatch } from '../server/store.mjs';
import { Versioning } from '../server/versioning.mjs';
import { pruneHistory } from '../server/retention.mjs';
import { validateDocument } from '../dist/core.mjs';
import { randomEdits } from './random-edits.mjs';
if (!process.env.DATABASE_URL) throw new Error('Use a dedicated PostgreSQL test database.');
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL }),
  store = new PostgresStore(pool),
  versions = new Versioning(store);
const user = randomUUID(),
  created = [];
const { random, randomDocument, randomPatch } = randomEdits(71);
const order = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
/** Documents compare independent of event order. */
const normal = (d) => ({ ...d, events: [...d.events].sort((a, b) => order(a.id, b.id)) });
const TABLES = [
  'oc_history_moments',
  'oc_history_durations',
  'oc_history_relationships',
  'oc_history_settings',
  'oc_history_moment_overrides',
  'oc_history_duration_overrides',
  'oc_history_relationship_overrides',
  'oc_history_bases',
];
/** Rows a timeline keeps in each history table. */
async function rowsOf(id) {
  const counts = {};
  for (const table of TABLES)
    counts[table] = Number(
      (await pool.query(`SELECT count(*) AS n FROM ${table} WHERE timeline_id=$1`, [id])).rows[0].n,
    );
  return counts;
}
const charged = async (revision) =>
  Number(
    (await pool.query('SELECT stored_bytes FROM oc_revisions WHERE id=$1', [revision])).rows[0]
      .stored_bytes,
  );
try {
  await pool.query(await readFile(new URL('../server/schema.sql', import.meta.url), 'utf8'));
  await pool.query('INSERT INTO oc_users(id,username,email_verified_at) VALUES($1,$2,now())', [
    user,
    'shared_' + user.slice(0, 8),
  ]);
  const original = randomDocument('Shared');
  const size = Buffer.byteLength(JSON.stringify(original));
  // Each timeline with the document it holds, and every saved revision with its document.
  const copies = [];
  const revisions = new Map();
  const track = (timeline, document) => {
    revisions.set(timeline.head_revision_id, document);
    return { timeline, document };
  };
  copies.push(track(await store.create(user, original), original));
  created.push(copies[0].timeline.id);

  /** Copies timeline `from` (a fork, or a duplicate), checking it shares or copies history. */
  async function copy(from, duplicate, shares) {
    const source = copies[from];
    const timeline = await versions.copy(
      source.timeline.id,
      user,
      { revision: source.timeline.revision },
      duplicate,
    );
    created.push(timeline.id);
    copies.push(track(timeline, source.document));
    const rows = await rowsOf(timeline.id);
    const bytes = await charged(timeline.head_revision_id);
    if (shares) {
      assert.equal(rows.oc_history_moments, 0, 'a copy keeps no versions of its own');
      assert.equal(rows.oc_history_bases, 1);
      assert(bytes < 2000, `a copy is charged its settings (${bytes})`);
    } else {
      assert.equal(rows.oc_history_bases, 0, 'past four levels, a copy starts its own');
      assert(rows.oc_history_moments >= 100);
      assert(bytes > size / 2, `a copy that starts its own history is charged it (${bytes})`);
    }
  }
  /** A random save to copy `index`: sparse, or every so often as a whole document. */
  async function edit(index, step, patch = randomPatch(copies[index].document, step)) {
    const entry = copies[index];
    let next;
    try {
      next = validateDocument(applyPatch(entry.document, patch));
    } catch {
      return false;
    }
    entry.timeline =
      step % 9 === 0
        ? await store.save(entry.timeline.id, user, entry.timeline.revision, next)
        : await store.save(entry.timeline.id, user, entry.timeline.revision, undefined, patch);
    entry.document = next;
    revisions.set(entry.timeline.head_revision_id, next);
    return true;
  }

  let saves = 0;
  for (let step = 1; step <= 200; step++) {
    if (step === 20) await copy(0, false, true); // A fork: two levels.
    if (step === 21) {
      // The upstream changes and the untouched fork syncs, rebuilding it from a document.
      const { document } = copies[0];
      const first = { ...document.events[0], metadata: { title: 'Upstream change' } };
      const settings = { ...document, events: [], durations: undefined, relationships: undefined };
      assert(await edit(0, step, { settings, changes: [{ id: first.id, event: first }] }));
      const fork = copies[1];
      fork.timeline = await versions.sync(fork.timeline.id, user, {
        revision: fork.timeline.revision,
      });
      fork.document = (await store.snapshot(fork.timeline.id, user)).document;
      assert.deepEqual(normal(fork.document), normal(copies[0].document), 'synced');
      revisions.set(fork.timeline.head_revision_id, fork.document);
      continue;
    }
    if (step === 60) await copy(1, true, true); // A duplicate of the fork: three levels.
    if (step === 100) await copy(2, false, true); // Four levels.
    if (step === 140) await copy(3, false, false); // Five would be too many: it copies.
    if (await edit(Math.floor(random() * copies.length), step)) saves++;
  }
  for (const { timeline, document } of copies)
    assert.deepEqual(
      normal((await store.snapshot(timeline.id, user)).document),
      normal(document),
      'live state',
    );
  // Every saved revision of every copy reads back as the document it saved.
  const readBack = async (label) => {
    let read = 0;
    for (const [revision, document] of revisions) {
      const exists = (await pool.query('SELECT 1 FROM oc_revisions WHERE id=$1', [revision])).rows
        .length;
      if (!exists) continue;
      assert.deepEqual(
        normal(await store.revisionDocument(pool, revision)),
        normal(document),
        `${label}: revision ${revision}`,
      );
      read++;
    }
    return read;
  };
  const read = await readBack('after saving');
  assert.equal(read, revisions.size);
  // Copies are charged what they changed, not what they read through to.
  for (const { timeline } of copies.slice(1, 4)) {
    const { rows } = await pool.query(
      `SELECT max(stored_bytes) AS largest FROM oc_revisions
      WHERE timeline_id=$1 AND kind='save'`,
      [timeline.id],
    );
    assert(Number(rows[0].largest) < size / 4, `largest save ${rows[0].largest}`);
  }

  // Pruning the upstream's history (as retention does) keeps the revision its fork reads
  // through to; pruning a copy keeps its head.
  for (const index of [0, 1, 2])
    await store.transaction((c) =>
      pruneHistory(c, copies[index].timeline.id, new Date(Date.now() + 60000)),
    );
  assert((await readBack('after pruning')) < read);
  for (const { timeline, document } of copies)
    assert.deepEqual(
      normal(await store.revisionDocument(pool, timeline.head_revision_id)),
      normal(document),
    );

  // Deleting the upstream keeps what its copies read through to; deleting the copies
  // too frees everything, down the chain.
  const remove = (id) =>
    store.transaction(async (c) => {
      await c.query('DELETE FROM oc_timelines WHERE id=$1', [id]);
      await store.removeHistory(c, id);
    });
  await remove(copies[0].timeline.id);
  assert((await rowsOf(copies[0].timeline.id)).oc_history_moments > 0);
  for (const { timeline, document } of copies.slice(1))
    assert.deepEqual(
      normal(await store.revisionDocument(pool, timeline.head_revision_id)),
      normal(document),
    );
  // A fork's ancestry (the fork base) is kept with the timeline; this test is about history.
  await pool.query('UPDATE oc_timelines SET fork_base_revision_id=NULL WHERE id=ANY($1::uuid[])', [
    copies.map((c) => c.timeline.id),
  ]);
  for (const index of [1, 2, 3]) {
    await pool.query(
      'DELETE FROM oc_revision_parents p USING oc_revisions r WHERE r.id=p.revision_id AND r.timeline_id=$1',
      [copies[index + 1]?.timeline.id ?? randomUUID()],
    );
    await remove(copies[index].timeline.id);
  }
  // The fifth copy started its own history, so nothing of the chain remains.
  for (const { timeline } of copies.slice(0, 4)) {
    assert.deepEqual(
      Object.values(await rowsOf(timeline.id)),
      TABLES.map(() => 0),
      `no history left for ${timeline.id}`,
    );
    assert.equal(
      (
        await pool.query('SELECT count(*) AS n FROM oc_revisions WHERE timeline_id=$1', [
          timeline.id,
        ])
      ).rows[0].n,
      '0',
    );
  }
  assert.deepEqual(
    normal(await store.revisionDocument(pool, copies[4].timeline.head_revision_id)),
    normal(copies[4].document),
  );
  console.log(
    `PASS shared history: ${saves} random saves over a chain of ${copies.length} forks and duplicates read back revision by revision (${read} revisions); copies are charged what they change; pruning and deletion keep what copies read through to, then free it.`,
  );
} finally {
  for (const id of created.reverse()) {
    await pool.query('DELETE FROM oc_timelines WHERE id=$1', [id]);
    await store.transaction((c) => store.removeHistory(c, id)).catch(() => {});
  }
  await pool.query('DELETE FROM oc_storage_entries WHERE user_id=$1', [user]);
  await pool.query('DELETE FROM oc_users WHERE id=$1', [user]);
  await pool.end();
}
