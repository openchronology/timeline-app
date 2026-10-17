// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// Persistent AVL trees stored as PostgreSQL rows with stable IDs. An insertion or deletion
// reads and rewrites only the nodes on its path (plus rotations), recomputing each node's
// subtree summaries from its children, so a save costs O(log n) rows instead of a rebuild.
//
// Three trees use it: the moment tree (oc_nodes, MOMENT_TREE) and the interval trees of
// durations and relationship arcs (oc_duration_nodes and oc_edge_nodes, INTERVAL_TREE).
// The timeline row names each root (root, duration_root, edge_root). Node IDs are only
// keys: the order of the tree is held in left_id/right_id, never in the IDs. In a fork, the
// tree's rows are read through to its source's (indexReader in index-versions.mjs), and the
// nodes a save changes are written as the fork's own rows.
import { Q, durationOverview } from '../dist/core.mjs';
import { removeRows } from './index-versions.mjs';

/**
 * Compares two strings by UTF-16 code units, which for the ASCII IDs the application allows
 * is PostgreSQL's "C" collation: the order IDs have in nodes and in SQL (COLLATE "C").
 */
const order = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
/** The larger of two rationals as text; `b` may be undefined (an absent child's summary). */
const max = (a, b) => (b !== undefined && Q.parse(b).compare(Q.parse(a)) > 0 ? b : a);
/** The smaller of two rationals as text; `b` may be undefined (an absent child's summary). */
const min = (a, b) => (b !== undefined && Q.parse(b).compare(Q.parse(a)) < 0 ? b : a);
/** A node ID from a row (bigint columns arrive as strings), or null for no node. */
const id = (value) => (value === null || value === undefined ? null : Number(value));
/**
 * `object[field]` (a rational's text) parsed, once per object and text: a save compares each
 * key with every node on its path, and parsing dominated that.
 */
const parsedTimes = new WeakMap();
function parsed(object, field) {
  let cache = parsedTimes.get(object);
  if (!cache) parsedTimes.set(object, (cache = {}));
  const text = object[field];
  if (cache[field]?.text !== text) cache[field] = { text, value: Q.parse(text) };
  return cache[field].value;
}

/**
 * Inserts or replaces rows of an index table in batches of 250 (one multi-row INSERT each,
 * so no statement grows with the save). `columns` must start with timeline_id and the key
 * column `id` (the primary key the conflict clause names); `casts` maps column names to SQL
 * casts (rationals arrive as text, JSON as strings); `rows` are arrays in `columns` order.
 * With `conflict` (the default) a row whose key exists is updated in place instead, and its
 * `hidden` flag cleared: in a fork, writing a key it had hidden (a tombstone of a row it
 * reads through to, see removeRows) makes the row visible again with the new values.
 * Side effects: index writes, so it must follow beginIndexWrite in the same transaction
 * (inserted rows take `since` from the transaction's clock, and an update fires the
 * versioning trigger that retires the old version when a fork's pin can see it).
 */
export async function upsertRows(client, table, columns, casts, rows, conflict = true) {
  for (let offset = 0; offset < rows.length; offset += 250) {
    const params = [];
    const tuples = rows.slice(offset, offset + 250).map((row) => {
      const start = params.length;
      params.push(...row);
      return '(' + columns.map((c, i) => '$' + (start + i + 1) + (casts[c] ?? '')).join(',') + ')';
    });
    // INSERT … VALUES (…),(…) ON CONFLICT(timeline_id,id) DO UPDATE SET every column but the
    // key (from EXCLUDED, the row proposed), served by the table's primary key. Within one
    // statement each key must appear once: PostgreSQL refuses to update a row twice.
    await client.query(
      `INSERT INTO ${table}(${columns.join(',')}) VALUES ${tuples.join(',')}` +
        (conflict
          ? ` ON CONFLICT(timeline_id,id) DO UPDATE SET ${columns
              .slice(2)
              .map((c) => `${c}=EXCLUDED.${c}`)
              .join(',')},hidden=false`
          : ''),
      params,
    );
  }
}

