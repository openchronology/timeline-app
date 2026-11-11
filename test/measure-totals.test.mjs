// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// Measures' totals in the editor's index (#574): the tree's range totals, overview groups'
// totals and coalesced groups' totals all match summing the values by hand, through random
// inserts, moves, value edits, deletions and changes of declarations.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  Q,
  MeasureTree,
  TimelineIndex,
  Viewport,
  validateDocument,
  addTotals,
} from '../dist/core.mjs';

/** A small deterministic generator, so a failure can be replayed. */
function random(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}
const q = (text) => Q.parse(text.includes('/') ? text : text + '/1');
const text = (v) => (v.denominator === 1n ? v.numerator.toString() : v.toString());

test('the tree totals any range as summing does, through adds and removals', () => {
  const rand = random(7);
  const names = ['a', 'b'];
  const tree = new MeasureTree(names);
  const entries = [];
  for (let step = 0; step < 2000; step++) {
    if (entries.length && rand() < 0.35) {
      const [time, values] = entries.splice(Math.floor(rand() * entries.length), 1)[0];
      tree.remove(time, values);
    } else {
      const time = Q.from(
        BigInt(Math.floor(rand() * 200) - 100),
        BigInt(1 + Math.floor(rand() * 4)),
      );
      const values = [
        Q.from(BigInt(Math.floor(rand() * 21) - 10)),
        Q.from(BigInt(Math.floor(rand() * 9) - 4), BigInt(1 + Math.floor(rand() * 6))),
      ];
      entries.push([time, values]);
      tree.add(time, values);
    }
    if (step % 50) continue;
    // Balanced: an AVL tree of n nodes is at most ~1.44 log2 n high.
    assert(tree.height <= 1.45 * Math.log2(entries.length + 2) + 1, `height ${tree.height}`);
    for (let k = 0; k < 20; k++) {
      const lower = Q.from(BigInt(Math.floor(rand() * 220) - 110), 2n),
        upper = lower.add(Q.from(BigInt(Math.floor(rand() * 120)), 3n));
      const includeLower = rand() < 0.5,
        includeUpper = rand() < 0.5;
      const expected = names.map((_, i) =>
        entries
          .filter(
            ([t]) =>
              (includeLower ? t.compare(lower) >= 0 : t.compare(lower) > 0) &&
              (includeUpper ? t.compare(upper) <= 0 : t.compare(upper) < 0),
          )
          .reduce((sum, [, v]) => sum.add(v[i]), Q.zero),
      );
      assert.deepEqual(
        tree.sum(lower, upper, { includeLower, includeUpper }).map(text),
        expected.map(text),
      );
    }
    assert.deepEqual(
      tree.total.map(text),
      names.map((_, i) => text(entries.reduce((sum, [, v]) => sum.add(v[i]), Q.zero))),
    );
  }
  // Built at once, the same totals.
  const built = MeasureTree.of(names, entries);
  assert.deepEqual(built.total.map(text), tree.total.map(text));
  assert.deepEqual(built.sum(q('-10'), q('10')).map(text), tree.sum(q('-10'), q('10')).map(text));
  assert.deepEqual(built.named([q('0'), q('3/2')]), { b: '3/2' });
  assert.equal(built.named([q('0'), q('0')]), undefined);
});

