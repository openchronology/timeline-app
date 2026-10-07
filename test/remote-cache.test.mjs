// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
import test from 'node:test';
import assert from 'node:assert/strict';
import { Q, Viewport, validateDocument } from '../dist/core.mjs';
import { ViewportCache, RemoteWorkspace, regroup } from '../dist/remote-cache.mjs';
const doc = () =>
  validateDocument({
    format: 'openchronology',
    version: 1,
    title: 'Remote',
    description: '',
    events: [],
  });
const point = (id, time, title = id) => ({
  id,
  time: Q.parse(time).toString(),
  metadata: { title },
});
const group = (first, last, count, id) => ({
  first: Q.parse(first).toString(),
  last: Q.parse(last).toString(),
  count: String(count),
  distinct: Number(count),
  ...(id ? { id } : {}),
});
test('one bounded viewport window prefetches nearby space, reuses neighboring pan/zoom, and retains confirmed data until replacement', () => {
  let now = 0;
  const cache = new ViewportCache(() => now),
    view = new Viewport(Q.zero, Q.from(100n));
  const plan = cache.plan(view, 1000, 24);
  assert.equal(plan.lower, '-25/1');
  assert.equal(plan.upper, '125/1');
  cache.store(plan, {
    groups: [
      group('-10', '-10', 1, 'before'),
      group('50', '50', 1, 'center'),
      group('120', '120', 1, 'after'),
    ],
    visitedNodes: 3,
  });
  assert.deepEqual(
    cache.get(view, plan).groups.map((g) => g.id),
    ['center'],
  );
  const pan = new Viewport(Q.from(20n), Q.from(100n));
  assert.deepEqual(
    cache.get(pan, cache.plan(pan, 1000, 24)).groups.map((g) => g.id),
    ['center', 'after'],
  );
  const zoom = new Viewport(Q.from(5n), Q.from(90n));
  assert(cache.get(zoom, cache.plan(zoom, 1000, 24)));
  const coarse = new Viewport(Q.zero, Q.from(400n));
  assert.equal(cache.get(coarse, cache.plan(coarse, 1000, 24)), null);
  assert.deepEqual(
    cache.visible(coarse).groups.map((g) => g.id),
    ['center', 'after'],
  );
  assert(cache.get(view, plan)); // returning to the confirmed resolution needs no fetch
  cache.store(plan, { groups: [group('50', '50', 1)], visitedNodes: 1 });
  now = 30001;
  assert.equal(cache.get(view, plan), null);
  cache.store(plan, { groups: [], visitedNodes: 1 });
  const far = new Viewport(Q.from(1000n), view.span);
  assert.equal(cache.get(far, cache.plan(far, 1000, 24)), null);
});
test('viewport budgets stay bounded at zero grouping and extreme rational magnitudes', () => {
  const cache = new ViewportCache();
  for (const span of [Q.from(1n, 10n ** 300n), Q.from(10n ** 300n)]) {
    const view = new Viewport(Q.zero, span),
      plan = cache.plan(view, 100000, 0);
    assert(Q.parse(plan.threshold).compare(span.mul(Q.from(3n, 2048n))) >= 0);
  }
  const view = new Viewport(),
    plan = cache.plan(view, 1000, 24);
  assert.throws(
    () =>
      cache.store(plan, {
        groups: Array.from({ length: 2049 }, () => group('0', '0', 1)),
        visitedNodes: 1,
      }),
    /budget/,
  );
  assert.throws(
    () =>
      cache.store(plan, {
        groups: [{ ...group('0', '0', 1), title: 'x'.repeat(cache.maxBytes) }],
        visitedNodes: 1,
      }),
    /budget/,
  );
  assert.equal(cache.get(view, plan), null);
});
test('inspector reads evict while unsaved moved, added and deleted events stay pinned', () => {
  const index = new RemoteWorkspace(doc());
  const a = point('a', '1'),
    b = point('b', '2');
  index.load(a);
  index.load(b);
  index.evict('b');
  assert.deepEqual([...index.byId.keys()], ['b']);
  index.load(a);
  index.put(point('a', '100', 'Edited'));
  index.delete('b');
  index.put(point('new', '3'));
  index.evict();
  assert(index.byId.has('a') && index.byId.has('new'));
  assert.equal(index.changes.get('a').before.time, '1/1');
  assert.equal(index.changes.get('b').before.time, '2/1');
  assert.equal(index.changes.get('new').before, undefined);
  const merged = index.apply({ ...doc(), events: [a, b, point('untouched', '999')] });
  assert.deepEqual(merged.events.map((e) => e.id).sort(), ['a', 'new', 'untouched']);
  assert(index.patch().changes.some((c) => c.id === 'b' && c.event === null));
  index.put(a);
  assert(!index.changes.has('a')); // undo returns to saved state
});
test('server summaries stay opaque and sparse edits do not duplicate original counts', () => {
  const index = new RemoteWorkspace(doc());
  const original = point('a', '10');
  index.load(original);
  index.put(point('a', '50', 'Moved'));
  const view = new Viewport(Q.zero, Q.from(100n));
  const result = index.overlay(
    { groups: [group('10', '12', 100)], visitedNodes: 2 },
    view,
    Q.from(3n),
  );
  assert.deepEqual(
    result.groups.map((g) => g.count),
    ['99', '1'],
  );
  assert.equal(result.groups[0].metadata, undefined);
  const joined = regroup(
    { groups: [group('1', '2', 10), group('3', '3', 1, 'single')], visitedNodes: 1 },
    Q.from(5n),
  );
  assert.equal(joined.groups[0].count, '11');
  assert.equal(joined.groups[0].id, undefined);
});
test('saving rebases concurrent local edits on the accepted server checkpoint', () => {
  const index = new RemoteWorkspace(doc());
  const original = point('a', '1');
  index.load(original);
  index.put(point('a', '2'));
  const sent = index.beginSave();
  index.put(point('a', '3'));
  index.accepted(sent, 'a');
  assert.equal(index.changes.get('a').before.time, '2/1');
  assert.equal(index.changes.get('a').after.time, '3/1');
  index.put(point('a', '2'));
  assert.equal(index.changes.size, 0);
  index.evict();
  assert.equal(index.byId.size, 0);
});

