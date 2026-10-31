// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// Durations: fixed and anchored ends, pinning when an anchor is deleted, legacy links, interval
// queries, sparse edits, saving, merges and plugins.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  Q,
  TimelineIndex,
  Viewport,
  validateDocument,
  durationTree,
  durationWindow,
  arrangeDurations,
  compareDurationRank,
  durationCountText,
  DURATION_COUNT_CAP,
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
test('durations and arcs follow the moments they name, whatever else is edited', () => {
  const index = new TimelineIndex({
    format: 'openchronology',
    version: 1,
    title: 'Anchors',
    description: '',
    events: [
      { id: 'start', time: '0/1', metadata: { title: 'Start' } },
      { id: 'end', time: '10/1', metadata: { title: 'End' } },
      { id: 'other', time: '5/1', metadata: { title: 'Other' } },
    ],
    durations: [{ id: 'span', start: { moment: 'start' }, end: { moment: 'end' }, metadata: {} }],
    relationships: [{ a: { moment: 'start' }, b: { moment: 'other' } }],
  });
  // Moments a few units apart stay separate (arcs join separate markers).
  const view = new Viewport(Q.from(-5n), Q.from(50n));
  const band = () => index.frame(view, 1000).durations.find((d) => d.id === 'span');
  const arc = () => index.frame(view, 1000).edges.map((e) => `${e.first} ${e.last}`);
  assert.equal(band().last, '10/1');
  assert.deepEqual(arc(), ['0/1 5/1']);
  // Renaming an anchor, or moving a moment nothing names, changes neither.
  index.put({ id: 'end', time: '10/1', metadata: { title: 'Renamed' } });
  index.put({ id: 'unnamed', time: '7/1', metadata: {} });
  index.put({ id: 'unnamed', time: '8/1', metadata: {} });
  assert.equal(band().last, '10/1');
  // Moving a named moment moves its duration and its arcs.
  index.put({ id: 'end', time: '20/1', metadata: { title: 'Renamed' } });
  assert.equal(band().last, '20/1');
  index.put({ id: 'other', time: '30/1', metadata: { title: 'Other' } });
  assert.deepEqual(arc(), ['0/1 30/1']);
  // A deleted anchor's time stays with what names it, until the moment returns elsewhere.
  index.delete('end');
  assert.equal(band().last, '20/1');
  index.put({ id: 'end', time: '40/1', metadata: {} });
  assert.equal(band().last, '40/1');
  // Deleting a moment ends its arcs.
  index.delete('other');
  assert.deepEqual(arc(), []);
});

