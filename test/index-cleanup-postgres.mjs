// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// Releasing what forks no longer read (#145, phase 3): as forks are deleted, saved whole or
// compacted, each timeline they read through to keeps exactly the versions its remaining
// forks read (its highest pin as index_pinned), a deleted one only the rows they see, and
// nothing once none does; compacting a fork, a page at a time between saves, leaves it
// reading exactly as before, holding its whole index; a fork that has rewritten most of
// what it reads is compacted after saving; and the migration releases what was left.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import pg from 'pg';
import { PostgresStore, applyPatch, releaseIndexes } from '../server/store.mjs';
import { Versioning } from '../server/versioning.mjs';
import { VERSIONED_TABLES, lineageOf } from '../server/index-versions.mjs';
import { validateDocument } from '../dist/core.mjs';
import { randomEdits } from './random-edits.mjs';
if (!process.env.DATABASE_URL) throw new Error('Use a dedicated PostgreSQL test database.');
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL }),
  store = new PostgresStore(pool),
  versions = new Versioning(store);
const user = randomUUID(),
  created = [];
const { randomDocument, randomPatch } = randomEdits(83);
const order = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const key = (r) => JSON.stringify([r.a, r.b]);
const normal = (d) => ({
  ...d,
  events: [...d.events].sort((a, b) => order(a.id, b.id)),
  ...(d.durations ? { durations: [...d.durations].sort((a, b) => order(a.id, b.id)) } : {}),
  ...(d.relationships
    ? { relationships: [...d.relationships].sort((a, b) => order(key(a), key(b))) }
    : {}),
});
const queries = [
  { kind: 'overview', lower: '-10/1', upper: '700/1', threshold: '0/1' },
  { kind: 'overview', lower: '100/1', upper: '300/1', threshold: '7/1' },
  { kind: 'events', lower: '50/1', upper: '450/1', limit: 500, after: null },
  { kind: 'durations', lower: '-10/1', upper: '700/1', limit: 500, after: null },
  { kind: 'tags' },
  { kind: 'search', text: 'note', page: 1 },
];
/** What a reader sees of timeline `id`. */
async function observe(id) {
  const results = [];
  for (const q of queries) {
    const r = await store.query(id, user, q);
    delete r.revision;
    delete r.visitedNodes;
    if (r.groups) r.groups = r.groups.map(({ visitedNodes, ...rest }) => rest);
    for (const list of [r.durations, r.edges]) list?.sort((a, b) => order(a.id, b.id));
    if (r.results) r.results.sort((a, b) => order(a.kind + a.id, b.kind + b.id));
    results.push(r);
  }
  const text = (await pool.query('SELECT oc_event_text($1) AS text', [id])).rows[0].text;
  return { results, text, document: normal((await store.snapshot(id, user)).document) };
}
/** Rows of timeline `id` in `table`s (live or retired). */
async function count(id, suffix = '', where = 'true') {
  let n = 0;
  for (const table of VERSIONED_TABLES)
    n += Number(
      (
        await pool.query(
          `SELECT count(*) AS n FROM ${table}${suffix} WHERE timeline_id=$1 AND ${where}`,
          [id],
        )
      ).rows[0].n,
    );
  return n;
}
/**
 * Timeline `id` (alive or deleted) keeps what the timelines reading through to it read and
 * no more: its highest pin as index_pinned, retired versions a pin falls in, and when
 * deleted, live rows some pin sees (nothing once none reads it).
 */
async function released(id, label) {
  const { rows } = await pool.query(
    `SELECT DISTINCT t.index_clocks[k] AS c FROM oc_timelines t,generate_subscripts(t.index_bases,1) k
    WHERE t.index_bases[k]=$1 ORDER BY 1`,
    [id],
  );
  const pins = rows.map((r) => r.c);
  const timeline = (await pool.query('SELECT index_pinned FROM oc_timelines WHERE id=$1', [id]))
    .rows[0];
  if (timeline) assert.equal(timeline.index_pinned, pins.at(-1) ?? null, `${label}: highest pin`);
  assert.equal(
    await count(
      id,
      '_retired',
      `NOT EXISTS(SELECT 1 FROM unnest('{${pins}}'::bigint[]) c WHERE coalesce(since,0)<=c AND until>c)`,
    ),
    0,
    `${label}: every retired version is one a fork reads`,
  );
  if (!timeline)
    assert.equal(
      await count(id, '', `coalesce(since,0)>${pins.at(-1) ?? -1}`),
      0,
      `${label}: a deleted timeline keeps only what forks see`,
    );
  return pins;
}
const remove = (id) =>
  store.transaction(async (c) => {
    await c.query('DELETE FROM oc_timelines WHERE id=$1', [id]);
    await store.removeHistory(c, id);
  });

