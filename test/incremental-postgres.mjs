// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// Oracle: random sparse saves applied in place (every other one a slice at a time) match a
// full rebuild of the same document, leave every stored tree a valid AVL tree with correct
// summaries, and replay from history.
import pg from 'pg';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { PostgresStore, applyPatch } from '../server/store.mjs';
import { Q, validateDocument, validatePluginManifest, PLUGIN_EXAMPLE } from '../dist/core.mjs';
import { randomEdits } from './random-edits.mjs';
if (!process.env.DATABASE_URL) throw new Error('Use a dedicated PostgreSQL test database.');
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const user = randomUUID();
const created = [];
let store;
const { randomPatch, randomDocument } = randomEdits(32);
const order = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
/** Documents compare independent of event order. */
const normal = (d) => ({
  ...d,
  events: [...d.events].sort((a, b) => order(a.id, b.id)),
});
const strip = ({ visitedNodes, ...rest }) => rest;

/** Recomputes every summary from the leaves and checks AVL balance, order and orphans. */
async function checkTrees(id) {
  const t = (await pool.query('SELECT * FROM oc_timelines WHERE id=$1', [id])).rows[0];
  const moments = new Map(
    (
      await pool.query(
        `SELECT id,oc_qtext(time) AS time,oc_qtext(first_time) AS first,oc_qtext(last_time) AS last,left_id,right_id,first_id,bucket_count,event_count,distinct_count,height,moment_ids
        FROM oc_nodes WHERE timeline_id=$1`,
        [id],
      )
    ).rows.map((r) => [Number(r.id), r]),
  );
  const seen = new Set();
  let previous = null;
  const walkMoments = (nodeId) => {
    if (nodeId === null) return null;
    const n = moments.get(Number(nodeId));
    assert(n, 'moment node exists');
    seen.add(Number(nodeId));
    const l = walkMoments(n.left_id);
    assert(previous === null || Q.parse(previous).compare(Q.parse(n.time)) < 0, 'moment order');
    previous = n.time;
    const r = walkMoments(n.right_id);
    const height = 1 + Math.max(l?.height ?? 0, r?.height ?? 0);
    assert.equal(n.height, height, 'moment height');
    assert(Math.abs((l?.height ?? 0) - (r?.height ?? 0)) <= 1, 'moment balance');
    assert.deepEqual(n.moment_ids, [...n.moment_ids].sort(order));
    assert(n.moment_ids.length > 0);
    const summary = {
      first: l ? l.first : n.time,
      last: r ? r.last : n.time,
      firstId: l ? l.firstId : Number(n.id),
      count: (l?.count ?? 0) + n.moment_ids.length + (r?.count ?? 0),
      distinct: (l?.distinct ?? 0) + 1 + (r?.distinct ?? 0),
      height,
    };
    assert.deepEqual(
      [n.first, n.last, Number(n.first_id), Number(n.event_count), n.distinct_count],
      [summary.first, summary.last, summary.firstId, summary.count, summary.distinct],
      'moment summaries',
    );
    assert.equal(Number(n.bucket_count), n.moment_ids.length);
    return summary;
  };
  const root = walkMoments(t.root);
  assert.equal(seen.size, moments.size, 'no orphaned moment nodes');
  assert.equal(Number(t.event_count), root?.count ?? 0);
  for (const [table, rootId] of [
    ['oc_duration_nodes', t.duration_root],
    ['oc_edge_nodes', t.edge_root],
  ]) {
    const rows = new Map(
      (
        await pool.query(
          `SELECT id,left_id,right_id,oc_qtext(min_time) AS min,oc_qtext(max_time) AS max,oc_qtext(first_time) AS first,oc_qtext(last_time) AS last,
          band,oc_qtext(max_first) AS max_first,subtree_count,oc_qtext(min_extent) AS min_extent,oc_qtext(max_extent) AS max_extent,height
          FROM ${table} WHERE timeline_id=$1`,
          [id],
        )
      ).rows.map((r) => [Number(r.id), r]),
    );
    const visited = new Set();
    let last = null;
    const bigger = (a, b) => (b !== undefined && Q.parse(b).compare(Q.parse(a)) > 0 ? b : a);
    const smaller = (a, b) => (b !== undefined && Q.parse(b).compare(Q.parse(a)) < 0 ? b : a);
    const walk = (nodeId) => {
      if (nodeId === null) return null;
      const n = rows.get(Number(nodeId));
      assert(n, `${table} node exists`);
      visited.add(Number(nodeId));
      const l = walk(n.left_id);
      const key = [n.first, n.band.id];
      assert(
        last === null ||
          Q.parse(last[0]).compare(Q.parse(key[0])) < 0 ||
          (last[0] === key[0] && last[1] < key[1]),
        `${table} order`,
      );
      last = key;
      const r = walk(n.right_id);
      const extent = Q.parse(n.last).sub(Q.parse(n.first)).toString();
      const summary = {
        min: l ? l.min : n.first,
        max: bigger(bigger(n.last, l?.max), r?.max),
        maxFirst: r ? r.maxFirst : n.first,
        count: 1 + (l?.count ?? 0) + (r?.count ?? 0),
        minExtent: smaller(smaller(extent, l?.minExtent), r?.minExtent),
        maxExtent: bigger(bigger(extent, l?.maxExtent), r?.maxExtent),
        height: 1 + Math.max(l?.height ?? 0, r?.height ?? 0),
      };
      assert(Math.abs((l?.height ?? 0) - (r?.height ?? 0)) <= 1, `${table} balance`);
      assert.deepEqual(
        [n.min, n.max, n.max_first, n.subtree_count, n.min_extent, n.max_extent, n.height],
        [
          summary.min,
          summary.max,
          summary.maxFirst,
          summary.count,
          summary.minExtent,
          summary.maxExtent,
          summary.height,
        ],
        `${table} summaries`,
      );
      assert.equal(n.band.first, n.first);
      assert.equal(n.band.last, n.last);
      return summary;
    };
    walk(rootId);
    assert.equal(visited.size, rows.size, `no orphaned ${table} rows`);
  }
}
const queries = [
  { kind: 'overview', lower: '-10/1', upper: '700/1', threshold: '0/1' },
  { kind: 'overview', lower: '-10/1', upper: '700/1', threshold: '7/1' },
  { kind: 'overview', lower: '100/1', upper: '300/1', threshold: '1/1' },
  { kind: 'overview', lower: '0/1', upper: '600/1', threshold: '61/1' },
  { kind: 'events', lower: '50/1', upper: '450/1', limit: 500, after: null },
  { kind: 'durations', lower: '-10/1', upper: '700/1', limit: 500, after: null },
  { kind: 'tags' },
  { kind: 'search', text: 'note', page: 1 },
];
/** Everything a reader can see, from the store's queries and derived rows. */
async function observe(store, id) {
  const results = [];
  for (const q of queries) {
    const r = await store.query(id, user, q);
    delete r.revision;
    if (r.groups) r.groups = r.groups.map(strip);
    delete r.visitedNodes;
    // Bands and arcs come in traversal order, which depends on the tree's shape.
    for (const list of [r.durations, r.edges]) list?.sort((a, b) => order(a.id, b.id));
    if (r.results) r.results.sort((a, b) => order(a.kind + a.id, b.kind + b.id));
    results.push(r);
  }
  const rows = async (sql) => (await pool.query(sql, [id])).rows;
  return {
    results,
    search: await rows(
      'SELECT kind,entity_id,oc_qtext(first_time) AS f,oc_qtext(last_time) AS l,title,body,tags FROM oc_entity_search WHERE timeline_id=$1 ORDER BY kind,entity_id COLLATE "C"',
    ),
    links: await rows(
      'SELECT a_kind,a_id,b_kind,b_id FROM oc_relationships WHERE timeline_id=$1 ORDER BY 1,2,3,4',
    ),
    moments: await rows(
      'SELECT id,oc_qtext(time) AS time,event FROM oc_moments WHERE timeline_id=$1 ORDER BY id COLLATE "C"',
    ),
    durations: await rows(
      `SELECT band,definition FROM oc_duration_nodes WHERE timeline_id=$1 ORDER BY band->>'id' COLLATE "C"`,
    ),
    arcs: await rows(
      `SELECT band FROM oc_edge_nodes WHERE timeline_id=$1 ORDER BY band->>'id' COLLATE "C"`,
    ),
  };
}
try {
  await pool.query(await readFile(new URL('../server/schema.sql', import.meta.url), 'utf8'));
  await pool.query(
    'INSERT INTO oc_users(id,username,email_verified_at,terms_version) VALUES($1,$2,now(),oc_policy_version())',
    [user, 'incremental_' + user.slice(0, 8)],
  );
  store = new PostgresStore(pool);
  let expected = randomDocument('Incremental');
  let timeline = await store.create(user, expected);
  created.push(timeline.id);
  let patches = 0,
    replays = 0;
  // Each saved revision and the document it saved, to read back from history at the end.
  const revisions = new Map([[timeline.head_revision_id, expected]]);
  for (let step = 1; step <= 120; step++) {
    const patch = randomPatch(expected, step);
    let next;
    try {
      next = validateDocument(applyPatch(expected, patch));
    } catch {
      // The oracle rejects it, so the store must too, leaving everything unchanged.
      await assert.rejects(store.save(timeline.id, user, timeline.revision, undefined, patch));
      continue;
    }
    // Every other patch is applied in slices of three changes, each to the timeline as the
    // last left it (saveIncrementally), and must end the same.
    store.patchSlice = step % 2 ? 3 : undefined;
    timeline = await store.save(timeline.id, user, timeline.revision, undefined, patch);
    expected = next;
    revisions.set(timeline.head_revision_id, expected);
    patches++;
    const saved = (await store.snapshot(timeline.id, user)).document;
    assert.deepEqual(normal(saved), normal(expected), `document after step ${step}`);
    if (step % 10 === 0 || step === 120) {
      await checkTrees(timeline.id);
      const fresh = await store.create(user, expected);
      created.push(fresh.id);
      assert.deepEqual(
        await observe(store, timeline.id),
        await observe(store, fresh.id),
        `index after step ${step} matches a rebuild`,
      );
      const history = await store.revisionDocument(pool, timeline.head_revision_id);
      assert.deepEqual(normal(history), normal(expected), `revision replay at step ${step}`);
      replays++;
      const bytes = Buffer.byteLength(JSON.stringify(expected));
      assert(
        Math.abs(Number(timeline.storage_bytes) - bytes) < bytes * 0.05 + 1024,
        `storage estimate ${timeline.storage_bytes} vs ${bytes}`,
      );
    }
  }
  // Every saved revision reads back, from rows, as the document it saved.
  for (const [revision, document] of revisions)
    assert.deepEqual(
      normal(await store.revisionDocument(pool, revision)),
      normal(document),
      `saved revision ${revision}`,
    );
  const { rows: kinds } = await pool.query(
    `SELECT count(*) FILTER (WHERE history_rows) AS kept,count(*) AS total,
    max(stored_bytes) FILTER (WHERE kind='save' AND number>1) AS largest FROM oc_revisions WHERE timeline_id=$1`,
    [timeline.id],
  );
  assert.equal(kinds[0].kept, kinds[0].total, 'every revision is kept as rows');
  // A save is charged the versions it wrote, far less than the whole timeline.
  assert(
    Number(kinds[0].largest) < Buffer.byteLength(JSON.stringify(expected)) / 4,
    `largest save ${kinds[0].largest} bytes`,
  );
  // Catalogue text catches up after the saves commit.
  await store.idle();
  const text = (
    await pool.query('SELECT event_text,event_text_stale FROM oc_timelines WHERE id=$1', [
      timeline.id,
    ])
  ).rows[0];
  assert.equal(text.event_text_stale, false);
  for (const e of expected.events.slice(0, 20)) assert(text.event_text.includes(e.metadata.title));
  // A patch far larger than its slices, growing a small timeline into a larger one, applied
  // in place (as a large timeline's would be): each slice moves the trees' roots, and the
  // timeline ends as a rebuild of the patched document.
  store.patchSlice = 7;
  const small = validateDocument({
    format: 'openchronology',
    version: 1,
    title: 'Sliced',
    description: '',
    events: Array.from({ length: 10 }, (_, i) => ({
      id: 's' + i,
      time: `${i}/1`,
      metadata: { title: 'Small ' + i },
    })),
  });
  let sliced = await store.create(user, small);
  created.push(sliced.id);
  const grown = {
    settings: { ...small, events: [] },
    changes: [
      ...Array.from({ length: 300 }, (_, i) => ({
        id: 'g' + i,
        event: { id: 'g' + i, time: `${100 + i}/1`, metadata: { title: 'Grown ' + i } },
      })),
      { id: 's3', event: null },
      { id: 's4', event: { id: 's4', time: '1000/1', metadata: { title: 'Moved' } } },
    ],
    durationChanges: Array.from({ length: 40 }, (_, i) => ({
      id: 'gd' + i,
      duration: { id: 'gd' + i, start: { moment: 'g' + i }, end: `${450 + i}/1`, metadata: {} },
    })),
    // Endpoints in canonical order, as the API sends them.
    relationshipChanges: Array.from({ length: 30 }, (_, i) => ({
      a: { duration: 'gd' + i },
      b: { moment: 'g' + i },
      related: true,
    })),
  };
  const grownDocument = validateDocument(applyPatch(small, grown));
  await store.transaction(async (c) => {
    await c.query('SELECT id FROM oc_timelines WHERE id=$1 FOR UPDATE', [sliced.id]);
    await store.saveIncrementally(c, await store.access(sliced.id, user, c), user, grown);
  });
  store.patchSlice = undefined;
  sliced = await store.access(sliced.id, user);
  assert.equal(Number(sliced.event_count), 309);
  assert.deepEqual(normal((await store.snapshot(sliced.id, user)).document), normal(grownDocument));
  await checkTrees(sliced.id);
  const rebuilt = await store.create(user, grownDocument);
  created.push(rebuilt.id);
  assert.deepEqual(
    await observe(store, sliced.id),
    await observe(store, rebuilt.id),
    'a sliced patch matches a rebuild',
  );
  assert.deepEqual(
    normal(await store.revisionDocument(pool, sliced.head_revision_id)),
    normal(grownDocument),
    'and is one revision',
  );
  // A metadata-only edit writes no tree rows.
  const target = expected.events[0];
  const before = await pool.query(
    'SELECT xmin::text FROM oc_nodes WHERE timeline_id=$1 UNION ALL SELECT xmin::text FROM oc_duration_nodes WHERE timeline_id=$1 UNION ALL SELECT xmin::text FROM oc_edge_nodes WHERE timeline_id=$1',
    [timeline.id],
  );
  timeline = await store.save(timeline.id, user, timeline.revision, undefined, {
    settings: { ...expected, events: [], durations: undefined, relationships: undefined },
    changes: [{ id: target.id, event: { ...target, metadata: { title: 'Only the title' } } }],
  });
  const after = await pool.query(
    'SELECT xmin::text FROM oc_nodes WHERE timeline_id=$1 UNION ALL SELECT xmin::text FROM oc_duration_nodes WHERE timeline_id=$1 UNION ALL SELECT xmin::text FROM oc_edge_nodes WHERE timeline_id=$1',
    [timeline.id],
  );
  assert.deepEqual(after.rows, before.rows, 'metadata edits leave tree rows untouched');
  // Changing the plugins saves in place too (#157): each plugin reads its own metadata, so
  // nothing is revalidated or rebuilt. A new script is compiled (in the sandbox) once.
  const plugins = [{ manifest: validatePluginManifest(PLUGIN_EXAMPLE), enabled: true }];
  const settings = { ...expected, events: [], durations: undefined, relationships: undefined };
  timeline = await store.save(timeline.id, user, timeline.revision, undefined, {
    settings: { ...settings, plugins },
    changes: [],
  });
  assert.deepEqual(timeline.plugins, plugins);
  const installed = await pool.query(
    'SELECT xmin::text FROM oc_nodes WHERE timeline_id=$1 UNION ALL SELECT xmin::text FROM oc_duration_nodes WHERE timeline_id=$1 UNION ALL SELECT xmin::text FROM oc_edge_nodes WHERE timeline_id=$1',
    [timeline.id],
  );
  assert.deepEqual(installed.rows, before.rows, 'plugin changes leave tree rows untouched');
  // One whose script does not compile is refused, and nothing changes.
  const broken = validatePluginManifest({
    ...PLUGIN_EXAMPLE,
    id: 'broken',
    source: 'function render(m,api) { return fetch(1); }',
  });
  await assert.rejects(
    store.save(timeline.id, user, timeline.revision, undefined, {
      settings: { ...settings, plugins: [...plugins, { manifest: broken, enabled: true }] },
      changes: [],
    }),
    (error) =>
      error.status === 400 && /does not compile: Unknown local variable: fetch/.test(error.message),
  );
  assert.equal((await store.access(timeline.id, user)).revision, timeline.revision);
  // Metadata a plugin may find malformed is stored as given, and search reads what it can.
  const odd = {
    ...target,
    metadata: {
      title: 'Odd stack',
      stack: [{ id: 'x', metadata: { title: 'Nested', stack: 'not a stack' } }, 7, null, 'text'],
      sources: 'not a list',
      color: { not: 'a color' },
    },
  };
  timeline = await store.save(timeline.id, user, timeline.revision, undefined, {
    settings: { ...settings, plugins },
    changes: [{ id: target.id, event: odd }],
  });
  const stored = await store.query(timeline.id, user, { kind: 'moment', id: target.id });
  assert.deepEqual(stored.event.metadata, odd.metadata);
  const found = await store.query(timeline.id, user, { kind: 'search', text: 'nested', page: 1 });
  assert.deepEqual(
    found.results.map((r) => r.id),
    [target.id],
  );
  console.log(
    `PASS incremental saves: ${patches} random patches (and a patch applied in many slices) match full rebuilds (documents, queries, search, links, arcs; ${replays} history replays, every revision read back from rows) and keep AVL invariants.`,
  );
} finally {
  await store?.idle();
  for (const id of created) await pool.query('DELETE FROM oc_timelines WHERE id=$1', [id]);
  await pool.query('DELETE FROM oc_storage_entries WHERE user_id=$1', [user]);
  await pool.query('DELETE FROM oc_users WHERE id=$1', [user]);
  await pool.end();
}
