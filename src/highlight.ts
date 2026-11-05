// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// Where a search's words match in a text, to highlight them (#459). Apart from search.ts so
// the website's pages can use it without the rest of the core.

export const SEARCH_MAX_TERMS = 8;
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
/**
 * Where `terms` (searchTerms) match in `text`, as searches match them (#459): each word of
 * letters and digits that begins with a term, as [start, end) offsets into `text`, in order.
 * For highlighting what a search found.
 */
export function matchRanges(text: string, terms: string[]): [number, number][] {
  const ranges: [number, number][] = [];
  if (!terms.length) return ranges;
  for (const word of text.matchAll(/[\p{L}\p{N}]+/gu)) {
    const lower = word[0].normalize('NFC').toLowerCase();
    if (terms.some((term) => lower.startsWith(term)))
      ranges.push([word.index!, word.index! + word[0].length]);
  }
  return ranges;
}
