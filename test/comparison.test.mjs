// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  Q,
  TimelineIndex,
  Viewport,
  DEFAULT_PRESENTATION,
  BUILTIN_PLUGINS,
} from '../dist/core.mjs';
import {
  ComparisonView,
  localEvents,
  samePresentation,
  unionPlugins,
} from '../dist/comparison.mjs';
const source = (key, times, extra = {}) => {
  const index = new TimelineIndex({
    format: 'openchronology',
    version: 1,
    title: key,
    description: '',
    events: times.map((time, i) => ({
      id: 'event-' + String(i).padStart(3, '0'),
      time: String(time),
      metadata: { title: key + i },
    })),
  });
  return {
    key,
    title: key,
    index,
    first: index.points.minKey()?.toString(),
    last: index.points.maxKey()?.toString(),
    ...extra,
  };
};
test('comparison affine transforms preserve exact coordinates and keep coincident sources distinct', async () => {
  const a = source('a', ['1/3', '2/3']),
    b = source('b', ['1/3', '2/3']);
  const view = new ComparisonView([a, b]);
  view.transform('b', Q.from(3n), Q.from(-1n));
  const frame = await view.frame(new Viewport(Q.from(-1n), Q.from(3n)), 1000, 1);
  assert.equal(frame.groups.length, 4);
  assert.equal(frame.groups.find((g) => g.id === 'b:event-000').first, '0/1');
  assert.equal(a.index.byId.get('event-000').time, '1/3');
  assert.throws(() => view.transform('b', Q.zero, Q.zero), /positive/);
  view.combined = true;
  const page = await view.events({ first: '0/1', last: '1/1', count: '4', distinct: 4 });
  assert.equal(page.events.length, 4);
  assert.equal(new Set(page.events.map((e) => e.id)).size, 4);
  assert.equal(page.events[0].metadata.originalTime, '1/3');
});
test('combined comparison pages all coincident IDs exactly once across multiple sources', async () => {
  const sources = ['a', 'b', 'c'].map((key) => source(key, Array(70).fill('0/1')));
  const view = new ComparisonView(sources);
  view.combined = true;
  const group = { first: '0/1', last: '0/1', count: '210', distinct: 1 };
  let next = null,
    ids = [];
  do {
    const page = await view.events(group, next, 25);
    assert(page.events.length <= 25);
    ids.push(...page.events.map((e) => e.id));
    next = page.next;
  } while (next);
  assert.equal(ids.length, 210);
  assert.equal(new Set(ids).size, 210);
  assert.deepEqual(ids, [...ids].sort());
});
test('server comparison inversely transforms bounds, reuses windows and discards finer caches', async () => {
  const calls = [];
  const remote = (key) => ({
    key,
    title: key,
    query: async (query) => {
      calls.push({ key, ...query });
      return {
        groups: [
          {
            first: '10/1',
            last: '10/1',
            count: '1',
            distinct: 1,
            id: 'shared',
            metadata: { title: key },
          },
        ],
        visitedNodes: 1,
      };
    },
  });
  const view = new ComparisonView([remote('a'), remote('b')]);
  view.transform('b', Q.from(2n), Q.from(100n));
  const viewport = new Viewport(Q.from(0n), Q.from(200n));
  await view.frame(viewport, 1000, 24);
  assert.equal(calls.length, 2);
  const b = calls.find((c) => c.key === 'b');
  assert(Q.parse(b.lower).compare(Q.from(-50n)) < 0);
  assert(Q.parse(b.upper).compare(Q.from(50n)) > 0);
  await view.frame(viewport, 1000, 24);
  assert.equal(calls.length, 2);
  view.transform('b', Q.one, Q.zero);
  await view.frame(viewport, 1000, 24);
  assert.equal(calls.length, 3);
  view.dispose();
  assert.equal(view.cached(viewport, 1000, 24), null);
});
test('plugin union deduplicates IDs, preserves order, reports incompatible definitions and does not mutate sources', () => {
  const plugin = { manifest: BUILTIN_PLUGINS[0], enabled: false };
  const result = unionPlugins([
    source('a', [], { plugins: [plugin] }),
    source('b', [], { plugins: [{ ...plugin, enabled: true }] }),
  ]);
  assert.equal(result.plugins.length, 1);
  assert.equal(result.plugins[0].enabled, true);
  assert.equal(plugin.enabled, false);
  const conflict = unionPlugins([
    source('a', [], { plugins: [plugin] }),
    source('b', [], { plugins: [{ ...plugin, manifest: { ...plugin.manifest, version: 99 } }] }),
  ]);
  assert.equal(conflict.conflicts.length, 1);
  assert(
    samePresentation([source('a', []), source('b', [], { presentation: DEFAULT_PRESENTATION })]),
  );
  assert(
    !samePresentation([
      source('a', []),
      source('b', [], { presentation: { ...DEFAULT_PRESENTATION, mode: 'gregorian' } }),
    ]),
  );
});

test('comparison source refresh preserves exact alignment and invalidates only its own cache', async () => {
  const first = source('a', ['1/3']),
    second = source('b', ['2/3']);
  const view = new ComparisonView([first, second]);
  view.transform('a', Q.from(3n), Q.from(2n));
  view.replaceSource(source('a', ['4/3']));
  assert.equal(view.tracks[0].scale.toString(), '3/1');
  assert.equal(view.tracks[0].offset.toString(), '2/1');
  const frame = await view.frame(new Viewport(Q.zero, Q.from(10n)), 1000, 1);
  assert.equal(frame.groups.find((g) => g.id === 'a:event-000').first, '6/1');
});
