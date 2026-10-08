// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
import test from 'node:test';
import assert from 'node:assert/strict';
import { Q, TimelineIndex, Viewport, validateDocument, filterDocument } from '../dist/core.mjs';
import { RemoteWorkspace } from '../dist/remote-cache.mjs';
import { applyPatch } from '../server/store.mjs';
import { rebaseDocument } from '../server/merge.mjs';
const doc = () => ({
  format: 'openchronology',
  version: 1,
  title: 'Links',
  description: '',
  events: [
    { id: 'a', time: '0/1', metadata: { title: 'A' } },
    { id: 'b', time: '100/1', metadata: { title: 'B' } },
    { id: 'c', time: '200/1', metadata: { title: 'C' } },
    { id: 'lone', time: '300/1', metadata: { title: 'Lone' } },
  ],
  durations: [{ id: 'x', start: '50/1', end: '60/1', metadata: { title: 'X' } }],
  relationships: [
    { a: { moment: 'a' }, b: { duration: 'x' } },
    { a: { moment: 'b' }, b: { moment: 'a' } },
    { a: { moment: 'b' }, b: { moment: 'c' } },
    { a: { moment: 'a' }, b: { moment: 'b' } },
  ],
});
const view = new Viewport(Q.from(-10n), Q.from(410n));
const arcs = (frame) => frame.edges.map((e) => `${e.id} ${e.first} ${e.last}`).sort();
test('relationships are undirected, canonical and deduplicated; self and dangling links fail', () => {
  const d = validateDocument(doc());
  assert.deepEqual(d.relationships, [
    { a: { duration: 'x' }, b: { moment: 'a' } },
    { a: { moment: 'a' }, b: { moment: 'b' } },
    { a: { moment: 'b' }, b: { moment: 'c' } },
  ]);
  for (const bad of [
    { a: { moment: 'a' }, b: { moment: 'a' } },
    { a: { moment: 'a' }, b: { moment: 'absent' } },
    { a: { moment: 'a' }, b: { event: 'b' } },
    { a: { moment: 'a' } },
    { a: { moment: 'a' }, b: { moment: 'b' }, label: 'extra' },
  ])
    assert.throws(() => validateDocument({ ...doc(), relationships: [bad] }));
  // Sparse documents may link entities they do not carry.
  assert.doesNotThrow(() => validateDocument({ ...doc(), events: [], durations: [] }, true));
});
test('the index follows links both ways, transitively, and keeps them through an undone delete', () => {
  const index = new TimelineIndex(validateDocument(doc()));
  assert.deepEqual([...index.relatedTo({ moment: 'a' })].sort(), ['d:x', 'm:b']);
  assert.deepEqual([...index.relatedTo({ moment: 'a' }, Infinity)].sort(), ['d:x', 'm:b', 'm:c']);
  assert.deepEqual([...index.relatedTo({ moment: 'lone' })], []);
  index.relate({ moment: 'lone' }, { moment: 'c' });
  assert.equal(index.relatedTo({ moment: 'a' }, Infinity).size, 4);
  assert.throws(() => index.relate({ moment: 'a' }, { moment: 'a' }), /itself/);
  index.unrelate({ moment: 'c' }, { moment: 'lone' });
  assert.equal(index.relatedTo({ moment: 'lone' }).size, 0);
  // Deleting a moment hides its links; restoring it brings them back.
  index.delete('b');
  assert.deepEqual([...index.relatedTo({ moment: 'a' })], ['d:x']);
  assert.equal(index.document().relationships.length, 1);
  index.put({ id: 'b', time: '100/1', metadata: { title: 'B' } });
  assert.equal(index.document().relationships.length, 3);
});
test('arcs run between moment times and duration starts; short arcs collapse', () => {
  const index = new TimelineIndex(validateDocument(doc()));
  assert.deepEqual(arcs(index.frame(view, 1000, 1)), [
    'd:x~m:a 0/1 50/1',
    'm:a~m:b 0/1 100/1',
    'm:b~m:c 100/1 200/1',
  ]);
  // 60 px over 410 units ≈ 24.6 units: the 50-unit arc stays, at 150 px it collapses.
  assert.equal(index.frame(view, 1000, 150).edges.length, 2);
  index.put({ id: 'c', time: '400/1', metadata: {} });
  assert(arcs(index.frame(view, 1000, 1)).includes('m:b~m:c 100/1 400/1'));
});
test('separations by relationship take the entity with direct or all connected relations', () => {
  const d = validateDocument(doc());
  const ids = (filter) => filterDocument(d, filter).events.map((e) => e.id);
  assert.deepEqual(ids({ related: { moment: 'a' }, depth: 'direct', mode: 'any' }), ['a', 'b']);
  assert.deepEqual(ids({ related: { moment: 'a' }, depth: 'all', mode: 'any' }), ['a', 'b', 'c']);
  assert.deepEqual(ids({ related: { moment: 'a' }, depth: 'all', mode: 'none' }), ['lone']);
  const near = filterDocument(d, { related: { moment: 'a' }, depth: 'direct', mode: 'any' });
  assert.deepEqual(
    near.durations.map((x) => x.id),
    ['x'],
  );
  // Links survive only within a side.
  assert.equal(near.relationships.length, 2);
});
test('sparse link edits overlay arcs, save as patches and cascade deleted entities', () => {
  const d = validateDocument(doc());
  const saved = new TimelineIndex(d).frame(view, 1000, 1);
  const remote = new RemoteWorkspace(d);
  remote.load(d.events[3]);
  remote.load(d.events[2]);
  remote.relate({ moment: 'lone' }, { moment: 'c' });
  remote.unrelate({ moment: 'a' }, { duration: 'x' });
  remote.put({ ...d.events[2], time: '250/1' });
  const overlaid = arcs(remote.overlay(saved, view, Q.from(1n, 1000n)));
  assert.deepEqual(overlaid, [
    'm:a~m:b 0/1 100/1',
    'm:b~m:c 100/1 250/1',
    'm:c~m:lone 250/1 300/1',
  ]);
  // The editor always loads a moment before deleting it.
  remote.load(d.events[1]);
  remote.delete('b');
  const patch = remote.patch();
  assert.equal(patch.relationshipChanges.length, 2);
  for (const result of [remote.apply(d), applyPatch(d, patch)])
    assert.deepEqual(validateDocument(result).relationships, [
      { a: { moment: 'c' }, b: { moment: 'lone' } },
    ]);
  const sent = remote.beginSave();
  remote.relate({ moment: 'a' }, { duration: 'x' });
  remote.accepted(sent);
  assert.deepEqual([...remote.relationshipChanges.keys()], ['d:x~m:a']);
});
test('merges treat links as a set and drop links to entities the merge removes', () => {
  const base = validateDocument(doc());
  const proposal = structuredClone(base);
  proposal.relationships.push({ a: { moment: 'c' }, b: { moment: 'lone' } });
  const upstream = structuredClone(base);
  upstream.events = upstream.events.filter((e) => e.id !== 'b');
  upstream.relationships = upstream.relationships.filter(
    (r) => r.a.moment !== 'b' && r.b.moment !== 'b',
  );
  const merged = rebaseDocument(base, proposal, upstream);
  assert.deepEqual(merged.relationships, [
    { a: { duration: 'x' }, b: { moment: 'a' } },
    { a: { moment: 'c' }, b: { moment: 'lone' } },
  ]);
});
