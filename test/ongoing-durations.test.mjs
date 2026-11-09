// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// Ongoing durations (#537): an end that is "now", accepted only on Gregorian timelines, left out
// of the interval trees and resolved at the current time when a window is drawn.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_PRESENTATION,
  Q,
  TimelineIndex,
  Viewport,
  validateDocument,
  validateDuration,
  resolveDuration,
  durationTree,
  durationWindow,
  withOngoing,
  summariesWithOngoing,
  nowCoordinate,
  isOngoing,
  printEntityTime,
  frameWithOngoing,
  filterDocument,
} from '../dist/core.mjs';
import { RemoteWorkspace } from '../dist/remote-cache.mjs';

const gregorian = { ...DEFAULT_PRESENTATION, mode: 'gregorian' };
const doc = (presentation = gregorian) => ({
  format: 'openchronology',
  version: 1,
  title: 'Work in progress',
  description: '',
  ...(presentation ? { presentation } : {}),
  events: [{ id: 'opened', time: '1000/1', metadata: { title: 'Opened' } }],
  durations: [
    {
      id: 'issue',
      start: { moment: 'opened' },
      end: { ongoing: true },
      metadata: { title: 'Issue' },
    },
    { id: 'done', start: '0/1', end: '500/1', metadata: { title: 'Done' } },
  ],
});
// A clock at 2,000 seconds after the epoch.
const at = (seconds) => () => seconds * 1000;

test('an ongoing end is accepted on a Gregorian timeline, and only as an end', () => {
  const valid = validateDocument(doc());
  assert.deepEqual(valid.durations.find((d) => d.id === 'issue').end, { ongoing: true });
  assert.ok(isOngoing(valid.durations.find((d) => d.id === 'issue').end));
  assert.throws(
    () => validateDuration({ id: 'x', start: { ongoing: true }, end: '1/1' }, Q.parse),
    /duration start is an exact time/,
  );
  assert.throws(
    () => validateDuration({ id: 'x', start: '1/1', end: { ongoing: false } }, Q.parse),
    /duration end is an exact time/,
  );
  assert.throws(
    () => validateDuration({ id: 'x', start: '1/1', end: { ongoing: true, extra: 1 } }, Q.parse),
    /duration end is an exact time/,
  );
});

test('timelines without a calendar have no "now", so they refuse ongoing durations', () => {
  assert.throws(() => validateDocument(doc(null)), /Gregorian time display/);
  assert.throws(
    () => validateDocument(doc({ ...gregorian, mode: 'rational' })),
    /Gregorian time display/,
  );
  // A partial save carries no settings: its timeline's were checked when they were saved.
  assert.equal(validateDocument(doc(null), true).durations.length, 2);
});

test('"now" maps through the Gregorian scale and origin', () => {
  assert.equal(nowCoordinate(gregorian, 2500).toString(), '5/2');
  assert.equal(
    nowCoordinate({ ...gregorian, scale: '1/86400', origin: '40587/1' }, 86400000).toString(),
    '40588/1',
  );
  assert.equal(nowCoordinate(undefined, 2500), null);
  assert.equal(nowCoordinate({ ...gregorian, mode: 'si' }, 2500), null);
});

test('an ongoing duration resolves to now, never before its start', () => {
  const issue = { id: 'issue', start: '1000/1', end: { ongoing: true }, metadata: {} },
    times = () => undefined;
  const band = resolveDuration(issue, times, Q.from(2000n));
  assert.deepEqual([band.first, band.last, band.endTime], ['1000/1', '2000/1', '2000/1']);
  // Starting later than now, it is a point at its start until then.
  assert.equal(resolveDuration(issue, times, Q.from(10n)).last, '1000/1');
  // Without a clock, it is the placeholder the trees hold: a point at its start.
  assert.equal(resolveDuration(issue, times).last, '1000/1');
});

test('a frame draws an ongoing band up to now, and it grows with the clock', () => {
  const index = new TimelineIndex(validateDocument(doc()));
  index.clock = at(2000);
  const view = new Viewport(Q.zero, Q.from(5000n));
  let issue = index.frame(view, 1000).durations.find((d) => d.id === 'issue');
  assert.deepEqual([issue.first, issue.last], ['1000/1', '2000/1']);
  index.clock = at(3000);
  issue = index.frame(view, 1000).durations.find((d) => d.id === 'issue');
  assert.equal(issue.last, '3000/1');
  // A window entirely after now does not reach it; one before its start does not either.
  const later = index.frame(new Viewport(Q.from(3500n), Q.from(100n)), 1000);
  assert.ok(!later.durations.some((d) => d.id === 'issue'));
  const earlier = index.frame(new Viewport(Q.from(600n), Q.from(100n)), 1000);
  assert.ok(!earlier.durations.some((d) => d.id === 'issue'));
});

test('a short ongoing duration is summarized like any collapsed duration', () => {
  const index = new TimelineIndex(validateDocument(doc()));
  index.clock = at(1001);
  // 1,000,000 seconds across 1,000 pixels: the one-second duration collapses.
  const frame = index.frame(new Viewport(Q.zero, Q.from(1000000n)), 1000);
  assert.ok(!frame.durations.some((d) => d.id === 'issue'));
  // Both collapsed durations are counted: the finished one and the ongoing one.
  assert.equal(
    frame.groups.reduce((n, g) => n + BigInt(g.durationCount ?? '0'), 0n),
    2n,
  );
});

