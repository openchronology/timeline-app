// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// Which moments and durations have pages for search engines (#467): listed in the sitemap,
// announced to IndexNow, and not marked noindex. A page of its own is worth a search engine's
// while only when the event says something of its own; thousands of near-identical pages,
// such as a log's lines, would lower how the site's other pages are rated.
//
// Each timeline's `index_events` setting chooses: `all` its events, `none` (its own page only),
// or `auto`, the default: an event with notes of at least LISTED_NOTES characters and a title
// no other event of the timeline shares, unless the timeline's notes are templated, most of
// them one text with only numbers and names changed (templatedNotes), when none are. Whether
// any are listed at all is entitiesListed's (server/indexnow.mjs): public, unlabelled, not a
// comparison, and not too large.

/** The settings: automatic, every event, or none. */
export const EVENT_LISTINGS = ['auto', 'all', 'none'];
/** The characters of notes (as searched: plain text) an event needs to be listed automatically. */
export const LISTED_NOTES = 150;
/** How many events with notes are sampled for templated notes, and the fewest that decide. */
export const TEMPLATE_SAMPLE = 200;
export const TEMPLATE_MIN = 20;
/** The share of the sample one template must account for to call the timeline templated. */
export const TEMPLATE_SHARE = 0.5;
/** How many of the opening words of a note's skeleton are compared. */
const SKELETON_WORDS = 12;

/**
 * The shape of a note, without what a template fills in: lower-cased, without `code`
 * spans, quoted strings, numbers, addresses and punctuation; its first few words. Two notes a
 * template wrote from different records ("At 02:35:04 UTC, `nginx` on `web-1` emitted…" and
 * "At 02:35:09 UTC, `api` on `web-2` emitted…") share it; two written by hand rarely do.
 */
export function skeleton(note) {
  return String(note ?? '')
    .toLowerCase()
    .replace(/`[^`]*`|"[^"]*"|“[^”]*”/g, ' ')
    .replace(/\b[\w.+-]+@[\w.-]+\b|https?:\/\/\S+|\/\S*/g, ' ')
    .replace(/[\p{N}]+/gu, ' ')
    .replace(/[^\p{L}\s]+/gu, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, SKELETON_WORDS)
    .join(' ');
}

/**
 * Whether a timeline's notes are templated: of a sample of its notes long enough to list
 * (at least TEMPLATE_MIN of them), at least TEMPLATE_SHARE share one skeleton.
 * @param {string[]} notes the sample
 */
export function templatedNotes(notes) {
  const long = notes.filter((n) => String(n).length >= LISTED_NOTES);
  if (long.length < TEMPLATE_MIN) return false;
  const counts = new Map();
  for (const note of long) {
    const shape = skeleton(note);
    counts.set(shape, (counts.get(shape) ?? 0) + 1);
  }
  return Math.max(...counts.values()) >= long.length * TEMPLATE_SHARE;
}

/**
 * SQL for whether index row `s` (an oc_entity_search row, or a fork's read of one) is listed
 * automatically, with `rows` the timeline's rows to compare its title with: notes of
 * LISTED_NOTES characters, and a title of its own.
 */
export const listedAutomatically = (rows) => `length(s.body) >= ${LISTED_NOTES}
  AND NOT EXISTS(SELECT 1 FROM ${rows} o WHERE lower(o.title)=lower(s.title)
    AND (o.kind,o.entity_id)<>(s.kind,s.entity_id))`;
