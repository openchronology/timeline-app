// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// Relationships: undirected, canonical links; the index following them; arcs, separations,
// sparse edits and merges.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  Q,
  TimelineIndex,
  Viewport,
  validateDocument,
  filterDocument,
  arcPath,
  arrowheadPath,
  crossArcPath,
  crossArrowheadPath,
} from '../dist/core.mjs';
import { RemoteWorkspace } from '../dist/remote-cache.mjs';
import { applyPatch } from '../server/store.mjs';
import { rebaseDocument } from '../server/merge.mjs';
const doc = () => ({
  format: 'openchronology',
  version: 1,
  title: 'Links',
  description: '',
  events: [
    { id: 'a', time: '0/1', metadata: { title: 'A' } },
    { id: 'b', time: '100/1', metadata: { title: 'B' } },
    { id: 'c', time: '200/1', metadata: { title: 'C' } },
    { id: 'lone', time: '300/1', metadata: { title: 'Lone' } },
  ],
  durations: [{ id: 'x', start: '50/1', end: '60/1', metadata: { title: 'X' } }],
  relationships: [
    { a: { moment: 'a' }, b: { duration: 'x' } },
    { a: { moment: 'b' }, b: { moment: 'a' } },
    { a: { moment: 'b' }, b: { moment: 'c' } },
    { a: { moment: 'a' }, b: { moment: 'b' } },
  ],
});
const view = new Viewport(Q.from(-10n), Q.from(410n));
const arcs = (frame) => frame.edges.map((e) => `${e.id} ${e.first} ${e.last}`).sort();
test('relationships are undirected, canonical and deduplicated; self and dangling links fail', () => {
  const d = validateDocument(doc());
  assert.deepEqual(d.relationships, [
    { a: { duration: 'x' }, b: { moment: 'a' } },
    { a: { moment: 'a' }, b: { moment: 'b' } },
    { a: { moment: 'b' }, b: { moment: 'c' } },
  ]);
  for (const bad of [
    { a: { moment: 'a' }, b: { moment: 'a' } },
    { a: { moment: 'a' }, b: { moment: 'absent' } },
    { a: { moment: 'a' }, b: { event: 'b' } },
    { a: { moment: 'a' } },
    { a: { moment: 'a' }, b: { moment: 'b' }, label: 'extra' },
  ])
    assert.throws(() => validateDocument({ ...doc(), relationships: [bad] }));
  // Sparse documents may link entities they do not carry.
  assert.doesNotThrow(() => validateDocument({ ...doc(), events: [], durations: [] }, true));
});
test('the index follows links both ways, transitively, and keeps them through an undone delete', () => {
  const index = new TimelineIndex(validateDocument(doc()));
  assert.deepEqual([...index.relatedTo({ moment: 'a' })].sort(), ['d:x', 'm:b']);
  assert.deepEqual([...index.relatedTo({ moment: 'a' }, Infinity)].sort(), ['d:x', 'm:b', 'm:c']);
  assert.deepEqual([...index.relatedTo({ moment: 'lone' })], []);
  index.relate({ moment: 'lone' }, { moment: 'c' });
  assert.equal(index.relatedTo({ moment: 'a' }, Infinity).size, 4);
  assert.throws(() => index.relate({ moment: 'a' }, { moment: 'a' }), /itself/);
  index.unrelate({ moment: 'c' }, { moment: 'lone' });
  assert.equal(index.relatedTo({ moment: 'lone' }).size, 0);
  // Deleting a moment hides its links; restoring it brings them back.
  index.delete('b');
  assert.deepEqual([...index.relatedTo({ moment: 'a' })], ['d:x']);
  assert.equal(index.document().relationships.length, 1);
  index.put({ id: 'b', time: '100/1', metadata: { title: 'B' } });
  assert.equal(index.document().relationships.length, 3);
});
test('arcs run between moment times and duration starts; short arcs collapse', () => {
  const index = new TimelineIndex(validateDocument(doc()));
  assert.deepEqual(arcs(index.frame(view, 1000, 1)), [
    'd:x~m:a 0/1 50/1',
    'm:a~m:b 0/1 100/1',
    'm:b~m:c 100/1 200/1',
  ]);
  // 60 px over 410 units ≈ 24.6 units: the 50-unit arc stays, at 150 px it collapses.
  assert.equal(index.frame(view, 1000, 150).edges.length, 2);
  index.put({ id: 'c', time: '400/1', metadata: {} });
  assert(arcs(index.frame(view, 1000, 1)).includes('m:b~m:c 100/1 400/1'));
});
test('separations by relationship take the entity with direct or all connected relations', () => {
  const d = validateDocument(doc());
  const ids = (filter) => filterDocument(d, filter).events.map((e) => e.id);
  assert.deepEqual(ids({ related: { moment: 'a' }, depth: 'direct', mode: 'any' }), ['a', 'b']);
  assert.deepEqual(ids({ related: { moment: 'a' }, depth: 'all', mode: 'any' }), ['a', 'b', 'c']);
  assert.deepEqual(ids({ related: { moment: 'a' }, depth: 'all', mode: 'none' }), ['lone']);
  const near = filterDocument(d, { related: { moment: 'a' }, depth: 'direct', mode: 'any' });
  assert.deepEqual(
    near.durations.map((x) => x.id),
    ['x'],
  );
  // Links survive only within a side.
  assert.equal(near.relationships.length, 2);
});
test('sparse link edits overlay arcs, save as patches and cascade deleted entities', () => {
  const d = validateDocument(doc());
  const saved = new TimelineIndex(d).frame(view, 1000, 1);
  const remote = new RemoteWorkspace(d);
  remote.load(d.events[3]);
  remote.load(d.events[2]);
  remote.relate({ moment: 'lone' }, { moment: 'c' });
  remote.unrelate({ moment: 'a' }, { duration: 'x' });
  remote.put({ ...d.events[2], time: '250/1' });
  const overlaid = arcs(remote.overlay(saved, view, Q.from(1n, 1000n)));
  assert.deepEqual(overlaid, [
    'm:a~m:b 0/1 100/1',
    'm:b~m:c 100/1 250/1',
    'm:c~m:lone 250/1 300/1',
  ]);
  // The editor always loads a moment before deleting it.
  remote.load(d.events[1]);
  remote.delete('b');
  const patch = remote.patch();
  assert.equal(patch.relationshipChanges.length, 2);
  for (const result of [remote.apply(d), applyPatch(d, patch)])
    assert.deepEqual(validateDocument(result).relationships, [
      { a: { moment: 'c' }, b: { moment: 'lone' } },
    ]);
  const sent = remote.beginSave();
  remote.relate({ moment: 'a' }, { duration: 'x' });
  remote.accepted(sent);
  assert.deepEqual([...remote.relationshipChanges.keys()], ['d:x~m:a']);
});
test('merges treat links as a set and drop links to entities the merge removes', () => {
  const base = validateDocument(doc());
  const proposal = structuredClone(base);
  proposal.relationships.push({ a: { moment: 'c' }, b: { moment: 'lone' } });
  const upstream = structuredClone(base);
  upstream.events = upstream.events.filter((e) => e.id !== 'b');
  upstream.relationships = upstream.relationships.filter(
    (r) => r.a.moment !== 'b' && r.b.moment !== 'b',
  );
  const merged = rebaseDocument(base, proposal, upstream);
  assert.deepEqual(merged.relationships, [
    { a: { duration: 'x' }, b: { moment: 'a' } },
    { a: { moment: 'c' }, b: { moment: 'lone' } },
  ]);
});