/*
 * Nodes are looked up by ID with `node`, a function of the ID (SQL) giving a subquery for
 * that node (indexReader's lookup), a lookup per node: right after a timeline is written (a
 * fork, an import) the planner's statistics can still count its nodes as none, and a join
 * would then read all of them at every step.
 */
/**
 * The nodes on the paths (`visited`, a CTE of node IDs) and their children, each read by its
 * key: the UNION (which also removes duplicates) adds each visited node's left and right
 * child, which a save needs besides the path itself, to recompute summaries and heights
 * from both children and to rotate. A child that is itself on a path is read once.
 */
const pathNodes = (node) => `SELECT n.* FROM (
      SELECT id FROM visited UNION SELECT x FROM visited v CROSS JOIN LATERAL ${node('v.id')} c,
      unnest(ARRAY[c.left_id,c.right_id]) x WHERE x IS NOT NULL
    ) ids(node_id) CROSS JOIN LATERAL ${node('ids.node_id')} n`;

/**
 * The moment tree's spec for PersistentTree (rows of oc_nodes): one node per distinct moment
 * time, holding its moment IDs in "C" order, ordered by time. Each node summarizes its
 * subtree: its first and last times, the ID of its leftmost node (firstId), its own bucket
 * size, its moment count and its count of distinct times (nodes), which the walks in
 * schema.sql (oc_overview_v2 and the others) take for a whole subtree without descending.
 *
 * A spec gives: the table's `columns` in write order and their `casts`; `select`, the
 * columns as read (rationals as text through oc_qtext); `decode` and `encode` between rows
 * and nodes; `compare(key, node)`; `create` and `merge` (a key already present: null when
 * keys are unique); `copy` (a node takes over another's contents, when removing); and
 * `summarize(node, left, right)`. `path` and `pathParams` give prefetch's query.
 */
export const MOMENT_TREE = {
  columns: [
    'timeline_id',
    'id',
    'time',
    'first_time',
    'last_time',
    'left_id',
    'right_id',
    'first_id',
    'bucket_count',
    'event_count',
    'distinct_count',
    'height',
    'moment_ids',
  ],
  casts: { time: '::mpq', first_time: '::mpq', last_time: '::mpq', moment_ids: '::text[]' },
  select:
    'id,oc_qtext(time) AS time,oc_qtext(first_time) AS first,oc_qtext(last_time) AS last,left_id,right_id,first_id,bucket_count,event_count,distinct_count,height,moment_ids',
  decode: (r) => ({
    id: Number(r.id),
    time: r.time,
    first: r.first,
    last: r.last,
    left: id(r.left_id),
    right: id(r.right_id),
    firstId: Number(r.first_id),
    bucketCount: Number(r.bucket_count),
    count: Number(r.event_count),
    distinct: Number(r.distinct_count),
    height: r.height,
    ids: r.moment_ids,
  }),
  encode: (owner, n) => [
    owner,
    n.id,
    n.time,
    n.first,
    n.last,
    n.left,
    n.right,
    n.firstId,
    n.bucketCount,
    n.count,
    n.distinct,
    n.height,
    n.ids,
  ],
  compare: (key, n) => parsed(key, 'time').compare(parsed(n, 'time')),
  create: (nodeId, { time, id: momentId }) => ({ id: nodeId, time, ids: [momentId] }),
  /** A moment at a time that already has a node joins its bucket, kept sorted ("C" order). */
  merge(n, { id: momentId }) {
    if (!n.ids.includes(momentId)) n.ids = [...n.ids, momentId].sort(order);
  },
  copy(to, from) {
    to.time = from.time;
    to.ids = from.ids;
  },
  /**
   * Recomputes `n`'s summaries from its children `l` and `r` (null when absent), which are
   * already up to date: the tree is ordered by time, so the first time and the first node
   * are the left subtree's and the last time the right subtree's.
   */
  summarize(n, l, r) {
    n.first = l ? l.first : n.time;
    n.last = r ? r.last : n.time;
    n.firstId = l ? l.firstId : n.id;
    n.bucketCount = n.ids.length;
    n.count = (l?.count ?? 0) + n.ids.length + (r?.count ?? 0);
    n.distinct = (l?.distinct ?? 0) + 1 + (r?.distinct ?? 0);
  },
  // Paths from the root towards each key, plus the children of every node on them. The keys
  // descend together: a node is read once, with the keys that reach it, which it splits
  // between its children, so the lookups follow the distinct nodes on the paths (appended
  // moments share nearly all of theirs), not keys × depth. Keys are cast once.
  // Parameters: $1 the timeline (used by `node`), $2 the keys' times, $3 the root. A key
  // equal to a node's time stops there (that node is its own). The recursion ends where a
  // child is missing or no key goes that way. Every node is reached from one parent, so
  // `path` has no duplicates.
  path: (node) => `WITH RECURSIVE path(id,keys) AS (
      SELECT $3::bigint,$2::mpq[]
      UNION ALL SELECT c.id,c.keys FROM path p CROSS JOIN LATERAL ${node('p.id')} n
      CROSS JOIN LATERAL (VALUES
        (n.left_id,ARRAY(SELECT k FROM unnest(p.keys) k WHERE k<n.time)),
        (n.right_id,ARRAY(SELECT k FROM unnest(p.keys) k WHERE k>n.time))) c(id,keys)
      WHERE c.id IS NOT NULL AND cardinality(c.keys)>0
    ), visited AS (SELECT id FROM path)
    ${pathNodes(node)}`,
  pathParams: (keys) => [keys.map((k) => k.time)],
};

