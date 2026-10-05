import { TimelineIndex } from '../dist/core.mjs';
/** Build one immutable balanced tree for a revision. Saves are atomic snapshot replacements. */
export function indexedNodes(document) {
  const index = new TimelineIndex(document),
    entries = [...index.points],
    nodes = [];
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
        events: bucket,
      };
    nodes.push(n);
    return n;
  }
  const root = build(0, entries.length);
  return { root: root?.id ?? null, nodes, count: document.events.length };
}
