// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// Measures' changes and balances (#595). A measure's values are changes: a moment's at its
// time, a duration's at its start or end as the measure says. Changes at one time apply
// together. A summary's totals are the changes in its part of the window: from its first time
// up to the next summary's (the first from the window's start, the last to its end), so every
// change in the window counts once. A balance is an anchor (an opening, closing or dated
// value) plus the changes on one side: the balance at t includes the changes at t, the
// balance before t excludes them.
import { Rational as Q } from 'rational-ordered-map';
import { addMeasureTotals, measureText, measureValue } from './measures.js';
import type { Measures } from './measures.js';

/** A duration as the change index reads it: its resolved start and end, and its metadata. */
export interface ChangeDuration {
  first: Q;
  last: Q;
  /** An ongoing duration's end is "now": counted at its end, it applies nothing yet. */
  ongoing: boolean;
  metadata: Record<string, unknown>;
}
/**
 * The changes durations make, as [time, values] entries in `names`' order: each value where
 * its measure says (start, or end; never for an ongoing duration counted at its end).
 */
export function durationChanges(
  durations: Iterable<ChangeDuration>,
  names: readonly string[],
  measures: Measures,
): [Q, Q[]][] {
  const entries: [Q, Q[]][] = [];
  const zero = () => names.map(() => Q.zero);
  for (const d of durations) {
    const atStart = zero(),
      atEnd = zero();
    let start = false,
      end = false;
    names.forEach((name, i) => {
      const value = measureValue(d.metadata, name);
      if (value.numerator === 0n) return;
      if (measures[name].durations === 'end') {
        if (d.ongoing) return;
        atEnd[i] = value;
        end = true;
      } else {
        atStart[i] = value;
        start = true;
      }
    });
    if (start) entries.push([d.first, atStart]);
    if (end) entries.push([d.last, atEnd]);
  }
  return entries;
}

/** The sum of changes from `lower` to `upper` (either open), by name; as a change index gives. */
export type ChangeSum = (
  lower: Q | undefined,
  upper: Q | undefined,
  options: { includeLower: boolean; includeUpper: boolean },
) => Record<string, string> | undefined;

/**
 * `groups` (in time order) with their totals taken from the change index: each covers from its
 * first time (the first from the window's `left`, inclusive) up to the next one's first time,
 * exclusive (the last up to `right`, inclusive), so the window's changes are each counted once.
 */
export function partitionTotals<G extends { first: string; totals?: Record<string, string> }>(
  groups: readonly G[],
  left: Q,
  right: Q,
  sum: ChangeSum,
): G[] {
  const starts = groups.map((g, i) => {
    const first = Q.parse(g.first);
    return i === 0 || first.compare(left) < 0 ? left : first;
  });
  return groups.map((group, i) => {
    const lower = starts[i],
      upper = i + 1 < groups.length ? starts[i + 1] : right;
    const last = i + 1 === groups.length;
    const empty = last ? lower.compare(upper) > 0 : lower.compare(upper) >= 0;
    const totals = empty
      ? undefined
      : sum(lower, upper, { includeLower: true, includeUpper: last });
    const { totals: _old, ...rest } = group;
    return (totals ? { ...rest, totals } : rest) as G;
  });
}

/** A measure's balance before and after a window's changes (#595). */
export interface WindowBalance {
  before: string;
  after: string;
}
/**
 * The balances of `measures` with an anchor, at the window [left, right]: before its changes
 * (those at `left` excluded) and after them (those at `right` included). `sum` reads the change
 * index; the anchor's time sets which changes lie between it and the window.
 */
export function windowBalances(
  measures: Measures | undefined,
  left: Q,
  right: Q,
  sum: ChangeSum,
): Record<string, WindowBalance> | undefined {
  const anchored = Object.entries(measures ?? {}).filter(([, d]) => d.balance);
  if (!anchored.length) return undefined;
  const value = (totals: Record<string, string> | undefined, name: string) =>
    measureValue({ measures: totals }, name);
  // P(t): the changes up to t; B(t) = anchor value + P(t) − P(anchor's time).
  const before = sum(undefined, left, { includeLower: true, includeUpper: false }),
    after = sum(undefined, right, { includeLower: true, includeUpper: true }),
    all = sum(undefined, undefined, { includeLower: true, includeUpper: true });
  const result: Record<string, WindowBalance> = {};
  for (const [name, d] of anchored) {
    const at = d.balance!.at;
    const anchorPrefix =
      at === 'start'
        ? Q.zero
        : at === 'end'
          ? value(all, name)
          : value(sum(undefined, Q.parse(at), { includeLower: true, includeUpper: true }), name);
    const base = Q.parse(
      d.balance!.value.includes('/') ? d.balance!.value : d.balance!.value + '/1',
    ).sub(anchorPrefix);
    result[name] = {
      before: measureText(base.add(value(before, name))),
      after: measureText(base.add(value(after, name))),
    };
  }
  return result;
}

/**
 * Each group's balances after its changes (#595): the window's balances before, plus the
 * groups' totals in turn. Only measures with an anchor.
 */
export function groupBalances<G extends { totals?: Record<string, string> }>(
  groups: readonly G[],
  balances: Record<string, WindowBalance> | undefined,
): (G & { balanceAfter?: Record<string, string> })[] {
  if (!balances) return [...groups];
  let running: Record<string, string> | undefined = Object.fromEntries(
    Object.entries(balances).map(([name, b]) => [name, b.before]),
  );
  return groups.map((group) => {
    const changes = Object.fromEntries(
      Object.entries(group.totals ?? {}).filter(([name]) => name in balances),
    );
    running = addMeasureTotals(running, changes);
    const balanceAfter = Object.fromEntries(
      Object.keys(balances).map((name) => [name, running?.[name] ?? '0']),
    );
    return { ...group, balanceAfter };
  });
}
