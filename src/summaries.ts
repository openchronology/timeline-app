// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// Summary groups: collapsed durations in frame form, and nearby groups merged into one at the
// view's grouping distance.
import { Rational as Q } from 'rational-ordered-map';
import { durationOverview, isOngoing, summariesWithOngoing, withOngoing } from './durations.js';
import type { DurationBand, DurationSummary } from './durations.js';
import type { Frame, FrameGroup } from './core.js';
import { addMeasureTotals, entityTotals } from './measures.js';

/** Groups of collapsed durations, in frame form: no moments, a duration count. */
export function durationGroups(summaries: readonly DurationSummary[]): FrameGroup[] {
  return summaries.map((s) => ({
    first: s.first,
    last: s.last,
    count: '0',
    distinct: 0,
    durationCount: String(s.count),
    ...(s.band ? { duration: { ...s.band, metadata: durationOverview(s.band.metadata) } } : {}),
    // Its durations' measure totals, each counted where it starts (#576).
    ...(s.totals ? { totals: s.totals } : {}),
  }));
}
/** Moments plus collapsed durations represented by a group. */
export function entityCount(group: FrameGroup): bigint {
  return BigInt(group.count) + BigInt(group.durationCount ?? '0');
}
/**
 * Merges adjacent summaries in time order while the merged block spans less than the
 * threshold. Members are never reconstructed; counts add exactly. Moment groups that are
 * already maximal never merge with each other, so this coalesces duration clusters into
 * nearby moment groups and coarsens cached summaries.
 */
/** Two groups' measure totals added (#574): canonical text by name, zeros left out. */
export const addTotals = addMeasureTotals;
/** Totals with every value negated, to take an entity's values away (#574). */
export function negateTotals(
  a: Record<string, string> | undefined,
): Record<string, string> | undefined {
  if (!a) return a;
  return Object.fromEntries(
    Object.entries(a).map(([name, text]) => [
      name,
      text.startsWith('-') ? text.slice(1) : '-' + text,
    ]),
  );
}
export function coalesceGroups(groups: readonly FrameGroup[], threshold: Q): FrameGroup[] {
  const out: FrameGroup[] = [];
  const ordered = [...groups].sort(
    (a, b) =>
      Q.parse(a.first).compare(Q.parse(b.first)) ||
      // Moments before durations at the same start, for a stable order across backends.
      Number(BigInt(b.count) > 0n) - Number(BigInt(a.count) > 0n),
  );
  for (const group of ordered) {
    const prev = out.at(-1);
    if (
      prev &&
      (group.first === prev.first ||
        Q.parse(group.last).sub(Q.parse(prev.first)).compare(threshold) < 0)
    ) {
      const durations = BigInt(prev.durationCount ?? '0') + BigInt(group.durationCount ?? '0');
      const totals = addTotals(prev.totals, group.totals);
      out[out.length - 1] = {
        first: prev.first,
        last: Q.parse(group.last).compare(Q.parse(prev.last)) > 0 ? group.last : prev.last,
        count: (BigInt(prev.count) + BigInt(group.count)).toString(),
        distinct:
          prev.distinct +
          group.distinct -
          (prev.distinct && group.distinct && prev.last === group.first ? 1 : 0),
        ...(durations ? { durationCount: durations.toString() } : {}),
        ...(totals ? { totals } : {}),
      };
    } else out.push(group);
  }
  return out;
}
/**
 * A window from an interval tree that holds each ongoing duration as a placeholder, a point at
 * its start (#537), with those durations resolved at "now" in its place: `ongoing` holds them
 * resolved. Each placeholder was summarized in the group holding its start, so it is taken out
 * of that group's count; then the resolved durations join the bands (withOngoing) or, when
 * shorter than `threshold`, the summaries. The PostgreSQL and SQLite stores answer windows
 * this way.
 */
export function frameWithOngoing<F extends Frame>(
  frame: F,
  ongoing: readonly DurationBand[],
  lower: Q,
  upper: Q,
  threshold: Q,
): F {
  if (!ongoing.length) return frame;
  let groups = frame.groups.map((g) => ({ ...g }));
  for (const band of ongoing) {
    const start = Q.parse(band.first);
    if (start.compare(lower) < 0 || start.compare(upper) > 0) continue;
    const group = groups.find(
      (g) =>
        BigInt(g.durationCount ?? '0') > 0n &&
        Q.parse(g.first).compare(start) <= 0 &&
        Q.parse(g.last).compare(start) >= 0,
    );
    if (!group) continue;
    const left = BigInt(group.durationCount!) - 1n;
    if (left > 0n) group.durationCount = left.toString();
    else delete group.durationCount;
    // Its values leave with it (#576), and return with it below when it is still short.
    const totals = addTotals(group.totals, negateTotals(entityTotals(band.metadata)));
    if (totals) group.totals = totals;
    else delete group.totals;
    if (group.duration?.id === band.id) delete group.duration;
  }
  groups = groups.filter((g) => BigInt(g.count) > 0n || BigInt(g.durationCount ?? '0') > 0n);
  const added = durationGroups(summariesWithOngoing([], ongoing, lower, upper, threshold));
  if (added.length) groups = coalesceGroups([...groups, ...added], threshold);
  const durations = (frame.durations ?? []).filter((band) => !isOngoing(band.end));
  const bands = withOngoing(
    frame.durationsTruncated
      ? {
          durations,
          durationsTruncated: true,
          durationsTotal: frame.durationsTotal ?? durations.length,
          ...(frame.durationsTotalMore ? { durationsTotalMore: true } : {}),
        }
      : { durations, durationsTruncated: false },
    ongoing,
    lower,
    upper,
    256,
    threshold.compare(Q.zero) > 0 ? threshold : null,
  );
  const result = { ...frame, ...bands, groups };
  if (!bands.durationsTruncated) {
    delete result.durationsTotal;
    delete result.durationsTotalMore;
  }
  return result;
}
