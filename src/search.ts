// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
import { Rational as Q } from 'rational-ordered-map';
import { resolveDuration } from './durations.js';
import type { Metadata, PointEvent, TimelineIndex } from './core.js';

export const SEARCH_PAGE_SIZE = 25;
export const SEARCH_MAX_TERMS = 8;
export interface SearchResult {
  kind: 'moment' | 'duration';
  id: string;
  /** A moment's time, or a duration's earlier endpoint. */
  first: string;
  last: string;
  title: string;
  snippet: string;
}
export interface SearchPage {
  results: SearchResult[];
  total: string;
  page: number;
}
/**
 * Lowercased words of letters and digits. Every term must occur; the same normalization
 * feeds PostgreSQL prefix queries, SQLite and in-memory matching.
 */
export function searchTerms(text: string): string[] {
  const terms = text
    .normalize('NFC')
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((term) => term.length > 0)
    .map((term) => term.slice(0, 64));
  return [...new Set(terms)].slice(0, SEARCH_MAX_TERMS);
}
/** Searchable title and body: notes plus the titles and notes of nested entries (stacks). */
export function searchText(metadata: Metadata): { title: string; body: string } {
  const parts: string[] = [];
  if (typeof metadata.description === 'string') parts.push(metadata.description);
  for (const value of Object.values(metadata))
    if (Array.isArray(value))
      for (const entry of value) {
        const nested = (entry as { metadata?: Metadata } | null)?.metadata;
        if (nested && typeof nested === 'object')
          for (const key of ['title', 'description'] as const)
            if (typeof nested[key] === 'string') parts.push(nested[key] as string);
      }
  return {
    title: typeof metadata.title === 'string' ? metadata.title : '',
    body: parts.join(' ').slice(0, 1048576),
  };
}
export function snippet(body: string) {
  return body.length > 240 ? body.slice(0, 239) + '…' : body;
}
/** Complete in-memory timelines: title matches rank first, then earlier entities. */
export function searchIndex(
  index: TimelineIndex,
  text: string,
  page = 1,
  pageSize = SEARCH_PAGE_SIZE,
): SearchPage {
  const terms = searchTerms(text);
  if (!terms.length) return { results: [], total: '0', page };
  const hits: (SearchResult & { titleHit: boolean })[] = [];
  const consider = (
    kind: SearchResult['kind'],
    id: string,
    first: string,
    last: string,
    metadata: Metadata,
  ) => {
    const { title, body } = searchText(metadata);
    const lowerTitle = title.toLowerCase(),
      haystack = lowerTitle + ' ' + body.toLowerCase();
    if (!terms.every((term) => haystack.includes(term))) return;
    hits.push({
      kind,
      id,
      first,
      last,
      title,
      snippet: snippet(body),
      titleHit: terms.every((term) => lowerTitle.includes(term)),
    });
  };
  for (const event of index.byId.values())
    consider('moment', event.id, event.time, event.time, event.metadata);
  for (const duration of index.durations.values()) {
    const band = resolveDuration(duration, (id) => index.momentTime(id));
    if (band) consider('duration', duration.id, band.first, band.last, duration.metadata);
  }
  hits.sort(
    (a, b) =>
      Number(b.titleHit) - Number(a.titleHit) ||
      Q.parse(a.first).compare(Q.parse(b.first)) ||
      a.kind.localeCompare(b.kind) ||
      (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );
  return {
    results: hits
      .slice((page - 1) * pageSize, page * pageSize)
      .map(({ titleHit: _titleHit, ...result }) => result),
    total: String(hits.length),
    page,
  };
}
/** Searchable rows for a saved document, used to rebuild server search indexes. */
export function searchRows(
  events: readonly PointEvent[],
  durations: readonly { id: string; first: string; last: string; metadata: Metadata }[],
) {
  return [
    ...events.map((e) => ({
      kind: 'moment' as const,
      id: e.id,
      first: e.time,
      last: e.time,
      ...searchText(e.metadata),
    })),
    ...durations.map((d) => ({
      kind: 'duration' as const,
      id: d.id,
      first: d.first,
      last: d.last,
      ...searchText(d.metadata),
    })),
  ];
}
