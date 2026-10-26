// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// Durations (docs/durations.md): spans between exact times or moments they follow, their
// validation and resolution, the interval tree for windows, and summaries when collapsed.
import { Rational as Q } from 'rational-ordered-map';
import { contentLabels, CONTENT_LABELS_KEY } from './content-labels.js';
import type { PointEvent, Metadata } from './core.js';
import { normalizeEntityTags } from './tags.js';
import { entryLimitText, withinEntryLimit } from './entry-limit.js';
/** An endpoint is an exact time, or an anchor that follows a moment's time. */
export type DurationEndpoint = string | { moment: string };
export interface Duration {
  id: string;
  start: DurationEndpoint;
  end: DurationEndpoint;
  metadata: Metadata;
}
export interface DurationBand extends Duration {
  startTime: string;
  endTime: string;
  first: string;
  last: string;
  sourceKey?: string;
}
const identifier = (v: unknown): v is string =>
  typeof v === 'string' && /^[A-Za-z0-9_.:-]{1,128}$/.test(v);
export function anchorOf(endpoint: DurationEndpoint): string | null {
  return typeof endpoint === 'string' ? null : endpoint.moment;
}
function endpoint(value: unknown, parse: (text: string) => Q): DurationEndpoint {
  if (typeof value === 'string') return parse(value).toString();
  if (
    value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.keys(value).length === 1 &&
    identifier((value as { moment?: unknown }).moment)
  )
    return { moment: (value as { moment: string }).moment };
  throw new Error('A duration endpoint is an exact time or {"moment": "<moment id>"}.');
}
function durationMetadata(value: unknown): Metadata {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Duration metadata must be a JSON object.');
  const metadata = JSON.parse(JSON.stringify(value)) as Metadata;
  for (const field of ['title', 'description'])
    if (metadata[field] !== undefined && typeof metadata[field] !== 'string')
      throw new Error('Duration titles and notes must be text.');
  if (metadata.durations !== undefined) throw new Error('Durations cannot contain durations.');
  if (metadata.tags !== undefined) metadata.tags = normalizeEntityTags(metadata.tags);
  return metadata;
}
export function validateDuration(value: unknown, parse: (text: string) => Q): Duration {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Invalid duration.');
  const d = value as Record<string, unknown>;
  if (!identifier(d.id)) throw new Error('Duration IDs must be unique ASCII identifiers.');
  return {
    id: d.id,
    start: endpoint(d.start, parse),
    end: endpoint(d.end, parse),
    metadata: durationMetadata(d.metadata ?? {}),
  };
}
/**
 * Validates a document's durations. Anchors must name existing root moments unless the
 * document is partial (a sparse save carries only changed moments).
 */
export function validateDurations(
  value: unknown,
  moments: ReadonlySet<string> | null,
  parse: (text: string) => Q,
): Duration[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || !withinEntryLimit(value.length))
    throw new Error(`Use at most ${entryLimitText()} durations per timeline.`);
  const ids = new Set<string>();
  return value.map((raw) => {
    const duration = validateDuration(raw, parse);
    if (ids.has(duration.id)) throw new Error('Duration IDs must be unique within a timeline.');
    ids.add(duration.id);
    if (moments)
      for (const anchor of [anchorOf(duration.start), anchorOf(duration.end)])
        if (anchor !== null && !moments.has(anchor))
          throw new Error('Duration anchors must name existing moments.');
    return duration;
  });
}
/**
 * Version-1 files stored durations as links inside their starting moment's metadata.
 * They become standalone durations anchored to both original moments, which keeps their
 * behavior: moving either moment still moves the band.
 */
