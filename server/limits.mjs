// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
/**
 * Limits operators set in the environment: how many timelines each kind of account may
 * compare at once, how many entries a timeline holds, and the default storage quota.
 */
import { DEFAULT_ENTRY_LIMIT } from '../dist/core.mjs';

/** No comparison holds more than this: live updates, layouts and saved views assume it. */
export const COMPARE_CEILING = 8;
const COMPARE_DEFAULTS = { guest: 4, user: 8, admin: 8 };

export class LimitError extends Error {}

/**
 * How many timelines guests, signed-in users and administrators may compare at once, from
 * COMPARE_TIMELINES_GUEST, _USER and _ADMIN (2 to 8; defaults 4, 8 and 8).
 */
export function compareLimits(env = process.env) {
  const limits = {};
  for (const [kind, fallback] of Object.entries(COMPARE_DEFAULTS)) {
    const name = 'COMPARE_TIMELINES_' + kind.toUpperCase(),
      text = env[name]?.trim();
    const value = text ? Number(text) : fallback;
    if (!Number.isInteger(value) || value < 2 || value > COMPARE_CEILING)
      throw new LimitError(`${name} must be a whole number from 2 to ${COMPARE_CEILING}.`);
    limits[kind] = value;
  }
  return limits;
}
/** The comparison limit for an account (null for a guest). */
export function compareLimit(limits, account) {
  if (!account) return limits.guest;
  return account.isAdmin || account.is_admin ? limits.admin : limits.user;
}

const UNITS = new Map([
  ['', 1n],
  ['b', 1n],
  ['kb', 1000n],
  ['mb', 1000n ** 2n],
  ['gb', 1000n ** 3n],
  ['tb', 1000n ** 4n],
  ['kib', 1024n],
  ['mib', 1024n ** 2n],
  ['gib', 1024n ** 3n],
  ['tib', 1024n ** 4n],
]);
/** Quotas go up to 10 TB, as the administration page allows. */
export const QUOTA_CEILING = 10_000_000_000_000n;
/**
 * A storage size such as `104857600`, `500MiB`, `2 GB` or `1.5GiB`, in bytes (rounded down).
 * Decimal units are powers of 1000 and binary ones of 1024.
 */
export function storageBytes(text) {
  const match = /^\s*(\d+(?:\.\d+)?)\s*([a-z]*)\s*$/i.exec(String(text));
  const unit = match ? UNITS.get(match[2].toLowerCase()) : undefined;
  if (!match || unit === undefined)
    throw new LimitError(
      `Expected a storage size such as 104857600, 500MiB or 2GB, not "${String(text).trim()}".`,
    );
  const [whole, fraction = ''] = match[1].split('.');
  if (fraction && unit === 1n) throw new LimitError('A size in bytes is a whole number.');
  const bytes = (BigInt(whole + fraction) * unit) / 10n ** BigInt(fraction.length);
  if (bytes > QUOTA_CEILING) throw new LimitError('A storage quota can be at most 10 TB.');
  return bytes;
}
/**
 * The default storage quota the environment sets (DEFAULT_USER_STORAGE_BYTES), in bytes, or
 * null when it is unset or empty: the administration page then sets it.
 */
export function defaultQuota(env = process.env) {
  const text = env.DEFAULT_USER_STORAGE_BYTES?.trim();
  return text ? storageBytes(text) : null;
}

/**
 * How many moments a timeline may hold, and as many durations and relationships, from
 * TIMELINE_ENTRY_LIMIT: a whole number from 1,000, or "unlimited" (Infinity). Unset or
 * empty, 200,000.
 */
export function entryLimit(env = process.env) {
  const text = env.TIMELINE_ENTRY_LIMIT?.trim().replaceAll(/[_,]/g, '');
  if (!text) return DEFAULT_ENTRY_LIMIT;
  if (text.toLowerCase() === 'unlimited') return Infinity;
  const value = /^\d+$/.test(text) ? Number(text) : NaN;
  if (!Number.isSafeInteger(value) || value < 1000)
    throw new LimitError(
      'TIMELINE_ENTRY_LIMIT must be a whole number of at least 1000, or unlimited.',
    );
  return value;
}
