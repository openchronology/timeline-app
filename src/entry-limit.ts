// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
/**
 * How many moments a timeline may hold, and as many durations and relationships (#129):
 * 200,000 by default. A server's TIMELINE_ENTRY_LIMIT changes it for that server's process
 * (server/limits.mjs), and its pages learn it from the session. Infinity is no limit.
 */
export const DEFAULT_ENTRY_LIMIT = 200000;
// Kept on the global object: the platform's bundles each carry their own copy of this module,
// and all of them in one process follow the server's setting.
const KEY = Symbol.for('openchronology.entryLimit');
const global = globalThis as unknown as Record<symbol, number | undefined>;
export function entryLimit(): number {
  return global[KEY] ?? DEFAULT_ENTRY_LIMIT;
}
export function setEntryLimit(value: number) {
  if (value !== Infinity && !(Number.isSafeInteger(value) && value >= 1))
    throw new RangeError('A timeline entry limit is a positive whole number or Infinity.');
  global[KEY] = value;
}
/** Whether a timeline may hold this many entries of one kind. */
export function withinEntryLimit(count: number): boolean {
  return count <= entryLimit();
}
/** The limit as text for messages: "200,000". */
export function entryLimitText(): string {
  return entryLimit().toLocaleString('en-US');
}
