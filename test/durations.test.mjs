// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  Q,
  TimelineIndex,
  Viewport,
  validateDocument,
  durationTree,
  durationWindow,
  pruneDurations,
} from '../dist/core.mjs';
import { RemoteWorkspace, ViewportCache } from '../dist/remote-cache.mjs';
const doc = () => ({
  format: 'openchronology',
  version: 1,
  title: 'Linked endpoints',
  description: '',
  events: [
    {
      id: 'start',
      time: '-100/1',
      metadata: {
        title: 'Start',
        durations: [
          {
            id: 'span',
            endId: 'end',
            metadata: { title: 'Long span', description: 'Notes', custom: { retained: true } },
          },
        ],
      },
    },
    { id: 'end', time: '100/1', metadata: { title: 'End' } },
  ],
});
test('exact intervals span empty windows, preserve files, and do not inflate moment summaries', () => {
  const source = validateDocument(doc()),
    index = new TimelineIndex(source),
    view = new Viewport(Q.zero, Q.one);
  const frame = index.frame(view, 1000);
  assert.equal(frame.groups.length, 0);
  assert.equal(frame.durations.length, 1);
  assert.equal(frame.durations[0].first, '-100/1');
  assert.equal(frame.durations[0].last, '100/1');
  assert.deepEqual(validateDocument(JSON.parse(JSON.stringify(index.document()))), source);
  index.put({ ...source.events[1], time: '1/3' });
  assert.equal(index.frame(view, 1000).durations[0].last, '1/3');
  index.delete('end');
  assert.equal(index.frame(view, 1000).durations.length, 0);
  assert.equal(index.document().events[0].metadata.durations.length, 0);
  index.put(source.events[1]);
  assert.equal(index.frame(view, 1000).durations.length, 1);
});
test('bounded interval queries prune off-screen spans and cope with reversed endpoints and huge rationals', () => {
  const events = [];
  const offset = 10n ** 500n,
    denominator = 10n ** 600n;
  for (let i = 0; i < 300; i++)
    events.push(
      {
        id: 'a' + i,
        time: Q.from(offset * denominator + BigInt(i), denominator).toString(),
        metadata: { durations: [{ id: 'd' + i, endId: 'b' + i, metadata: {} }] },
      },
      {
        id: 'b' + i,
        time: Q.from(offset * denominator + BigInt(i + 1), denominator).toString(),
        metadata: {},
      },
    );
  const tree = durationTree(events);
  assert.equal(durationWindow(tree, Q.zero, Q.one).durations.length, 0);
  const all = durationWindow(tree, Q.from(offset), Q.from(offset + 1n));
  assert.equal(all.durations.length, 256);
  assert(all.durationsTruncated);
  const hit = durationWindow(
    tree,
    Q.from(offset * denominator + 10n, denominator),
    Q.from(offset * denominator + 10n, denominator),
  );
  assert.equal(hit.durations.length, 2);
  const reversed = doc();
  reversed.events[0].time = '200/1';
  assert.equal(
    durationWindow(durationTree(reversed.events), Q.from(150n), Q.from(151n)).durations.length,
    1,
  );
});
test('invalid references, duplicate IDs, self links and malformed duration metadata are rejected', () => {
  for (const mutate of [
    (d) => (d.events[0].metadata.durations[0].endId = 'missing'),
    (d) => (d.events[0].metadata.durations[0].endId = 'start'),
    (d) => d.events[0].metadata.durations.push(d.events[0].metadata.durations[0]),
    (d) => (d.events[0].metadata.durations[0].metadata.title = 42),
  ]) {
    const d = doc();
    mutate(d);
    assert.throws(() => validateDocument(d));
  }
  assert.doesNotThrow(() => validateDocument({ ...doc(), events: [doc().events[0]] }, true));
});
test('sparse endpoint edits adjust interval cache and exports without loading all points', () => {
  const d = validateDocument(doc()),
    remote = new RemoteWorkspace(d),
    view = new Viewport(Q.zero, Q.one),
    original = new TimelineIndex(d).frame(view, 1000);
  remote.load(d.events[1]);
  remote.put({ ...d.events[1], time: '1/2' });
  assert.equal(remote.overlay(original, view, Q.zero).durations[0].last, '1/2');
  remote.delete('end');
  assert.equal(remote.overlay(original, view, Q.zero).durations.length, 0);
  assert.equal(remote.apply(d).events[0].metadata.durations.length, 0);
  assert.equal(
    pruneDurations({ ...d, events: [d.events[0]] }).events[0].metadata.durations.length,
    0,
  );
  const cache = new ViewportCache();
  const query = cache.plan(view, 1000, 24);
  cache.store(query, original);
  assert.equal(cache.visible(view).durations.length, 1);
});
