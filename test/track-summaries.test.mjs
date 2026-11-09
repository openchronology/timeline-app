// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// Separated tracks summarized like moments (#560): a span from disjoin to union narrower than
// the grouping distance collapses into the track it unites into, and tracks with nothing in
// view are not drawn.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Q, collapseTrackSpans, shownTracks } from '../dist/core.mjs';

const group = (sourceKey, first, last = first, count = 1, extra = {}) => ({
  first: `${first}/1`,
  last: `${last}/1`,
  count: String(count),
  distinct: count,
  sourceKey,
  ...extra,
});
const band = (sourceKey, id, first, last) => ({
  id: `${sourceKey}:${id}`,
  start: `${first}/1`,
  end: `${last}/1`,
  startTime: `${first}/1`,
  endTime: `${last}/1`,
  first: `${first}/1`,
  last: `${last}/1`,
  metadata: { title: id },
  sourceKey,
});
const span = (key, into, begins, ends) => ({
  key,
  into,
  begins: Q.parse(String(begins)),
  ends: Q.parse(String(ends)),
});

test('a span narrower than the grouping distance is a summary on the track it unites into', () => {
  const frame = {
    groups: [
      group('x', 40, 40, 2),
      group('x', 41, 41, 1),
      // Outside the span: its own.
      group('x', 70),
      group('rest', 10),
      // Near enough to the summary to join it, as moments group.
      group('rest', 43, 43, 3),
      group('rest', 60),
    ],
    durations: [band('x', 'd', 40, 90), band('x', 'late', 80, 85), band('rest', 'r', 0, 100)],
    visitedNodes: 0,
  };
  const { frame: drawn, collapsed } = collapseTrackSpans(
    frame,
    [span('x', 'rest', 39, 42)],
    Q.parse('5'),
  );
  assert.deepEqual(
    collapsed.map((s) => s.key),
    ['x'],
  );
  const summary = drawn.groups.find((g) => g.sources);
  assert.deepEqual(summary, {
    first: '40/1',
    last: '43/1',
    count: '6',
    distinct: 6,
    durationCount: '1',
    sources: ['rest', 'x'],
    sourceKey: 'rest',
  });
  // Its members left x; what x holds outside the span stays.
  assert.deepEqual(
    drawn.groups.filter((g) => g.sourceKey === 'x').map((g) => g.first),
    ['70/1'],
  );
  assert.deepEqual(
    drawn.durations.map((b) => b.id),
    ['x:late', 'rest:r'],
  );
  // Wider than the grouping distance, it is drawn apart.
  const wide = collapseTrackSpans(frame, [span('x', 'rest', 39, 42)], Q.parse('3'));
  assert.equal(wide.collapsed.length, 0);
  assert.equal(wide.frame, frame);
});

test('a lone moment or duration moves as itself; spans into narrow spans collapse on', () => {
  const lone = collapseTrackSpans(
    { groups: [group('x', 5, 5, 1, { id: 'x:m', title: 'M' })], durations: [], visitedNodes: 0 },
    [span('x', 'rest', 4, 6)],
    Q.parse('10'),
  );
  assert.deepEqual(lone.frame.groups, [
    { ...group('x', 5, 5, 1, { id: 'x:m', title: 'M' }), sourceKey: 'rest', sources: ['x'] },
  ]);
  const duration = collapseTrackSpans(
    { groups: [], durations: [band('x', 'd', 5, 50)], visitedNodes: 0 },
    [span('x', 'rest', 4, 6)],
    Q.parse('10'),
  );
  assert.equal(duration.frame.groups[0].duration.id, 'x:d');
  assert.equal(duration.frame.groups[0].durationCount, '1');
  assert.equal(duration.frame.groups[0].count, '0');
  // x unites into y, which unites into rest, both narrow: x's summary moves on with y's.
  const chain = collapseTrackSpans(
    { groups: [group('x', 5), group('y', 6)], durations: [], visitedNodes: 0 },
    [span('y', 'rest', 3, 8), span('x', 'y', 4, 6)],
    Q.parse('10'),
  );
  assert.deepEqual(
    chain.collapsed.map((s) => s.key),
    ['x', 'y'],
  );
  assert.deepEqual(
    chain.frame.groups.map((g) => [g.sourceKey, g.count, g.sources]),
    [['rest', '2', ['x', 'y']]],
  );
});

test('only tracks with something in view are shown, and the rest always', () => {
  const frame = {
    groups: [group('a', 10), group('b', 200), group('c', 20, 20, 0)],
    durations: [band('d', 'long', 0, 1000)],
    visitedNodes: 0,
  };
  const shown = shownTracks(
    frame,
    ['a', 'b', 'c', 'd', 'rest'],
    Q.parse('0'),
    Q.parse('100'),
    'rest',
  );
  assert.deepEqual([...shown], ['a', 'd', 'rest']);
});
