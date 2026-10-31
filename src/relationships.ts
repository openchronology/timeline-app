// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// Relationships (docs/relationships.md): undirected links between moments and durations, their
// validation, the graph they form, and the arcs drawn between linked entities.
import { Rational as Q } from 'rational-ordered-map';
import { durationTree, resolveDuration } from './durations.js';
import type { Duration, DurationBand, IntervalNode } from './durations.js';
import type { PointEvent } from './core.js';
import { entryLimitText, withinEntryLimit } from './entry-limit.js';

/** A moment or a duration. Their ID spaces are separate, so references name the kind. */
export type EntityRef = { moment: string } | { duration: string };
/** An undirected link between two different entities. */
export interface Relationship {
  a: EntityRef;
  b: EntityRef;
}
/** An arc on the timeline: a relationship placed between its endpoints' times. */
export interface EdgeBand {
  id: string;
  a: EntityRef;
  b: EntityRef;
  first: string;
  last: string;
  aTime: string;
  bTime: string;
  sourceKey?: string;
  /**
   * In a separation view's answer (#415), whether each end is in that view: the view's arcs
   * are the whole timeline's, so an end that isn't is on the other track.
   */
  aIn?: boolean;
  bIn?: boolean;
}
const identifier = (v: unknown): v is string =>
  typeof v === 'string' && /^[A-Za-z0-9_.:-]{1,128}$/.test(v);
/** "m:<id>" or "d:<id>": a total order and a map key for references. */
export function refKey(ref: EntityRef): string {
  return 'moment' in ref ? 'm:' + ref.moment : 'd:' + ref.duration;
}
export function refFromKey(key: string): EntityRef {
  return key.startsWith('m:') ? { moment: key.slice(2) } : { duration: key.slice(2) };
}
export function validateRef(value: unknown): EntityRef {
  if (
    value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.keys(value).length === 1
  ) {
    const v = value as Record<string, unknown>;
    if (identifier(v.moment)) return { moment: v.moment };
    if (identifier(v.duration)) return { duration: v.duration };
  }
  throw new Error('A relationship endpoint is {"moment": "<id>"} or {"duration": "<id>"}.');
}
/** Endpoints in canonical order, so each link has one representation. */
export function canonicalRelationship(a: EntityRef, b: EntityRef): Relationship {
  const ka = refKey(a),
    kb = refKey(b);
  if (ka === kb) throw new Error('An entity cannot be related to itself.');
  return ka < kb ? { a, b } : { a: b, b: a };
}
export function relationshipKey(r: Relationship): string {
  return refKey(r.a) + '~' + refKey(r.b);
}
/**
 * Validates, canonicalizes, deduplicates and sorts relationships. Endpoints must exist
 * unless `exists` is null (sparse documents carry only some entities).
 */
export function validateRelationships(
  value: unknown,
  exists: ((key: string) => boolean) | null,
): Relationship[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || !withinEntryLimit(value.length))
    throw new Error(`Use at most ${entryLimitText()} relationships per timeline.`);
  const seen = new Map<string, Relationship>();
  for (const raw of value) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw))
      throw new Error('A relationship has two endpoints, a and b.');
    const r = raw as Record<string, unknown>;
    if (Object.keys(r).some((k) => k !== 'a' && k !== 'b'))
      throw new Error('A relationship has two endpoints, a and b.');
    const relationship = canonicalRelationship(validateRef(r.a), validateRef(r.b));
    if (exists && (!exists(refKey(relationship.a)) || !exists(refKey(relationship.b))))
      throw new Error('Relationships must connect existing events.');
    seen.set(relationshipKey(relationship), relationship);
  }
  return [...seen].sort(([a], [b]) => (a < b ? -1 : 1)).map(([, r]) => r);
}
/** Undirected adjacency, keyed by reference keys. */
export function adjacency(relationships: Iterable<Relationship>): Map<string, Set<string>> {
  const graph = new Map<string, Set<string>>();
  for (const { a, b } of relationships) {
    const ka = refKey(a),
      kb = refKey(b);
    if (!graph.has(ka)) graph.set(ka, new Set());
    if (!graph.has(kb)) graph.set(kb, new Set());
    graph.get(ka)!.add(kb);
    graph.get(kb)!.add(ka);
  }
  return graph;
}
/** Everything reachable from a reference (excluding itself), by breadth-first search. */
export function reachable(graph: Map<string, Set<string>>, start: string, depth = Infinity) {
  const found = new Set<string>([start]);
  let frontier = [start];
  for (let step = 0; step < depth && frontier.length; step++) {
    const next: string[] = [];
    for (const key of frontier)
      for (const neighbour of graph.get(key) ?? [])
        if (!found.has(neighbour)) {
          found.add(neighbour);
          next.push(neighbour);
        }
    frontier = next;
  }
  found.delete(start);
  return found;
}
/** Where an entity sits for arcs: a moment's time, or a duration's start. */
export function entityTimes(
  events: Iterable<PointEvent>,
  durations: Iterable<Duration>,
  momentTime: (id: string) => string | undefined,
): Map<string, string> {
  const times = new Map<string, string>();
  for (const e of events) times.set('m:' + e.id, e.time);
  for (const d of durations) {
    const band = resolveDuration(d, momentTime);
    if (band) times.set('d:' + d.id, band.startTime);
  }
  return times;
}
export function edgeBand(
  r: Relationship,
  times: (key: string) => string | undefined,
): EdgeBand | null {
  const aTime = times(refKey(r.a)),
    bTime = times(refKey(r.b));
  if (aTime === undefined || bTime === undefined) return null;
  const ordered = Q.parse(aTime).compare(Q.parse(bTime)) <= 0;
  return {
    id: relationshipKey(r),
    a: r.a,
    b: r.b,
    aTime,
    bTime,
    first: ordered ? aTime : bTime,
    last: ordered ? bTime : aTime,
  };
}
/**
 * Arcs reuse the duration interval tree: each relationship becomes a fixed interval between
 * its endpoints' times, so viewports fetch only arcs touching them and short ones collapse.
 */