test('joining a window keeps the longest and counts every match', () => {
  const fixed = Array.from({ length: 4 }, (_, i) => ({
    id: 'f' + i,
    start: String(i),
    end: String(i + 10),
    metadata: {},
  }));
  const tree = durationTree(fixed, () => undefined),
    lower = Q.zero,
    upper = Q.from(100n);
  const long = resolveDuration(
    { id: 'long', start: '0', end: { ongoing: true }, metadata: { title: 'Long' } },
    () => undefined,
    Q.from(90n),
  );
  const joined = withOngoing(durationWindow(tree, lower, upper, 3), [long], lower, upper, 3);
  assert.equal(joined.durationsTruncated, true);
  assert.equal(joined.durationsTotal, 5);
  // The three longest are kept, then listed in start order (f0 and long both start at 0).
  assert.deepEqual(
    joined.durations.map((d) => d.id),
    ['f0', 'long', 'f1'],
  );
  // Nothing ongoing in the window leaves it as it was.
  const window = durationWindow(tree, lower, upper, 3);
  assert.equal(withOngoing(window, [], lower, upper, 3), window);
  // Summaries gain the collapsed ones, in start order.
  const short = { ...long, id: 'short', first: '5', last: '6', startTime: '5', endTime: '6' };
  assert.deepEqual(
    summariesWithOngoing(
      [{ first: '1', last: '2', count: 2 }],
      [short, long],
      lower,
      upper,
      Q.from(3n),
    ).map((s) => [s.first, s.count]),
    [
      ['1', 2],
      ['5', 1],
    ],
  );
});

test('an ongoing end reads as "now"', () => {
  assert.equal(printEntityTime(null, { start: '1/1', end: { ongoing: true } }), '1/1 – now');
});

test("a store's placeholder window, joined with its ongoing durations, is what the index draws", () => {
  const now = 50000;
  const durations = [];
  for (let i = 0; i < 40; i++)
    durations.push({
      id: 'd' + String(i).padStart(2, '0'),
      start: String(i * 1000),
      end: i % 3 ? String(i * 1000 + (i % 7) * 400) : { ongoing: true },
      metadata: { title: 'Span ' + i },
    });
  const document = validateDocument({ ...doc(), events: [], durations });
  // The stores hold each ongoing duration as a point at its start.
  const placeholders = validateDocument({
    ...doc(),
    events: [],
    durations: durations.map((d) => (isOngoing(d.end) ? { ...d, end: d.start } : d)),
  });
  const ongoing = document.durations
    .filter((d) => isOngoing(d.end))
    .map((d) => resolveDuration(d, () => undefined, Q.from(BigInt(now))));
  for (const [left, span] of [
    [0, 60000],
    [0, 600000],
    [20000, 3000],
    [45000, 20000],
  ]) {
    const view = new Viewport(Q.from(BigInt(left)), Q.from(BigInt(span)));
    const index = new TimelineIndex(document);
    index.clock = at(now);
    const expected = index.frame(view, 1000);
    const stored = new TimelineIndex(placeholders).frame(view, 1000);
    const threshold = view.threshold(1000, 24);
    const joined = frameWithOngoing(stored, ongoing, view.left, view.right, threshold);
    const ids = (f) => f.durations.map((d) => d.id + ':' + d.last).sort();
    assert.deepEqual(ids(joined), ids(expected), `bands in [${left}, +${span}]`);
    const counted = (f) => f.groups.reduce((n, g) => n + BigInt(g.durationCount ?? '0'), 0n);
    assert.equal(counted(joined), counted(expected), `summaries in [${left}, +${span}]`);
  }
});

test("a server window's ongoing band keeps the end it was resolved at under unsaved edits", () => {
  const start = '1000';
  const workspace = new RemoteWorkspace(validateDocument(doc()));
  const band = {
    ...resolveDuration(
      { id: 'open', start, end: { ongoing: true }, metadata: { title: 'Open' } },
      () => undefined,
      Q.parse('5000'),
    ),
  };
  assert.equal(band.last, '5000/1');
  const frame = { groups: [], durations: [band] };
  const [overlaid] = workspace.overlay(
    frame,
    new Viewport(Q.zero, Q.parse('9000')),
    Q.zero,
  ).durations;
  assert.equal(overlaid.last, '5000/1', 'not a point at its start');
  assert.ok(isOngoing(overlaid.end));
});

test('a separated side keeps an ongoing end, to resolve when it is drawn', () => {
  const d = validateDocument(doc());
  for (const filter of [
    { tags: ['nothing'], mode: 'none' },
    { separations: [{ related: { duration: 'issue' }, depth: 'direct' }], track: 0 },
  ]) {
    const issue = filterDocument(d, filter).durations?.find((x) => x.id === 'issue');
    assert.ok(issue, JSON.stringify(filter));
    assert.deepEqual(issue.end, { ongoing: true });
    assert.equal(issue.start, '1000/1');
  }
  // Drawn from its side, it ends at the clock like the whole timeline's.
  const side = new TimelineIndex(
    validateDocument(filterDocument(d, { tags: ['nothing'], mode: 'none' })),
  );
  side.clock = at(2000);
  const issue = side
    .frame(new Viewport(Q.zero, Q.from(5000n)), 1000)
    .durations.find((b) => b.id === 'issue');
  assert.equal(issue.last, '2000/1');
});
