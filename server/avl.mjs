// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// Persistent AVL trees stored as PostgreSQL rows with stable IDs. An insertion or deletion
// reads and rewrites only the nodes on its path (plus rotations), recomputing each node's
// subtree summaries from its children, so a save costs O(log n) rows instead of a rebuild.
import { Q, durationOverview } from '../dist/core.mjs';

const order = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const max = (a, b) => (b !== undefined && Q.parse(b).compare(Q.parse(a)) > 0 ? b : a);
const min = (a, b) => (b !== undefined && Q.parse(b).compare(Q.parse(a)) < 0 ? b : a);
const id = (value) => (value === null || value === undefined ? null : Number(value));

/** Inserts or replaces rows in batches; `casts` maps column names to SQL casts. */
export async function upsertRows(client, table, columns, casts, rows, conflict = true) {
  for (let offset = 0; offset < rows.length; offset += 250) {
    const params = [];
    const tuples = rows.slice(offset, offset + 250).map((row) => {
      const start = params.length;
      params.push(...row);
      return '(' + columns.map((c, i) => '$' + (start + i + 1) + (casts[c] ?? '')).join(',') + ')';
    });
    await client.query(
      `INSERT INTO ${table}(${columns.join(',')}) VALUES ${tuples.join(',')}` +
        (conflict
          ? ` ON CONFLICT(timeline_id,id) DO UPDATE SET ${columns
              .slice(2)
              .map((c) => `${c}=EXCLUDED.${c}`)
              .join(',')}`
          : ''),
      params,
    );
  }
}

/** One node per distinct moment time, holding its moment IDs in "C" order. */
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
  compare: (key, n) => Q.parse(key.time).compare(Q.parse(n.time)),
  create: (nodeId, { time, id: momentId }) => ({ id: nodeId, time, ids: [momentId] }),
  merge(n, { id: momentId }) {
    if (!n.ids.includes(momentId)) n.ids = [...n.ids, momentId].sort(order);
  },
  copy(to, from) {
    to.time = from.time;
    to.ids = from.ids;
  },
  summarize(n, l, r) {
    n.first = l ? l.first : n.time;
    n.last = r ? r.last : n.time;
    n.firstId = l ? l.firstId : n.id;
    n.bucketCount = n.ids.length;
    n.count = (l?.count ?? 0) + n.ids.length + (r?.count ?? 0);
    n.distinct = (l?.distinct ?? 0) + 1 + (r?.distinct ?? 0);
  },
  // Paths from the root towards each key, plus the children of every node on them.
  path: (table) => `WITH RECURSIVE path(key,id) AS (
      SELECT k,$3::bigint FROM unnest($2::text[]) k
      UNION SELECT p.key,CASE WHEN p.key::mpq<n.time THEN n.left_id WHEN p.key::mpq>n.time THEN n.right_id END
      FROM path p JOIN ${table} n ON n.timeline_id=$1 AND n.id=p.id
    ), visited AS (SELECT DISTINCT id FROM path WHERE id IS NOT NULL)
    SELECT n.* FROM ${table} n WHERE n.timeline_id=$1 AND n.id IN (
      SELECT id FROM visited UNION SELECT c.left_id FROM ${table} c JOIN visited v ON c.timeline_id=$1 AND c.id=v.id
      UNION SELECT c.right_id FROM ${table} c JOIN visited v ON c.timeline_id=$1 AND c.id=v.id)`,
  pathParams: (keys) => [keys.map((k) => k.time)],
};

/** Stored band and definition of a resolved duration (or arc), as the full builder writes them. */
export function intervalPayload(band) {
  return {
    first: band.first,
    last: band.last,
    band: { ...band, metadata: durationOverview(band.metadata) },
    definition: { id: band.id, start: band.start, end: band.end, metadata: band.metadata },
  };
}

/** Augmented interval tree ordered by (start, ID in "C" order): durations or arcs. */
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
  compare: (key, n) => Q.parse(key.first).compare(Q.parse(n.first)) || order(key.id, n.band.id),
  create: (nodeId, payload) => ({ id: nodeId, ...payload }),
  merge: null,
  copy(to, from) {
    to.first = from.first;
    to.last = from.last;
    to.band = from.band;
    to.definition = from.definition;
  },
  summarize(n, l, r) {
    const extent = Q.parse(n.last).sub(Q.parse(n.first)).toString();
    n.min = l ? l.min : n.first;
    n.max = max(max(n.last, l?.max), r?.max);
    n.maxFirst = r ? r.maxFirst : n.first;
    n.count = 1 + (l?.count ?? 0) + (r?.count ?? 0);
    n.minExtent = min(min(extent, l?.minExtent), r?.minExtent);
    n.maxExtent = max(max(extent, l?.maxExtent), r?.maxExtent);
  },
  path: (table) => `WITH RECURSIVE path(first,eid,id) AS (
      SELECT f,e,$4::integer FROM unnest($2::text[],$3::text[]) AS k(f,e)
      UNION SELECT p.first,p.eid,CASE
        WHEN p.first::mpq<n.first_time OR (p.first::mpq=n.first_time AND p.eid COLLATE "C"<(n.band->>'id') COLLATE "C") THEN n.left_id
        WHEN p.first::mpq>n.first_time OR (p.first::mpq=n.first_time AND p.eid COLLATE "C">(n.band->>'id') COLLATE "C") THEN n.right_id END
      FROM path p JOIN ${table} n ON n.timeline_id=$1 AND n.id=p.id
    ), visited AS (SELECT DISTINCT id FROM path WHERE id IS NOT NULL)
    SELECT n.* FROM ${table} n WHERE n.timeline_id=$1 AND n.id IN (
      SELECT id FROM visited UNION SELECT c.left_id FROM ${table} c JOIN visited v ON c.timeline_id=$1 AND c.id=v.id
      UNION SELECT c.right_id FROM ${table} c JOIN visited v ON c.timeline_id=$1 AND c.id=v.id)`,
  pathParams: (keys) => [keys.map((k) => k.first), keys.map((k) => k.id)],
};

