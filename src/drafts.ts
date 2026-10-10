// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
/**
 * Browser drafts stored record by record: one record per moment, duration, link and deleted
 * moment's last time, plus the timeline's settings. After the first save of a timeline, each
 * save writes only what the index's change journal names, so the pause after an edit no
 * longer grows with the timeline. The stored records rebuild exactly the document the index
 * would export. Storage is abstract here; the editor stores records in IndexedDB.
 */
import { TimelineIndex } from './core.js';
import type { TimelineDocument, PointEvent } from './core.js';
import type { Duration } from './durations.js';
import type { Relationship } from './relationships.js';

export const DRAFT_STORES = [
  'draft-moments',
  'draft-durations',
  'draft-links',
  'draft-retired',
] as const;
export type DraftStore = (typeof DRAFT_STORES)[number];
/** Writes a record, or deletes it when `value` is undefined. */
export interface DraftWrite {
  store: DraftStore;
  key: string;
  value?: unknown;
}
/** Document fields other than the entities and the (possibly large) embedded assets. */
export type DraftSettings = Omit<
  TimelineDocument,
  'events' | 'durations' | 'relationships' | 'assets'
>;
export interface DraftParts {
  settings: DraftSettings;
  assets?: Record<string, string>;
  moments: PointEvent[];
  durations: Duration[];
  links: Relationship[];
  retired: [string, string][];
}
const stores: Record<string, DraftStore> = {
  m: 'draft-moments',
  d: 'draft-durations',
  l: 'draft-links',
  r: 'draft-retired',
};
/** The records to write for journal entries (see TimelineIndex.takeChanges). */
export function draftWrites(index: TimelineIndex, changes: Iterable<string>): DraftWrite[] {
  const writes: DraftWrite[] = [];
  for (const change of changes) {
    const kind = change.slice(0, 1),
      key = change.slice(2);
    const value =
      kind === 'm'
        ? index.byId.get(key)
        : kind === 'd'
          ? index.durations.get(key)
          : kind === 'l'
            ? index.relationships.get(key)
            : index.retiredTime(key);
    writes.push({ store: stores[kind], key, value });
  }
  return writes;
}
/** Every record of an index, for its first save. */
export function allDraftWrites(index: TimelineIndex): DraftWrite[] {
  return [
    ...[...index.byId].map(([key, value]) => ({ store: stores.m, key, value })),
    ...[...index.durations].map(([key, value]) => ({ store: stores.d, key, value })),
    ...[...index.relationships].map(([key, value]) => ({ store: stores.l, key, value })),
    ...index.retiredTimes().map(([key, value]) => ({ store: stores.r, key, value })),
  ];
}
export function draftSettings(index: TimelineIndex): DraftSettings {
  return {
    format: 'openchronology',
    version: 1,
    title: index.title,
    description: index.description,
    ...(index.presentation ? { presentation: index.presentation } : {}),
    ...(index.plugins === undefined ? {} : { plugins: index.plugins }),
    ...(index.tags === undefined ? {} : { tags: index.tags }),
  };
}
/** The document a draft's records describe. */
export function draftDocument(parts: DraftParts): TimelineDocument {
  return TimelineIndex.fromParts(
    {
      ...parts.settings,
      ...(parts.assets === undefined ? {} : { assets: parts.assets }),
      events: parts.moments,
      durations: parts.durations,
      relationships: parts.links,
    },
    parts.retired,
  ).document();
}
