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

/**
 * The balances at a view's edges (#595), from a window fetched around it. A server's or desktop
 * file's window is wider than the view, and the editor shows cached windows while it zooms and
 * pans, so the window's own balances are at its edges, not the view's. Each summary carries the
 * running balance after its changes, which span from its first time to the next summary's
 * (partitionTotals). The view's balance before is the last one whose span ends by `left`, else
 * the window's; after, the last one whose span starts by `right`. Both are exact at span
 * boundaries; an edge within a span takes that whole span on the side of the view. Summaries
 * that carry no balance (such as ones unsaved edits changed) are passed over, and a view of
 * only such keeps the window's balance after.
 */
export function viewBalances(
  groups: readonly { first: string; balanceAfter?: Record<string, string> }[],
  balances: Record<string, WindowBalance> | undefined,
  left: Q,
  right: Q,
): Record<string, WindowBalance> | undefined {
  if (!balances) return balances;
  const firsts = groups.map((g) => Q.parse(g.first));
  return Object.fromEntries(
    Object.entries(balances).map(([name, window]) => {
      let before = window.before,
        after: string | undefined,
        unknown = false;
      groups.forEach((group, i) => {
        const value = group.balanceAfter?.[name];
        const next = firsts[i + 1];
        if (next && next.compare(left) <= 0) {
          if (value !== undefined) before = value;
        } else if (firsts[i].compare(right) <= 0) {
          if (value !== undefined) after = value;
          else unknown = true;
        }
      });
      return [name, { before, after: after ?? (unknown ? window.after : before) }];
    }),
  );
}

/** A duration's changes (#595): [time, values] at its start and end, as `measures` say. */
export function durationContributions(
  band: { first: string; last: string; end?: unknown; metadata: Record<string, unknown> },
  measures: Measures | undefined,
): [string, Record<string, string>][] {
  const values = band.metadata?.measures;
  if (!measures || !values || typeof values !== 'object' || Array.isArray(values)) return [];
  const ongoing = !!band.end && typeof band.end === 'object' && 'ongoing' in (band.end as object);
  const start: Record<string, string> = {},
    end: Record<string, string> = {};
  for (const [name, value] of Object.entries(values as Record<string, string>)) {
    const d = measures[name];
    if (!d || typeof value !== 'string') continue;
    if (d.durations === 'end') {
      if (!ongoing) end[name] = value;
    } else start[name] = value;
  }
  return [
    ...(Object.keys(start).length ? [[band.first, start] as [string, Record<string, string>]] : []),
    ...(Object.keys(end).length ? [[band.last, end] as [string, Record<string, string>]] : []),
  ];
}

/**
 * A timeline's changes by time (#595), to build a change index whole: moments' at their times
 * and durations' (resolved `bands`) where their measures say, added up per time, in time
 * order, times with no change left out.
 */
export function changePoints(
  moments: Iterable<{ time: string; metadata: Record<string, unknown> }>,
  bands: Iterable<{
    first: string;
    last: string;
    end?: unknown;
    metadata: Record<string, unknown>;
  }>,
  measures: Measures | undefined,
): [string, Record<string, string>][] {
  if (!measures || !Object.keys(measures).length) return [];
  const byTime = new Map<string, Record<string, string> | undefined>();
  const add = (time: string, values: Record<string, string> | undefined) => {
    const key = Q.parse(time).toString();
    byTime.set(key, addMeasureTotals(byTime.get(key), values));
  };
  for (const m of moments) {
    const values = m.metadata?.measures;
    if (values && typeof values === 'object' && !Array.isArray(values))
      add(m.time, values as Record<string, string>);
  }
  for (const band of bands)
    for (const [time, values] of durationContributions(band, measures)) add(time, values);
  return [...byTime]
    .filter((entry): entry is [string, Record<string, string>] => !!entry[1])
    .sort((a, b) => Q.parse(a[0]).compare(Q.parse(b[0])));
}

/** A request for the changes up to `time` (after everything when undefined), at it or before. */
export interface PrefixAsk {
  time: Q | undefined;
  inclusive: boolean;
}
/**
 * `frame` with its measures' totals split across its summaries and its balances (#595), from a
 * change index answered by `prefixes`: the changes up to each asked time, in order. A first
 * pass records the times partitionTotals and windowBalances need, the second uses the answers,
 * so a store answers them all in one request.
 */
export async function measuredFrame<
  F extends {
    groups: { first: string; totals?: Record<string, string> }[];
    balances?: Record<string, WindowBalance>;
  },
>(
  frame: F,
  lower: Q,
  upper: Q,
  measures: Measures | undefined,
  prefixes: (asks: PrefixAsk[]) => Promise<(Record<string, string> | undefined)[]>,
): Promise<F> {
  if (!measures || !Object.keys(measures).length) return frame;
  const key = (time: Q | undefined, inclusive: boolean) =>
    `${time?.toString() ?? '∞'}|${inclusive}`;
  const wanted = new Map<string, PrefixAsk>();
  const known = new Map<string, Record<string, string> | undefined>();
  const prefix = (time: Q | undefined, inclusive: boolean) => {
    const k = key(time, inclusive);
    if (!wanted.has(k)) wanted.set(k, { time, inclusive });
    return known.get(k);
  };
  const sum: ChangeSum = (from, to, { includeLower, includeUpper }) => {
    const below = from === undefined ? undefined : prefix(from, !includeLower);
    return addMeasureTotals(
      to === undefined ? prefix(undefined, true) : prefix(to, includeUpper),
      below &&
        Object.fromEntries(
          Object.entries(below).map(([n, v]) => [n, v.startsWith('-') ? v.slice(1) : '-' + v]),
        ),
    );
  };
  const measure = () => ({
    groups: partitionTotals(frame.groups, lower, upper, sum),
    balances: windowBalances(measures, lower, upper, sum),
  });
  measure();
  const asks = [...wanted.values()];
  const answers = asks.length ? await prefixes(asks) : [];
  asks.forEach((a, i) => known.set(key(a.time, a.inclusive), answers[i] ?? undefined));
  const { groups, balances } = measure();
  return {
    ...frame,
    groups: groupBalances(groups, balances),
    ...(balances ? { balances } : {}),
  };
}

/**
 * A moment's or summary's balances before and after its changes (#595), on the metadata the
 * hover card, the reader and plugin scripts (`api.balance`) read: a symbol, so it is never
 * saved and no metadata key can be mistaken for it.
 */
export const BALANCES = Symbol('balances');
/**
 * Each group's balances before and after its changes (#595), by anchored measure: before the
 * first, the window's balance before its changes; before each later one, the one before's
 * balance after. Undefined without anchored measures.
 */
export function groupBalanceSpans(
  groups: readonly { balanceAfter?: Record<string, string> }[],
  balances: Record<string, WindowBalance> | undefined,
): Record<string, WindowBalance>[] | undefined {
  if (!balances || !Object.keys(balances).length) return undefined;
  let before = Object.fromEntries(Object.entries(balances).map(([n, b]) => [n, b.before]));
  return groups.map((group) => {
    const after = group.balanceAfter ?? before;
    const span = Object.fromEntries(
      Object.keys(balances).map((name) => [
        name,
        { before: before[name] ?? '0', after: after[name] ?? before[name] ?? '0' },
      ]),
    );
    before = after;
    return span;
  });
}
