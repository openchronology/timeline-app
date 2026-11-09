// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// Tags (docs/tags.md) and separations: validating timeline and entity tags, splitting a timeline
// into what carries chosen tags (or relates to a chosen entity) and the rest, and tag counts.
import { durationWindow, isOngoing, resolveDuration } from './durations.js';
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
 * When a disjoin happens: at an exact time, at a moment's time (following it as it moves), or
 * at the first moment carrying the separation's tags (following them as they come and go).
 */
export type DisjoinTime = { at: string } | { moment: string } | { first: true };
/**
 * A disjoin (#549): from the main timeline (`from` null) or another separation (its index),
 * at a time. An event leaves that track for this separation's from then on.
 */
export type Disjoin = { from: number | null } & DisjoinTime;
/** When a union happens: at an exact time, at a moment's, or at the separation's last moment. */
export type UnionTime = { at: string } | { moment: string } | { last: true };
/**
 * A union, a disjoin's complement (#549): into the main timeline (`into` null) or another
 * separation, at a time. From then on the separation's events go there, and its track ends.
 */
export type Union = { into: number | null } & UnionTime;
/**
 * One of several separations (#548): the events with any of its tags, or (#552) an entity and
 * the entities related to it (`direct`) or connected to it through relationships (`all`), in a
 * track of their own. With disjoins, only from each one's time on, and only from its track:
 * before it, an event stays where it would otherwise be (the main timeline, or another
 * separation it matches). With unions, until them: an event at or after one goes to its
 * target (the latest passed).
 */
export type SeparationTrack = (
  { tags: string[] } | { related: EntityRef; depth: 'direct' | 'all' }
) & {
  disjoins?: Disjoin[];
  unions?: Union[];
};
/** The most separations shown together: each is a track, and a comparison has eight. */
const SEPARATIONS = 7;
const ID = /^[A-Za-z0-9_.:-]{1,128}$/;
/** A disjoin's or union's time: exact, a moment's, or the separation's first or last moment. */
function validateWhen(
  d: Record<string, unknown>,
  bound: 'first' | 'last',
): { at: string } | { moment: string } | { first: true } | { last: true } {
  const kinds = ['at', 'moment', bound].filter((k) => d[k] !== undefined);
  if (kinds.length !== 1)
    throw new Error(`A disjoin or union is at a time, a moment, or the ${bound} moment.`);
  if (d.at !== undefined) {
    if (typeof d.at !== 'string')
      throw new Error('A disjoin’s or union’s time must be an exact rational.');
    try {
      return { at: Q.parse(d.at).toString() };
    } catch {
      throw new Error('A disjoin’s or union’s time must be an exact rational.');
    }
  }
  if (d.moment !== undefined) {
    if (typeof d.moment !== 'string' || !ID.test(d.moment))
      throw new Error('A disjoin or union names a moment by its ID.');
    return { moment: d.moment };
  }
  if (d[bound] !== true) throw new Error(`A ${bound} moment is written \`"${bound}": true\`.`);
  return bound === 'first' ? { first: true } : { last: true };
}
/**
 * The order separations are resolved in: each after the separations it disjoins from, so an
 * event's place in them is known first. Throws when disjoins form a circle.
 */
export function separationOrder(
  separations: readonly { disjoins?: readonly { from: number | null }[] }[],
): number[] {
  const order: number[] = [],
    state = new Map<number, 'visiting' | 'done'>();
  const visit = (i: number) => {
    if (state.get(i) === 'done') return;
    if (state.get(i) === 'visiting')
      throw new Error('Separations cannot disjoin from each other in a circle.');
    state.set(i, 'visiting');
    for (const d of separations[i].disjoins ?? []) if (d.from !== null) visit(d.from);
    state.set(i, 'done');
    order.push(i);
  };
  separations.forEach((_, i) => visit(i));
  return order;
}
/**
 * Validates separations: one to seven, each with events' tags, disjoins (at most one from each
 * track) and unions (at most one into each), naming the main timeline or another separation,
 * each at an exact time, a moment, or the separation's first (disjoins) or last (unions) moment.
 * Disjoins may not form a circle.
 */
