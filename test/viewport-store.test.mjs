// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// Signed-in users’ stored timeline windows (src/viewport-store.ts): keys, saving, per-revision
// counts, eviction past the budget, and answering views once restored.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Q, Viewport } from '../dist/core.mjs';
import { ViewportCache } from '../dist/remote-cache.mjs';
import {
  planSave,
  STORED_PER_REVISION,
  storeScope,
  timelinePrefix,
  versionPrefix,
  windowKey,
  fingerprint,
} from '../dist/viewport-store.mjs';
const frame = (title) => ({
  groups: [{ first: '1/1', last: '1/1', count: '1', distinct: 1, id: 'm', title }],
  visitedNodes: 1,
});
const win = (lower, upper, title = 'm') => ({
  lower: `${lower}/1`,
  upper: `${upper}/1`,
  threshold: '1/1',
  frame: frame(title),
});
const scope = storeScope('https://timescale.info', 'alice');
const timeline = timelinePrefix(scope, 't1'),
  r1 = versionPrefix(scope, 't1', '1', 'p'),
  r2 = versionPrefix(scope, 't1', '2', 'p');
test('keys separate servers, users, timelines, revisions and plugin sets', () => {
  const keys = [
    versionPrefix(storeScope('https://a', 'alice'), 't', '1', 'p'),
    versionPrefix(storeScope('https://a', 'bob'), 't', '1', 'p'),
    versionPrefix(storeScope('https://b', 'alice'), 't', '1', 'p'),
    versionPrefix(storeScope('https://a', 'alice'), 't2', '1', 'p'),
    versionPrefix(storeScope('https://a', 'alice'), 't', '12', 'p'),
    versionPrefix(storeScope('https://a', 'alice'), 't', '1', 'q'),
  ];
  for (const a of keys)
    for (const b of keys) if (a !== b) assert(!a.startsWith(b), `${a} within ${b}`);
  // A revision's prefix lies within its timeline's, and "t" does not take in "t2".
  assert(r1.startsWith(timeline));
  assert(!versionPrefix(scope, 't12', '1', 'p').startsWith(timeline));
  assert.equal(fingerprint('[{"id":"a"}]'), fingerprint('[{"id":"a"}]'));
  assert.notEqual(fingerprint('[{"id":"a"}]'), fingerprint('[{"id":"b"}]'));
});
test('saving writes new windows, keeps released ones and removes other revisions', () => {
  const kept = win(0, 10),
    released = win(10, 20),
    added = win(20, 30);
  const catalog = [
    { key: windowKey(r1, kept), bytes: 100, saved: 0 },
    { key: windowKey(r1, released), bytes: 100, saved: 0 },
    { key: windowKey(r2.replace('\u00012\u0001', '\u00010\u0001'), kept), bytes: 100, saved: 0 },
    { key: windowKey(versionPrefix(scope, 'other', '1', 'p'), kept), bytes: 100, saved: 0 },
  ];
  const plan = planSave(catalog, timeline, r1, [kept, added], 1000);
  assert.deepEqual(
    plan.put.map((p) => p.key),
    [windowKey(r1, added)],
  );
  // A window the page let go of stays stored, for a later visit; another revision's goes.
  assert.deepEqual(plan.remove, [catalog[2].key]);
  // A new revision replaces every window of the timeline, and leaves other timelines alone.
  const next = planSave(catalog, timeline, r2, [added], 1000);
  assert.deepEqual(
    next.remove.sort(),
    catalog
      .slice(0, 3)
      .map((c) => c.key)
      .sort(),
  );
});
test('a revision keeps its most recently saved windows, up to its count', () => {
  const stored = Array.from({ length: STORED_PER_REVISION + 3 }, (_, i) => ({
    key: windowKey(r1, win(i * 10, i * 10 + 10)),
    bytes: 10,
    saved: i,
  }));
  const current = [win(-20, -10), win(-10, 0)];
  const plan = planSave(stored, timeline, r1, current, 1000);
  // Room for the page's two windows and the revision's newest others: the five oldest go.
  assert.deepEqual(
    plan.remove.sort(),
    stored
      .slice(0, 5)
      .map((c) => c.key)
      .sort(),
  );
  assert.equal(plan.put.length, 2);
});
test('past the budget or keeping time, the least recently saved other windows go first', () => {
  const other = (name, saved, bytes = 1000) => ({
    key: windowKey(versionPrefix(scope, name, '1', 'p'), win(0, 1)),
    bytes,
    saved,
  });
  const catalog = [other('old', 10), other('newer', 20), other('newest', 30)];
  const current = [win(0, 10)];
  const size = JSON.stringify(current[0].frame).length * 2;
  // Room for the new window and two of the three stored ones: the oldest goes.
  const plan = planSave(catalog, timeline, r1, current, 40, size + 2000);
  assert.deepEqual(plan.remove, [catalog[0].key]);
  // The windows being saved stay even when they alone exceed the budget.
  assert.deepEqual(planSave([], timeline, r1, current, 40, 1).put.length, 1);
  // Windows saved more than the keeping time ago go regardless of the budget.
  assert.deepEqual(planSave(catalog, timeline, r1, [], 1000, Infinity, 985).remove, [
    catalog[0].key,
  ]);
});
test('restored windows answer views at once, within the cache limits', () => {
  let now = 0;
  const source = new ViewportCache(() => now),
    view = new Viewport(Q.zero, Q.from(100n)),
    plan = source.plan(view, 1000, 24);
  source.store(plan, frame('restored'));
  const far = new Viewport(Q.from(5000n), Q.from(100n));
  source.store(source.plan(far, 1000, 24), frame('far'));
  const stored = JSON.parse(JSON.stringify(source.snapshot()));
  assert.equal(stored.length, 2);
  // Much later, in another page: the revision was just confirmed, so they count as fresh.
  now = 10 * 60 * 1000;
  const page = new ViewportCache(() => now);
  page.restore(stored);
  assert.deepEqual(
    page.get(view, page.plan(view, 1000, 24)).groups.map((g) => g.title),
    ['restored'],
  );
  assert(page.get(far, page.plan(far, 1000, 24)));
  // Windows already held, or beyond one response's limits, are skipped.
  page.restore(stored);
  assert.equal(page.size, 2);
  page.restore([
    {
      ...stored[0],
      lower: '-9000/1',
      frame: {
        groups: Array.from({ length: 2049 }, () => stored[0].frame.groups[0]),
        visitedNodes: 1,
      },
    },
  ]);
  assert.equal(page.size, 2);
});
