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
test('an overscanned window answers nearby pans and zooms, and confirmed data stays shown until replaced', () => {
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
test('the running cache keeps windows of several places and resolutions to return to', () => {
  let now = 0;
  const cache = new ViewportCache(() => now);
  const answer = (view) => {
    const plan = cache.plan(view, 1000, 24);
    cache.store(plan, {
      groups: [group(view.left.toString(), view.left.toString(), 1)],
      visitedNodes: 1,
    });
    return plan;
  };
  const home = new Viewport(Q.zero, Q.from(100n)),
    far = new Viewport(Q.from(5000n), Q.from(100n)),
    wide = new Viewport(Q.zero, Q.from(800n));
  answer(home);
  answer(far);
  answer(wide);
  now = 10000;
  for (const view of [home, far, wide]) assert(cache.get(view, cache.plan(view, 1000, 24)));
  assert.equal(cache.size, 3);
  // A wider window of the same resolution replaces the windows it contains.
  const homePlan = cache.plan(home, 1000, 24);
  cache.store(
    { ...homePlan, lower: '-1000/1', upper: '1000/1' },
    { groups: [group('-900', '-900', 1, 'wide')], visitedNodes: 1 },
  );
  assert.equal(cache.size, 3);
  const pan = new Viewport(Q.from(-600n), Q.from(100n));
  assert.deepEqual(
    cache.get(pan, cache.plan(pan, 1000, 24)).groups.map((g) => g.id),
    [],
  );
  assert(cache.get(home, homePlan));
  // Releasing keeps every window covering the view: here its own and the coarser one.
  cache.release(home);
  assert.equal(cache.size, 2);
  cache.release();
  assert.equal(cache.size, 0);
});
test('predicted windows follow the motion, stay within the server limit, and stop once fetched', () => {
  const cache = new ViewportCache(() => 0),
    view = new Viewport(Q.zero, Q.from(100n)),
    level = Q.parse(cache.plan(view, 1000, 24).threshold);
  const levels = (motion) =>
    cache.predict(view, 1000, 24, motion).map((q) => Q.parse(q.threshold).div(level).toString());
  assert.deepEqual(levels(null), ['1/1', '2/1', '1/2']);
  assert.deepEqual(levels('pan'), ['1/1', '2/1', '1/2']);
  assert.deepEqual(levels('zoom-in'), ['1/2', '1/1', '2/1']);
  assert.deepEqual(levels('zoom-out'), ['2/1', '1/1', '1/2']);
  for (const q of cache.predict(view, 1000, 24)) {
    const lower = Q.parse(q.lower),
      upper = Q.parse(q.upper);
    // Every window covers the view and asks for at most 1,024 groups.
    assert(lower.compare(view.left) <= 0 && upper.compare(view.right) >= 0);
    assert(upper.sub(lower).compare(Q.parse(q.threshold).mul(Q.from(1024n))) <= 0);
  }
  const [pan] = cache.predict(view, 1000, 24, 'pan');
  assert.equal(pan.lower, '-200/1');
  assert.equal(pan.upper, '300/1');
  cache.store(pan, { groups: [], visitedNodes: 1 });
  assert.deepEqual(levels(null), ['2/1', '1/2']);
  // Panning anywhere within the prefetched window is answered without a request.
  for (const left of [-200n, -50n, 120n, 200n]) {
    const moved = new Viewport(Q.from(left), Q.from(100n));
    assert(cache.get(moved, cache.plan(moved, 1000, 24)));
  }
  // At zero grouping the limit narrows the margin, and the finer level cannot cover the view.
  const tight = cache.predict(view, 1000, 0);
  for (const q of tight)
    assert(
      Q.parse(q.upper)
        .sub(Q.parse(q.lower))
        .compare(Q.parse(q.threshold).mul(Q.from(1024n))) <= 0,
    );
  assert(!tight.some((q) => Q.parse(q.threshold).compare(level) < 0 && q.lower === '-50/1'));
});
test('over budget, the windows farthest from the view are released first', () => {
  let now = 0;
  const cache = new ViewportCache(() => now),
    view = new Viewport(Q.zero, Q.from(100n)),
    plan = cache.plan(view, 1000, 24);
  cache.store(plan, { groups: [], visitedNodes: 1 });
  cache.get(view, plan);
  // Windows ever farther away, then one next to the view.
  for (let i = 1; i <= cache.maxEntries; i++) {
    now += 10;
    const away = new Viewport(Q.from(BigInt(i * 1000)), Q.from(100n));
    cache.store(cache.plan(away, 1000, 24), { groups: [], visitedNodes: 1 });
  }
  const near = new Viewport(Q.from(150n), Q.from(100n));
  cache.store(cache.plan(near, 1000, 24), { groups: [], visitedNodes: 1 });
  assert.equal(cache.size, cache.maxEntries);
  assert(cache.get(view, plan), 'the window serving the view stays');
  assert(cache.get(near, cache.plan(near, 1000, 24)), 'a nearby window stays');
  const farthest = new Viewport(Q.from(BigInt(cache.maxEntries * 1000)), Q.from(100n));
  assert.equal(cache.nearest(farthest)?.frame.groups.length ?? 0, 0);
  assert.equal(
    cache.get(farthest, cache.plan(farthest, 1000, 24)),
    null,
    'the farthest window went first',
  );
  // Windows unused for five minutes are released on the next store.
  now += cache.keepFor + 1;
  cache.store(plan, { groups: [], visitedNodes: 1 });
  assert.equal(cache.size, 1);
});
test('while a window is fetched, the last drawn one stands in, else the closest covering one', () => {
  const cache = new ViewportCache(() => 0),
    fine = new Viewport(Q.zero, Q.from(100n)),
    coarse = new Viewport(Q.zero, Q.from(200n));
  const finePlan = cache.plan(fine, 1000, 24),
    coarsePlan = cache.plan(coarse, 1000, 24);
  cache.store(
    { ...finePlan, lower: '-100/1', upper: '300/1' },
    { groups: [group('10', '10', 1, 'a'), group('12', '12', 1, 'b')], visitedNodes: 1 },
  );
  cache.store(
    { ...coarsePlan, lower: '150/1', upper: '400/1' },
    { groups: [group('160', '160', 2)], visitedNodes: 1 },
  );
  const stand = cache.nearest(coarse, Q.parse(coarsePlan.threshold));
  assert.equal(stand.threshold.toString(), finePlan.threshold, 'covering beats partial');
  assert.deepEqual(
    regroup(stand.frame, Q.parse(coarsePlan.threshold)).groups.map((g) => g.count),
    ['2'],
  );
  assert.equal(
    cache
      .nearest(new Viewport(Q.from(300n), Q.from(50n)), Q.parse(coarsePlan.threshold))
      .threshold.toString(),
    coarsePlan.threshold,
  );
});
test('zooming out keeps the window last drawn on screen rather than a coarser covering one', () => {
  const cache = new ViewportCache(() => 0),
    start = new Viewport(Q.zero, Q.from(1000n)),
    near = new Viewport(Q.zero, Q.from(20n)),
    out = new Viewport(Q.zero, Q.from(40n));
  cache.store(cache.plan(start, 1000, 24), { groups: [group('0', '10', 2)], visitedNodes: 1 });
  const nearPlan = cache.plan(near, 1000, 24);
  cache.store(nearPlan, { groups: [group('10', '10', 1, 'near')], visitedNodes: 1 });
  assert(cache.get(near, nearPlan));
  const outPlan = cache.plan(out, 1000, 24);
  assert.equal(cache.get(out, outPlan), null);
  assert.deepEqual(
    cache.nearest(out, Q.parse(outPlan.threshold)).frame.groups.map((g) => g.id),
    ['near'],
  );
  // Far from what was drawn, the covering window stands in.
  const away = new Viewport(Q.from(500n), Q.from(40n));
  assert.equal(
    cache.nearest(away, Q.parse(outPlan.threshold)).threshold.toString(),
    cache.plan(start, 1000, 24).threshold,
  );
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

test('a writable server timeline opens when its metadata reports unset settings as null', () => {
  // GET /api/timelines/<id> returns null for settings a timeline never had (for example
  // one created through the API); the editor builds its workspace from that metadata.
  const workspace = new RemoteWorkspace({
    format: 'openchronology',
    version: 1,
    title: 'Created through the API',
    description: '',
    presentation: null,
    plugins: null,
    tags: null,
    assets: null,
    events: [],
  });
  assert.equal(workspace.tags, undefined);
  assert.equal(workspace.assets, undefined);
  assert.equal(workspace.plugins, undefined);
  assert.equal(workspace.presentation, undefined);
});

test('redoing an undone edit stays an edit when the history retains the moment', () => {
  // Undo puts the original back (no change remains); the inspector is closed, so a render
  // evicts the moment. Redo must still find its saved original, or the edit would count as
  // an addition and the server's copy would show beside it.
  const replay = (retained) => {
    const index = new RemoteWorkspace(doc());
    const original = point('a', '1', 'Original'),
      edited = point('a', '1', 'Edited');
    index.load(original);
    index.put(edited);
    index.put(original);
    assert.equal(index.changes.has('a'), false);
    index.evict(undefined, undefined, retained);
    index.put(edited);
    return index.changes.get('a');
  };
  assert.equal(replay({ moments: new Set(['a']) }).before.metadata.title, 'Original');
  // Without the history's moments the original is gone: the redo looks like an addition.
  assert.equal(replay({}).before, undefined);
});