test('an arc is drawn only over the stage, as the same parabola, wherever its ends are', () => {
  /** A drawn arc's height at x: its path is one quadratic with its control midway in x. */
  const at = (d, x) => {
    const [x0, y0, , cy, x1, y1] = d.match(/-?[\d.e+]+/g).map(Number);
    const t = (x - x0) / (x1 - x0);
    return (1 - t) ** 2 * y0 + 2 * t * (1 - t) * cy + t ** 2 * y1;
  };
  const parabola = (xa, xb, x) => {
    const t = (x - xa) / (xb - xa);
    return 192 - 4 * 150 * t * (1 - t);
  };
  // Wholly in view, it is the arc as before: ends on the axis, its middle `lift` over it.
  const whole = arcPath(100, 300, 192, 40, -64, 464);
  assert.equal(whole, 'M 100 192 Q 200 112 300 192');
  // Ends twenty million pixels apart, panned: only the stage's part, at the parabola's heights.
  for (const shift of [0, 7.25, 25, 333.5]) {
    const xa = -1e7 + shift,
      xb = 1e7 + shift;
    const d = arcPath(xa, xb, 192, 150, -64, 464);
    assert(
      d.match(/-?[\d.e+]+/g).every((v) => Math.abs(Number(v)) < 1000),
      d,
    );
    for (const x of [-64, 0, 200, 464])
      assert(Math.abs(at(d, x) - parabola(xa, xb, x)) < 1e-6, `${shift}: ${x}`);
  }
  // Either order of ends; nothing when the arc is entirely off screen.
  assert.equal(arcPath(300, 100, 192, 40, -64, 464), whole);
  assert.equal(arcPath(1000, 2000, 192, 40, -64, 464), '');
  assert.equal(arcPath(-2000, -1000, 192, 40, -64, 464), '');
});

