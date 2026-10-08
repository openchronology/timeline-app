// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
import { Rational as Q } from 'rational-ordered-map';
import type { PointEvent, Metadata } from './core.js';
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
export const MAX_DURATIONS = 200000;
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
  if (!Array.isArray(value) || value.length > MAX_DURATIONS)
    throw new Error('Use at most 200,000 durations per timeline.');
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
  bands.sort((a, b) => Q.parse(a.first).compare(Q.parse(b.first)) || a.id.localeCompare(b.id));
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
      count: 1 + (left?.count ?? 0) + (right?.count ?? 0),
      minExtent: extent,
      maxExtent: extent,
    };
    for (const n of [left, right])
      if (n) {
        if (n.max.compare(node.max) > 0) node.max = n.max;
        if (n.minExtent.compare(node.minExtent) < 0) node.minExtent = n.minExtent;
        if (n.maxExtent.compare(node.maxExtent) > 0) node.maxExtent = n.maxExtent;
      }
    return node;
  }
  return build(0, bands.length);
}
/** A duration is drawn as a band only while its extent reaches the grouping distance. */
export function collapses(band: { first: string; last: string }, threshold: Q | null) {
  return threshold !== null && Q.parse(band.last).sub(Q.parse(band.first)).compare(threshold) < 0;
}
export function durationWindow(
  root: IntervalNode | null,
  lower: Q,
  upper: Q,
  limit = 256,
  threshold: Q | null = null,
) {
  const bands: DurationBand[] = [];
  let more = false;
  function visit(n: IntervalNode | null) {
    if (!n || more || n.min.compare(upper) > 0 || n.max.compare(lower) < 0) return;
    // Subtrees made only of collapsed durations contribute summaries, not bands.
    if (threshold !== null && n.maxExtent.compare(threshold) < 0) return;
    visit(n.left);
    if (
      !more &&
      Q.parse(n.band.first).compare(upper) <= 0 &&
      Q.parse(n.band.last).compare(lower) >= 0 &&
      !collapses(n.band, threshold)
    ) {
      if (bands.length === limit) more = true;
      else bands.push({ ...n.band, metadata: durationOverview(n.band.metadata) });
    }
    visit(n.right);
  }
  visit(root);
  return { durations: bands, durationsTruncated: more };
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
 * Viewport bands carry a bounded projection: title, a notes preview, and short text fields
 * that plugins such as colors read. Full metadata is fetched when a duration is opened.
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
  return result;
}
