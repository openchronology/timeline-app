// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// Oracle for forks that read through to their source's index (#145, phase 2): a family of
// forks and duplicates four levels deep (and one more, which copies instead), each saved at
// random alongside its sources, reads exactly as a timeline rebuilt from its document (every
// query, the walks in the database, catalogue text and history) and keeps the invariants the
// walks rely on; a fork saved whole reads through to nothing; and a deleted timeline's rows
// are kept while any fork reads them, then released.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import pg from 'pg';
import { PostgresStore, applyPatch } from '../server/store.mjs';
import { Versioning } from '../server/versioning.mjs';
import {
  INDEX_LEVELS,
  VERSIONED_TABLES,
  indexReader,
  lineageOf,
} from '../server/index-versions.mjs';
import { validateDocument } from '../dist/core.mjs';
import { randomEdits } from './random-edits.mjs';
if (!process.env.DATABASE_URL) throw new Error('Use a dedicated PostgreSQL test database.');
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL }),
  store = new PostgresStore(pool),
  versions = new Versioning(store);
const user = randomUUID(),
  created = [];
const { randomDocument, randomPatch } = randomEdits(71);
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
const reader = async (id) => indexReader(pool, await lineageOf(pool, id));
const queries = [
  { kind: 'overview', lower: '-10/1', upper: '700/1', threshold: '0/1' },
  { kind: 'overview', lower: '-10/1', upper: '700/1', threshold: '7/1' },
  { kind: 'overview', lower: '100/1', upper: '300/1', threshold: '1/1' },
  { kind: 'overview', lower: '0/1', upper: '600/1', threshold: '61/1' },
  { kind: 'events', lower: '50/1', upper: '450/1', limit: 500, after: null },
  { kind: 'events', lower: null, upper: null, limit: 40, after: { time: '200/1', id: 'm1' } },
  { kind: 'durations', lower: '-10/1', upper: '700/1', limit: 500, after: null },
  { kind: 'tags' },
  { kind: 'search', text: 'note', page: 1 },
  { kind: 'search', text: 'duration', page: 1 },
  ...['m0', 'm3', 'm101'].map((id) => ({
    kind: 'related',
    entity: { kind: 'moment', id },
    limit: 20,
  })),
  { kind: 'related', entity: { kind: 'duration', id: 'd0' }, limit: 20 },
  ...['m2', 'm150', 'm299'].map((id) => ({ kind: 'moment', id })),
  ...['d1', 'd20'].map((id) => ({ kind: 'duration', id })),
];
/** Everything a reader can see: the store's queries, the database's walks, the rows. */
async function observe(id) {
  const results = [];
  for (const q of queries) {
    const r = await store.query(id, user, q);
    delete r.revision;
    delete r.visitedNodes;
    if (r.groups) r.groups = r.groups.map(({ visitedNodes, ...rest }) => rest);
    // Bands and arcs come in traversal order, which depends on the tree's shape.
    for (const list of [r.durations, r.edges]) list?.sort((a, b) => order(a.id, b.id));
    if (r.results) r.results.sort((a, b) => order(a.kind + a.id, b.kind + b.id));
    results.push(r);
  }
  const { first, last } = await store.metadata(id, user);
  const recent = [
    (await store.recent(id, user, 'last')).times,
    (await store.recent(id, user, 'first')).times,
  ];
  const text = (await pool.query('SELECT oc_event_text($1) AS text', [id])).rows[0].text;
  const index = await reader(id);
  const rows = async (sql) => (await pool.query(sql, [id])).rows;
  return {
    results,
    first,
    last,
    recent,
    text,
    search: await rows(
      `SELECT kind,entity_id,oc_qtext(first_time) AS f,oc_qtext(last_time) AS l,title,body,tags
      FROM ${index('oc_entity_search')} x ORDER BY kind,entity_id COLLATE "C"`,
    ),
    links: await rows(
      `SELECT a_kind,a_id,b_kind,b_id FROM ${index('oc_relationships')} x ORDER BY 1,2,3,4`,
    ),
    moments: await rows(
      `SELECT id,oc_qtext(time) AS time,event FROM ${index('oc_moments')} x ORDER BY id COLLATE "C"`,
    ),
    durations: await rows(
      `SELECT band,definition FROM ${index('oc_duration_nodes')} x ORDER BY band->>'id' COLLATE "C"`,
    ),
    arcs: await rows(
      `SELECT band FROM ${index('oc_edge_nodes')} x ORDER BY band->>'id' COLLATE "C"`,
    ),
  };
}
/**
 * Every node the timeline sees is in its trees, once; a fork's own nodes have only its own
 * nodes above them, and its own moments are in nodes of its own (what the walks rely on).
 */