// A band as the window sends it, from `first` to `last`, titled.
const band = (id, first, last, title = id, sourceKey) => ({
  id,
  start: String(first),
  end: String(last),
  first: Q.from(BigInt(first)).toString(),
  last: Q.from(BigInt(last)).toString(),
  startTime: Q.from(BigInt(first)).toString(),
  endTime: Q.from(BigInt(last)).toString(),
  metadata: { title },
  ...(sourceKey ? { sourceKey } : {}),
});
test('past 256 bands, a window counts its durations up to the cap (#316)', () => {
  const same = (n) =>
    Array.from({ length: n }, (_, i) => ({
      id: 'd' + i,
      start: '0/1',
      end: '100/1',
      metadata: {},
    }));
  const few = durationWindow(
    durationTree(same(10), () => undefined),
    Q.zero,
    Q.from(100n),
  );
  assert.equal(few.durationsTruncated, false);
  assert.equal(few.durationsTotal, undefined);
  const many = durationWindow(
    durationTree(same(3000), () => undefined),
    Q.zero,
    Q.from(100n),
  );
  assert.equal(many.durations.length, 256);
  assert.equal(many.durationsTotal, 3000);
  assert.equal(many.durationsTotalMore, undefined);
  const beyond = durationWindow(
    durationTree(same(DURATION_COUNT_CAP + 5), () => undefined),
    Q.zero,
    Q.from(100n),
  );
  assert.equal(beyond.durationsTotal, DURATION_COUNT_CAP);
  assert.equal(beyond.durationsTotalMore, true);
  assert.equal(durationCountText(DURATION_COUNT_CAP, true), '10,000+');
  // A dense window sends its longest, in start order: spans longer than the 3,000 same ones
  // but starting after them are kept, though the first 256 by start would leave them out.
  const later = Array.from({ length: 18 }, (_, i) => ({
    id: 'later' + i,
    start: `${105 + i * 80}/1`,
    end: `${1000 + i * 90}/1`,
    metadata: {},
  }));
  const ranked = durationWindow(
    durationTree([...same(3000), ...later], () => undefined),
    Q.zero,
    Q.from(3000n),
  );
  const kept = ranked.durations.map((b) => b.id);
  assert.equal(kept.length, 256);
  assert(later.every((d) => kept.includes(d.id)));
  assert.deepEqual(
    ranked.durations.map((b) => Q.parse(b.first)),
    ranked.durations.map((b) => Q.parse(b.first)).sort((a, b) => a.compare(b)),
  );
  assert.equal(durationCountText(1234), '1,234');
});
test('nearly identical spans share one band; rows go longest first and stop at the cap (#316)', () => {
  // One pixel per unit of time; grouping within 5 pixels.
  const pixels = (span) =>
    Number(span.toString().split('/')[0]) / Number(span.toString().split('/')[1]);
  const bands = [
    band('era', 0, 1000, 'An era'),
    ...Array.from({ length: 40 }, (_, i) =>
      band('same' + i, 100 + (i % 3), 300 - (i % 4), 'Same ' + i),
    ),
    band('short', 400, 450, 'Short'),
    // Six bands overlapping each other, apart from the rest, to fill rows past the cap.
    ...Array.from({ length: 6 }, (_, i) =>
      band('stack' + i, 500 + i * 30, 900 - i * 20, 'Stack ' + i),
    ),
  ];
  const { shown, hidden } = arrangeDurations(bands, pixels, 5, 4);
  // The forty near-identical spans are one band, led by the first in rank order.
  const same = shown.find((s) => s.band.id.startsWith('same'));
  assert.equal(same.members.length, 40);
  assert.equal(
    same.band.id,
    [...bands].filter((b) => b.id.startsWith('same')).sort(compareDurationRank)[0].id,
  );
  // The longest takes the first row.
  assert.equal(shown.find((s) => s.band.id === 'era').row, 0);
  // No two bands in one row overlap (#269).
  for (const a of shown)
    for (const b of shown)
      if (a !== b && a.row === b.row && (a.band.sourceKey ?? '') === (b.band.sourceKey ?? ''))
        assert(
          Q.parse(a.band.last).compare(Q.parse(b.band.first)) <= 0 ||
            Q.parse(b.band.last).compare(Q.parse(a.band.first)) <= 0,
        );
  // At most four rows; what needed more is hidden, every band accounted for once.
  assert(shown.every((s) => s.row < 4));
  const hiddenIds = hidden.flatMap((h) => h.bands.map((b) => b.id));
  assert(hiddenIds.length > 0);
  assert.equal(shown.reduce((n, s) => n + s.members.length, 0) + hiddenIds.length, bands.length);
  // A comparison's timelines are arranged apart, each with its own rows.
  const two = arrangeDurations(
    [band('a', 0, 10, 'A', 'one'), band('b', 0, 10, 'B', 'two')],
    pixels,
    0,
    1,
  );
  assert.deepEqual(two.shown.map((s) => [s.band.sourceKey, s.row]).sort(), [
    ['one', 0],
    ['two', 0],
  ]);
});
test('the arrangement depends on the durations, not on where the view is (#316)', () => {
  const bands = Array.from({ length: 300 }, (_, i) =>
    band('d' + i, (i * 37) % 500, ((i * 37) % 500) + 50 + ((i * 13) % 400), 'D' + (i % 7)),
  );
  const pixels = (span) =>
    Number(span.toString().split('/')[0]) / Number(span.toString().split('/')[1]);
  const layout = (list) =>
    JSON.stringify(
      arrangeDurations(list, pixels, 3, 8).shown.map((s) => [s.band.id, s.row, s.members.length]),
    );
  const first = layout(bands);
  // Same bands in another order (a different window's tree walk): the same layout.
  assert.equal(layout([...bands].reverse()), first);
  assert.equal(layout([...bands].sort(() => 0.5 - Math.random())), first);
  // Panning only moves the bands; grouping uses distances in time, so nothing reshuffles.
  assert.equal(layout(bands.map((b) => ({ ...b }))), first);
});
test('a dense window keeps exactly the longest durations and counts them (#316, randomized)', () => {
  let seed = 316;
  const random = (n) => (seed = (seed * 1103515245 + 12345) % 2147483648) % n;
  for (let round = 0; round < 40; round++) {
    const durations = Array.from({ length: 50 + random(900) }, (_, i) => {
      const start = random(200),
        length = random(4) === 0 ? random(400) : random(60);
      return {
        id: 'd' + String(random(100000)).padStart(5, '0') + '-' + i,
        start: `${start}/1`,
        end: `${start + length}/${1 + random(2)}`,
        metadata: {},
      };
    });
    const tree = durationTree(durations, () => undefined);
    const lower = Q.from(BigInt(random(150))),
      upper = lower.add(Q.from(BigInt(1 + random(120)))),
      threshold = random(3) ? Q.from(BigInt(random(30))) : null,
      limit = 1 + random(80);
    const window = durationWindow(tree, lower, upper, limit, threshold);
    // Brute force: every duration touching the window and reaching the threshold, ranked.
    const all = durations
      .map((d) => {
        const a = Q.parse(d.start),
          b = Q.parse(d.end);
        return { id: d.id, first: a.min(b), last: a.max(b) };
      })
      .filter(
        (b) =>
          b.first.compare(upper) <= 0 &&
          b.last.compare(lower) >= 0 &&
          (threshold === null || b.last.sub(b.first).compare(threshold) >= 0),
      )
      .sort(
        (a, b) =>
          b.last.sub(b.first).compare(a.last.sub(a.first)) ||
          a.first.compare(b.first) ||
          (a.id < b.id ? -1 : 1),
      );
    const expected = all
      .slice(0, limit)
      .sort((a, b) => a.first.compare(b.first) || (a.id < b.id ? -1 : 1))
      .map((b) => b.id);
    assert.deepEqual(
      window.durations.map((b) => b.id),
      expected,
      `round ${round}`,
    );
    assert.equal(window.durationsTruncated, all.length > limit);
    assert.equal(window.durationsTotal, all.length > limit ? all.length : undefined);
  }
});
