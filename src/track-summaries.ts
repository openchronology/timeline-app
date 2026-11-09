// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
/**
 * Separations drawn as tracks (#560), summarized like moments and durations: a separation
 * whose disjoin and union are closer than the grouping distance is a summary on the track it
 * unites into, with everything it held between them; and a separation's track with nothing in
 * view is not drawn.
 */
import { Rational as Q } from 'rational-ordered-map';
import type { DurationBand, Frame, FrameGroup } from './core.js';

/** A group on the shared axis of separated tracks: its track, and where its members are. */
export interface TrackGroup extends FrameGroup {
  /** The track it is drawn on. */
  sourceKey?: string;
  /** The tracks its members are read from, where they are not its own (a collapsed span). */
  sources?: string[];
}
/** A separation's track from its disjoin (`begins`) to its union into track `into`. */
export interface TrackSpan {
  key: string;
  into: string;
  begins: Q;
  ends: Q;
}

const membersOf = (g: TrackGroup) => g.sources ?? (g.sourceKey ? [g.sourceKey] : []);
const summed = (groups: readonly TrackGroup[], bands: readonly DurationBand[], key: string) => {
  let count = 0n,
    durations = BigInt(bands.length),
    distinct = 0;
  let first: Q | null = null,
    last: Q | null = null;
  const sources = new Set<string>();
  const extend = (from: Q, to: Q) => {
    if (!first || from.compare(first) < 0) first = from;
    if (!last || to.compare(last) > 0) last = to;
  };
  for (const g of groups) {
    count += BigInt(g.count);
    durations += BigInt(g.durationCount ?? '0');
    distinct += g.distinct;
    extend(Q.parse(g.first), Q.parse(g.last));
    for (const source of membersOf(g)) sources.add(source);
  }
  for (const b of bands) {
    extend(Q.parse(b.first), Q.parse(b.first));
    sources.add(b.sourceKey ?? key);
  }
  return {
    first: first! as Q,
    last: last! as Q,
    group: {
      count: count.toString(),
      distinct,
      ...(durations ? { durationCount: durations.toString() } : {}),
      sources: [...sources].sort(),
    },
  };
};

/**
 * The spans narrower than `threshold`, inner ones first: a span uniting into a track that is
 * itself narrow collapses before it, so its summary moves on with that track's.
 */
function narrowSpans(spans: readonly TrackSpan[], threshold: Q): TrackSpan[] {
  const narrow = spans.filter((s) => s.ends.sub(s.begins).compare(threshold) < 0);
  const ordered: TrackSpan[] = [];
  const left = [...narrow];
  while (left.length) {
    const next = left.findIndex((s) => !left.some((other) => other !== s && other.into === s.key));
    ordered.push(...left.splice(Math.max(0, next), 1));
  }
  return ordered;
}

/**
 * `frame` (the joined frames of a separation's tracks) with each span narrower than
 * `threshold` collapsed: the groups of its track that meet the span, and the bands that begin
 * in it, become one summary on the track it unites into, which takes in that track's groups
 * within the threshold of it, as moments group. A lone moment or duration moves as itself.
 * Returns the frame and the spans collapsed.
 */
export function collapseTrackSpans(
  frame: Frame,
  spans: readonly TrackSpan[],
  threshold: Q,
): { frame: Frame; collapsed: TrackSpan[] } {
  const collapsed = narrowSpans(spans, threshold);
  if (!collapsed.length) return { frame, collapsed };
  let groups = frame.groups as TrackGroup[];
  let bands = frame.durations ?? [];
  for (const span of collapsed) {
    const meets = (first: Q, last: Q) =>
      last.compare(span.begins) >= 0 && first.compare(span.ends) <= 0;
    const moved = groups.filter(
      (g) => g.sourceKey === span.key && meets(Q.parse(g.first), Q.parse(g.last)),
    );
    const movedBands = bands.filter((b) => {
      const start = Q.parse(b.first);
      return b.sourceKey === span.key && meets(start, start);
    });
    if (!moved.length && !movedBands.length) continue;
    groups = groups.filter((g) => !moved.includes(g));
    bands = bands.filter((b) => !movedBands.includes(b));
    let summary: TrackGroup;
    if (moved.length === 1 && !movedBands.length)
      summary = { ...moved[0], sourceKey: span.into, sources: membersOf(moved[0]) };
    else {
      const { first, last, group } = summed(moved, movedBands, span.key);
      summary = {
        ...group,
        first: first.toString(),
        last: last.toString(),
        sourceKey: span.into,
        // A lone duration reads like itself.
        ...(movedBands.length === 1 && !moved.length ? { duration: movedBands[0] } : {}),
      };
    }
    // Nearby groups on its new track join it, while the whole spans less than the threshold.
    for (;;) {
      const first = Q.parse(summary.first),
        last = Q.parse(summary.last);
      const near = groups.find((g) => {
        if (g.sourceKey !== span.into) return false;
        const from = Q.parse(g.first).compare(first) < 0 ? Q.parse(g.first) : first,
          to = Q.parse(g.last).compare(last) > 0 ? Q.parse(g.last) : last;
        return to.sub(from).compare(threshold) < 0;
      });
      if (!near) break;
      groups = groups.filter((g) => g !== near);
      const joined = summed([summary, near], [], span.into);
      summary = {
        ...joined.group,
        first: joined.first.toString(),
        last: joined.last.toString(),
        sourceKey: span.into,
      };
    }
    groups = [...groups, summary];
  }
  return { frame: { ...frame, groups, durations: bands }, collapsed };
}

/**
 * The tracks with something in the view [left, right]: a group or a band of theirs that meets
 * it. `always` (the rest of the timeline) is shown either way.
 */
export function shownTracks(
  frame: Frame,
  keys: readonly string[],
  left: Q,
  right: Q,
  always?: string,
): Set<string> {
  const shown = new Set<string>(always === undefined ? [] : [always]);
  const meets = (first: string, last: string) =>
    Q.parse(last).compare(left) >= 0 && Q.parse(first).compare(right) <= 0;
  for (const g of frame.groups as TrackGroup[])
    if (g.sourceKey && meets(g.first, g.last) && BigInt(g.count) + BigInt(g.durationCount ?? '0'))
      shown.add(g.sourceKey);
  for (const b of frame.durations ?? [])
    if (b.sourceKey && meets(b.first, b.last)) shown.add(b.sourceKey);
  return new Set(keys.filter((k) => shown.has(k)));
}
