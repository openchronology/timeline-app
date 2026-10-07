// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
import { Rational as Q } from 'rational-ordered-map';
import type { PointEvent, Metadata, TimelineDocument } from './core.js';
export interface DurationLink {
  id: string;
  endId: string;
  metadata: Metadata;
}
export interface DurationBand extends DurationLink {
  startId: string;
  startTime: string;
  endTime: string;
  first: string;
  last: string;
  sourceKey?: string;
}
const identifier = (v: unknown): v is string =>
  typeof v === 'string' && /^[A-Za-z0-9_.:-]{1,128}$/.test(v);
export function durationLinks(metadata: Metadata): DurationLink[] {
  if (metadata.durations === undefined) return [];
  if (!Array.isArray(metadata.durations) || metadata.durations.length > 1000)
    throw new Error('Use at most 1,000 durations per moment.');
  return metadata.durations.map((raw) => {
    if (
      !raw ||
      typeof raw !== 'object' ||
      !identifier(raw.id) ||
      !identifier(raw.endId) ||
      !raw.metadata ||
      typeof raw.metadata !== 'object' ||
      Array.isArray(raw.metadata)
    )
      throw new Error('A duration needs an ID, an endpoint moment ID and metadata.');
    for (const field of ['title', 'description'])
      if (raw.metadata[field] !== undefined && typeof raw.metadata[field] !== 'string')
        throw new Error('Duration titles and notes must be text.');
    if (raw.metadata.durations !== undefined)
      throw new Error('Durations cannot contain durations.');
    return { id: raw.id, endId: raw.endId, metadata: raw.metadata };
  });
}
export function validateDurations(events: readonly PointEvent[]) {
  const points = new Set(events.map((e) => e.id)),
    ids = new Set<string>();
  for (const start of events)
    for (const link of durationLinks(start.metadata)) {
      if (!points.has(link.endId) || link.endId === start.id)
        throw new Error('Duration endpoints must be two existing distinct moments.');
      if (ids.has(link.id)) throw new Error('Duration IDs must be unique within a timeline.');
      ids.add(link.id);
      if (ids.size > 200000) throw new Error('Use at most 200,000 durations per timeline.');
    }
}
/** Cascade only after explicit endpoint deletion; never invent orphan coordinates. */
export function pruneDurations(
  doc: TimelineDocument,
  deleted?: ReadonlySet<string>,
): TimelineDocument {
  const ids = new Set(doc.events.map((e) => e.id));
  return {
    ...doc,
    events: doc.events.map((e) => {
      const links = durationLinks(e.metadata),
        retained = links.filter(
          (l) => ids.has(l.endId) || (deleted !== undefined && !deleted.has(l.endId)),
        );
      return links.length === retained.length
        ? e
        : { ...e, metadata: { ...e.metadata, durations: retained } };
    }),
  };
}
export interface IntervalNode {
  band: DurationBand;
  left: IntervalNode | null;
  right: IntervalNode | null;
  min: Q;
  max: Q;
}
/** Augmented balanced interval tree: intervals spanning the viewport survive even if both endpoints are outside. */
export function durationTree(events: Iterable<PointEvent>): IntervalNode | null {
  const points = new Map([...events].map((e) => [e.id, e]));
  const bands: DurationBand[] = [];
  for (const start of points.values())
    for (const link of durationLinks(start.metadata)) {
      const end = points.get(link.endId);
      if (!end) continue;
      const a = Q.parse(start.time),
        b = Q.parse(end.time);
      bands.push({
        ...link,
        startId: start.id,
        startTime: start.time,
        endTime: end.time,
        first: a.compare(b) <= 0 ? start.time : end.time,
        last: a.compare(b) <= 0 ? end.time : start.time,
      });
    }
  bands.sort((a, b) => Q.parse(a.first).compare(Q.parse(b.first)) || a.id.localeCompare(b.id));
  function build(lo: number, hi: number): IntervalNode | null {
    if (lo >= hi) return null;
    const mid = Math.floor((lo + hi) / 2),
      band = bands[mid],
      left = build(lo, mid),
      right = build(mid + 1, hi);
    let max = Q.parse(band.last);
    for (const n of [left, right]) if (n && n.max.compare(max) > 0) max = n.max;
    return { band, left, right, min: left?.min ?? Q.parse(band.first), max };
  }
  return build(0, bands.length);
}
export function durationWindow(root: IntervalNode | null, lower: Q, upper: Q, limit = 256) {
  const bands: DurationBand[] = [];
  let more = false;
  function visit(n: IntervalNode | null) {
    if (!n || more || n.min.compare(upper) > 0 || n.max.compare(lower) < 0) return;
    visit(n.left);
    if (
      !more &&
      Q.parse(n.band.first).compare(upper) <= 0 &&
      Q.parse(n.band.last).compare(lower) >= 0
    ) {
      if (bands.length === limit) more = true;
      else bands.push({ ...n.band, metadata: durationOverview(n.band.metadata) });
    }
    visit(n.right);
  }
  visit(root);
  return { durations: bands, durationsTruncated: more };
}

/** Viewport bands never carry arbitrary, possibly huge editor-only metadata. */
export function durationOverview(metadata: Metadata): Metadata {
  const result: Metadata = {};
  for (const key of ['title', 'description'] as const)
    if (typeof metadata[key] === 'string') result[key] = metadata[key].slice(0, 512);
  return result;
}
