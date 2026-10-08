// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
import { Rational as Q } from 'rational-ordered-map';
import { durationOverview } from './durations.js';
import type { DurationSummary } from './durations.js';
import type { FrameGroup } from './core.js';

/** Groups of collapsed durations, in frame form: no moments, a duration count. */
export function durationGroups(summaries: readonly DurationSummary[]): FrameGroup[] {
  return summaries.map((s) => ({
    first: s.first,
    last: s.last,
    count: '0',
    distinct: 0,
    durationCount: String(s.count),
    ...(s.band ? { duration: { ...s.band, metadata: durationOverview(s.band.metadata) } } : {}),
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
      out[out.length - 1] = {
        first: prev.first,
        last: Q.parse(group.last).compare(Q.parse(prev.last)) > 0 ? group.last : prev.last,
        count: (BigInt(prev.count) + BigInt(group.count)).toString(),
        distinct:
          prev.distinct +
          group.distinct -
          (prev.distinct && group.distinct && prev.last === group.first ? 1 : 0),
        ...(durations ? { durationCount: durations.toString() } : {}),
      };
    } else out.push(group);
  }
  return out;
}
