// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// A timeline's default view (#416): how it opens for readers, embeds and shared links. It is a
// separation, by tags or by an entity's relationships, saved with the timeline's settings (`view`
// in a document), so exports, saves, forks, merges and saved history keep it like the title.
import { validateTags } from './tags.js';
import { refKey, validateRef } from './relationships.js';
import type { EntityRef } from './relationships.js';

/**
 * What a timeline opens separated by: tags (one separation), several groups of tags (one
 * track each, above the rest), or an entity and its related or connected set.
 */
export type ViewSeparation =
  { tags: string[] } | { groups: string[][] } | { related: EntityRef; depth: 'direct' | 'all' };
/** The most tag separations shown at once: each is a track, and a comparison has eight. */
export const SEPARATION_LIMIT = 7;
/** A tag separation's groups: one for `{tags}`, each of `{groups}`; none for an entity's. */
export function separationGroups(s: ViewSeparation | null | undefined): string[][] {
  if (!s) return [];
  return 'tags' in s ? [s.tags] : 'groups' in s ? s.groups : [];
}
/** Tag separations as a default view keeps them: `{tags}` for one, `{groups}` for several. */
export function tagSeparation(groups: string[][]): ViewSeparation {
  return groups.length === 1 ? { tags: [...groups[0]] } : { groups: groups.map((g) => [...g]) };
}
export interface TimelineView {
  separation: ViewSeparation;
}
/**
 * Validates a timeline's default view, returning it normalized: tags as entity tags are (one to
 * forty, trimmed and lowercased), an entity reference as relationships name one. The entity need
 * not exist: one deleted since opens the whole timeline instead (resolveSeparation's callers).
 */
export function validateTimelineView(value: unknown): TimelineView {
  const object = (v: unknown): v is Record<string, unknown> =>
    !!v && typeof v === 'object' && !Array.isArray(v);
  if (!object(value) || Object.keys(value).some((k) => k !== 'separation'))
    throw new Error('A timeline’s default view has only a separation.');
  const s = value.separation;
  if (object(s) && 'tags' in s) {
    if (Object.keys(s).length !== 1)
      throw new Error('A default separation by tags has only its tags.');
    const tags = validateTags(s.tags);
    if (!tags.length) throw new Error('A default separation needs at least one tag.');
    return { separation: { tags } };
  }
  if (object(s) && 'groups' in s) {
    if (Object.keys(s).length !== 1 || !Array.isArray(s.groups))
      throw new Error('A default separation by several groups of tags has only its groups.');
    if (s.groups.length < 2 || s.groups.length > SEPARATION_LIMIT)
      throw new Error(
        `A default view has two to ${SEPARATION_LIMIT} groups of tags; one is {"tags": [...]}.`,
      );
    const groups = s.groups.map((group) => {
      const tags = validateTags(group);
      if (!tags.length) throw new Error('Each group of a default separation needs a tag.');
      return tags;
    });
    return { separation: { groups } };
  }
  if (object(s) && 'related' in s) {
    if (
      Object.keys(s).some((k) => k !== 'related' && k !== 'depth') ||
      (s.depth !== 'direct' && s.depth !== 'all')
    )
      throw new Error('A default separation by relationships has an entity and a depth.');
    return { separation: { related: validateRef(s.related), depth: s.depth } };
  }
  throw new Error('A default view separates by tags or by an entity’s relationships.');
}
/**
 * Whether two separations are the same: the same normalized tags in any order (tags have no
 * commas), or the same entity and depth.
 */
export function sameSeparation(a: ViewSeparation | null, b: ViewSeparation | null): boolean {
  if (!a || !b) return a === b;
  if ('related' in a || 'related' in b)
    return (
      'related' in a &&
      'related' in b &&
      refKey(a.related) === refKey(b.related) &&
      a.depth === b.depth
    );
  // Tag separations: the same groups, each the same tags, in any order.
  const key = (s: ViewSeparation) =>
    separationGroups(s)
      .map((g) => [...g].sort().join(','))
      .sort()
      .join('|');
  return key(a) === key(b);
}
