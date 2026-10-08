// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  TimelineIndex,
  Viewport,
  Q,
  validateDocument,
  validatePluginManifest,
  filterDocument,
  tagCounts,
  viewFilterKey,
} from '../dist/core.mjs';
const doc = () => ({
  format: 'openchronology',
  version: 1,
  title: 'Tags',
  description: '',
  events: [
    { id: 'a', time: '1/1', metadata: { title: 'A', tags: [' War ', 'war', 'TRADE'] } },
    { id: 'b', time: '2/1', metadata: { title: 'B' } },
    { id: 'c', time: '3/1', metadata: { title: 'C', tags: ['art'] } },
  ],
  durations: [
    { id: 'x', start: { moment: 'b' }, end: '9/1', metadata: { tags: ['War'] } },
    { id: 'y', start: '0/1', end: { moment: 'a' }, metadata: {} },
  ],
});
test('entity tags normalize like timeline tags; other shapes stay custom metadata', () => {
  const d = validateDocument(doc());
  assert.deepEqual(d.events[0].metadata.tags, ['war', 'trade']);
  assert.deepEqual(d.durations.find((x) => x.id === 'x').metadata.tags, ['war']);
  // Older documents may use "tags" for something else; they still open unchanged.
  const custom = validateDocument({
    ...doc(),
    events: [{ id: 'z', time: '0/1', metadata: { tags: { kind: 'legacy' } } }],
    durations: [],
  });
  assert.deepEqual(custom.events[0].metadata.tags, { kind: 'legacy' });
  assert.throws(
    () =>
      validatePluginManifest({
        apiVersion: 1,
        id: 'labels',
        version: 1,
        name: 'Labels',
        description: 'Labels',
        fields: [{ kind: 'text', metadataKey: 'tags', label: 'Tags' }],
      }),
    /reserved/,
  );
});
test('separations split entities by tag and pin durations that follow the other side', () => {
  const d = validateDocument(doc());
  const tagged = filterDocument(d, { tags: ['WAR'], mode: 'any' });
  const rest = filterDocument(d, { tags: ['war'], mode: 'none' });
  assert.deepEqual(
    tagged.events.map((e) => e.id),
    ['a'],
  );
  assert.deepEqual(
    rest.events.map((e) => e.id),
    ['b', 'c'],
  );
  // "x" follows "b", which is on the other side; it keeps b's time as a fixed start.
  assert.deepEqual(tagged.durations, [
    { id: 'x', start: '2/1', end: '9/1', metadata: { tags: ['war'] } },
  ]);
  assert.deepEqual(
    rest.durations.map((x) => [x.start, x.end]),
    [['0/1', '1/1']],
  );
  for (const side of [tagged, rest])
    assert.doesNotThrow(() => new TimelineIndex(validateDocument(side)));
  const frame = new TimelineIndex(tagged).frame(new Viewport(Q.zero, Q.from(10n)), 1000, 24);
  assert.equal(frame.durations[0].first, '2/1');
  assert.equal(viewFilterKey({ tags: ['Trade', 'war', 'trade'], mode: 'any' }), 'any:trade,war');
  assert.deepEqual(tagCounts(d.events, d.durations), [
    { tag: 'war', count: 2 },
    { tag: 'art', count: 1 },
    { tag: 'trade', count: 1 },
  ]);
});
