// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// Builds a perfectly balanced moment tree from a whole document, for rebuilding a timeline's
// index (Store.replace); incremental saves (avl.mjs) then change it in place.
import { TimelineIndex } from '../dist/core.mjs';
/**
 * Builds a perfectly balanced moment tree, which is also a valid AVL tree: incremental saves
 * (server/avl.mjs) continue from it. Node IDs are in-order positions only initially.
 * Returns `{root, nodes, count}`: the root's ID (null when empty), the nodes in the shape
 * MOMENT_TREE encodes (plus each node's moments as `events`), and the moment count.
 */
export function indexedNodes(document) {
  const index = new TimelineIndex(document),
    entries = [...index.points],
    nodes = [];
  /**
   * Builds the subtree of entries [start, end): the middle entry is its root, so the two
   * halves differ in size by at most one and the heights of every node's subtrees by at
   * most one. Children are built first, so each node's summaries come from theirs. ID
   * mid + 1 is the entry's position, unique and 1-based.
   */
  function build(start, end) {
    if (start >= end) return null;
    const mid = Math.floor((start + end) / 2),
      left = build(start, mid),
      right = build(mid + 1, end);
    const [time, bucket] = entries[mid],
      n = {
        id: mid + 1,
        time: time.toString(),
        first: left?.first ?? time.toString(),
        last: right?.last ?? time.toString(),
        left: left?.id ?? null,
        right: right?.id ?? null,
        firstId: left?.firstId ?? mid + 1,
        bucketCount: bucket.length,
        count: (left?.count ?? 0) + bucket.length + (right?.count ?? 0),
        distinct: (left?.distinct ?? 0) + 1 + (right?.distinct ?? 0),
        height: 1 + Math.max(left?.height ?? 0, right?.height ?? 0),
        ids: bucket.map((e) => e.id),
        events: bucket,
      };
    nodes.push(n);
    return n;
  }
  const root = build(0, entries.length);
  return { root: root?.id ?? null, nodes, count: document.events.length };
}
