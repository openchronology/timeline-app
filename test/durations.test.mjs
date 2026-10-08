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
  fixMissingAnchors,
  durationPlugins,
  momentPlugins,
  pluginColor,
  BUILTIN_PLUGINS,
} from '../dist/core.mjs';
import { RemoteWorkspace, ViewportCache, applyChanges } from '../dist/remote-cache.mjs';
import { applyPatch } from '../server/store.mjs';
import { rebaseDocument } from '../server/merge.mjs';
const doc = () => ({
  format: 'openchronology',
  version: 1,
  title: 'Standalone durations',
  description: '',
  events: [
    { id: 'start', time: '-100/1', metadata: { title: 'Start' } },
    { id: 'end', time: '100/1', metadata: { title: 'End' } },
  ],
  durations: [
    {
      id: 'span',
      start: { moment: 'start' },
      end: { moment: 'end' },
      metadata: { title: 'Long span', description: 'Notes', custom: { retained: true } },
    },
    { id: 'fixed', start: '-5/1', end: '1/3', metadata: { title: 'Fixed' } },
    { id: 'mixed', start: { moment: 'end' }, end: '200/1', metadata: {} },
  ],
});
const legacy = () => ({
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
        durations: [{ id: 'span', endId: 'end', metadata: { title: 'Long span' } }],
      },
    },
    { id: 'end', time: '100/1', metadata: { title: 'End' } },
  ],
});
const fixedOf = (d) => d.durations.find((x) => x.id === 'fixed');
const ids = (frame) => frame.durations.map((d) => d.id).sort();
test('fixed and anchored endpoints resolve exactly and survive JSON round trips', () => {
  const source = validateDocument(doc()),
    index = new TimelineIndex(source),
    view = new Viewport(Q.zero, Q.one);
  const frame = index.frame(view, 1000);
  assert.equal(frame.groups.length, 0);
  assert.deepEqual(ids(frame), ['fixed', 'span']);
  const span = frame.durations.find((d) => d.id === 'span');
  assert.equal(span.first, '-100/1');
  assert.equal(span.last, '100/1');
  assert.deepEqual(span.start, { moment: 'start' });
  assert.deepEqual(validateDocument(JSON.parse(JSON.stringify(index.document()))), source);
  // An anchored endpoint follows its moment; a fixed one does not.
  index.put({ ...source.events[1], time: '1/3' });
  // The span no longer reaches 150; the mixed duration now starts at the moved moment.
  const moved = index.frame(new Viewport(Q.from(150n), Q.one), 1000);
  assert.deepEqual(ids(moved), ['mixed']);
  assert.equal(index.frame(view, 1000).durations.find((d) => d.id === 'span').last, '1/3');
  assert.equal(index.frame(view, 1000).durations.find((d) => d.id === 'mixed').first, '1/3');
});
test('deleting an anchoring moment pins its durations; undoing the delete re-anchors them', () => {
  const index = new TimelineIndex(validateDocument(doc())),
    view = new Viewport(Q.zero, Q.one);
  index.delete('end');
  // Unsaved, the band stays at the moment's last time.
  assert.equal(index.frame(view, 1000).durations.find((d) => d.id === 'span').last, '100/1');
  const exported = index.document();
  assert.equal(exported.durations.find((d) => d.id === 'span').end, '100/1');
  assert.equal(exported.durations.find((d) => d.id === 'mixed').start, '100/1');
  assert.doesNotThrow(() => validateDocument(exported));
  index.put({ id: 'end', time: '50/1', metadata: {} });
  assert.deepEqual(index.document().durations.find((d) => d.id === 'span').end, { moment: 'end' });
  assert.equal(index.frame(view, 1000).durations.find((d) => d.id === 'span').last, '50/1');
  index.deleteDuration('span');
  assert.deepEqual(
    index.document().durations.map((d) => d.id),
    ['fixed', 'mixed'],
  );
});
test('legacy links convert to standalone durations anchored to both moments', () => {
  const converted = validateDocument(legacy());
  assert.equal(converted.events[0].metadata.durations, undefined);
  assert.deepEqual(converted.durations, [
    {
      id: 'span',
      start: { moment: 'start' },
      end: { moment: 'end' },
      metadata: { title: 'Long span' },
    },
  ]);
  // Conversion is idempotent and stable through export.
  assert.deepEqual(validateDocument(new TimelineIndex(converted).document()), converted);
  for (const mutate of [
    (d) => (d.events[0].metadata.durations[0].endId = 'start'),
    (d) => (d.events[0].metadata.durations[0].endId = 'missing'),
    (d) => (d.events[0].metadata.durations = 'not an array'),
  ]) {
    const d = legacy();
    mutate(d);
    assert.throws(() => validateDocument(d));
  }
});
test('invalid endpoints, unknown anchors, duplicate IDs and malformed metadata are rejected', () => {
  for (const mutate of [
    (d) => (d.durations[0].start = { moment: 'missing' }),
    (d) => (d.durations[0].start = { moment: 'start', extra: 1 }),
    (d) => (d.durations[0].start = 12),
    (d) => (fixedOf(d).end = 'not a time'),
    (d) => d.durations.push(d.durations[0]),
    (d) => (d.durations[0].metadata.title = 42),
    (d) => (d.durations[0].metadata.durations = []),
    (d) => (d.durations = {}),
  ]) {
    const d = doc();
    mutate(d);
    assert.throws(() => validateDocument(d));
  }
  // Partial documents (sparse saves) may name moments they do not carry.
  assert.doesNotThrow(() => validateDocument({ ...doc(), events: [] }, true));
});
test('bounded interval queries prune off-screen spans and cope with reversed endpoints and huge rationals', () => {
  const durations = [];
  const offset = 10n ** 500n,
    denominator = 10n ** 600n;
  for (let i = 0; i < 300; i++)
    durations.push({
      id: 'd' + i,
      start: Q.from(offset * denominator + BigInt(i), denominator).toString(),
      end: Q.from(offset * denominator + BigInt(i + 1), denominator).toString(),
      metadata: {},
    });
  const tree = durationTree(durations, () => undefined);
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
  const reversed = durationTree(
    [{ id: 'r', start: '200/1', end: '100/1', metadata: {} }],
    () => undefined,
  );
  assert.equal(durationWindow(reversed, Q.from(150n), Q.from(151n)).durations.length, 1);
  // Anchors to unknown moments are skipped rather than placed at an invented coordinate.
  assert.equal(
    durationTree(
      [{ id: 'x', start: { moment: 'gone' }, end: '1/1', metadata: {} }],
      () => undefined,
    ),
    null,
  );
});
test('sparse edits overlay bands, save as patches, and apply exactly to saved documents', () => {
  const d = validateDocument(doc()),
    remote = new RemoteWorkspace(d),
    view = new Viewport(Q.zero, Q.one),
    original = new TimelineIndex(d).frame(view, 1000);
  assert.deepEqual(remote.document().durations, undefined);
  // Moving an anchoring moment carries saved bands that follow it.
  remote.load(d.events[1]);
  remote.put({ ...d.events[1], time: '1/2' });
  assert.equal(
    remote.overlay(original, view, Q.zero).durations.find((b) => b.id === 'span').last,
    '1/2',
  );
  // Edited durations replace their saved bands; new ones appear.
  remote.loadDuration(fixedOf(d));
  remote.putDuration({ ...fixedOf(d), end: '2/3', metadata: { title: 'Edited' } });
  remote.putDuration({ id: 'new', start: '0/1', end: { moment: 'end' }, metadata: {} });
  const overlaid = remote.overlay(original, view, Q.zero).durations;
  assert.equal(overlaid.find((b) => b.id === 'fixed').last, '2/3');
  assert.equal(overlaid.find((b) => b.id === 'new').last, '1/2');
  const patch = remote.patch();
  assert.deepEqual(patch.durationChanges.map((c) => c.id).sort(), ['fixed', 'new']);
  // Deleting a moment pins anchored durations in both client and server application.
  remote.delete('end');
  const sparse = remote.patch();
  const local = remote.apply(d);
  const server = applyPatch(d, sparse);
  for (const result of [local, server]) {
    const v = validateDocument(result);
    assert.equal(v.events.length, 1);
    assert.equal(v.durations.find((x) => x.id === 'span').end, '100/1');
    assert.equal(v.durations.find((x) => x.id === 'new').end, '100/1');
    assert.equal(v.durations.find((x) => x.id === 'fixed').end, '2/3');
  }
  remote.deleteDuration('fixed');
  assert.equal(
    validateDocument(
      applyChanges(d, remote.document(), remote.changes, remote.durationChanges),
    ).durations.some((x) => x.id === 'fixed'),
    false,
  );
  const cache = new ViewportCache();
  const query = cache.plan(view, 1000, 24);
  cache.store(query, original);
  assert.equal(cache.visible(view).durations.length, 2);
});
test('saving accepts sent duration edits and keeps edits made during the save', () => {
  const d = validateDocument(doc()),
    remote = new RemoteWorkspace(d);
  remote.loadDuration(fixedOf(d));
  remote.putDuration({ ...fixedOf(d), metadata: { title: 'First' } });
  const sent = remote.beginSave();
  remote.putDuration({ ...fixedOf(d), metadata: { title: 'Second' } });
  remote.accepted(sent);
  assert.deepEqual(remote.durationChanges.get('fixed').before.metadata, { title: 'First' });
  assert.deepEqual(remote.durationChanges.get('fixed').after.metadata, { title: 'Second' });
  remote.accepted(remote.beginSave());
  assert.equal(remote.durationChanges.size, 0);
});
test('merges compare durations by ID and pin anchors whose moments the merge deletes', () => {
  const base = validateDocument(doc());
  const proposal = structuredClone(base);
  proposal.durations.find((d) => d.id === 'fixed').metadata.title = 'Proposed';
  const upstream = structuredClone(base);
  upstream.events = upstream.events.filter((e) => e.id !== 'end');
  upstream.durations = fixMissingAnchors(
    upstream.durations,
    (id) => id === 'start',
    () => '100/1',
  );
  const merged = rebaseDocument(base, proposal, upstream);
  assert.equal(merged.durations.find((d) => d.id === 'fixed').metadata.title, 'Proposed');
  assert.equal(merged.durations.find((d) => d.id === 'span').end, '100/1');
  // Legacy saved versions merge after conversion.
  assert.equal(rebaseDocument(legacy(), legacy(), legacy()).durations.length, 1);
  const conflicting = structuredClone(base);
  conflicting.durations.find((d) => d.id === 'fixed').metadata.title = 'Other';
  assert.throws(() => rebaseDocument(base, proposal, conflicting), /duration fixed/);
});
test('colors and hover cards apply to durations; moment-only plugins do not', () => {
  const byId = Object.fromEntries(BUILTIN_PLUGINS.map((p) => [p.id, p]));
  const installed = Object.values(byId).map((manifest) => ({ manifest, enabled: true }));
  const durationIds = durationPlugins(installed).map((p) => p.manifest.id);
  assert(durationIds.includes('moment-colors'));
  assert(durationIds.includes('focus-on-hover'));
  for (const id of ['moment-stacks', 'moment-shapes', 'moment-icons', 'expand-on-hover'])
    if (byId[id]) assert(!durationIds.includes(id), id);
  assert.equal(pluginColor(durationPlugins(installed), { color: '#AA0000' }), '#aa0000');
  // Explicit targets override the default, in both directions.
  const custom = (targets) => ({
    enabled: true,
    manifest: {
      apiVersion: 1,
      id: 'custom',
      version: 1,
      name: 'Custom',
      description: 'Custom',
      fields: [{ kind: 'shape', metadataKey: 'form', label: 'Form' }],
      targets,
    },
  });
  assert.equal(durationPlugins([custom(['durations'])])[0].manifest.fields.length, 0);
  assert.equal(momentPlugins([custom(['durations'])]).length, 0);
  assert.equal(momentPlugins([custom(['moments'])]).length, 1);
  assert.equal(durationPlugins([custom(['moments'])]).length, 0);
});