async function checkTrees(id) {
  const t = (await pool.query('SELECT * FROM oc_timelines WHERE id=$1', [id])).rows[0];
  const index = await reader(id);
  for (const [table, root] of [
    ['oc_nodes', t.root],
    ['oc_duration_nodes', t.duration_root],
    ['oc_edge_nodes', t.edge_root],
  ]) {
    const nodes = new Map(
      (
        await pool.query(
          `SELECT x.id,x.left_id,x.right_id,x.timeline_id=$1 AS own${table === 'oc_nodes' ? ',x.moment_ids' : ''}
          FROM ${index(table)} x`,
          [id],
        )
      ).rows.map((n) => [Number(n.id), n]),
    );
    const seen = new Set();
    const walk = (nodeId, aboveOwn) => {
      if (nodeId === null) return;
      const n = nodes.get(Number(nodeId));
      assert(n, `${table} node ${nodeId} exists`);
      assert(!seen.has(Number(nodeId)), `${table} node ${nodeId} once`);
      seen.add(Number(nodeId));
      assert(!n.own || aboveOwn, `${table}: a fork's own node has its own nodes above it`);
      walk(n.left_id, n.own);
      walk(n.right_id, n.own);
    };
    walk(root, true);
    assert.equal(seen.size, nodes.size, `${table}: every node it sees is in its tree`);
    if (table === 'oc_nodes' && index.depth) {
      const { rows: own } = await pool.query(
        'SELECT id FROM oc_moments WHERE timeline_id=$1 AND NOT hidden',
        [id],
      );
      const holder = new Map();
      for (const n of nodes.values()) for (const m of n.moment_ids) holder.set(m, n);
      for (const { id: moment } of own)
        assert(holder.get(moment).own, `its own moment ${moment} is in a node of its own`);
    }
  }
}
/** Rows of these timelines, live or retired. */
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
const remove = (id) =>
  store.transaction(async (c) => {
    await c.query('DELETE FROM oc_timelines WHERE id=$1', [id]);
    await store.removeHistory(c, id);
  });

