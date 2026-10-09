// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// Oracle: random sparse saves applied in place match a full rebuild of the same document,
// leave every stored tree a valid AVL tree with correct summaries, and replay from history.
import pg from 'pg';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { PostgresStore, applyPatch } from '../server/store.mjs';
import { Q, validateDocument } from '../dist/core.mjs';
if (!process.env.DATABASE_URL) throw new Error('Use a dedicated PostgreSQL test database.');
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const user = randomUUID();
const created = [];
let store;
let seed = 32;
const random = () => {
  seed = (seed * 1103515245 + 12345) % 2147483648;
  return seed / 2147483648;
};
const pick = (list) => list[Math.floor(random() * list.length)];
const time = () =>
  Q.from(BigInt(Math.floor(random() * 600)), BigInt(1 + Math.floor(random() * 3))).toString();
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
/** A random patch over the current document; references stay valid. */
function randomPatch(document, step) {
  const changes = new Map(),
    durationChanges = new Map(),
    relationshipChanges = [];
  const moments = document.events.map((e) => e.id);
  const live = () => moments.filter((m) => changes.get(m) !== null);
  for (let i = 0, n = 1 + Math.floor(random() * 6); i < n; i++) {
    const roll = random();
    const existing = document.events.find((e) => e.id === pick(moments));
    if (roll < 0.25 && existing)
      changes.set(existing.id, {
        ...existing,
        metadata: { ...existing.metadata, title: `Renamed ${step}.${i}` },
      });
    else if (roll < 0.45 && existing)
      // Moves to a new time or onto an existing one (sharing its node).
      changes.set(existing.id, {
        ...existing,
        time: random() < 0.4 ? pick(document.events).time : time(),
      });
    else if (roll < 0.55 && existing && moments.length > 5) changes.set(existing.id, null);
    else if (roll < 0.7) {
      const id = `n${step}x${i}`;
      changes.set(id, { id, time: time(), metadata: { title: `New ${id}`, tags: ['new'] } });
      moments.push(id);
    } else if (roll < 0.85) {
      const id =
        random() < 0.5 && document.durations?.length
          ? pick(document.durations).id
          : `d${step}x${i}`;
      const start = time();
      const anchors = live();
      durationChanges.set(id, {
        id,
        start: random() < 0.4 ? { moment: pick(anchors) } : start,
        end:
          random() < 0.3
            ? { moment: pick(anchors) }
            : Q.parse(start)
                .add(Q.from(BigInt(Math.floor(random() * 90))))
                .toString(),
        metadata: { title: `Span ${id} note` },
      });
    } else if (roll < 0.9 && document.durations?.length)
      durationChanges.set(pick(document.durations).id, null);
    else if (roll < 0.97) {
      const entities = [
        ...live().map((m) => ({ moment: m })),
        ...(document.durations ?? [])
          .filter((d) => !durationChanges.has(d.id) || durationChanges.get(d.id))
          .map((d) => ({ duration: d.id })),
      ];
      const key = (ref) => ('moment' in ref ? 'm:' : 'd:') + (ref.moment ?? ref.duration);
      const a = pick(entities),
        b = pick(entities);
      if (key(a) !== key(b))
        relationshipChanges.push(
          key(a) < key(b) ? { a, b, related: true } : { a: b, b: a, related: true },
        );
    } else if (document.relationships?.length) {
      const r = pick(document.relationships);
      relationshipChanges.push({ ...r, related: false });
    }
  }
  return {
    settings: {
      ...document,
      events: [],
      durations: undefined,
      relationships: undefined,
      ...(step % 7 === 3 ? { title: `Incremental ${step}` } : {}),
    },
    changes: [...changes].map(([id, event]) => ({ id, event })),
    durationChanges: [...durationChanges].map(([id, duration]) => ({ id, duration })),
    relationshipChanges,
  };
}
try {
  await pool.query(await readFile(new URL('../server/schema.sql', import.meta.url), 'utf8'));
  await pool.query('INSERT INTO oc_users(id,username,email_verified_at) VALUES($1,$2,now())', [
    user,
    'incremental_' + user.slice(0, 8),
  ]);
  store = new PostgresStore(pool);
  const events = Array.from({ length: 300 }, (_, i) => ({
    id: 'm' + i,
    time: time(),
    metadata: { title: 'Moment ' + i, description: 'A note', ...(i % 5 ? {} : { tags: ['five'] }) },
  }));
  let expected = validateDocument({
    format: 'openchronology',
    version: 1,
    title: 'Incremental',
    description: '',
    events,
    durations: Array.from({ length: 40 }, (_, i) => {
      const start = time();
      return {
        id: 'd' + i,
        start: i % 4 ? start : { moment: 'm' + i },
        end:
          i % 6
            ? Q.parse(start)
                .add(Q.from(BigInt(i * 3)))
                .toString()
            : { moment: 'm' + (i + 50) },
        metadata: { title: 'Duration ' + i, tags: i % 3 ? [] : ['three'] },
      };
    }),
    relationships: Array.from({ length: 50 }, (_, i) => ({
      a: { moment: 'm' + i },
      b: i % 3 ? { moment: 'm' + (i + 100) } : { duration: 'd' + (i % 40) },
    })),
  });
  let timeline = await store.create(user, expected);
  created.push(timeline.id);
  let patches = 0,
    replays = 0;
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
    timeline = await store.save(timeline.id, user, timeline.revision, undefined, patch);
    expected = next;
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
  // Every saved revision replays to the document it recorded.
  const { rows: kinds } = await pool.query(
    'SELECT count(*) FILTER (WHERE patch IS NOT NULL) AS patches,count(*) FILTER (WHERE snapshot_id IS NOT NULL) AS snapshots FROM oc_revisions WHERE timeline_id=$1',
    [timeline.id],
  );
  assert(Number(kinds[0].patches) > 50, 'saves record patches');
  // Catalogue text catches up after the saves commit.
  await store.idle();
  const text = (
    await pool.query('SELECT event_text,event_text_stale FROM oc_timelines WHERE id=$1', [
      timeline.id,
    ])
  ).rows[0];
  assert.equal(text.event_text_stale, false);
  for (const e of expected.events.slice(0, 20)) assert(text.event_text.includes(e.metadata.title));
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
  console.log(
    `PASS incremental saves: ${patches} random patches match full rebuilds (documents, queries, search, links, arcs; ${replays} history replays) and keep AVL invariants.`,
  );
} finally {
  await store?.idle();
  for (const id of created) await pool.query('DELETE FROM oc_timelines WHERE id=$1', [id]);
  await pool.query('DELETE FROM oc_storage_entries WHERE user_id=$1', [user]);
  await pool.query('DELETE FROM oc_users WHERE id=$1', [user]);
  await pool.end();
}
