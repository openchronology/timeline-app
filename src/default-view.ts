// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// A timeline's default view (#416): how it opens for readers, embeds and shared links. It is a
// separation, by tags or by an entity's relationships, saved with the timeline's settings (`view`
// in a document), so exports, saves, forks, merges and saved history keep it like the title.
import { validateEntityTags, validateSeparations } from './tags.js';
import type { SeparationTrack } from './tags.js';
import { refKey, validateRef } from './relationships.js';
import type { EntityRef } from './relationships.js';

/**
 * What a timeline opens separated by: tags (one separation), several groups of tags (one
 * track each, above the rest), or an entity and its related or connected set.
 */
export type ViewSeparation =
  | { tags: string[] }
  | { groups: string[][] }
  /** Separations of which some disjoin at a time (#549). */
  | { separations: SeparationTrack[] }
  | { related: EntityRef; depth: 'direct' | 'all' };
/** The most tag separations shown at once: each is a track, and a comparison has eight. */
export const SEPARATION_LIMIT = 7;
/** A tag separation's separations: one for `{tags}`, each of `{groups}` or `{separations}`. */
export function viewSeparations(s: ViewSeparation | null | undefined): SeparationTrack[] {
  if (!s || 'related' in s) return [];
  if ('separations' in s) return s.separations;
  return ('tags' in s ? [s.tags] : s.groups).map((tags) => ({ tags }));
}
/** A tag separation's groups of tags. */
export const separationGroups = (s: ViewSeparation | null | undefined): string[][] =>
  viewSeparations(s).map((t) => t.tags);
/**
 * Tag separations as a default view keeps them: `{tags}` for one, `{groups}` for several, and
 * `{separations}` when any disjoins or unites.
 */
export function tagSeparation(tracks: SeparationTrack[] | string[][]): ViewSeparation {
  const list: SeparationTrack[] = tracks.map((t) => (Array.isArray(t) ? { tags: [...t] } : t));
  if (list.some((t) => t.disjoins?.length || t.unions?.length))
    return { separations: list.map((t) => ({ ...t, tags: [...t.tags] })) };
  return list.length === 1 ? { tags: [...list[0].tags] } : { groups: list.map((t) => [...t.tags]) };
}
/**
 * A timeline's default view: its separation, and when it is one of the timeline's saved views
 * (#550), that view's ID: a server's saved view, or an entry of a file's `views`. The
 * separation is then a copy: a server shows the view as it is now, and the copy only once the
 * view is gone.
 */
export interface TimelineView {
  id?: string;
  separation: ViewSeparation;
}
/** A saved view's ID: a server's (a UUID) or a file's own. */
const VIEW_ID = /^[A-Za-z0-9_.:-]{1,128}$/;
/** A view saved in a file (#550): its ID, its title and description, and its separation. */
export interface SavedViewEntry {
  id: string;
  title: string;
  description?: string;
  separation: ViewSeparation;
}
/** The most views a file keeps. */
export const SAVED_VIEW_LIMIT = 100;
/** Validates a saved view's title (1–200 characters, trimmed) and description (≤ 2000). */
export function validateViewText(title: unknown, description: unknown = '') {
  if (typeof title !== 'string' || !title.trim() || title.trim().length > 200)
    throw new Error('A view’s title is 1–200 characters.');
  if (typeof description !== 'string' || description.length > 2000)
    throw new Error('A view’s description is at most 2,000 characters.');
  return { title: title.trim(), description: description.trim() };
}
/** Validates the views a file keeps: each with a unique ID, a title and a separation. */
export function validateSavedViews(value: unknown): SavedViewEntry[] {
  if (!Array.isArray(value) || value.length > SAVED_VIEW_LIMIT)
    throw new Error(`A file keeps at most ${SAVED_VIEW_LIMIT} views.`);
  const ids = new Set<string>();
  return value.map((raw) => {
    const v = raw as Record<string, unknown> | null;
    if (!v || typeof v !== 'object' || Array.isArray(v))
      throw new Error('A view is its ID, title and separation.');
    if (typeof v.id !== 'string' || !VIEW_ID.test(v.id) || ids.has(v.id))
      throw new Error('Each view has an ID of its own.');
    ids.add(v.id);
    const { title, description } = validateViewText(v.title, v.description ?? '');
    const { separation } = validateTimelineView({ separation: v.separation });
    return { id: v.id, title, ...(description ? { description } : {}), separation };
  });
}
/**
 * Validates a timeline's default view, returning it normalized: tags as entity tags are (one to
 * forty, trimmed and lowercased), an entity reference as relationships name one. The entity need
 * not exist: one deleted since opens the whole timeline instead (resolveSeparation's callers).
 */
export function validateTimelineView(value: unknown): TimelineView {
  const object = (v: unknown): v is Record<string, unknown> =>
    !!v && typeof v === 'object' && !Array.isArray(v);
  if (!object(value) || Object.keys(value).some((k) => k !== 'separation' && k !== 'id'))
    throw new Error('A timeline’s default view has only a separation, and the view’s ID.');
  if (value.id !== undefined && (typeof value.id !== 'string' || !VIEW_ID.test(value.id)))
    throw new Error('A default view names a saved view by its ID.');
  const id = value.id === undefined ? {} : { id: value.id as string };
  return { ...id, ...validateViewSeparation(value.separation) };
}
/** Validates a default view's separation, as `{separation}`. */
function validateViewSeparation(s: unknown): { separation: ViewSeparation } {
  const object = (v: unknown): v is Record<string, unknown> =>
    !!v && typeof v === 'object' && !Array.isArray(v);
  if (object(s) && 'tags' in s) {
    if (Object.keys(s).length !== 1)
      throw new Error('A default separation by tags has only its tags.');
    const tags = validateEntityTags(s.tags);
    if (!tags.length) throw new Error('A default separation needs at least one tag.');
    return { separation: { tags } };
  }
  if (object(s) && 'separations' in s) {
    if (Object.keys(s).length !== 1)
      throw new Error('A default separation with disjoins or unions has only its separations.');
    return { separation: { separations: validateSeparations(s.separations) } };
  }
  if (object(s) && 'groups' in s) {
    if (Object.keys(s).length !== 1 || !Array.isArray(s.groups))
      throw new Error('A default separation by several groups of tags has only its groups.');
    if (s.groups.length < 2 || s.groups.length > SEPARATION_LIMIT)
      throw new Error(
        `A default view has two to ${SEPARATION_LIMIT} groups of tags; one is {"tags": [...]}.`,
      );
    const groups = s.groups.map((group) => {
      const tags = validateEntityTags(group);
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
  // Tag separations: the same tags (in any order), disjoins and unions for each; without them, the
  // groups in any order.
  const key = (s: ViewSeparation) => {
    const tracks = viewSeparations(s).map((t) =>
      JSON.stringify({
        tags: [...t.tags].sort(),
        disjoins: t.disjoins ?? [],
        unions: t.unions ?? [],
      }),
    );
    return viewSeparations(s).some((t) => t.disjoins?.length || t.unions?.length)
      ? tracks.join('|')
      : tracks.sort().join('|');
  };
  return key(a) === key(b);
}