try {
  await pool.query(await readFile(new URL('../server/schema.sql', import.meta.url), 'utf8'));
  await pool.query('INSERT INTO oc_users(id,username,email_verified_at) VALUES($1,$2,now())', [
    user,
    'through_' + user.slice(0, 8),
  ]);
  // Each timeline with the document it holds, and each saved revision with its document.
  const family = [];
  const revisions = new Map();
  const track = (name, timeline, document) => {
    revisions.set(timeline.head_revision_id, document);
    const entry = { name, timeline, document };
    family.push(entry);
    created.push(timeline.id);
    return entry;
  };
  const source = track('source', await store.create(user, randomDocument('Source')), null);
  source.document = (await store.snapshot(source.timeline.id, user)).document;
  revisions.set(source.timeline.head_revision_id, source.document);
  /** Forks (or duplicates) `from`: read through to it at its clock, `depth` levels deep. */
  async function copy(name, from, depth, duplicate = false) {
    const { rows } = await pool.query('SELECT index_clock FROM oc_timelines WHERE id=$1', [
      from.timeline.id,
    ]);
    const timeline = await versions.copy(
      from.timeline.id,
      user,
      { revision: from.timeline.revision },
      duplicate,
    );
    const entry = track(name, timeline, from.document);
    const lineage = await lineageOf(pool, timeline.id);
    assert.equal(lineage.index_bases.length, depth, `${name} reads through ${depth} levels`);
    if (depth) {
      assert.equal(lineage.index_bases[0], from.timeline.id);
      assert.equal(lineage.index_clocks[0], rows[0].index_clock, `${name} reads its source now`);
      const pinned = await pool.query('SELECT index_pinned FROM oc_timelines WHERE id=$1', [
        from.timeline.id,
      ]);
      assert(BigInt(pinned.rows[0].index_pinned) >= BigInt(rows[0].index_clock), 'pinned');
      assert.equal(await rowsOf([timeline.id]), 0, `${name} copied nothing`);
    } else assert(await rowsOf([timeline.id]), `${name} copied its index`);
    assert.deepEqual(
      normal((await store.snapshot(timeline.id, user)).document),
      normal(from.document),
      `${name} holds its source's document`,
    );
    return entry;
  }
  /** A random save to `entry`: sparse, or (`whole`) the patched document. */
  async function edit(entry, step, whole = false) {
    const patch = randomPatch(entry.document, step);
    let next;
    try {
      next = validateDocument(applyPatch(entry.document, patch));
    } catch {
      await assert.rejects(
        store.save(entry.timeline.id, user, entry.timeline.revision, undefined, patch),
      );
      return;
    }
    entry.timeline = whole
      ? await store.save(entry.timeline.id, user, entry.timeline.revision, next)
      : await store.save(entry.timeline.id, user, entry.timeline.revision, undefined, patch);
    entry.document = next;
    revisions.set(entry.timeline.head_revision_id, next);
  }
  /** Every timeline reads as one rebuilt from its document, and its history replays. */
  async function verify(step) {
    for (const entry of family) {
      const id = entry.timeline.id;
      assert.deepEqual(
        normal((await store.snapshot(id, user)).document),
        normal(entry.document),
        `${entry.name}'s document at step ${step}`,
      );
      await checkTrees(id);
      const fresh = await store.create(user, entry.document);
      created.push(fresh.id);
      assert.deepEqual(
        await observe(id),
        await observe(fresh.id),
        `${entry.name} reads as a rebuild at step ${step}`,
      );
      assert.deepEqual(
        normal(await store.revisionDocument(pool, entry.timeline.head_revision_id)),
        normal(entry.document),
        `${entry.name}'s history at step ${step}`,
      );
    }
  }

  let forkWhole = null;
  for (let step = 1; step <= 90; step++) {
    if (step === 3) await copy('fork', source, 1);
    if (step === 12) await copy('fork of fork', family[1], 2);
    if (step === 21) await copy('duplicate', family[2], 3, true);
    if (step === INDEX_LEVELS * 10 - 9) await copy('deepest', family[3], INDEX_LEVELS);
    // Past INDEX_LEVELS, a copy copies (and reads as fast as any timeline).
    if (step === 45) await copy('copied', family[4], 0);
    if (step === 50) await copy('second fork', source, 1);
    for (const entry of family)
      // The source is now and then saved whole (retiring every row its forks read).
      await edit(entry, step, entry === source && step % 30 === 0);
    // A fork saved whole holds its whole index: it reads through to nothing any more, and
    // its own forks still read it as it was.
    if (step === 70) {
      forkWhole = family[2];
      await edit(forkWhole, step, true);
      assert.deepEqual((await lineageOf(pool, forkWhole.timeline.id)).index_bases, []);
    }
    if (step % 15 === 0 || step === 90) await verify(step);
  }
  const retired = Number(
    (
      await pool.query('SELECT count(*) AS n FROM oc_nodes_retired WHERE timeline_id=$1', [
        source.timeline.id,
      ])
    ).rows[0].n,
  );
  assert(retired > 0, 'the source retired what its forks read');

  // Deleting timelines forks read through to keeps their rows until nothing reads them.
  const ids = family.map((e) => e.timeline.id);
  await remove(source.timeline.id);
  family.splice(family.indexOf(source), 1);
  assert(await rowsOf([source.timeline.id]), 'kept for its forks');
  await verify('after deleting the source');
  // Forks reading through to it go one by one, the deepest last.
  for (const name of ['second fork', 'fork', 'fork of fork', 'duplicate']) {
    const entry = family.find((e) => e.name === name);
    await remove(entry.timeline.id);
    family.splice(family.indexOf(entry), 1);
    assert(await rowsOf([source.timeline.id]), `still kept after deleting the ${name}`);
  }
  await verify('after deleting all but the deepest');
  const deepest = family.find((e) => e.name === 'deepest');
  await remove(deepest.timeline.id);
  family.splice(family.indexOf(deepest), 1);
  assert.equal(
    await rowsOf(ids.filter((id) => family.every((e) => e.timeline.id !== id))),
    0,
    'released once nothing reads them',
  );
  await verify('after releasing');
  console.log(
    `PASS read-through forks: ${revisions.size} revisions across forks ${INDEX_LEVELS} levels deep (and a copy past them) read as rebuilds, keep their walks' invariants and history; a fork saved whole reads through to nothing; deleted timelines' rows are kept while forks read them, then released.`,
  );
} finally {
  await store.idle();
  for (const id of created.reverse()) {
    await pool.query('DELETE FROM oc_timelines WHERE id=$1', [id]);
    await store.transaction((c) => store.removeHistory(c, id)).catch(() => {});
  }
  await pool.query('DELETE FROM oc_storage_entries WHERE user_id=$1', [user]);
  await pool.query('DELETE FROM oc_users WHERE id=$1', [user]);
  await pool.end();
}
