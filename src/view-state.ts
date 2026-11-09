// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
/**
 * A server timeline's view kept across reloads of the page (#128): its bounds, grouping
 * distance, separations (by tags or relationships) and whether it follows the latest events. Kept in
 * the tab's session storage, like the page itself: a reload shows the same view, a new tab
 * or a shared link starts from the whole timeline. Stored text is read back as untrusted:
 * anything malformed is dropped rather than shown.
 */
import { Q } from './core.js';
import type { EntityRef } from './relationships.js';
import { validateSeparations } from './tags.js';
import type { SeparationTrack } from './tags.js';

/** Separations by tags, some perhaps disjoining (#549), or an entity's relationships. */
/**
 * Separations, by tags or an entity's relationships (#552), with the titles of those entities
 * by reference key (`m:<id>`, `d:<id>`) for the bar's label.
 */
export type StoredSeparation = { tracks: SeparationTrack[]; titles?: Record<string, string> };
export interface ViewState {
  /** The view's bounds, as exact rationals. */
  left?: string;
  right?: string;
  /** "Group within", in pixels. */
  density?: number;
  separation?: StoredSeparation;
  follow?: boolean;
}
export const VIEW_PREFIX = 'och:view:';
/** One timeline (or comparison) of one server. */
export function viewStorageKey(origin: string, scope: string): string {
  return VIEW_PREFIX + origin + '\u0001' + scope;
}
const DENSITY = { min: 12, max: 48 };
const TAGS = 64,
  TEXT = 1000;

function separationOf(value: unknown): StoredSeparation | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const v = value as Record<string, unknown>;
  const group = (list: unknown) => {
    if (!Array.isArray(list)) return null;
    const tags = list.filter((t): t is string => typeof t === 'string' && !!t && t.length <= TEXT);
    return tags.length && tags.length === list.length && tags.length <= TAGS ? tags : null;
  };
  // One group, as tabs kept it before there could be several; groups, before disjoins.
  if (Array.isArray(v.tags)) {
    const tags = group(v.tags);
    return tags ? { tracks: [{ tags }] } : undefined;
  }
  if (Array.isArray(v.groups)) {
    const groups = v.groups.map(group);
    return groups.length && groups.length <= 7 && groups.every((g) => g !== null)
      ? { tracks: (groups as string[][]).map((tags) => ({ tags })) }
      : undefined;
  }
  if (Array.isArray(v.tracks)) {
    try {
      const tracks = validateSeparations(v.tracks);
      const titles: Record<string, string> = {};
      if (v.titles && typeof v.titles === 'object' && !Array.isArray(v.titles))
        for (const [key, title] of Object.entries(v.titles))
          if (
            /^[md]:/.test(key) &&
            key.length <= 200 &&
            typeof title === 'string' &&
            title.length <= TEXT
          )
            titles[key] = title;
      return { tracks, ...(Object.keys(titles).length ? { titles } : {}) };
    } catch {
      return undefined;
    }
  }
  const related = v.related as Record<string, unknown> | null | undefined;
  if (
    !related ||
    typeof related !== 'object' ||
    (v.depth !== 'direct' && v.depth !== 'all') ||
    typeof v.label !== 'string' ||
    v.label.length > TEXT
  )
    return undefined;
  const keys = Object.keys(related);
  if (keys.length !== 1 || (keys[0] !== 'moment' && keys[0] !== 'duration')) return undefined;
  const id = related[keys[0]];
  if (typeof id !== 'string' || !id || id.length > 200) return undefined;
  // One entity's relationships, as tabs kept it before they were a kind of separation.
  const ref = (keys[0] === 'moment' ? { moment: id } : { duration: id }) as EntityRef;
  return {
    tracks: [{ related: ref, depth: v.depth }],
    titles: { [(keys[0] === 'moment' ? 'm:' : 'd:') + id]: v.label },
  };
}
/** The valid parts of stored text; nothing for text that is not a stored view. */
export function readViewState(text: string | null | undefined): ViewState {
  let value: unknown;
  try {
    value = JSON.parse(text ?? '');
  } catch {
    return {};
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const v = value as Record<string, unknown>,
    state: ViewState = {};
  if (typeof v.left === 'string' && typeof v.right === 'string') {
    try {
      const left = Q.parse(v.left),
        right = Q.parse(v.right);
      if (right.compare(left) > 0) {
        state.left = left.toString();
        state.right = right.toString();
      }
    } catch {
      // Not a pair of rationals.
    }
  }
  if (
    typeof v.density === 'number' &&
    Number.isInteger(v.density) &&
    v.density >= DENSITY.min &&
    v.density <= DENSITY.max
  )
    state.density = v.density;
  const separation = separationOf(v.separation);
  if (separation) state.separation = separation;
  if (typeof v.follow === 'boolean') state.follow = v.follow;
  return state;
}