/**
 * Stored band and definition of a resolved duration (or arc), as the full builder writes them:
 * the payload of an INTERVAL_TREE node. The band keeps an overview of the metadata (what the
 * viewport draws), the definition the whole duration as saved.
 */
export function intervalPayload(band) {
  return {
    first: band.first,
    last: band.last,
    band: { ...band, metadata: durationOverview(band.metadata) },
    definition: { id: band.id, start: band.start, end: band.end, metadata: band.metadata },
  };
}

/**
 * The interval tree's spec (see MOMENT_TREE for the parts of a spec): an augmented AVL tree
 * of durations (oc_duration_nodes) or relationship arcs (oc_edge_nodes), one node each,
 * ordered by (start, ID in "C" order), so keys are unique. Each node summarizes its subtree
 * for oc_duration_overview in schema.sql: the earliest start (min) and latest end (max)
 * bound which subtrees a window can intersect; the latest start (maxFirst), the entry count
 * and the shortest and longest extents decide when a whole subtree collapses into a summary.
 */
export const INTERVAL_TREE = {
  columns: [
    'timeline_id',
    'id',
    'left_id',
    'right_id',
    'min_time',
    'max_time',
    'first_time',
    'last_time',
    'band',
    'definition',
    'max_first',
    'subtree_count',
    'min_extent',
    'max_extent',
    'height',
  ],
  casts: {
    min_time: '::mpq',
    max_time: '::mpq',
    first_time: '::mpq',
    last_time: '::mpq',
    band: '::jsonb',
    definition: '::jsonb',
    max_first: '::mpq',
    min_extent: '::mpq',
    max_extent: '::mpq',
  },
  decode: (r) => ({
    id: Number(r.id),
    left: id(r.left_id),
    right: id(r.right_id),
    first: r.first,
    last: r.last,
    band: r.band,
    definition: r.definition,
    min: r.min,
    max: r.max,
    maxFirst: r.max_first,
    count: Number(r.subtree_count),
    minExtent: r.min_extent,
    maxExtent: r.max_extent,
    height: r.height,
  }),
  select:
    'id,left_id,right_id,oc_qtext(min_time) AS min,oc_qtext(max_time) AS max,oc_qtext(first_time) AS first,oc_qtext(last_time) AS last,band,definition,oc_qtext(max_first) AS max_first,subtree_count,oc_qtext(min_extent) AS min_extent,oc_qtext(max_extent) AS max_extent,height',
  encode: (owner, n) => [
    owner,
    n.id,
    n.left,
    n.right,
    n.min,
    n.max,
    n.first,
    n.last,
    JSON.stringify(n.band),
    JSON.stringify(n.definition),
    n.maxFirst,
    n.count,
    n.minExtent,
    n.maxExtent,
    n.height,
  ],
  compare: (key, n) => parsed(key, 'first').compare(parsed(n, 'first')) || order(key.id, n.band.id),
  create: (nodeId, payload) => ({ id: nodeId, ...payload }),
  // Keys are unique (the ID breaks ties), so inserting one already present is an error.
  merge: null,
  copy(to, from) {
    to.first = from.first;
    to.last = from.last;
    to.band = from.band;
    to.definition = from.definition;
  },
  /**
   * Recomputes `n`'s summaries from its up-to-date children. Ordered by start: the earliest
   * start is the leftmost's and the latest start the rightmost's; ends follow no order, so
   * the latest end is the maximum over the node and both subtrees.
   */
  summarize(n, l, r) {
    const extent = Q.parse(n.last).sub(Q.parse(n.first)).toString();
    n.min = l ? l.min : n.first;
    n.max = max(max(n.last, l?.max), r?.max);
    n.maxFirst = r ? r.maxFirst : n.first;
    n.count = 1 + (l?.count ?? 0) + (r?.count ?? 0);
    n.minExtent = min(min(extent, l?.minExtent), r?.minExtent);
    n.maxExtent = max(max(extent, l?.maxExtent), r?.maxExtent);
  },
  // As the moment tree's: the keys (start, ID) descend together, split at each node.
  // Parameters: $1 the timeline, $2 the keys' starts, $3 their IDs (two parallel arrays),
  // $4 the root. `side` compares a key with node n in the tree's order, the ID in "C"
  // collation as in compare above; `keys` keeps both arrays aligned by filtering them
  // together (unnest of both WITH ORDINALITY, in their original order).
  path: (node) => {
    const side = (op) =>
      `f${op}n.first_time OR (f=n.first_time AND e COLLATE "C"${op}(n.band->>'id') COLLATE "C")`;
    const keys = (op) =>
      ['f', 'e'].map(
        (c) =>
          `ARRAY(SELECT ${c} FROM unnest(p.firsts,p.eids) WITH ORDINALITY k(f,e,o) WHERE ${side(op)} ORDER BY o)`,
      );
    return `WITH RECURSIVE path(id,firsts,eids) AS (
      SELECT $4::integer,$2::mpq[],$3::text[]
      UNION ALL SELECT c.id,c.firsts,c.eids FROM path p CROSS JOIN LATERAL ${node('p.id')} n
      CROSS JOIN LATERAL (VALUES (n.left_id,${keys('<')}),(n.right_id,${keys('>')})) c(id,firsts,eids)
      WHERE c.id IS NOT NULL AND cardinality(c.firsts)>0
    ), visited AS (SELECT id FROM path)
    ${pathNodes(node)}`;
  },
  pathParams: (keys) => [keys.map((k) => k.first), keys.map((k) => k.id)],
};