/** A tree whose rows are read on demand and written back by flush(). */
export class PersistentTree {
  constructor(client, spec, table, owner, root) {
    Object.assign(this, { client, spec, table, owner, root: id(root) });
    this.nodes = new Map();
    this.dirty = new Set();
    this.dropped = new Set();
    this.next = null;
  }
  get size() {
    return this.root === null ? Promise.resolve(0) : this.get(this.root).then((n) => n.count);
  }
  #add(rows) {
    for (const row of rows) {
      const n = this.spec.decode(row);
      if (!this.nodes.has(n.id) && !this.dropped.has(n.id)) this.nodes.set(n.id, n);
    }
  }
  async get(nodeId) {
    if (nodeId === null) return null;
    if (!this.nodes.has(nodeId)) {
      const { rows } = await this.client.query(
        `SELECT ${this.spec.select} FROM ${this.table} WHERE timeline_id=$1 AND id=$2`,
        [this.owner, nodeId],
      );
      this.#add(rows);
    }
    const n = this.nodes.get(nodeId);
    if (!n) throw new Error('Broken timeline index');
    return n;
  }
  /** Loads the saved paths towards several keys in one query; later reads hit the cache. */
  async prefetch(keys) {
    if (!keys.length || this.root === null) return;
    const sql = this.spec
      .path(this.table)
      .replace('SELECT n.* FROM', `SELECT ${this.spec.select} FROM`);
    const { rows } = await this.client.query(sql, [
      this.owner,
      ...this.spec.pathParams(keys),
      this.root,
    ]);
    this.#add(rows);
  }
  async #newId() {
    if (this.next === null) {
      const { rows } = await this.client.query(
        `SELECT coalesce(max(id),0) AS id FROM ${this.table} WHERE timeline_id=$1`,
        [this.owner],
      );
      this.next = Number(rows[0].id);
    }
    return ++this.next;
  }
  #touch(n) {
    this.dirty.add(n.id);
  }
  #drop(n) {
    this.nodes.delete(n.id);
    this.dirty.delete(n.id);
    this.dropped.add(n.id);
  }
  async insert(key, payload) {
    this.root = await this.#insert(this.root, key, payload);
  }
  /** Removes `key`; `keep(node)` may shrink the node instead and returns true to retain it. */
  async remove(key, keep = null) {
    this.root = await this.#remove(this.root, key, keep);
  }
  /** Replaces the payload of the node with `key` without moving it (its summaries are unchanged). */
  async replace(key, update) {
    let nodeId = this.root;
    while (nodeId !== null) {
      const n = await this.get(nodeId),
        c = this.spec.compare(key, n);
      if (c === 0) {
        update(n);
        this.#touch(n);
        return;
      }
      nodeId = c < 0 ? n.left : n.right;
    }
    throw new Error('Broken timeline index');
  }
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
  async #removeMin(nodeId) {
    const n = await this.get(nodeId);
    if (n.left === null) {
      this.#drop(n);
      return n.right;
    }
    n.left = await this.#removeMin(n.left);
    return this.#balance(n);
  }
  async #update(n) {
    const l = await this.get(n.left),
      r = await this.get(n.right);
    n.height = 1 + Math.max(l?.height ?? 0, r?.height ?? 0);
    this.spec.summarize(n, l, r);
    this.#touch(n);
  }
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
  async #rotateRight(n) {
    const l = await this.get(n.left);
    n.left = l.right;
    await this.#update(n);
    l.right = n.id;
    await this.#update(l);
    return l.id;
  }
  async #rotateLeft(n) {
    const r = await this.get(n.right);
    n.right = r.left;
    await this.#update(n);
    r.left = n.id;
    await this.#update(r);
    return r.id;
  }
  /** Writes changed nodes and deletes removed ones. */
  async flush() {
    if (this.dropped.size)
      await this.client.query(
        `DELETE FROM ${this.table} n USING unnest($2::bigint[]) k(id) WHERE n.timeline_id=$1 AND n.id=k.id`,
        [this.owner, [...this.dropped]],
      );
    const rows = [...this.dirty].map((nodeId) =>
      this.spec.encode(this.owner, this.nodes.get(nodeId)),
    );
    await upsertRows(this.client, this.table, this.spec.columns, this.spec.casts, rows);
    this.dirty.clear();
    this.dropped.clear();
  }
}