export function convertLegacyDurations(events: PointEvent[]): {
  events: PointEvent[];
  durations: Duration[];
} {
  const durations: Duration[] = [];
  const converted = events.map((event) => {
    const legacy = event.metadata.durations;
    if (legacy === undefined) return event;
    if (!Array.isArray(legacy) || legacy.length > 1000)
      throw new Error('Use at most 1,000 durations per moment.');
    for (const raw of legacy) {
      if (!raw || typeof raw !== 'object' || !identifier(raw.id) || !identifier(raw.endId))
        throw new Error('A duration needs an ID, an endpoint moment ID and metadata.');
      if (raw.endId === event.id)
        throw new Error('Duration endpoints must be two existing distinct moments.');
      durations.push({
        id: raw.id,
        start: { moment: event.id },
        end: { moment: raw.endId },
        metadata: durationMetadata(raw.metadata),
      });
    }
    const metadata = { ...event.metadata };
    delete metadata.durations;
    return { ...event, metadata };
  });
  return { events: converted, durations };
}
/** Resolves both endpoints; an anchor to an unknown moment cannot be placed. */
export function resolveDuration(
  duration: Duration,
  timeOf: (moment: string) => string | undefined,
): DurationBand | null {
  const time = (e: DurationEndpoint) => (typeof e === 'string' ? e : timeOf(e.moment));
  const startTime = time(duration.start),
    endTime = time(duration.end);
  if (startTime === undefined || endTime === undefined) return null;
  const ordered = Q.parse(startTime).compare(Q.parse(endTime)) <= 0;
  return {
    ...duration,
    startTime,
    endTime,
    first: ordered ? startTime : endTime,
    last: ordered ? endTime : startTime,
  };
}
/**
 * Replaces anchors to moments that no longer exist with their last known times, so saving
 * or exporting never leaves a duration referring to a deleted moment.
 */
export function fixMissingAnchors(
  durations: readonly Duration[],
  exists: (moment: string) => boolean,
  lastTime: (moment: string) => string | undefined,
): Duration[] {
  return durations.map((duration) => {
    const fix = (e: DurationEndpoint): DurationEndpoint => {
      if (typeof e === 'string' || exists(e.moment)) return e;
      const time = lastTime(e.moment);
      if (time === undefined) throw new Error('Duration anchors must name existing moments.');
      return time;
    };
    const start = fix(duration.start),
      end = fix(duration.end);
    return start === duration.start && end === duration.end
      ? duration
      : { ...duration, start, end };
  });
}
export interface IntervalNode {
  band: DurationBand;
  left: IntervalNode | null;
  right: IntervalNode | null;
  /** Smallest start in the subtree (the tree is ordered by start, then ID). */
  min: Q;
  /** Largest end in the subtree. */
  max: Q;
  /** Largest start, entry count and extent bounds, for summarizing whole subtrees. */
  maxFirst: Q;
  count: number;
  minExtent: Q;
  maxExtent: Q;
  /** Smallest end in the subtree, for counting whole subtrees that all touch a window. */
  minLast: Q;
  /** The ID of the subtree's first band in (start, ID) order: no band starting at `min` has a smaller one. */
  minId: string;
  /** This node's own band's exact start, end and extent, parsed once. */
  first: Q;
  last: Q;
  extent: Q;
}
/** Augmented balanced interval tree: intervals spanning the viewport survive even if both endpoints are outside. */
export function durationTree(
  durations: Iterable<Duration>,
  timeOf: (moment: string) => string | undefined,
): IntervalNode | null {
  const bands: DurationBand[] = [];
  for (const duration of durations) {
    const band = resolveDuration(duration, timeOf);
    if (band) bands.push(band);
  }
  // Ties order by ID in code-unit ("C") order, which the server's incremental trees share.
  bands.sort(
    (a, b) =>
      Q.parse(a.first).compare(Q.parse(b.first)) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );
  function build(lo: number, hi: number): IntervalNode | null {
    if (lo >= hi) return null;
    const mid = Math.floor((lo + hi) / 2),
      band = bands[mid],
      left = build(lo, mid),
      right = build(mid + 1, hi);
    const first = Q.parse(band.first),
      last = Q.parse(band.last),
      extent = last.sub(first);
    const node: IntervalNode = {
      band,
      left,
      right,
      min: left?.min ?? first,
      max: last,
      maxFirst: right?.maxFirst ?? first,
      minLast: last,
      minId: left?.minId ?? band.id,
      count: 1 + (left?.count ?? 0) + (right?.count ?? 0),
      minExtent: extent,
      maxExtent: extent,
      first,
      last,
      extent,
    };
    for (const n of [left, right])
      if (n) {
        if (n.max.compare(node.max) > 0) node.max = n.max;
        if (n.minLast.compare(node.minLast) < 0) node.minLast = n.minLast;
        if (n.minExtent.compare(node.minExtent) < 0) node.minExtent = n.minExtent;
        if (n.maxExtent.compare(node.maxExtent) > 0) node.maxExtent = n.maxExtent;
      }
    return node;
  }
  return build(0, bands.length);
}
/**
 * The row each band is drawn in beneath the axis, so that no two that overlap in time share
 * one: by start, then the longer first, each takes the first row whose bands have all ended
 * by its start (a band ending where another starts leaves the row to it). Bands of separate
 * groups (`group`: a comparison's timelines, each with rows of its own) are packed apart.
 * Returns each band's row by its position in `bands`.
 */
