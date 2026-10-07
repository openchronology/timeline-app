// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  Q,
  TimelineIndex,
  Viewport,
  validateDocument,
  parseTime,
  parseTimestamp,
  printTimestamp,
  demo,
  wheelZoomFactor,
} from '../dist/core.mjs';
import { indexedNodes } from '../server/tree.mjs';
test('unnamed and blank-named moments stay unnamed in timeline frames', () => {
  const doc = validateDocument({
    format: 'openchronology',
    version: 1,
    title: 'Optional names',
    description: '',
    events: [
      { id: 'missing', time: '0/1', metadata: { description: 'Notes without a title' } },
      { id: 'blank', time: '10/1', metadata: { title: '' } },
    ],
  });
  const index = new TimelineIndex(doc);
  assert.deepEqual(
    index.frame(new Viewport(Q.parse('-1'), Q.parse('12')), 1000, 1).groups.map((g) => g.title),
    ['', ''],
  );
  assert.equal(index.byId.size, 2);
});

test('JSON round trips canonical exact times and keeps coincident events', () => {
  const document = validateDocument({
    format: 'openchronology',
    version: 1,
    title: 'Moments',
    description: '',
    events: [
      {
        id: 'a',
        time: '2/4',
        metadata: { title: 'Half', nested: { text: '<script>not HTML</script>' } },
      },
      { id: 'b', time: '0.5', metadata: { title: 'Also half' } },
    ],
  });
  const index = new TimelineIndex(document);
  assert.equal(index.points.size, 1);
  assert.equal(index.points.entryCount, 2n);
  assert.equal(index.document().events[0].time, '1/2');
  assert.deepEqual(
    validateDocument(JSON.parse(JSON.stringify(index.document()))),
    index.document(),
  );
  index.put({ id: 'a', time: '3/4', metadata: { title: 'Moved' } });
  assert.equal(index.points.entryCount, 2n);
  assert.equal(index.points.size, 2);
  assert.equal(index.points.get(Q.parse('1/2'))[0].id, 'b');
  index.delete('b');
  assert.equal(index.points.size, 1);
  assert.throws(
    () => validateDocument({ ...document, events: [{ id: 'a', time: 0.5, metadata: {} }] }),
    /string/,
  );
  assert.throws(
    () => validateDocument({ ...document, events: [document.events[0], document.events[0]] }),
    /unique/,
  );
});
test('viewport arithmetic remains exact at huge offsets and tiny scales', () => {
  const offset = Q.from(10n ** 1200n),
    tiny = Q.from(1n, 10n ** 1100n),
    view = new Viewport(offset, tiny.mul(Q.from(100n)));
  const time = offset.add(tiny.mul(Q.from(25n)));
  assert.equal(view.x(time, 800), 200);
  assert(view.at(200, 800).equals(time));
  const zoomed = view.zoom(200, 800, Q.from(1n, 4n));
  assert(zoomed.at(200, 800).equals(time));
  assert(view.pinch(200, 300, 800, Q.from(1n, 2n)).at(300, 800).equals(time));
  assert(view.pan(80, 800).left.equals(offset.sub(tiny.mul(Q.from(10n)))));
  assert(view.threshold(800, 24).equals(tiny.mul(Q.from(3n))));
});
test('camera rounding stays below a millionth of a pixel at arbitrary absolute scales', () => {
  const huge = Q.from(10n ** 1200n),
    tiny = Q.from(1n, 10n ** 1100n);
  for (const original of [
    new Viewport(Q.from(-17n, 23n), Q.from(28n, 3n)),
    new Viewport(huge.add(Q.from(1n, 3n)), tiny),
    new Viewport(huge.neg().sub(Q.from(1n, 7n)), tiny),
    new Viewport(tiny.neg(), huge),
    new Viewport(Q.from(1n, 11n), Q.from(1n << 70n)),
  ]) {
    for (const width of [1, 997, 997.125, 4096]) {
      const rounded = original.rasterize(width),
        tolerance = original.span.div(Q.from(BigInt(Math.ceil(width)) << 20n));
      for (const error of [
        rounded.left.sub(original.left).abs(),
        rounded.right.sub(original.right).abs(),
        rounded.span.sub(original.span).abs(),
      ])
        assert(error.compare(tolerance) <= 0);
      assert(rounded.span.compare(Q.zero) > 0);
      for (const bound of [rounded.left, rounded.span, rounded.right]) {
        const denominator = bound.denominator;
        assert.equal(denominator & (denominator - 1n), 0n);
      }
    }
  }
  assert.throws(() => new Viewport().rasterize(Infinity), /screen width/);
});
test('repeated wheel, button, pan and pinch gestures retain bounded camera precision', () => {
  const width = 997,
    pixel = 273.125,
    original = new Viewport(),
    digits = (v) => Math.max(...[v.left, v.right, v.span].map((q) => q.toString().length));
  for (const delta of [0, 0.125, 1, 120, 500, 4000])
    assert(wheelZoomFactor(delta).mul(wheelZoomFactor(-delta)).equals(Q.one));
  let view = original,
    maximum = 0;
  for (let i = 0; i < 5000; i++) {
    const delta = [0.125, 120, 500][i % 3];
    view = view.zoom(pixel, width, wheelZoomFactor(-delta)).rasterize(width);
    view = view.zoom(pixel, width, wheelZoomFactor(delta)).rasterize(width);
    maximum = Math.max(maximum, digits(view));
  }
  assert(maximum < 64, `Wheel history grew camera values to ${maximum} characters`);
  const drift = original.span.div(Q.from(BigInt(width) * 100n)); // 0.01 pixel total.
  assert(view.left.sub(original.left).abs().compare(drift) < 0);
  assert(view.right.sub(original.right).abs().compare(drift) < 0);
  for (let i = 0; i < 1000; i++) {
    view = view.zoom(pixel, width, Q.from(4n, 5n)).rasterize(width);
    view = view.zoom(pixel, width, Q.from(5n, 4n)).rasterize(width);
    view = view.pan(17.125, width).rasterize(width);
    view = view.pan(-17.125, width).rasterize(width);
    view = view.pinch(201.5, 203.25, width, Q.from(131n, 157n)).rasterize(width);
    view = view.pinch(203.25, 201.5, width, Q.from(157n, 131n)).rasterize(width);
    assert(digits(view) < 64);
  }
});
test('zooming can gain visible precision without changing exact timeline events or explicit bounds', () => {
  const offset = Q.from(10n ** 1200n),
    tiny = Q.from(1n, 10n ** 1100n),
    document = validateDocument({
      format: 'openchronology',
      version: 1,
      title: 'Exact coordinates',
      description: '',
      events: [
        { id: 'a', time: offset.toString(), metadata: {} },
        { id: 'b', time: offset.add(tiny).toString(), metadata: {} },
      ],
    }),
    index = new TimelineIndex(document),
    explicit = new Viewport(offset.sub(tiny), tiny.mul(Q.from(4n)));
  const initial = explicit.rasterize(997);
  let view = explicit;
  for (let i = 0; i < 100; i++) {
    view = view.zoom(391.125, 997, wheelZoomFactor(-120)).rasterize(997);
    view = view.zoom(391.125, 997, wheelZoomFactor(120)).rasterize(997);
  }
  assert(view.left.toString().length <= initial.left.toString().length + 16);
  assert(view.span.toString().length <= initial.span.toString().length + 16);
  assert.equal(index.frame(view, 997, 24).groups.length, 2);
  assert.deepEqual(index.document(), document);
  assert(explicit.left.equals(offset.sub(tiny)));
  assert(explicit.span.equals(tiny.mul(Q.from(4n))));
  const coarse = new Viewport(Q.zero, Q.one).rasterize(997),
    zoomed = coarse.zoom(0, 997, Q.from(1n, 1n << 300n)).rasterize(997);
  assert(zoomed.span.equals(Q.from(1n, 1n << 300n)));
  assert(zoomed.span.denominator.toString(2).length > 300);
});
test('large coincident buckets load once, preserve ID order, and refine edits exactly', () => {
  const events = Array.from({ length: 10000 }, (_, i) => ({
    id: `same-${String(9999 - i).padStart(5, '0')}`,
    time: i % 2 ? '2/4' : '1/2',
    metadata: { title: `Moment ${i}` },
  }));
  const index = new TimelineIndex({
    format: 'openchronology',
    version: 1,
    title: 'Coincident',
    description: '',
    events,
  });
  assert.equal(index.points.size, 1);
  assert.equal(index.points.entryCount, 10000n);
  assert.equal(index.points.get(Q.parse('1/2'))[0].id, 'same-00000');
  const frame = index.frame(new Viewport(Q.zero, Q.one), 800, 24);
  assert.equal(frame.groups[0].count, '10000');
  assert(frame.visitedNodes < 10);
  index.put({ id: 'same-00000', time: '3/4', metadata: { title: 'Moved' } });
  assert.equal(index.points.entryCount, 10000n);
  assert.equal(index.points.get(Q.parse('1/2')).length, 9999);
});
test('screen thresholds break summaries apart, with strict equality and duplicate buckets', () => {
  const index = new TimelineIndex(
    validateDocument({
      format: 'openchronology',
      version: 1,
      title: 'Dense',
      description: '',
      events: [
        { id: 'a', time: '0', metadata: {} },
        { id: 'b', time: '1/1000', metadata: {} },
        { id: 'c', time: '1/1000', metadata: {} },
      ],
    }),
  );
  assert.deepEqual(
    index.frame(new Viewport(Q.zero, Q.one), 100, 24).groups.map((g) => g.count),
    ['3'],
  );
  const zoomed = new Viewport(Q.zero, Q.from(1n, 240n));
  assert.deepEqual(
    index.frame(zoomed, 100, 24).groups.map((g) => g.count),
    ['1', '2'],
  );
  assert.equal(index.eventsBetween('1/1000', '1/1000').length, 2);
});
test('balanced PostgreSQL snapshots cache exact counts and use only integer node IDs', () => {
  const document = demo(true),
    tree = indexedNodes(document),
    nodes = new Map(tree.nodes.map((n) => [n.id, n]));
  function visit(id) {
    if (id === null) return { height: 0, count: 0, distinct: 0 };
    const n = nodes.get(id),
      left = visit(n.left),
      right = visit(n.right);
    assert(Math.abs(left.height - right.height) <= 1);
    assert.equal(n.count, left.count + n.bucketCount + right.count);
    assert.equal(n.distinct, left.distinct + 1 + right.distinct);
    if (n.left) assert(Q.parse(nodes.get(n.left).last).compare(Q.parse(n.time)) < 0);
    if (n.right) assert(Q.parse(nodes.get(n.right).first).compare(Q.parse(n.time)) > 0);
    return {
      height: 1 + Math.max(left.height, right.height),
      count: n.count,
      distinct: n.distinct,
    };
  }
  const root = visit(tree.root);
  assert.equal(root.count, 20010);
  assert(root.height < 20);
});
test('calendar conversion is cosmetic and bijective for arbitrary rational seconds and fixed offsets', () => {
  assert.equal(parseTimestamp('1970-01-01T00:00:00Z').toString(), '0/1');
  assert.equal(parseTime('1970-01-01T01:00:00+01:00').toString(), '0/1');
  assert.equal(parseTimestamp('1969-12-31T23:59:59.5Z').toString(), '-1/2');
  assert.throws(() => parseTimestamp('2025-02-29T00:00:00Z'), /day/);
  assert.equal(printTimestamp(Q.from(1n, 3n)), '1970-01-01T00:00:00{+1/3}Z');
  for (const q of [
    Q.from(-1n, 3n),
    Q.from(1n, 7n),
    Q.from(10n ** 100n, 19n),
    Q.from(-(10n ** 100n), 17n),
    Q.parseDecimal('123.00000000000000000000000001'),
  ])
    for (const offset of [-839, 0, 345, 840])
      assert(parseTimestamp(printTimestamp(q, offset)).equals(q));
  const leap = parseTimestamp('2000-02-29T12:34:56.12345Z');
  assert.equal(printTimestamp(leap), '2000-02-29T12:34:56.12345Z');
});