test('an arrowhead sits on its arc near the end, pointing into it along the tangent (#326)', () => {
  const parabola = (xa, xb, lift, x) => {
    const t = (x - Math.min(xa, xb)) / Math.abs(xb - xa);
    return 192 - 4 * lift * t * (1 - t);
  };
  for (const [x, other, lift] of [
    [100, 300, 78],
    [300, 100, 78],
    [50, 90, 30],
    [0, 4000, 150],
  ]) {
    const d = arrowheadPath(x, other, 192, lift);
    assert.match(d, /^M [-\d. ]+ L [-\d. ]+ L [-\d. ]+ Z$/);
    const [tx, ty, ax, ay, bx, by] = d.match(/-?[\d.]+/g).map(Number);
    // The tip is on the arc, about 12 pixels from the end, toward the other end.
    assert(Math.abs(ty - parabola(x, other, lift, tx)) < 0.05, d);
    assert(Math.abs(Math.hypot(tx - x, ty - 192) - 12) < 1.5, d);
    assert(Math.sign(tx - x) === Math.sign(other - x), d);
    // It points into the end: from the middle of its base, along the tangent there.
    const mx = (ax + bx) / 2,
      my = (ay + by) / 2;
    assert(Math.abs(Math.hypot(tx - mx, ty - my) - 9) < 0.05, d);
    assert(Math.abs(Math.hypot(ax - bx, ay - by) - 9) < 0.05, d);
    const slope =
      (parabola(x, other, lift, tx + 1e-4) - parabola(x, other, lift, tx - 1e-4)) / 2e-4;
    assert(Math.abs((ty - my) / (tx - mx) - slope) < 0.02, d);
    assert(Math.sign(x - tx) === Math.sign(tx - mx) && ty >= my, d);
  }
  // Mirrored at the other end of the same arc.
  const [l, r] = [arrowheadPath(100, 300, 192, 78), arrowheadPath(300, 100, 192, 78)].map((d) =>
    d.match(/-?[\d.]+/g).map(Number),
  );
  // Its tip, and its corners (in the other order, as the triangle is mirrored).
  for (const [i, j] of [
    [0, 0],
    [2, 4],
    [4, 2],
  ]) {
    assert(Math.abs(l[i] - (400 - r[j])) < 0.02);
    assert(Math.abs(l[i + 1] - r[j + 1]) < 0.02);
  }
  assert.equal(arrowheadPath(100, 100, 192, 18), '');
});