export function durationLanes(bands: { first: string; last: string; group?: string }[]): number[] {
  const order = bands
    .map((band, index) => ({
      index,
      group: band.group ?? '',
      first: Q.parse(band.first),
      last: Q.parse(band.last),
    }))
    .sort(
      (a, b) =>
        a.group.localeCompare(b.group) || a.first.compare(b.first) || b.last.compare(a.last),
    );
  const lanes = new Array<number>(bands.length);
  // Each group's rows, by the end of the band last placed in each.
  const ends = new Map<string, Q[]>();
  for (const band of order) {
    const rows = ends.get(band.group) ?? [];
    ends.set(band.group, rows);
    let row = rows.findIndex((end) => end.compare(band.first) <= 0);
    if (row < 0) row = rows.push(band.last) - 1;
    else rows[row] = band.last;
    lanes[band.index] = row;
  }
  return lanes;
}
/** A duration is drawn as a band only while its extent reaches the grouping distance. */
export function collapses(band: { first: string; last: string }, threshold: Q | null) {
  return threshold !== null && Q.parse(band.last).sub(Q.parse(band.first)).compare(threshold) < 0;
}
/**
 * How far a window's durations are counted past the bands sent (#316): a count at the cap
 * reads as "10,000+", so counting a dense window costs at most this many matches.
 */
export const DURATION_COUNT_CAP = 10000;
/** Each rational's numerator and denominator, read once: Rational.compare re-parses both. */
const parts = new WeakMap<Q, [bigint, bigint]>();
/** Compares two rationals exactly, by cross-multiplying their cached parts (denominators > 0). */
function compareExact(a: Q, b: Q) {
  let x = parts.get(a);
  if (!x) parts.set(a, (x = [a.numerator, a.denominator]));
  let y = parts.get(b);
  if (!y) parts.set(b, (y = [b.numerator, b.denominator]));
  const left = x[0] * y[1],
    right = y[0] * x[1];
  return left < right ? -1 : left > right ? 1 : 0;
}
/**
 * The duration bands touching [lower, upper] and at least `threshold` long, at most `limit`
 * of them, in start order. A dense window keeps its longest (#316): longest first, then by
 * start and ID. When some were left out, `durationsTotal` is how many touch the window,
 * counted up to DURATION_COUNT_CAP (with `durationsTotalMore` past it).
 *
 * Neither needs every match. The longest are found best-first: a priority queue of subtrees,
 * each ranked by the best it could hold (its longest extent and earliest start), and of single
 * durations, so the work follows `limit` and the tree's height. The count takes a subtree whose
 * durations all touch the window and reach the threshold from its cached size.
 */
