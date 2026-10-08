// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
import { resolveDuration } from './durations.js';
import type { Metadata, PointEvent, TimelineDocument } from './core.js';
import type { Duration } from './durations.js';

export function validateTags(value: unknown): string[] {
  if (!Array.isArray(value) || value.length > 40) throw new Error('Use at most 40 tags.');
  const tags = value.map((tag) => {
    if (typeof tag !== 'string') throw new Error('Tags must be text.');
    const normalized = tag.normalize('NFC').trim().toLowerCase();
    if (!normalized || normalized.length > 64 || /[\x00-\x1f\x7f,]/.test(normalized))
      throw new Error('Tags must be 1–64 characters without commas or control characters.');
    return normalized;
  });
  return [...new Set(tags)];
}
/**
 * Normalizes an entity's `metadata.tags` when it is a valid tag list. Anything else is left
 * untouched as ordinary custom metadata, so older documents using that key still open.
 */
export function normalizeEntityTags(value: unknown): unknown {
  try {
    return validateTags(value);
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
export interface ViewFilter {
  tags: string[];
  mode: 'any' | 'none';
}
/** Stable cache key for a filter: mode plus sorted, normalized tags. */
export function viewFilterKey(filter: ViewFilter): string {
  return filter.mode + ':' + [...validateTags(filter.tags)].sort().join(',');
}
function matches(metadata: Metadata, filter: ViewFilter, wanted: Set<string>) {
  const any = entityTags(metadata).some((tag) => wanted.has(tag));
  return filter.mode === 'any' ? any : !any;
}
/**
 * One side of a separation. Durations are resolved to fixed endpoints first, because the
 * moments they follow may be on the other side.
 */
export function filterDocument(document: TimelineDocument, filter: ViewFilter): TimelineDocument {
  const wanted = new Set(validateTags(filter.tags));
  const times = new Map(document.events.map((e) => [e.id, e.time]));
  const events: PointEvent[] = document.events.filter((e) => matches(e.metadata, filter, wanted));
  const durations: Duration[] = [];
  for (const duration of document.durations ?? []) {
    if (!matches(duration.metadata, filter, wanted)) continue;
    const band = resolveDuration(duration, (id) => times.get(id));
    if (band)
      durations.push({
        id: duration.id,
        start: band.startTime,
        end: band.endTime,
        metadata: duration.metadata,
      });
  }
  return {
    ...document,
    events,
    ...(durations.length ? { durations } : { durations: undefined }),
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
