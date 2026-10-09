// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// The browser's duration summaries with start-range pruning return exactly what the
// previous traversal (copied below, unchanged) returned.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Q, durationTree, durationSummaries } from '../dist/core.mjs';

/** The traversal before start-range pruning (src/durations.ts at issue #35). */
function previousSummaries(root, lower, upper, threshold) {
  const out = [];
  let anchor = null,
    last = null,
    count = 0,
    single;
  const close = () => {
    if (anchor && last)
      out.push({
        first: anchor.toString(),
        last: last.toString(),
        count,
        ...(count === 1 && single ? { band: single } : {}),
      });
    anchor = last = null;
    count = 0;
    single = undefined;
  };
  const join = (first, end, n, band) => {
    if (anchor && first.sub(anchor).compare(threshold) >= 0) close();
    if (!anchor) anchor = first;
    if (!last || end.compare(last) > 0) last = end;
    count += n;
    single = n === 1 && count === 1 ? band : undefined;
  };
  const stack = root ? [{ node: root, point: false }] : [];
  while (stack.length) {
    const { node: n, point } = stack.pop();
    if (point) {
      const first = Q.parse(n.band.first),
        end = Q.parse(n.band.last);
      if (
        end.compare(lower) >= 0 &&
        first.compare(upper) <= 0 &&
        end.sub(first).compare(threshold) < 0
      )
        join(first, end, 1, n.band);
      continue;
    }
    if (n.max.compare(lower) < 0 || n.min.compare(upper) > 0) continue;
    if (n.minExtent.compare(threshold) >= 0) continue;
    const whole =
      n.maxExtent.compare(threshold) < 0 &&
      n.min.compare(lower) >= 0 &&
      n.maxFirst.compare(upper) <= 0;
    const base = anchor && n.min.sub(anchor).compare(threshold) < 0 ? anchor : n.min;
    if (whole && n.maxFirst.sub(base).compare(threshold) < 0) {
      join(n.min, n.max, n.count, n.count === 1 ? n.band : undefined);
      continue;
    }
    if (n.right) stack.push({ node: n.right, point: false });
    stack.push({ node: n, point: true });
    if (n.left) stack.push({ node: n.left, point: false });
  }
  close();
  return out;
}

let seed = 35;
const random = (n) => {
  seed = (seed * 1103515245 + 12345) % 2147483648;
  return Math.floor((seed / 2147483648) * n);
};
const time = () =>
  random(12) === 0
    ? `${1 + random(9)}123456789012345678901234567/${1 + random(7)}`
    : Q.from(BigInt(random(3300) - 300), BigInt([1, 2, 4, 8][random(4)])).toString();

test('pruned duration summaries match the previous traversal', () => {
  let compared = 0,
    groups = 0;
  for (let round = 0; round < 20; round++) {
    const moments = new Map(Array.from({ length: 30 }, (_, i) => ['m' + i, time()]));
    const durations = Array.from({ length: 40 + random(200) }, (_, i) => {
      const k = BigInt(random(26400) - 2400);
      const at = (n) => Q.from(n, 8n).toString();
      const roll = random(10);
      return {
        id: 'd' + i,
        start: roll < 7 ? at(k) : roll < 8 ? { moment: 'm' + random(30) } : time(),
        end:
          roll < 6
            ? at(k + BigInt(random(120)))
            : roll < 7
              ? at(k + BigInt(800 + random(20000)))
              : roll < 9
                ? at(k)
                : { moment: 'm' + random(30) },
        metadata: { title: 'D' + i },
      };
    });
    const root = durationTree(durations, (m) => moments.get(m));
    const bands = [];
    const walk = (n) => n && (bands.push(n.band), walk(n.left), walk(n.right));
    walk(root);
    const times = bands.flatMap((b) => [b.first, b.last]);
    const extents = bands.map((b) => Q.parse(b.last).sub(Q.parse(b.first)).toString());
    for (let w = 0; w < 50; w++) {
      const pick = (list) => list[random(list.length)];
      let [a, b] = random(2) ? [pick(times), pick(times)] : [time(), time()];
      if (Q.parse(a).compare(Q.parse(b)) > 0) [a, b] = [b, a];
      const lower = Q.parse(a),
        upper = Q.parse(b);
      const roll = random(6);
      const threshold =
        roll < 2 && extents.length
          ? Q.parse(pick(extents))
          : roll === 2
            ? Q.from(1n, BigInt(1 + random(64)))
            : roll === 3
              ? Q.from(BigInt(1 + random(4000)))
              : upper.sub(lower).div(Q.from(BigInt(1 + random(64))));
      const expected = previousSummaries(root, lower, upper, threshold);
      assert.deepEqual(
        durationSummaries(root, lower, upper, threshold),
        expected,
        `window ${a}..${b} threshold ${threshold.toString()}`,
      );
      compared++;
      groups += expected.length;
    }
  }
  assert.equal(compared, 1000);
  assert(groups > 2000, `the windows produced summaries (${groups})`);
});