test('an undo during saving survives cache eviction and becomes a change against the saved event', () => {
  const index = new RemoteWorkspace(doc());
  const original = point('a', '1');
  index.load(original);
  index.put(point('a', '2'));
  const sent = index.beginSave();
  index.put(original);
  index.evict();
  index.accepted(sent);
  assert.equal(index.changes.get('a').before.time, '2/1');
  assert.equal(index.changes.get('a').after.time, '1/1');
});
test('coincident sparse points remain one group even with zero visual grouping', () => {
  const frame = regroup(
    { groups: [group('1', '1', 1, 'a'), group('1', '1', 1, 'b')], visitedNodes: 1 },
    Q.zero,
  );
  assert.equal(frame.groups.length, 1);
  assert.equal(frame.groups[0].count, '2');
  assert.equal(frame.groups[0].distinct, 1);
});

test('confirmed windows reconcile IDs, replace summaries and remove absent moments atomically', () => {
  const cache = new ViewportCache();
  const view = new Viewport(Q.zero, Q.from(100n));
  const plan = cache.plan(view, 1000, 24);
  const same = group('20', '20', 1, 'same');
  const summary = group('30', '40', 100);
  cache.store(plan, { groups: [same, group('50', '50', 1, 'removed'), summary], visitedNodes: 3 });
  const zoomed = new Viewport(Q.zero, Q.from(80n));
  assert.equal(cache.get(zoomed, cache.plan(zoomed, 1000, 24)), null);
  assert.equal(cache.visible(zoomed).groups.length, 3);
  assert.throws(
    () => cache.store(plan, { groups: Array(2049).fill(same), visitedNodes: 1 }),
    /budget/,
  );
  assert.equal(cache.visible(view).groups.length, 3); // failed response leaves confirmed data intact
  cache.store(plan, {
    groups: [{ ...same }, group('60', '60', 1, 'new'), { ...summary, count: '99' }],
    visitedNodes: 4,
  });
  const result = cache.visible(view);
  assert.equal(result.groups[0], same);
  assert.deepEqual(
    result.groups.map((g) => g.id),
    ['same', 'new', undefined],
  );
  assert.equal(result.groups[2].count, '99');
  assert.notEqual(result.groups[2], summary);
});