export function edgeTree(
  relationships: Iterable<Relationship>,
  times: (key: string) => string | undefined,
): IntervalNode | null {
  const spans: Duration[] = [];
  for (const r of relationships) {
    const band = edgeBand(r, times);
    if (band) spans.push({ id: band.id, start: band.aTime, end: band.bTime, metadata: {} });
  }
  return durationTree(spans, () => undefined);
}
/** Converts an interval-tree band produced by edgeTree back into an arc. */
export function arcFromBand(band: DurationBand): EdgeBand {
  const [ka, kb] = band.id.split('~');
  return {
    id: band.id,
    a: refFromKey(ka),
    b: refFromKey(kb),
    aTime: band.startTime,
    bTime: band.endTime,
    first: band.first,
    last: band.last,
  };
}
/**
 * The SVG path of a relationship's arc between screen positions `xa` and `xb` on the axis at
 * height `axis`, rising `lift` pixels at its middle, drawn only over `left`–`right` (the stage,
 * plus a margin). The arc is the parabola y = axis − 4·lift·t(1 − t), with t running from 0 at
 * `xa` to 1 at `xb`; the part in view is returned as its own quadratic curve with the same shape.
 * An endpoint far off screen would otherwise put a coordinate millions of pixels away, and
 * browsers draw such a curve as a few straight chords, whose height in view jumps as the view
 * pans. Empty when no part of the arc is in view.
 */
export function arcPath(
  xa: number,
  xb: number,
  axis: number,
  lift: number,
  left: number,
  right: number,
): string {
  const lo = Math.min(xa, xb),
    hi = Math.max(xa, xb);
  const x0 = Math.max(lo, left),
    x1 = Math.min(hi, right);
  if (!(x0 <= x1) || hi === lo) return lo >= left && lo <= right ? `M ${lo} ${axis}` : '';
  const y = (x: number) => {
    const t = (x - lo) / (hi - lo);
    return axis - 4 * lift * t * (1 - t);
  };
  // A quadratic curve whose control point sits midway in x passes through the parabola's middle
  // point when its control is at twice that height less the ends' mean.
  const xm = (x0 + x1) / 2,
    y0 = y(x0),
    y1 = y(x1);
  return `M ${x0} ${y0} Q ${xm} ${2 * y(xm) - (y0 + y1) / 2} ${x1} ${y1}`;
}
/**
 * An arrowhead (#326) where the arc of `arcPath` ends at `x`, its other end at `other`: a
 * triangle `length` pixels long and as wide, its tip on the arc `gap` pixels from the endpoint
 * (so the marker there doesn't cover it), pointing into the endpoint along the arc's tangent.
 * Empty when the two ends coincide.
 */