test("overview groups carry their moments' totals, kept up to date as the index changes", () => {
  const rand = random(11);
  const MEASURES = { cost: { type: 'mpz' }, hours: { type: 'mpq' } };
  const value = () => {
    const values = {};
    if (rand() < 0.7) values.cost = String(Math.floor(rand() * 1000) - 300);
    if (rand() < 0.5) values.hours = `${Math.floor(rand() * 9) + 1}/${Math.floor(rand() * 4) + 1}`;
    return values;
  };
  const moment = (i) => ({
    id: 'm' + i,
    time: `${Math.floor(rand() * 1000)}/${1 + Math.floor(rand() * 3)}`,
    metadata: { title: 'M' + i, measures: value() },
  });
  const index = new TimelineIndex(
    validateDocument({
      format: 'openchronology',
      version: 1,
      title: 'Totals',
      description: '',
      measures: MEASURES,
      events: Array.from({ length: 300 }, (_, i) => moment(i)),
    }),
  );
  const check = () => {
    const viewport = new Viewport(q('-10'), q('1100'));
    for (const width of [40, 200, 1200]) {
      const frame = index.frame(viewport, width);
      for (const group of frame.groups) {
        const expected = {};
        for (const event of index.byId.values()) {
          const t = Q.parse(event.time);
          if (t.compare(Q.parse(group.first)) < 0 || t.compare(Q.parse(group.last)) > 0) continue;
          for (const [name, v] of Object.entries(event.metadata.measures ?? {}))
            expected[name] = (expected[name] ?? Q.zero).add(q(v));
        }
        const named = Object.fromEntries(
          Object.entries(expected)
            .filter(([, v]) => v.numerator !== 0n)
            .map(([n, v]) => [n, text(v)]),
        );
        assert.deepEqual(group.totals ?? {}, named, `${group.first}..${group.last}`);
      }
      // Every moment's values are counted once across the groups.
      const all = frame.groups.reduce((sum, g) => addTotals(sum, g.totals), undefined) ?? {};
      assert.deepEqual(all, index.measureTotals(viewport.left, viewport.right));
    }
  };
  check();
  for (let step = 0; step < 300; step++) {
    const ids = [...index.byId.keys()];
    const r = rand();
    if (r < 0.3) index.put(moment(1000 + step));
    else if (r < 0.5) index.delete(ids[Math.floor(rand() * ids.length)]);
    else {
      // Moved, or its values changed, or both.
      const event = index.byId.get(ids[Math.floor(rand() * ids.length)]);
      index.put({
        ...event,
        time: rand() < 0.5 ? event.time : `${Math.floor(rand() * 1000)}/1`,
        metadata: { ...event.metadata, measures: value() },
      });
    }
    if (step % 30 === 0) check();
  }
  check();
  // A change of declarations rebuilds the totals for the measures it keeps.
  index.measures = { cost: MEASURES.cost };
  const frame = index.frame(new Viewport(q('-10'), q('1100')), 40);
  assert(frame.groups.every((g) => !g.totals || Object.keys(g.totals).every((n) => n === 'cost')));
  index.measures = undefined;
  assert(index.frame(new Viewport(q('-10'), q('1100')), 40).groups.every((g) => !g.totals));
  assert.deepEqual(index.measureTotals(), {});
});

test('coalesced groups add their totals', () => {
  assert.deepEqual(addTotals({ a: '1', b: '1/2' }, { b: '-1/2', c: '3' }), { a: '1', c: '3' });
  assert.equal(addTotals({ a: '1' }, { a: '-1' }), undefined);
  assert.deepEqual(addTotals(undefined, { a: '2' }), { a: '2' });
});

test("collapsed durations' values count where they start, once, beside moments' (#576)", () => {
  const rand = random(576);
  const MEASURES = { cost: { type: 'mpz' } };
  const cost = () => String(Math.floor(rand() * 900) - 200);
  const events = Array.from({ length: 80 }, (_, i) => ({
    id: 'm' + i,
    time: `${Math.floor(rand() * 1000)}/1`,
    metadata: { measures: { cost: cost() } },
  }));
  const durations = Array.from({ length: 120 }, (_, i) => {
    const start = Math.floor(rand() * 1000);
    // Mostly short (collapsing at most views), some long (drawn as bands).
    const length = rand() < 0.8 ? Math.floor(rand() * 8) : 100 + Math.floor(rand() * 400);
    return {
      id: 'd' + i,
      start: `${start}/1`,
      end: `${start + length}/1`,
      metadata: { measures: { cost: cost() } },
    };
  });
  const index = new TimelineIndex(
    validateDocument({
      format: 'openchronology',
      version: 1,
      title: 'Durations',
      description: '',
      measures: MEASURES,
      events,
      durations,
    }),
  );
  const viewport = new Viewport(q('-50'), q('1600'));
  for (const width of [60, 300, 1500]) {
    const frame = index.frame(viewport, width);
    const threshold = viewport.threshold(width, 24);
    // Every moment in view and every collapsed duration reaching it, each once.
    let expected = Q.zero;
    for (const e of events) expected = expected.add(q(e.metadata.measures.cost));
    let collapsed = 0;
    for (const d of durations) {
      const first = q(d.start),
        last = q(d.end);
      if (last.sub(first).compare(threshold) >= 0) continue;
      if (last.compare(viewport.left) < 0 || first.compare(viewport.right) > 0) continue;
      expected = expected.add(q(d.metadata.measures.cost));
      collapsed++;
    }
    const counted = frame.groups.reduce((n, g) => n + Number(g.durationCount ?? 0), 0);
    assert.equal(counted, collapsed, `${width}: durations summarized`);
    const all = frame.groups.reduce((sum, g) => addTotals(sum, g.totals), undefined) ?? {};
    assert.equal(all.cost ?? '0', text(expected), `${width}: every value once`);
    // A band drawn on its own carries its values for the reader and the chart.
    for (const band of frame.durations ?? [])
      assert.deepEqual(
        band.metadata.measures,
        durations.find((d) => d.id === band.id).metadata.measures,
      );
  }
});