export function durationWindow(
  root: IntervalNode | null,
  lower: Q,
  upper: Q,
  limit = 256,
  threshold: Q | null = null,
) {
  // Whether a subtree could hold a match, and whether every duration in it is one.
  const reaches = (n: IntervalNode) =>
    compareExact(n.min, upper) <= 0 &&
    compareExact(n.max, lower) >= 0 &&
    (threshold === null || compareExact(n.maxExtent, threshold) >= 0);
  const whole = (n: IntervalNode) =>
    compareExact(n.maxFirst, upper) <= 0 &&
    compareExact(n.minLast, lower) >= 0 &&
    (threshold === null || compareExact(n.minExtent, threshold) >= 0);
  const matches = (n: IntervalNode) =>
    compareExact(n.first, upper) <= 0 &&
    compareExact(n.last, lower) >= 0 &&
    (threshold === null || compareExact(n.extent, threshold) >= 0);
  let count = 0;
  function tally(n: IntervalNode | null) {
    if (!n || count > DURATION_COUNT_CAP || !reaches(n)) return;
    if (whole(n)) {
      count += n.count;
      return;
    }
    if (matches(n)) count++;
    tally(n.left);
    tally(n.right);
  }
  tally(root);
  // Best-first: an entry is a subtree, ranked by the best it could hold (its longest extent,
  // earliest start and the first ID at that start), or one duration, ranked exactly. At equal
  // rank a subtree comes first, since it may hold that very duration.
  type Entry = { node: IntervalNode; tree: boolean };
  const before = (a: Entry, b: Entry) => {
    const extent = compareExact(
      a.tree ? a.node.maxExtent : a.node.extent,
      b.tree ? b.node.maxExtent : b.node.extent,
    );
    if (extent) return extent > 0;
    const start = compareExact(
      a.tree ? a.node.min : a.node.first,
      b.tree ? b.node.min : b.node.first,
    );
    if (start) return start < 0;
    // A subtree's IDs at its earliest start begin at minId (the tree is ordered by start, then ID).
    const idA = a.tree ? a.node.minId : a.node.band.id,
      idB = b.tree ? b.node.minId : b.node.band.id;
    if (idA !== idB) return idA < idB;
    return a.tree && !b.tree;
  };
  const heap: Entry[] = [];
  const push = (entry: Entry) => {
    heap.push(entry);
    for (let i = heap.length - 1; i > 0;) {
      const up = (i - 1) >> 1;
      if (!before(heap[i], heap[up])) break;
      [heap[i], heap[up]] = [heap[up], heap[i]];
      i = up;
    }
  };
  const pop = () => {
    const top = heap[0],
      last = heap.pop()!;
    if (heap.length) {
      heap[0] = last;
      for (let i = 0; ;) {
        const l = 2 * i + 1,
          r = l + 1;
        let best = i;
        if (l < heap.length && before(heap[l], heap[best])) best = l;
        if (r < heap.length && before(heap[r], heap[best])) best = r;
        if (best === i) break;
        [heap[i], heap[best]] = [heap[best], heap[i]];
        i = best;
      }
    }
    return top;
  };
  const kept: IntervalNode[] = [];
  if (root && reaches(root)) push({ node: root, tree: true });
  while (heap.length && kept.length < limit) {
    const { node, tree } = pop();
    if (!tree) {
      kept.push(node);
      continue;
    }
    if (matches(node)) push({ node, tree: false });
    for (const child of [node.left, node.right])
      if (child && reaches(child)) push({ node: child, tree: true });
  }
  kept.sort((a, b) => compareExact(a.first, b.first) || (a.band.id < b.band.id ? -1 : 1));
  const durations = kept.map((n) => ({ ...n.band, metadata: durationOverview(n.band.metadata) }));
  return count > limit
    ? {
        durations,
        durationsTruncated: true,
        durationsTotal: Math.min(count, DURATION_COUNT_CAP),
        ...(count > DURATION_COUNT_CAP ? { durationsTotalMore: true } : {}),
      }
    : { durations, durationsTruncated: false };
}
/** "1,234" or, at the cap with more beyond it, "10,000+". */
export function durationCountText(total: number, more = false) {
  return total.toLocaleString('en-US') + (more ? '+' : '');
}
/**
 * The order in which a window's durations claim rows (#316): the longest first (an era before
 * the events inside it), then by start, title and ID. It depends only on the durations, not
 * on the view, so panning never reshuffles the rows.
 */