export function validateSeparations(value: unknown): SeparationTrack[] {
  if (!Array.isArray(value) || !value.length || value.length > SEPARATIONS)
    throw new Error(`Show one to ${SEPARATIONS} separations.`);
  const count = value.length;
  const track = (v: unknown, index: number) => {
    if (v === null) return null;
    if (Number.isInteger(v) && (v as number) >= 0 && (v as number) < count && v !== index)
      return v as number;
    throw new Error('A disjoin or union names the main timeline or another separation.');
  };
  const separations = value.map((raw, index): SeparationTrack => {
    const s = raw as Record<string, unknown> | null;
    if (!s || typeof s !== 'object' || Array.isArray(s))
      throw new Error('A separation is its tags, and when it disjoins and unites.');
    let by: { tags: string[] } | { related: EntityRef; depth: 'direct' | 'all' };
    if (s.related !== undefined) {
      // An entity and its relationships (#552), in place of tags.
      if (s.tags !== undefined)
        throw new Error('A separation is by tags or by an entity’s relationships, not both.');
      if (s.depth !== 'direct' && s.depth !== 'all')
        throw new Error('A separation by relationships is direct or all.');
      by = { related: validateRef(s.related), depth: s.depth };
    } else {
      const tags = validateEntityTags(s.tags);
      if (!tags.length) throw new Error('Each separation needs a tag.');
      by = { tags };
    }
    const list = (key: 'disjoins' | 'unions') => {
      const v = s[key];
      if (v === undefined || v === null) return [];
      if (!Array.isArray(v) || v.length > SEPARATIONS + 1)
        throw new Error(`A separation's ${key} are a list, one for each track at most.`);
      return v as Record<string, unknown>[];
    };
    const sources = new Set<number | null>(),
      targets = new Set<number | null>();
    const disjoins = list('disjoins').map((d): Disjoin => {
      if (!d || typeof d !== 'object') throw new Error('A disjoin is its source and time.');
      const from = track(d.from, index);
      if (sources.has(from)) throw new Error('A separation disjoins from each track at most once.');
      sources.add(from);
      return { from, ...(validateWhen(d, 'first') as DisjoinTime) };
    });
    const unions = list('unions').map((u): Union => {
      if (!u || typeof u !== 'object') throw new Error('A union is its target and time.');
      const into = track(u.into, index);
      if (targets.has(into)) throw new Error('A separation unites into each track at most once.');
      targets.add(into);
      return { into, ...(validateWhen(u, 'last') as UnionTime) };
    });
    return {
      ...by,
      ...(disjoins.length ? { disjoins } : {}),
      ...(unions.length ? { unions } : {}),
    };
  });
  separationOrder(separations);
  return separations;
}
/**
 * A disjoin's or union's time, resolved: its exact time, its moment's (`momentTime`), or the
 * first or last of the separation's moments (`boundTime`); null when there is none (a moment
 * since deleted, or none of the separation's yet), and it then waits.
 */
export function disjoinTime(
  when: DisjoinTime | UnionTime,
  momentTime: (id: string) => string | undefined,
  boundTime: (which: 'first' | 'last') => string | undefined,
): Rational | null {
  const time =
    'at' in when
      ? when.at
      : 'moment' in when
        ? momentTime(when.moment)
        : boundTime('first' in when ? 'first' : 'last');
  return time === undefined ? null : Q.parse(time);
}
/** Whether an entity (its reference key, `m:<id>` or `d:<id>`, and its tags) is a separation's. */
export type SeparationMatch = (key: string, tags: readonly string[]) => boolean;
/**
 * Which entities a separation takes, in a document: those with any of its tags, or its entity
 * and those related to it (directly, or through any chain of relationships).
 */
export function separationMatch(
  separation: SeparationTrack,
  document: Pick<TimelineDocument, 'relationships'>,
): SeparationMatch {
  if ('tags' in separation) {
    const tags = separation.tags;
    return (_key, entity) => entity.some((t) => tags.includes(t));
  }
  const start = refKey(separation.related);
  const set = reachable(
    adjacency(validateRelationships(document.relationships, null)),
    start,
    separation.depth === 'direct' ? 1 : Infinity,
  );
  set.add(start);
  return (key) => set.has(key);
}
/** The earliest or latest moment a separation takes in a document, by its time. */
export function boundMomentTime(document: Pick<TimelineDocument, 'events'>) {
  return (matches: SeparationMatch, which: 'first' | 'last'): string | undefined => {
    let found: Rational | null = null;
    for (const e of document.events)
      if (matches('m:' + e.id, entityTags(e.metadata))) {
        const time = Q.parse(e.time);
        if (!found || time.compare(found) * (which === 'first' ? 1 : -1) < 0) found = time;
      }
    return found?.toString();
  };
}
/**
 * Separations with each disjoin's and union's time resolved (null: not yet), and which
 * entities each takes (`matches`; left out where only the times are needed, for drawing).
 */
