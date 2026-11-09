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
import { Rational, Rational as Q } from 'rational-ordered-map';
import type { Metadata, PointEvent, TimelineDocument } from './core.js';
import type { Duration } from './durations.js';

/** The longest a timeline's own tag may be (catalog tags, shown on cards and pages). */
export const TIMELINE_TAG_LENGTH = 64;
/**
 * The longest an event's tag may be: long enough for references such as
 * `gitlab:git.example.com/group/subgroup/project!1234` (#538).
 */
export const ENTITY_TAG_LENGTH = 128;
/**
 * Normalizes a list of tags: trimmed, lowercased, deduplicated, at most 40, each 1 to `length`
 * characters without commas or control characters. A timeline's own tags by default; events'
 * tags, and the tags that select events, with ENTITY_TAG_LENGTH (validateEntityTags).
 */
export function validateTags(value: unknown, length = TIMELINE_TAG_LENGTH): string[] {
  if (!Array.isArray(value) || value.length > 40) throw new Error('Use at most 40 tags.');
  const tags = value.map((tag) => {
    if (typeof tag !== 'string') throw new Error('Tags must be text.');
    const normalized = tag.normalize('NFC').trim().toLowerCase();
    if (!normalized || normalized.length > length || /[\x00-\x1f\x7f,]/.test(normalized))
      throw new Error(`Tags must be 1–${length} characters without commas or control characters.`);
    return normalized;
  });
  return [...new Set(tags)];
}
/** Events' tags, and tags that select events (separations, charts), at most 128 characters. */
export const validateEntityTags = (value: unknown) => validateTags(value, ENTITY_TAG_LENGTH);
/**
 * Normalizes an entity's `metadata.tags` when it is a valid tag list. Anything else is left
 * untouched as ordinary custom metadata, so older documents using that key still open.
 */
export function normalizeEntityTags(value: unknown): unknown {
  try {
    return validateEntityTags(value);
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
  | { related: EntityRef; depth: 'direct' | 'all'; mode: 'any' | 'none' }
  /** One track of several separations, some disjoining at a time (`null`: the main track). */
  | { separations: SeparationTrack[]; track: number | null };
/**
 * One of several separations (#548): the events with any of its tags, in a track of their own.
 * With `disjoin`, only from `at` on: before it, they stay in the track they disjoin from, the
 * main timeline's (`from` null) or an earlier separation's (its index), and the separation
 * forks away at `at` (#549).
 */
export interface SeparationTrack {
  tags: string[];
  disjoin?: { at: string; from: number | null };
}
/** The most separations shown together: each is a track, and a comparison has eight. */
const SEPARATIONS = 7;
/**
 * Validates separations: one to seven, each with events' tags, and a disjoin, when it has one,
 * at an exact time from the main timeline or an earlier separation (so they never disjoin
 * from each other in a circle).
 */
export function validateSeparations(value: unknown): SeparationTrack[] {
  if (!Array.isArray(value) || !value.length || value.length > SEPARATIONS)
    throw new Error(`Show one to ${SEPARATIONS} separations.`);
  return value.map((raw, index) => {
    const s = raw as Record<string, unknown> | null;
    if (!s || typeof s !== 'object' || Array.isArray(s))
      throw new Error('A separation is its tags, and when it disjoins.');
    const tags = validateEntityTags(s.tags);
    if (!tags.length) throw new Error('Each separation needs a tag.');
    if (s.disjoin === undefined || s.disjoin === null) return { tags };
    const d = s.disjoin as Record<string, unknown>;
    if (
      !d ||
      typeof d !== 'object' ||
      typeof d.at !== 'string' ||
      !(
        d.from === null ||
        (Number.isInteger(d.from) && (d.from as number) >= 0 && (d.from as number) < index)
      )
    )
      throw new Error(
        'A separation disjoins at a time, from the main timeline or an earlier separation.',
      );
    let at: string;
    try {
      at = Q.parse(d.at).toString();
    } catch {
      throw new Error('A disjoin’s time must be an exact rational.');
    }
    return { tags, disjoin: { at, from: d.from as number | null } };
  });
}
/** Stable cache key for a filter. */
export function viewFilterKey(filter: ViewFilter): string {
  if ('related' in filter)
    return `${filter.mode}:related:${filter.depth}:${refKey(validateRef(filter.related))}`;
  if ('separations' in filter)
    return `tracks:${filter.track === null ? 'rest' : filter.track}:${JSON.stringify(
      validateSeparations(filter.separations).map((s) => ({ ...s, tags: [...s.tags].sort() })),
    )}`;
  return filter.mode + ':' + [...validateEntityTags(filter.tags)].sort().join(',');
}
/**
 * Which tracks an entity with `tags` at `time` is on, among `separations`: for each separation
 * it matches, that separation's track, or before it disjoins, the track it disjoins from
 * (followed back); the main track (`null`) when it matches none.
 */
export function separationTracks(
  separations: SeparationTrack[],
  tags: readonly string[],
  time: Rational | null,
): Set<number | null> {
  const ats = separations.map((s) => (s.disjoin ? Q.parse(s.disjoin.at) : null));
  const trackOf = (i: number): number | null => {
    const s = separations[i];
    if (!s.disjoin || !time || time.compare(ats[i]!) >= 0) return i;
    return s.disjoin.from === null ? null : trackOf(s.disjoin.from);
  };
  const tracks = new Set<number | null>();
  separations.forEach((s, i) => {
    if (s.tags.some((tag) => tags.includes(tag))) tracks.add(trackOf(i));
  });
  if (!tracks.size) tracks.add(null);
  return tracks;
}
/**
 * One side of a separation. Durations are resolved to fixed endpoints first, because the
 * moments they follow may be on the other side.
 */
export function filterDocument(document: TimelineDocument, filter: ViewFilter): TimelineDocument {
  const keep = filterMembership(document, filter);
  const times = new Map(document.events.map((e) => [e.id, e.time]));
  // An entity's time decides its track where a separation disjoins: a moment's, and a
  // duration's start.
  const events: PointEvent[] = document.events.filter((e) => keep('m:' + e.id, e.metadata, e.time));
  const durations: Duration[] = [];
  for (const duration of document.durations ?? []) {
    const band = resolveDuration(duration, (id) => times.get(id));
    if (!keep('d:' + duration.id, duration.metadata, band?.startTime)) continue;
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
): (key: string, metadata: Metadata, time?: string) => boolean {
  // Several separations: on this track when it is one of the entity's, at its time.
  if ('separations' in filter) {
    const separations = validateSeparations(filter.separations);
    return (_key, metadata, time) =>
      separationTracks(separations, entityTags(metadata), time ? Q.parse(time) : null).has(
        filter.track,
      );
  }
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
    const wanted = new Set(validateEntityTags(filter.tags));
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
  const inside = (key: string) => keep(key, metadata.get(key) ?? {}, times.get(key));
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
