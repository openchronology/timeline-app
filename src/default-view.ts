// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// A timeline's default view (#416): how it opens for readers, embeds and shared links. It is a
// separation, by tags or by an entity's relationships, saved with the timeline's settings (`view`
// in a document), so exports, saves, forks, merges and saved history keep it like the title.
import { validateTags } from './tags.js';
import { refKey, validateRef } from './relationships.js';
import type { EntityRef } from './relationships.js';

/** What a timeline opens separated by: tags, or an entity and its related or connected set. */
export type ViewSeparation = { tags: string[] } | { related: EntityRef; depth: 'direct' | 'all' };
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
  if ('tags' in a || 'tags' in b)
    return (
      'tags' in a && 'tags' in b && [...a.tags].sort().join(',') === [...b.tags].sort().join(',')
    );
  return refKey(a.related) === refKey(b.related) && a.depth === b.depth;
}