/**
 * A tree whose rows are read on demand and written back by flush(), of the timeline `owner`
 * (its row, as `t` in incremental.mjs) read by `rows` (its indexReader). In a fork, a node it
 * changes becomes its own, and so does the path to it: the walks in schema.sql rely on a
 * fork's own nodes having only nodes of its own above them.
 */
export class PersistentTree {
  /**
   * `client` the transaction's client; `spec` MOMENT_TREE or INTERVAL_TREE; `table` its
   * table; `owner` the timeline row (id, index_bases); `root` the root node's ID (null for
   * an empty tree); `rows` the timeline's indexReader. Nothing is read until needed.
   * `nodes` caches the nodes read or written, `dirty` the IDs to write, `dropped` the IDs to
   * delete, `next` the last node ID handed out (read on the first insertion).
   */
  constructor(client, spec, table, owner, root, rows) {
    Object.assign(this, {
      client,
      spec,
      table,
      owner: owner.id,
      timeline: owner,
      rows,
      root: id(root),
    });
    this.nodes = new Map();
    this.dirty = new Set();
    this.dropped = new Set();
    this.next = null;
  }
  /** How many entries the tree holds: the root's count summary (a promise). */
  get size() {
    return this.root === null ? Promise.resolve(0) : this.get(this.root).then((n) => n.count);
  }
  /**
   * Caches nodes read from the database, unless already cached (a cached node may have
   * changed since) or removed in this save (a fork would read the source's version again).
   */
  #add(rows) {
    for (const row of rows) {
      const n = this.spec.decode(row);
      if (!this.nodes.has(n.id) && !this.dropped.has(n.id)) this.nodes.set(n.id, n);
    }
  }
  /**
   * The node with ID `nodeId` (null for null), from the cache or read by its key. Throws
   * when the tree names a node the index does not hold.
   */
  async get(nodeId) {
    if (nodeId === null) return null;
    if (!this.nodes.has(nodeId)) {
      // One node by (timeline, id): the primary key, or in a fork the first version found
      // going down its levels (indexReader's lookup). prefetch usually makes this a miss.
      const { rows } = await this.client.query(
        `SELECT ${this.spec.select} FROM ${this.rows.lookup(this.table, ['$2::bigint'])} x`,
        [this.owner, nodeId],
      );
      this.#add(rows);
    }
    const n = this.nodes.get(nodeId);
    if (!n) throw new Error('Broken timeline index');
    return n;
  }
  /**
   * Loads the saved paths towards several keys (with their children) in one query; later
   * reads hit the cache. `keys` are objects as compare takes them. A save calls it once per
   * tree before changing anything, so a batch of k changes reads each node on the paths
   * once rather than issuing k × depth lookups (test/tree-paths-postgres.mjs checks that the
   * changes then find every node already read).
   */
  async prefetch(keys) {
    if (!keys.length || this.root === null) return;
    // The spec's recursive walk, with each node looked up through the timeline's levels,
    // selecting the spec's columns rather than whole rows.
    const sql = this.spec
      .path((nodeId) => this.rows.lookup(this.table, [nodeId]))
      .replace('SELECT n.* FROM', `SELECT ${this.spec.select} FROM`);
    const { rows } = await this.client.query(sql, [
      this.owner,
      ...this.spec.pathParams(keys),
      this.root,
    ]);
    this.#add(rows);
  }
  /**
   * A node ID not used in this tree: one past the largest found, then counting up. A save
   * holds the timeline row locked, so no other transaction hands out IDs meanwhile.
   */
  async #newId() {
    if (this.next === null) {
      // The last ID read backwards from the index, whatever the statistics say; in a fork,
      // after any ID any version of a timeline it reads through to used.
      // Each is ORDER BY id DESC LIMIT 1 on (timeline_id, id): the live table's primary key,
      // or the retired twin's key index (timeline_id, id, until), read backwards from the
      // end. A fork's own node with an ID its levels also have would hide theirs, so a new
      // ID must be past every ID any level holds, live or retired.
      const last = (table, timeline) =>
        `(SELECT id FROM ${table} WHERE timeline_id=${timeline} ORDER BY id DESC LIMIT 1)`;
      const { rows } = await this.client.query(
        `SELECT greatest(${[
          last(this.table, '$1'),
          ...this.timeline.index_bases.flatMap((_, i) => [
            last(this.table, `($2::uuid[])[${i + 1}]`),
            last(this.table + '_retired', `($2::uuid[])[${i + 1}]`),
          ]),
        ]},0) AS id`,
        [this.owner, ...(this.rows.depth ? [this.timeline.index_bases] : [])],
      );
      this.next = Number(rows[0].id);
    }
    return ++this.next;
  }
  /** Marks `n` to be written by flush(). */
  #touch(n) {
    this.dirty.add(n.id);
  }
  /** Marks `n` removed: flush() deletes its row (or hides it in a fork). */
  #drop(n) {
    this.nodes.delete(n.id);
    this.dirty.delete(n.id);
    this.dropped.add(n.id);
  }
  /**
   * Adds `payload` under `key`, or (MOMENT_TREE) merges it into the node with that key.
   * Rewrites the path from the root and rebalances it; throws on a duplicate key in a tree
   * without `merge`.
   */
  async insert(key, payload) {
    this.root = await this.#insert(this.root, key, payload);
  }
  /**
   * Removes `key`; `keep(node)` may shrink the node instead and returns true to retain it
   * (a moment leaving a time other moments still share). Throws when the key is absent.
   */
  async remove(key, keep = null) {
    this.root = await this.#remove(this.root, key, keep);
  }
  /**
   * Replaces the payload of the node with `key` without moving it (its summaries are
   * unchanged). In a fork, the path to it is written too.
   */
  async replace(key, update) {
    const path = [];
    let nodeId = this.root;
    while (nodeId !== null) {
      const n = await this.get(nodeId),
        c = this.spec.compare(key, n);
      path.push(n);
      if (c === 0) {
        update(n);
        for (const p of this.rows.depth ? path : [n]) this.#touch(p);
        return;
      }
      nodeId = c < 0 ? n.left : n.right;
    }
    throw new Error('Broken timeline index');
  }
  /** Makes the node with `key` and the path to it a fork's own (see the class). */
  async own(key) {
    if (this.rows.depth) await this.replace(key, () => {});
  }
  /**
   * Inserts into the subtree rooted at `nodeId`, returning the subtree's new root ID: the
   * recursion descends to an empty place, creates the node there, and on the way back up
   * updates each node on the path and rebalances it.
   */
  async #insert(nodeId, key, payload) {
    if (nodeId === null) {
      const n = { ...this.spec.create(await this.#newId(), payload), left: null, right: null };
      this.nodes.set(n.id, n);
      await this.#update(n);
      return n.id;
    }
    const n = await this.get(nodeId),
      c = this.spec.compare(key, n);
    if (c === 0) {
      if (!this.spec.merge) throw new Error('Duplicate index key');
      this.spec.merge(n, payload);
      await this.#update(n);
      return n.id;
    }
    if (c < 0) n.left = await this.#insert(n.left, key, payload);
    else n.right = await this.#insert(n.right, key, payload);
    return this.#balance(n);
  }
  /**
   * Removes `key` from the subtree rooted at `nodeId`, returning the subtree's new root ID.
   * A node with at most one child is replaced by that child; one with two takes over its
   * in-order successor's contents (the smallest key of its right subtree), whose node is
   * removed instead, so the tree's order holds. Every node on the way back up is rebalanced.
   */
  async #remove(nodeId, key, keep) {
    if (nodeId === null) throw new Error('Broken timeline index');
    const n = await this.get(nodeId),
      c = this.spec.compare(key, n);
    if (c < 0) n.left = await this.#remove(n.left, key, keep);
    else if (c > 0) n.right = await this.#remove(n.right, key, keep);
    else {
      if (keep && keep(n)) {
        await this.#update(n);
        return n.id;
      }
      if (n.left === null || n.right === null) {
        this.#drop(n);
        return n.left ?? n.right;
      }
      // Take over the in-order successor's contents, then remove the successor's node.
      let successor = await this.get(n.right);
      while (successor.left !== null) successor = await this.get(successor.left);
      this.spec.copy(n, successor);
      n.right = await this.#removeMin(n.right);
    }
    return this.#balance(n);
  }
  /** Removes the leftmost node of the subtree at `nodeId`; returns the subtree's new root. */
  async #removeMin(nodeId) {
    const n = await this.get(nodeId);
    if (n.left === null) {
      this.#drop(n);
      return n.right;
    }
    n.left = await this.#removeMin(n.left);
    return this.#balance(n);
  }
  /** Recomputes `n`'s height and summaries from its children and marks it to be written. */
  async #update(n) {
    const l = await this.get(n.left),
      r = await this.get(n.right);
    n.height = 1 + Math.max(l?.height ?? 0, r?.height ?? 0);
    this.spec.summarize(n, l, r);
    this.#touch(n);
  }
  /**
   * Restores the AVL invariant at `n` (its subtrees' heights differ by at most one) after an
   * insertion or removal below it changed one side's height by one; returns the ID of the
   * node now at its place. A side two higher than the other is rotated up:
   *
   * - left-left (the left child's outer, left subtree is at least as high as its inner):
   *   one right rotation of `n`;
   * - left-right (the inner subtree is higher): first a left rotation of the left child,
   *   making it left-left, then a right rotation of `n`;
   * - right-right and right-left mirror them.
   *
   * Each rotation updates the two nodes it moves, lower one first, so summaries stay exact.
   */
  async #balance(n) {
    await this.#update(n);
    const l = await this.get(n.left),
      r = await this.get(n.right),
      skew = (l?.height ?? 0) - (r?.height ?? 0);
    if (skew > 1) {
      const outer = await this.get(l.left),
        inner = await this.get(l.right);
      if ((outer?.height ?? 0) < (inner?.height ?? 0)) n.left = await this.#rotateLeft(l);
      return this.#rotateRight(n);
    }
    if (skew < -1) {
      const outer = await this.get(r.right),
        inner = await this.get(r.left);
      if ((outer?.height ?? 0) < (inner?.height ?? 0)) n.right = await this.#rotateRight(r);
      return this.#rotateLeft(n);
    }
    return n.id;
  }
  /**
   * Right rotation: `n`'s left child `l` takes its place, `n` becomes `l`'s right child and
   * takes `l`'s former right subtree as its left (keys between l and n), keeping the order:
   *
   *         n               l
   *        / \             / \
   *       l   C    ->     A   n
   *      / \                 / \
   *     A   B               B   C
   *
   * Returns `l`'s ID. `n` is updated before `l`, whose summaries depend on it.
   */
  async #rotateRight(n) {
    const l = await this.get(n.left);
    n.left = l.right;
    await this.#update(n);
    l.right = n.id;
    await this.#update(l);
    return l.id;
  }
  /** Left rotation, the mirror of #rotateRight: `n`'s right child takes its place. */
  async #rotateLeft(n) {
    const r = await this.get(n.right);
    n.right = r.left;
    await this.#update(n);
    r.left = n.id;
    await this.#update(r);
    return r.id;
  }
  /**
   * Writes changed nodes and deletes removed ones, in the save's transaction (after
   * beginIndexWrite). Removed nodes go first, through removeRows: deleted from the
   * timeline's own rows and, in a fork, hidden where it reads them through to its levels.
   * Changed nodes are then upserted (written as the timeline's own rows).
   */
  async flush() {
    if (this.dropped.size)
      await removeRows(
        this.client,
        this.timeline,
        this.rows,
        this.table,
        ['bigint'],
        [[...this.dropped]],
      );
    const rows = [...this.dirty].map((nodeId) =>
      this.spec.encode(this.owner, this.nodes.get(nodeId)),
    );
    await upsertRows(this.client, this.table, this.spec.columns, this.spec.casts, rows);
    this.dirty.clear();
    this.dropped.clear();
  }
}