export function compareDurationRank(a: DurationBand, b: DurationBand) {
  const extent = (band: DurationBand) => Q.parse(band.last).sub(Q.parse(band.first));
  const title = (band: DurationBand) => String(band.metadata.title ?? '');
  return (
    extent(b).compare(extent(a)) ||
    Q.parse(a.first).compare(Q.parse(b.first)) ||
    (title(a) < title(b) ? -1 : title(a) > title(b) ? 1 : 0) ||
    (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  );
}
/** A band as drawn: the duration that represents it, everything grouped into it, and its row. */
export interface ArrangedDuration {
  band: DurationBand;
  /** The durations drawn as this band, `band` first: those spanning nearly the same time. */
  members: DurationBand[];
  row: number;
}
/**
 * How a window's duration bands are drawn (#316), for each source (`sourceKey`: a
 * comparison's timelines are arranged apart):
 * - Durations whose start and end are both closer than `distance` pixels to a band's are drawn
 *   as that band ("Title + 12 more"), so a thousand spans of the same time take one row.
 * - Bands claim rows in compareDurationRank order, each taking the first row where it
 *   overlaps no band already placed (a band ending where another starts may share its row).
 * - At most `maxRows` rows are drawn; the bands that would need more are `hidden`, listed by
 *   source in rank order.
 * `pixels` converts a span of time to pixels at the current zoom.
 */
export function arrangeDurations(
  bands: DurationBand[],
  pixels: (span: Q) => number,
  distance: number,
  maxRows: number,
): { shown: ArrangedDuration[]; hidden: { source: string; bands: DurationBand[] }[] } {
  // Each band's bounds parsed once, then ranked as compareDurationRank does.
  const keyed = bands.map((band) => {
    const first = Q.parse(band.first),
      last = Q.parse(band.last);
    return { band, first, last, extent: last.sub(first), title: String(band.metadata.title ?? '') };
  });
  keyed.sort(
    (a, b) =>
      b.extent.compare(a.extent) ||
      a.first.compare(b.first) ||
      (a.title < b.title ? -1 : a.title > b.title ? 1 : 0) ||
      (a.band.id < b.band.id ? -1 : a.band.id > b.band.id ? 1 : 0),
  );
  // Positions in pixels from the first-ranked band's start, as doubles: computed once per
  // band, and the same wherever the view is.
  const origin = keyed[0]?.first ?? Q.zero;
  const at = (time: Q) => {
    const offset = time.sub(origin);
    return (offset.compare(Q.zero) < 0 ? -1 : 1) * pixels(offset.abs());
  };
  const groups = new Map<
    string,
    { first: Q; last: Q; x0: number; x1: number; item: ArrangedDuration }[]
  >();
  for (const { band, first, last } of keyed) {
    const source = band.sourceKey ?? '',
      x0 = at(first),
      x1 = at(last);
    const list = groups.get(source) ?? [];
    groups.set(source, list);
    const group = list.find(
      // Strictly closer than the distance, as moments group (`start - anchor < threshold`).
      (g) => Math.abs(g.x0 - x0) < distance && Math.abs(g.x1 - x1) < distance,
    );
    if (group) group.item.members.push(band);
    else list.push({ first, last, x0, x1, item: { band, members: [band], row: -1 } });
  }
  const shown: ArrangedDuration[] = [],
    hidden: { source: string; bands: DurationBand[] }[] = [];
  for (const [source, list] of groups) {
    const rows: { first: Q; last: Q }[][] = [];
    const left: DurationBand[] = [];
    for (const { first, last, item } of list) {
      let row = rows.findIndex((placed) =>
        placed.every((p) => p.last.compare(first) <= 0 || last.compare(p.first) <= 0),
      );
      if (row < 0) row = rows.push([]) - 1;
      if (row >= maxRows) {
        left.push(...item.members);
        continue;
      }
      rows[row].push({ first, last });
      item.row = row;
      shown.push(item);
    }
    if (left.length) hidden.push({ source, bands: left });
  }
  return { shown, hidden };
}
/** One summarized cluster of collapsed durations. */
export interface DurationSummary {
  first: string;
  last: string;
  count: number;
  /** The duration, when the cluster holds exactly one. */
  band?: DurationBand;
}
/**
 * Anchored-span summaries of the collapsed durations (extent below the threshold) that
 * intersect [lower, upper], keyed by start. Like moment overviews, whole subtrees that fit
 * in the current group are consumed from cached counts instead of being enumerated.
 */
export function durationSummaries(
  root: IntervalNode | null,
  lower: Q,
  upper: Q,
  threshold: Q,
): DurationSummary[] {
  const out: DurationSummary[] = [];
  let anchor: Q | null = null,
    last: Q | null = null,
    count = 0,
    single: DurationBand | undefined;
  const close = () => {
    if (anchor && last)
      out.push({
        first: anchor.toString(),
        last: last.toString(),
        count,
        ...(count === 1 && single ? { band: single } : {}),
      });
    anchor = last = null;
    count = 0;
    single = undefined;
  };
  const join = (first: Q, end: Q, n: number, band?: DurationBand) => {
    if (anchor && first.sub(anchor).compare(threshold) >= 0) close();
    if (!anchor) anchor = first;
    if (!last || end.compare(last) > 0) last = end;
    count += n;
    single = n === 1 && count === 1 ? band : undefined;
  };
  const stack: { node: IntervalNode; point: boolean }[] = root
    ? [{ node: root, point: false }]
    : [];
  // A collapsed duration that reaches the window starts after lower − threshold, so
  // subtrees starting no later than that hold nothing to summarize.
  const earliest = lower.sub(threshold);
  while (stack.length) {
    const { node: n, point } = stack.pop()!;
    if (point) {
      const first = Q.parse(n.band.first),
        end = Q.parse(n.band.last);
      if (
        end.compare(lower) >= 0 &&
        first.compare(upper) <= 0 &&
        end.sub(first).compare(threshold) < 0
      )
        join(first, end, 1, n.band);
      continue;
    }
    if (n.max.compare(lower) < 0 || n.min.compare(upper) > 0) continue;
    if (n.maxFirst.compare(earliest) <= 0) continue;
    if (n.minExtent.compare(threshold) >= 0) continue;
    // Every entry collapses and lies inside the window, so the subtree is one block if it fits.
    const whole =
      n.maxExtent.compare(threshold) < 0 &&
      n.min.compare(lower) >= 0 &&
      n.maxFirst.compare(upper) <= 0;
    const base = anchor && n.min.sub(anchor).compare(threshold) < 0 ? anchor : n.min;
    if (whole && n.maxFirst.sub(base).compare(threshold) < 0) {
      join(n.min, n.max, n.count, n.count === 1 ? n.band : undefined);
      continue;
    }
    if (n.right) stack.push({ node: n.right, point: false });
    stack.push({ node: n, point: true });
    if (n.left) stack.push({ node: n.left, point: false });
  }
  close();
  return out;
}

/**
 * Viewport bands carry a bounded projection: title, a notes preview, short text fields that
 * plugins such as colors read, and tags. Full metadata is fetched when a duration is opened.
 */
export function durationOverview(metadata: Metadata): Metadata {
  const result: Metadata = {};
  if (typeof metadata.title === 'string') result.title = metadata.title.slice(0, 512);
  if (typeof metadata.description === 'string')
    result.description = metadata.description.slice(0, 2000);
  let size = JSON.stringify(result).length;
  for (const [key, value] of Object.entries(metadata))
    if (
      key !== 'title' &&
      key !== 'description' &&
      typeof value === 'string' &&
      value.length <= 256
    ) {
      size += key.length + value.length + 6;
      if (size > 4096) break;
      result[key] = value;
    }
  // Its tags, which plugins may derive values from (#122), such as a log entry's severity.
  if (Array.isArray(metadata.tags)) {
    const tags = metadata.tags.filter((t): t is string => typeof t === 'string').slice(0, 40);
    if (tags.length && size + JSON.stringify(tags).length <= 4096) result.tags = tags;
  }
  // Its sensitive-content labels (#115), so its background image is blurred.
  const labels = contentLabels(metadata[CONTENT_LABELS_KEY]);
  if (labels.length) result[CONTENT_LABELS_KEY] = labels;
  return result;
}
