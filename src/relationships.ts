// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
import { Rational as Q } from 'rational-ordered-map';
import { durationTree, resolveDuration } from './durations.js';
import type { Duration, DurationBand, IntervalNode } from './durations.js';
import type { PointEvent } from './core.js';

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
}
export const MAX_RELATIONSHIPS = 200000;
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
  if (!Array.isArray(value) || value.length > MAX_RELATIONSHIPS)
    throw new Error('Use at most 200,000 relationships per timeline.');
  const seen = new Map<string, Relationship>();
  for (const raw of value) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw))
      throw new Error('A relationship has two endpoints, a and b.');
    const r = raw as Record<string, unknown>;
    if (Object.keys(r).some((k) => k !== 'a' && k !== 'b'))
      throw new Error('A relationship has two endpoints, a and b.');
    const relationship = canonicalRelationship(validateRef(r.a), validateRef(r.b));
    if (exists && (!exists(refKey(relationship.a)) || !exists(refKey(relationship.b))))
      throw new Error('Relationships must connect existing moments and durations.');
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
