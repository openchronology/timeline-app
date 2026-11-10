// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// Measures' totals in the editor's index (#574): an AVL tree over distinct times whose nodes
// keep their own values and their subtree's totals, one exact rational per measure, so the
// total of any range is read in O(log n) and an edit changes the nodes on one path. Addition is
// associative with zero for an empty subtree, so rotations regroup sums without changing them.
import { Rational as Q } from 'rational-ordered-map';

interface Node {
  key: Q;
  /** The values at this time, one per measure. */
  own: Q[];
  /** The subtree's totals, one per measure. */
  total: Q[];
  height: number;
  left: Node | null;
  right: Node | null;
}
const height = (n: Node | null) => n?.height ?? 0;
const zero = (length: number) => Array.from({ length }, () => Q.zero);
const isZero = (values: readonly Q[]) => values.every((v) => v.numerator === 0n);
function plus(a: readonly Q[], b: readonly Q[]): Q[] {
  return a.map((v, i) => (b[i].numerator === 0n ? v : v.numerator === 0n ? b[i] : v.add(b[i])));
}
function node(key: Q, own: Q[], left: Node | null, right: Node | null): Node {
  let total = own;
  if (left) total = plus(left.total, total);
  if (right) total = plus(total, right.total);
  return { key, own, total, height: 1 + Math.max(height(left), height(right)), left, right };
}
function rotateLeft(n: Node): Node {
  const r = n.right!;
  return node(r.key, r.own, node(n.key, n.own, n.left, r.left), r.right);
}
function rotateRight(n: Node): Node {
  const l = n.left!;
  return node(l.key, l.own, l.left, node(n.key, n.own, l.right, n.right));
}
function balance(n: Node): Node {
  const factor = height(n.left) - height(n.right);
  if (factor > 1) {
    const left = height(n.left!.left) >= height(n.left!.right) ? n.left : rotateLeft(n.left!);
    return rotateRight(node(n.key, n.own, left, n.right));
  }
  if (factor < -1) {
    const right = height(n.right!.right) >= height(n.right!.left) ? n.right : rotateRight(n.right!);
    return rotateLeft(node(n.key, n.own, n.left, right));
  }
  return n;
}
function removeMin(n: Node): [Node, Node | null] {
  if (!n.left) return [n, n.right];
  const [min, left] = removeMin(n.left);
  return [min, balance(node(n.key, n.own, left, n.right))];
}
/** `n` with `delta` added at `key`; a node whose values all become zero is removed. */
function add(n: Node | null, key: Q, delta: Q[]): Node | null {
  if (!n) return isZero(delta) ? null : node(key, delta, null, null);
  const c = key.compare(n.key);
  if (c < 0) return balance(node(n.key, n.own, add(n.left, key, delta), n.right));
  if (c > 0) return balance(node(n.key, n.own, n.left, add(n.right, key, delta)));
  const own = plus(n.own, delta);
  if (!isZero(own)) return node(n.key, own, n.left, n.right);
  if (!n.left) return n.right;
  if (!n.right) return n.left;
  const [min, right] = removeMin(n.right);
  return balance(node(min.key, min.own, n.left, right));
}
/** A balanced tree of `entries`, sorted by key and distinct, in linear time. */
function build(entries: [Q, Q[]][], from: number, to: number): Node | null {
  if (from >= to) return null;
  const mid = (from + to) >> 1;
  return node(
    entries[mid][0],
    entries[mid][1],
    build(entries, from, mid),
    build(entries, mid + 1, to),
  );
}

/**
 * The totals of `names`' values by time. Values are added and taken away (`add` with the
 * negated values), so a moment that moves or changes is one subtraction and one addition.
 */
export class MeasureTree {
  #root: Node | null = null;
  constructor(readonly names: readonly string[]) {}
  /** A tree of `entries` (time and values, in any order; times may repeat). */
  static of(names: readonly string[], entries: Iterable<[Q, Q[]]>): MeasureTree {
    const tree = new MeasureTree(names);
    const byTime = new Map<string, [Q, Q[]]>();
    for (const [time, values] of entries) {
      const key = time.toString(),
        found = byTime.get(key);
      byTime.set(key, found ? [found[0], plus(found[1], values)] : [time, values]);
    }
    const sorted = [...byTime.values()]
      .filter(([, values]) => !isZero(values))
      .sort((a, b) => a[0].compare(b[0]));
    tree.#root = build(sorted, 0, sorted.length);
    return tree;
  }
  /** Adds `values` (one per name) at `time`. */
  add(time: Q, values: Q[]): void {
    if (!isZero(values)) this.#root = add(this.#root, time, values);
  }
  /** Takes `values` away at `time`. */
  remove(time: Q, values: Q[]): void {
    this.add(
      time,
      values.map((v) => v.neg()),
    );
  }
  get height(): number {
    return height(this.#root);
  }
  /** The totals of everything, one per name. */
  get total(): Q[] {
    return this.#root ? this.#root.total : zero(this.names.length);
  }
  /**
   * The totals from `lower` to `upper` (both included unless said otherwise; either may be
   * left open), one per name, from whole subtrees: O(log n) nodes.
   */
  sum(
    lower?: Q,
    upper?: Q,
    {
      includeLower = true,
      includeUpper = true,
    }: { includeLower?: boolean; includeUpper?: boolean } = {},
  ): Q[] {
    const above = (key: Q) =>
      lower === undefined || (includeLower ? key.compare(lower) >= 0 : key.compare(lower) > 0);
    const below = (key: Q) =>
      upper === undefined || (includeUpper ? key.compare(upper) <= 0 : key.compare(upper) < 0);
    let result = zero(this.names.length);
    // Descends to where the range splits, then takes whole subtrees down each side.
    let n = this.#root;
    while (n && !(above(n.key) && below(n.key))) n = above(n.key) ? n.left : n.right;
    if (!n) return result;
    result = plus(result, n.own);
    for (let left = n.left; left;)
      if (above(left.key)) {
        result = plus(result, left.own);
        if (left.right) result = plus(result, left.right.total);
        left = left.left;
      } else left = left.right;
    for (let right = n.right; right;)
      if (below(right.key)) {
        result = plus(result, right.own);
        if (right.left) result = plus(result, right.left.total);
        right = right.right;
      } else right = right.left;
    return result;
  }
  /** Totals as an entity's values are written: canonical text by name, zeros left out. */
  named(totals: readonly Q[]): Record<string, string> | undefined {
    const result: Record<string, string> = {};
    totals.forEach((v, i) => {
      if (v.numerator !== 0n)
        result[this.names[i]] = v.denominator === 1n ? v.numerator.toString() : v.toString();
    });
    return Object.keys(result).length ? result : undefined;
  }
}