export function arrowheadPath(
  x: number,
  other: number,
  axis: number,
  lift: number,
  length = 9,
  gap = 12,
): string {
  const span = Math.abs(other - x),
    toward = Math.sign(other - x);
  if (!(span > 0)) return '';
  // How far along the axis the tip is: the gap, measured along the arc's slope at its end.
  const along = Math.min(gap / Math.hypot(1, (4 * lift) / span), span / 2),
    t = along / span;
  const tipX = x + toward * along,
    tipY = axis - 4 * lift * t * (1 - t);
  // The tangent there, heading back toward the endpoint (down to the axis).
  const dx = -toward * span,
    dy = 4 * lift * (1 - 2 * t),
    norm = Math.hypot(dx, dy);
  const ux = dx / norm,
    uy = dy / norm,
    half = length / 2;
  const bx = tipX - ux * length,
    by = tipY - uy * length;
  const n = (v: number) => Math.round(v * 100) / 100;
  return (
    `M ${n(tipX)} ${n(tipY)} L ${n(bx - uy * half)} ${n(by + ux * half)} ` +
    `L ${n(bx + uy * half)} ${n(by - ux * half)} Z`
  );
}
/**
 * The cubic curve of an arc between two tracks of a separation (#415): from `(xa, ya)` on one
 * track's axis to `(xb, yb)` on the other's, leaving and arriving vertically, with both control
 * points at the gap's middle height. Its x runs as the smoothstep 3t² − 2t³ of its parameter t,
 * so it is monotone and crosses the gap as an S.
 */
function crossCurve(xa: number, ya: number, xb: number, yb: number) {
  const dx = xb - xa,
    dy = yb - ya,
    ym = (ya + yb) / 2;
  return {
    at: (t: number) => ({
      x: xa + dx * t * t * (3 - 2 * t),
      y: ya * (1 - t) ** 3 + 3 * ym * t * (1 - t) + yb * t ** 3,
    }),
    slope: (t: number) => ({ x: 6 * dx * t * (1 - t), y: 1.5 * dy * ((1 - t) ** 2 + t * t) }),
  };
}
/**
 * The SVG path of an arc between two tracks of a separation (#415), drawn only over
 * `left`–`right` like arcPath: the part of crossCurve in view, as its own cubic with the same
 * shape (so an endpoint far off screen never puts a coordinate millions of pixels away). An
 * arc whose ends are far apart crosses the view nearly level in the gap's middle, running off
 * toward both. Empty when no part of the arc is in view.
 */
export function crossArcPath(
  xa: number,
  ya: number,
  xb: number,
  yb: number,
  left: number,
  right: number,
): string {
  const curve = crossCurve(xa, ya, xb, yb),
    n = (v: number) => Math.round(v * 100) / 100;
  if (Math.max(xa, xb) < left || Math.min(xa, xb) > right) return '';
  // Where x reaches a bound: the inverse of the smoothstep, t = 1/2 − sin(asin(1 − 2u)/3).
  const at = (x: number) => {
    const u = Math.min(1, Math.max(0, (x - xa) / (xb - xa)));
    return 0.5 - Math.sin(Math.asin(1 - 2 * u) / 3);
  };
  const [t0, t1] = xa === xb ? [0, 1] : [at(left), at(right)].sort((p, q) => p - q);
  if (!(t1 > t0)) return '';
  // The part from t0 to t1 as a cubic of its own: control points a third of the way along
  // each end's tangent.
  const p0 = curve.at(t0),
    p1 = curve.at(t1),
    s0 = curve.slope(t0),
    s1 = curve.slope(t1),
    h = (t1 - t0) / 3;
  return (
    `M ${n(p0.x)} ${n(p0.y)} C ${n(p0.x + h * s0.x)} ${n(p0.y + h * s0.y)} ` +
    `${n(p1.x - h * s1.x)} ${n(p1.y - h * s1.y)} ${n(p1.x)} ${n(p1.y)}`
  );
}
/**
 * An arrowhead on an arc between tracks (#415), as arrowheadPath does for arcs on one track:
 * at the end `(x, y)` of crossArcPath's curve toward `(otherX, otherY)`, its tip on the curve
 * `gap` pixels from the endpoint, pointing into it along the curve. Empty when the ends meet.
 */
export function crossArrowheadPath(
  x: number,
  y: number,
  otherX: number,
  otherY: number,
  length = 9,
  gap = 12,
): string {
  if (!(Math.hypot(otherX - x, otherY - y) > 2 * gap)) return '';
  const curve = crossCurve(x, y, otherX, otherY);
  // The parameter whose point is `gap` from the end, by bisection on the distance, which grows
  // along the first half of the curve.
  let lo = 0,
    hi = 0.5;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2,
      p = curve.at(mid);
    if (Math.hypot(p.x - x, p.y - y) < gap) lo = mid;
    else hi = mid;
  }
  const tip = curve.at(lo),
    slope = curve.slope(lo),
    norm = Math.hypot(slope.x, slope.y);
  // The tangent there, heading back toward the endpoint.
  const ux = -slope.x / norm,
    uy = -slope.y / norm,
    half = length / 2;
  const bx = tip.x - ux * length,
    by = tip.y - uy * length;
  const n = (v: number) => Math.round(v * 100) / 100;
  return (
    `M ${n(tip.x)} ${n(tip.y)} L ${n(bx - uy * half)} ${n(by + ux * half)} ` +
    `L ${n(bx + uy * half)} ${n(by - ux * half)} Z`
  );
}