try {
  await pool.query(await readFile(new URL('../server/schema.sql', import.meta.url), 'utf8'));
  await pool.query('INSERT INTO oc_users(id,username,email_verified_at) VALUES($1,$2,now())', [
    user,
    'cleanup_' + user.slice(0, 8),
  ]);
  const family = new Map();
  const track = (name, timeline, document) => {
    family.set(name, { timeline, document });
    created.push(timeline.id);
  };
  const source = randomDocument('Source');
  track('source', await store.create(user, source), source);
  family.get('source').document = (
    await store.snapshot(family.get('source').timeline.id, user)
  ).document;
  const fork = async (name, from) => {
    const entry = family.get(from);
    track(
      name,
      await versions.copy(entry.timeline.id, user, { revision: entry.timeline.revision }),
      entry.document,
    );
  };
  let step = 0;
  async function edit(name, whole = false) {
    const entry = family.get(name);
    const patch = randomPatch(entry.document, ++step);
    let next;
    try {
      next = validateDocument(applyPatch(entry.document, patch));
    } catch {
      return;
    }
    entry.timeline = whole
      ? await store.save(entry.timeline.id, user, entry.timeline.revision, next)
      : await store.save(entry.timeline.id, user, entry.timeline.revision, undefined, patch);
    entry.document = next;
  }
  const editAll = async (rounds) => {
    for (let round = 0; round < rounds; round++) for (const name of family.keys()) await edit(name);
  };
  /** Every timeline reads as its document rebuilt. */
  async function verify(label) {
    await store.idle();
    for (const [name, entry] of family) {
      const fresh = await store.create(user, entry.document);
      created.push(fresh.id);
      assert.deepEqual(
        await observe(entry.timeline.id),
        await observe(fresh.id),
        `${name} reads as a rebuild ${label}`,
      );
    }
  }
  // Compaction is tested on its own below; here, forks only read through.
  const compact = store.compact;
  store.compact = () => Promise.resolve();

  // Forks at different clocks of the source, and a fork of a fork.
  await editAll(3);
  await fork('a', 'source');
  await editAll(4);
  await fork('b', 'source');
  await fork('c', 'a');
  await editAll(6);
  const sourceId = family.get('source').timeline.id;
  const aId = family.get('a').timeline.id;
  assert.equal((await released(sourceId, 'forked')).length, 2, 'pinned twice');
  assert((await count(sourceId, '_retired')) > 0);
  await verify('when forked');

  // A fork deleted: the source keeps only what the others read.
  const b = family.get('b');
  family.delete('b');
  await remove(b.timeline.id);
  assert.equal((await released(sourceId, 'after deleting b')).length, 1);
  await verify('after deleting b');

  // A fork saved whole reads through to nothing; its fork still reads the source.
  await edit('a', true);
  assert.deepEqual((await lineageOf(pool, aId)).index_bases, []);
  await released(sourceId, 'after a saved whole');
  await released(aId, 'after a saved whole');
  await editAll(3);
  await verify('after a saved whole');

  // Compacted a page at a time, saved to between pages: it holds its whole index and reads
  // as before, and what it read is released.
  store.compact = compact;
  store.compactPage = 40;
  const cId = family.get('c').timeline.id;
  let pages = 0;
  while (!(await store.compactStep(cId))) {
    pages++;
    if (pages % 3 === 0) await edit('c');
    if (pages % 4 === 0) await edit('source');
    // Its rows so far are the same rows: it reads as its document meanwhile.
    if (pages % 5 === 0)
      assert.deepEqual(
        normal((await store.snapshot(cId, user)).document),
        normal(family.get('c').document),
        `c reads its document while compacting (page ${pages})`,
      );
  }
  assert(pages > 3, `compacted in ${pages} pages`);
  assert.deepEqual((await lineageOf(pool, cId)).index_bases, []);
  assert.equal(await count(cId, '', 'hidden'), 0, 'no hidden rows once compacted');
  assert.equal((await released(sourceId, 'after compacting c')).length, 0, 'nothing pins it');
  await released(aId, 'after compacting c');
  assert.equal(await count(sourceId, '_retired'), 0, 'its versions go');
  assert.equal(await count(aId, '_retired'), 0);
  await editAll(3);
  await verify('after compacting c');

  // A fork that has rewritten most of what it reads is compacted after saving.
  delete store.compactPage;
  await fork('d', 'source');
  const dId = family.get('d').timeline.id;
  for (let i = 0; i < 4; i++) await edit('d');
  await store.idle();
  assert.equal((await lineageOf(pool, dId)).index_bases.length, 1, 'a little change: still shared');
  // Half its moments rewritten, in saves small enough to apply in place.
  const d = family.get('d');
  const half = d.document.events.slice(0, Math.ceil(d.document.events.length / 2) + 1);
  for (let from = 0; from < half.length; from += 50) {
    const patch = {
      settings: { ...d.document, events: [], durations: undefined, relationships: undefined },
      changes: half
        .slice(from, from + 50)
        .map((e) => ({ id: e.id, event: { ...e, metadata: { title: 'Rewritten ' + e.id } } })),
    };
    d.timeline = await store.save(d.timeline.id, user, d.timeline.revision, undefined, patch);
    d.document = validateDocument(applyPatch(d.document, patch));
    if (from + 50 < half.length)
      assert.equal((await lineageOf(pool, dId)).index_bases.length, 1, 'not yet half');
  }
  await store.idle();
  assert.deepEqual((await lineageOf(pool, dId)).index_bases, [], 'rewritten half: compacted');
  assert.equal((await released(sourceId, 'after d compacted')).length, 0);
  await verify('after d compacted');

  // What earlier versions left (a fork deleted without releasing) goes when migrating.
  await fork('e', 'source');
  await editAll(2);
  const e = family.get('e');
  family.delete('e');
  await pool.query('ALTER TABLE oc_timelines DISABLE TRIGGER oc_index_release');
  await remove(e.timeline.id);
  await pool.query('ALTER TABLE oc_timelines ENABLE TRIGGER oc_index_release');
  assert((await count(sourceId, '_retired')) > 0, 'left behind');
  await releaseIndexes(pool);
  assert.equal(await count(sourceId, '_retired'), 0);
  await released(sourceId, 'after migrating');
  await verify('after migrating');

  // Deleting the source while its fork of a fork reads it, then that fork: all released.
  await fork('f', 'a');
  await edit('f');
  await edit('f');
  await fork('g', 'f');
  await editAll(2);
  const fId = family.get('f').timeline.id;
  family.delete('f');
  await remove(fId);
  await released(fId, 'f deleted');
  await released(aId, 'f deleted');
  assert((await count(fId)) > 0, 'kept for g');
  await verify('after deleting f');
  const g = family.get('g');
  family.delete('g');
  await remove(g.timeline.id);
  assert.equal(await count(fId), 0);
  assert.equal(await count(fId, '_retired'), 0);
  await released(aId, 'g deleted');
  assert.equal(await count(aId, '_retired'), 0);
  console.log(
    `PASS releasing index versions: ${step} saves across forks; deleted, rewritten and compacted (${pages} pages, saved to between them) forks leave their levels exactly the versions others read, and nothing once none do; forks that rewrote half are compacted; migrating releases what was left.`,
  );
} finally {
  await pool.query('ALTER TABLE oc_timelines ENABLE TRIGGER oc_index_release').catch(() => {});
  await store.idle();
  for (const id of created.reverse()) {
    await pool.query('DELETE FROM oc_timelines WHERE id=$1', [id]);
    await store.transaction((c) => store.removeHistory(c, id)).catch(() => {});
  }
  await pool.query('DELETE FROM oc_storage_entries WHERE user_id=$1', [user]);
  await pool.query('DELETE FROM oc_users WHERE id=$1', [user]);
  await pool.end();
}
