// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// Tags (docs/tags.md) and separations: validating timeline and entity tags, splitting a timeline
// into what carries chosen tags (or relates to a chosen entity) and the rest, and tag counts.
import { durationWindow, resolveDuration } from './durations.js';
import {
  adjacency,
  arcFromBand,
  edgeTree,
  entityTimes,
  reachable,
  refKey,
  validateRef,
  validateRelationships,
} from './relationships.js';
import type { EdgeBand, EntityRef } from './relationships.js';
import type { Rational } from 'rational-ordered-map';
import type { Metadata, PointEvent, TimelineDocument } from './core.js';
import type { Duration } from './durations.js';

export function validateTags(value: unknown): string[] {
  if (!Array.isArray(value) || value.length > 40) throw new Error('Use at most 40 tags.');
  const tags = value.map((tag) => {
    if (typeof tag !== 'string') throw new Error('Tags must be text.');
    const normalized = tag.normalize('NFC').trim().toLowerCase();
    if (!normalized || normalized.length > 64 || /[\x00-\x1f\x7f,]/.test(normalized))
      throw new Error('Tags must be 1–64 characters without commas or control characters.');
    return normalized;
  });
  return [...new Set(tags)];
}
/**
 * Normalizes an entity's `metadata.tags` when it is a valid tag list. Anything else is left
 * untouched as ordinary custom metadata, so older documents using that key still open.
 */
export function normalizeEntityTags(value: unknown): unknown {
  try {
    return validateTags(value);
  } catch {
    return value;
  }
}
/** An entity's tags: `metadata.tags`, normalized like timeline tags. */
export function entityTags(metadata: Metadata): string[] {
  return Array.isArray(metadata.tags)
    ? metadata.tags.filter((tag): tag is string => typeof tag === 'string')
    : [];
}
/**
 * A tag separation splits a timeline into entities carrying any of the tags and the rest.
 * Both halves are read-only views of one saved state.
 */
export type ViewFilter =
  | { tags: string[]; mode: 'any' | 'none' }
  /** An entity and its relations (direct, or everything reachable), or everything else. */
  | { related: EntityRef; depth: 'direct' | 'all'; mode: 'any' | 'none' };
/** Stable cache key for a filter. */
export function viewFilterKey(filter: ViewFilter): string {
  if ('related' in filter)
    return `${filter.mode}:related:${filter.depth}:${refKey(validateRef(filter.related))}`;
  return filter.mode + ':' + [...validateTags(filter.tags)].sort().join(',');
}
/**
 * One side of a separation. Durations are resolved to fixed endpoints first, because the
 * moments they follow may be on the other side.
 */
export function filterDocument(document: TimelineDocument, filter: ViewFilter): TimelineDocument {
  const keep = filterMembership(document, filter);
  const times = new Map(document.events.map((e) => [e.id, e.time]));
  const events: PointEvent[] = document.events.filter((e) => keep('m:' + e.id, e.metadata));
  const durations: Duration[] = [];
  for (const duration of document.durations ?? []) {
    if (!keep('d:' + duration.id, duration.metadata)) continue;
    const band = resolveDuration(duration, (id) => times.get(id));
    if (band)
      durations.push({
        id: duration.id,
        start: band.startTime,
        end: band.endTime,
        metadata: duration.metadata,
      });
  }
  // Links between entities that are both on this side remain.
  const kept = new Set([...events.map((e) => 'm:' + e.id), ...durations.map((d) => 'd:' + d.id)]);
  const relationships = (document.relationships ?? []).filter(
    (r) => kept.has(refKey(r.a)) && kept.has(refKey(r.b)),
  );
  return {
    ...document,
    events,
    ...(durations.length ? { durations } : { durations: undefined }),
    ...(relationships.length ? { relationships } : { relationships: undefined }),
  };
}
/**
 * Whether an entity, named by its reference key (`m:<id>` or `d:<id>`) with its metadata, is
 * on the side of `document` that `filter` selects.
 */
export function filterMembership(
  document: Pick<TimelineDocument, 'relationships'>,
  filter: ViewFilter,
): (key: string, metadata: Metadata) => boolean {
  // Membership on the "any" side, by reference key.
  let inside: (key: string, metadata: Metadata) => boolean;
  if ('related' in filter) {
    const start = refKey(validateRef(filter.related));
    const set = reachable(
      adjacency(validateRelationships(document.relationships, null)),
      start,
      filter.depth === 'direct' ? 1 : Infinity,
    );
    set.add(start);
    inside = (key) => set.has(key);
  } else {
    const wanted = new Set(validateTags(filter.tags));
    inside = (_key, metadata) => entityTags(metadata).some((tag) => wanted.has(tag));
  }
  return (key, metadata) => inside(key, metadata) === (filter.mode === 'any');
}
/**
 * Relationship arcs for a separation of a timeline held in memory (#415): the whole timeline's
 * arcs touching a window, each end marked with whether it is on the side `filter` selects
 * (`aIn`, `bIn`), so the view can draw arcs within a track and between the tracks. The arcs
 * come from an interval tree of the whole document's links, built once, with the same limits
 * as a timeline's own (TimelineIndex.frame): at most 256 a window, none shorter than the
 * grouping `threshold` (when there is one).
 */
export function separationArcs(document: TimelineDocument, filter: ViewFilter) {
  const keep = filterMembership(document, filter);
  const metadata = new Map<string, Metadata>();
  for (const e of document.events) metadata.set('m:' + e.id, e.metadata);
  for (const d of document.durations ?? []) metadata.set('d:' + d.id, d.metadata);
  const moments = new Map(document.events.map((e) => [e.id, e.time]));
  const times = entityTimes(document.events, document.durations ?? [], (id) => moments.get(id));
  const tree = edgeTree(document.relationships ?? [], (key) => times.get(key));
  const inside = (key: string) => keep(key, metadata.get(key) ?? {});
  return (
    lower: Rational,
    upper: Rational,
    threshold: Rational | null,
  ): { edges: EdgeBand[]; edgesTruncated: boolean } => {
    const arcs = durationWindow(tree, lower, upper, 256, threshold);
    return {
      edges: arcs.durations.map((band) => {
        const edge = arcFromBand(band);
        return { ...edge, aIn: inside(refKey(edge.a)), bIn: inside(refKey(edge.b)) };
      }),
      edgesTruncated: arcs.durationsTruncated,
    };
  };
}
/** Tags used by moments and durations, most used first. */
export function tagCounts(
  moments: Iterable<PointEvent>,
  durations: Iterable<Duration>,
  limit = 200,
): { tag: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const { metadata } of [...moments, ...durations])
    for (const tag of entityTags(metadata)) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  return [...counts]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || (a.tag < b.tag ? -1 : 1))
    .slice(0, limit);
}