test('an arc between separated tracks crosses the gap as one S curve, drawn only over the stage (#415)', () => {
  const numbers = (d) => d.match(/-?[\d.e+]+/g).map(Number);
  /** The curve both ends describe: smoothstep in x, a cubic in y, vertical at both ends. */
  const point = (xa, ya, xb, yb, t) => ({
    x: xa + (xb - xa) * t * t * (3 - 2 * t),
    y: ya * (1 - t) ** 3 + 3 * ((ya + yb) / 2) * t * (1 - t) + yb * t ** 3,
  });
  const cubic = ([x0, y0, x1, y1, x2, y2, x3, y3], t) => ({
    x: (1 - t) ** 3 * x0 + 3 * t * (1 - t) ** 2 * x1 + 3 * t * t * (1 - t) * x2 + t ** 3 * x3,
    y: (1 - t) ** 3 * y0 + 3 * t * (1 - t) ** 2 * y1 + 3 * t * t * (1 - t) * y2 + t ** 3 * y3,
  });
  // Wholly in view: from one axis to the other, leaving and arriving vertically.
  const whole = crossArcPath(100, 192, 300, 532, -64, 464);
  assert.equal(whole, 'M 100 192 C 100 362 300 362 300 532');
  // Ends far apart and panned: only the stage's part, on the same curve, with small numbers.
  for (const [xa, xb] of [
    [-1e7, 1e7 + 25],
    [-5e6, 300],
    [200, 9e6],
    [1e7, -1e7],
  ]) {
    const d = crossArcPath(xa, 192, xb, 532, -64, 464);
    const n = numbers(d);
    assert(
      n.every((v) => Math.abs(v) < 2000),
      d,
    );
    assert(Math.min(n[0], n[6]) >= -64.01 && Math.max(n[0], n[6]) <= 464.01, d);
    // Points along the drawn piece lie on the whole curve: at their x, the curve's y.
    for (const t of [0, 0.3, 0.7, 1]) {
      const p = cubic(n, t);
      let lo = 0,
        hi = 1;
      const rising = xb > xa;
      for (let i = 0; i < 80; i++) {
        const mid = (lo + hi) / 2;
        if (point(xa, 192, xb, 532, mid).x < p.x === rising) lo = mid;
        else hi = mid;
      }
      assert(Math.abs(point(xa, 192, xb, 532, lo).y - p.y) < 0.05, `${d} at ${t}`);
    }
  }
  // Ends at one time: a vertical line; nothing when the curve is off screen.
  assert.equal(crossArcPath(50, 192, 50, 532, -64, 464), 'M 50 192 C 50 362 50 362 50 532');
  assert.equal(crossArcPath(1000, 192, 2000, 532, -64, 464), '');
  assert.equal(crossArcPath(-2000, 532, -1000, 192, -64, 464), '');
});

test('an arrowhead on an arc between tracks sits near its end and points into it (#415)', () => {
  for (const [x, y, ox, oy] of [
    [100, 192, 300, 532],
    [300, 532, 100, 192],
    [100, 192, 100, 532],
    [0, 532, 5000, 192],
  ]) {
    const d = crossArrowheadPath(x, y, ox, oy);
    assert.match(d, /^M [-\d. ]+ L [-\d. ]+ L [-\d. ]+ Z$/);
    const [tx, ty, ax, ay, bx, by] = d.match(/-?[\d.]+/g).map(Number);
    // The tip is 12 pixels from the end, toward the other track; it points into the end,
    // nearly vertically when the ends are close in time, since the curve leaves the axis
    // upright.
    assert(Math.abs(Math.hypot(tx - x, ty - y) - 12) < 0.05, d);
    assert(Math.sign(ty - y) === Math.sign(oy - y), d);
    const mx = (ax + bx) / 2,
      my = (ay + by) / 2;
    assert(Math.abs(Math.hypot(tx - mx, ty - my) - 9) < 0.05, d);
    assert(Math.abs(Math.hypot(ax - bx, ay - by) - 9) < 0.05, d);
    assert(Math.sign(my - ty) === Math.sign(oy - y), d);
    if (Math.abs(ox - x) < 1000) assert(Math.abs(tx - mx) < 3, d);
  }
  assert.equal(crossArrowheadPath(100, 192, 100, 200), '');
});
