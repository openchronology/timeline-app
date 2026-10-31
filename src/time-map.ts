// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
/**
 * Shifting and scaling times for good (#96), with the alignment comparisons use: each time
 * becomes `(time − around) × scale + around + offset`, in exact rationals, so with `around`
 * at zero it is comparison's `time × scale + offset`. A positive scale keeps the order.
 *
 * It applies to every moment and duration, or to those a separation filter selects (tags,
 * or relationships). A duration's fixed start or end is mapped; one that follows a moment
 * keeps following it, and so moves only when that moment does.
 */
import { Rational as Q } from 'rational-ordered-map';
import type { PointEvent, TimelineDocument } from './core.js';
import type { Duration, DurationEndpoint } from './durations.js';
import { parseDecimal } from './numeric.js';
import { filterMembership } from './tags.js';
import type { ViewFilter } from './tags.js';

export interface TimeMapping {
  scale: Q;
  offset: Q;
  around: Q;
}
/** A mapping as sent to the server: exact rationals (or finite decimals) as text. */
export interface TimeMappingInput {
  scale: string;
  offset: string;
  around?: string;
}
function rational(value: unknown, name: string): Q {
  if (typeof value !== 'string' || !value.trim() || value.length > 4000)
    throw new Error(`Give the ${name} as a number.`);
  const text = value.trim();
  try {
    return text.includes('/') ? Q.parse(text) : parseDecimal(text);
  } catch {
    throw new Error(`Give the ${name} as a number.`);
  }
}
/** Validates a mapping: a positive scale, an offset and an optional point to scale around. */
export function timeMapping(value: unknown): TimeMapping {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Give a scale and an offset.');
  const input = value as Record<string, unknown>;
  const scale = rational(input.scale, 'scale');
  if (scale.compare(Q.zero) <= 0) throw new Error('Scale must be positive.');
  return {
    scale,
    offset: rational(input.offset, 'offset'),
    around: input.around === undefined ? Q.zero : rational(input.around, 'point to scale around'),
  };
}
export function timeMappingInput(mapping: TimeMapping): TimeMappingInput {
  return {
    scale: mapping.scale.toString(),
    offset: mapping.offset.toString(),
    around: mapping.around.toString(),
  };
}
/** Whether the mapping leaves every time where it is. */
export function unchanged(mapping: TimeMapping): boolean {
  return mapping.scale.compare(Q.one) === 0 && mapping.offset.compare(Q.zero) === 0;
}
export function mapTime(time: Q, mapping: TimeMapping): Q {
  return time.sub(mapping.around).mul(mapping.scale).add(mapping.around).add(mapping.offset);
}
const mapText = (time: string, mapping: TimeMapping, parse: (text: string) => Q) =>
  mapTime(parse(time), mapping).toString();
/**
 * The moments and durations of `document` that `filter` selects (all of them without one),
 * mapped. Those whose times do not change, such as durations that only follow moments, are
 * left out. `parse` reads a stored time (core's parseTime).
 */
export function mappedEntities(
  document: Pick<TimelineDocument, 'events' | 'durations' | 'relationships'>,
  mapping: TimeMapping,
  filter: ViewFilter | null,
  parse: (text: string) => Q,
): { events: PointEvent[]; durations: Duration[] } {
  const keep = filter ? filterMembership(document, filter) : () => true;
  const events: PointEvent[] = [],
    durations: Duration[] = [];
  if (unchanged(mapping)) return { events, durations };
  for (const event of document.events) {
    if (!keep('m:' + event.id, event.metadata)) continue;
    const time = mapText(event.time, mapping, parse);
    if (time !== parse(event.time).toString()) events.push({ ...event, time });
  }
  const endpoint = (end: DurationEndpoint) =>
    typeof end === 'string' ? mapText(end, mapping, parse) : end;
  for (const duration of document.durations ?? []) {
    if (!keep('d:' + duration.id, duration.metadata)) continue;
    const start = endpoint(duration.start),
      end = endpoint(duration.end);
    const moved = (before: DurationEndpoint, after: DurationEndpoint) =>
      typeof before === 'string' && after !== parse(before).toString();
    if (moved(duration.start, start) || moved(duration.end, end))
      durations.push({ ...duration, start, end });
  }
  return { events, durations };
}