export type ResolvedSeparation = {
  matches?: SeparationMatch;
  disjoins?: { from: number | null; at: Rational | null }[];
  unions?: { into: number | null; at: Rational | null }[];
};
/** Resolves separations' entities, disjoins and unions against a document. */
export function resolveSeparations(
  separations: SeparationTrack[],
  document: Pick<TimelineDocument, 'events' | 'relationships'>,
): ResolvedSeparation[] {
  const times = new Map(document.events.map((e) => [e.id, e.time]));
  const bound = boundMomentTime(document);
  return separations.map((s) => {
    const matches = separationMatch(s, document);
    const when = (w: DisjoinTime | UnionTime) =>
      disjoinTime(
        w,
        (id) => times.get(id),
        (which) => bound(matches, which),
      );
    return {
      matches,
      ...(s.disjoins ? { disjoins: s.disjoins.map((d) => ({ from: d.from, at: when(d) })) } : {}),
      ...(s.unions ? { unions: s.unions.map((u) => ({ into: u.into, at: when(u) })) } : {}),
    };
  });
}
/** Stable cache key for a filter. */
export function viewFilterKey(filter: ViewFilter): string {
  if ('related' in filter)
    return `${filter.mode}:related:${filter.depth}:${refKey(validateRef(filter.related))}`;
  if ('separations' in filter)
    return `tracks:${filter.track === null ? 'rest' : filter.track}:${JSON.stringify(
      validateSeparations(filter.separations).map((s) =>
        'tags' in s ? { ...s, tags: [...s.tags].sort() } : s,
      ),
    )}`;
  return filter.mode + ':' + [...validateEntityTags(filter.tags)].sort().join(',');
}
/**
 * Which tracks an entity (`key`, with `tags`) at `time` is on, among `separations`, taken each after
 * those it disjoins from: a separation it matches without disjoins takes it, beside the tracks
 * it is already on; one with disjoins takes it from a track it is on (the main timeline when on
 * none) once that track's disjoin has come, and it leaves that track. Where a separation that
 * takes it has united (its latest union at or before `time`), it goes to that union's target
 * instead, followed on. The main track (`null`) when nothing takes it.
 */
export function separationTracks(
  separations: ResolvedSeparation[],
  key: string,
  tags: readonly string[],
  time: Rational | null,
): Set<number | null> {
  const passed = (at: Rational | null) => !!at && !!time && time.compare(at) >= 0;
  // Where an event taken by separation `i` is: there, or where its latest passed union goes.
  const unite = (i: number): number | null => {
    const seen = new Set<number>();
    let current: number | null = i;
    while (current !== null && !seen.has(current)) {
      seen.add(current);
      const latest: { into: number | null; at: Rational | null } | undefined = (
        separations[current].unions ?? []
      )
        .filter((u) => passed(u.at))
        .sort((a, b) => b.at!.compare(a.at!))[0];
      if (!latest) return current;
      current = latest.into;
    }
    return current;
  };
  let on = new Set<number | null>();
  for (const i of separationOrder(separations)) {
    const s = separations[i];
    if (!s.matches?.(key, tags)) continue;
    if (!s.disjoins) {
      on.add(unite(i));
      continue;
    }
    const home = on.size ? on : new Set<number | null>([null]);
    const leaving = s.disjoins.filter((d) => home.has(d.from) && passed(d.at)).map((d) => d.from);
    if (!leaving.length) {
      on = home;
      continue;
    }
    on = new Set([...home].filter((track) => !leaving.includes(track)));
    on.add(unite(i));
  }
  return on.size ? on : new Set([null]);
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
        // An ongoing end stays "now" (#537), resolved when a window is read, not frozen at
        // the start it resolves to here.
        end: isOngoing(duration.end) ? duration.end : band.endTime,
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
  document: Pick<TimelineDocument, 'relationships' | 'events'>,
  filter: ViewFilter,
): (key: string, metadata: Metadata, time?: string) => boolean {
  // Several separations: on this track when it is one of the entity's, at its time.
  if ('separations' in filter) {
    const separations = resolveSeparations(validateSeparations(filter.separations), document);
    return (key, metadata, time) =>
      separationTracks(separations, key, entityTags(metadata), time ? Q.parse(time) : null).has(
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
