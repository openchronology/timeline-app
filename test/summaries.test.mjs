// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
import test from 'node:test';
import assert from 'node:assert/strict';
import { Q, TimelineIndex, Viewport, validateDocument, coalesceGroups } from '../dist/core.mjs';
import { RemoteWorkspace, regroup } from '../dist/remote-cache.mjs';

/** Brute-force reference on integer coordinates (see native-store summary_tests). */
function reference(moments, spans, lo, hi, t) {
  // Exact comparison of an integer difference with a rational threshold.
  const below = (d) => Q.from(BigInt(d)).compare(t) < 0;
  const groups = [];
  for (const p of moments.filter((m) => m >= lo && m <= hi).sort((a, b) => a - b)) {
    const g = groups.at(-1);
    if (g && below(p - g.first)) {
      if (p !== g.last) g.distinct++;
      g.last = p;
      g.count++;
    } else groups.push({ first: p, last: p, count: 1, distinct: 1, durations: 0 });
  }
  const clusters = [];
  for (const [a, b] of spans
    .filter(([a, b]) => below(b - a) && b >= lo && a <= hi)
    .sort((x, y) => x[0] - y[0] || x[1] - y[1])) {
    const c = clusters.at(-1);
    if (c && below(a - c.first)) {
      c.last = Math.max(c.last, b);
      c.durations++;
    } else clusters.push({ first: a, last: b, count: 0, distinct: 0, durations: 1 });
  }
  const out = [];
  for (const g of [...groups, ...clusters].sort(
    (x, y) => x.first - y.first || (y.count > 0) - (x.count > 0),
  )) {
    const p = out.at(-1);
    if (p && (g.first === p.first || below(g.last - p.first))) {
      const overlap = p.distinct > 0 && g.distinct > 0 && p.last === g.first;
      p.last = Math.max(p.last, g.last);
      p.count += g.count;
      p.distinct += g.distinct - (overlap ? 1 : 0);
      p.durations += g.durations;
    } else out.push({ ...g });
  }
  return out;
}
const shape = (frame) =>
  frame.groups.map((g) => ({
    first: Number(Q.parse(g.first).numerator),
    last: Number(Q.parse(g.last).numerator),
    count: Number(g.count),
    distinct: g.distinct,
    durations: Number(g.durationCount ?? 0),
  }));
test('browser summaries of moments and collapsed durations match a brute-force reference', () => {
  let seed = 7;
  const next = (n) => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return Math.floor((seed / 2147483648) * n);
  };
  let mixed = 0,
    singles = 0;
  for (let trial = 0; trial < 8; trial++) {
    const moments = Array.from({ length: 50 + next(100) }, () => next(3000));
    const spans = Array.from({ length: 40 + next(120) }, () => {
      const a = next(3000);
      return [a, a + (next(10) < 8 ? next(40) : next(1500))];
    });
    const index = new TimelineIndex(
      validateDocument({
        format: 'openchronology',
        version: 1,
        title: 'Oracle',
        description: '',
        events: moments.map((m, i) => ({ id: 'm' + i, time: m + '/1', metadata: {} })),
        durations: spans.map(([a, b], i) => ({
          id: 'd' + i,
          start: a + '/1',
          end: b + '/1',
          metadata: { title: 'D' + i },
        })),
      }),
    );
    for (let view = 0; view < 20; view++) {
      const lo = next(3200) - 100,
        span = 1 + next(3000),
        pixels = 1 + next(80);
      const viewport = new Viewport(Q.from(BigInt(lo)), Q.from(BigInt(span)));
      const t = viewport.threshold(1000, pixels);
      const frame = index.frame(viewport, 1000, pixels);
      const expected = reference(moments, spans, lo, lo + span, t);
      assert.deepEqual(shape(frame), expected, `trial ${trial}, view ${view}`);
      for (const band of frame.durations)
        assert(
          Q.parse(band.last).sub(Q.parse(band.first)).compare(t) >= 0,
          'Bands never collapse.',
        );
      mixed += frame.groups.filter((g) => g.count !== '0' && g.durationCount).length;
      singles += frame.groups.filter((g) => g.duration).length;
    }
  }
  assert(mixed > 0 && singles > 0);
});
test('a lone collapsed duration is a summary carrying its band; zero thresholds keep bands', () => {
  const index = new TimelineIndex(
    validateDocument({
      format: 'openchronology',
      version: 1,
      title: 'Lone',
      description: '',
      events: [{ id: 'far', time: '900/1', metadata: {} }],
      durations: [{ id: 'short', start: '10/1', end: '11/1', metadata: { title: 'Short' } }],
    }),
  );
  const coarse = index.frame(new Viewport(Q.zero, Q.from(1000n)), 1000, 24);
  assert.deepEqual(coarse.durations, []);
  const lone = coarse.groups.find((g) => g.duration);
  assert.equal(lone.count, '0');
  assert.equal(lone.durationCount, '1');
  assert.equal(lone.duration.metadata.title, 'Short');
  // Zoomed in, the same duration is a band again.
  const fine = index.frame(new Viewport(Q.from(9n), Q.from(4n)), 1000, 24);
  assert.equal(fine.durations[0].id, 'short');
  assert(!fine.groups.some((g) => g.durationCount));
});
test('cached summaries coarsen with duration counts, and moment groups never merge with each other', () => {
  const groups = [
    { first: '0/1', last: '1/1', count: '3', distinct: 2 },
    { first: '2/1', last: '3/1', count: '0', distinct: 0, durationCount: '2' },
    { first: '12/1', last: '13/1', count: '1', distinct: 1, id: 'x' },
  ];
  assert.deepEqual(coalesceGroups(groups, Q.from(10n)), [
    { first: '0/1', last: '3/1', count: '3', distinct: 2, durationCount: '2' },
    { first: '12/1', last: '13/1', count: '1', distinct: 1, id: 'x' },
  ]);
  assert.equal(regroup({ groups, visitedNodes: 0 }, Q.from(100n)).groups[0].durationCount, '2');
});
test('sparse overlays move edited collapsed durations between summaries', () => {
  const doc = validateDocument({
    format: 'openchronology',
    version: 1,
    title: 'Sparse',
    description: '',
    events: [{ id: 'm', time: '0/1', metadata: {} }],
    durations: [
      { id: 'a', start: '1/1', end: '2/1', metadata: {} },
      { id: 'b', start: '3/1', end: '4/1', metadata: {} },
    ],
  });
  const view = new Viewport(Q.from(-100n), Q.from(1000n)),
    threshold = view.threshold(1000, 24);
  const saved = new TimelineIndex(doc).frame(view, 1000, 24);
  assert.equal(saved.groups.length, 1);
  assert.equal(saved.groups[0].durationCount, '2');
  const remote = new RemoteWorkspace(doc);
  remote.loadDuration(doc.durations[1]);
  remote.putDuration({ ...doc.durations[1], start: '600/1', end: '601/1' });
  const overlaid = remote.overlay(saved, view, threshold);
  assert.deepEqual(
    overlaid.groups.map((g) => [g.first, g.count, g.durationCount ?? '0']),
    [
      ['0/1', '1', '1'],
      ['600/1', '0', '1'],
    ],
  );
  assert.equal(overlaid.groups[1].duration.id, 'b');
  // Lengthening it past the threshold turns it back into a band.
  remote.putDuration({ ...doc.durations[1], start: '600/1', end: '800/1' });
  const band = remote.overlay(saved, view, threshold);
  assert.equal(band.durations[0].id, 'b');
  assert.equal(band.groups.length, 1);
});
