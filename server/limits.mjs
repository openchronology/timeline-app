// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
/**
 * Limits operators set in the environment: how many timelines each kind of account may
 * compare at once, how many entries a timeline holds, and the default storage quota.
 */
import {
  DEFAULT_ENTRY_LIMIT,
  DEFAULT_TIME_DIGITS,
  setTimeDigitLimit,
  UNBOUNDED_TIME_DIGITS,
} from '../dist/core.mjs';

/** No comparison holds more than this: live updates, layouts and saved views assume it. */
export const COMPARE_CEILING = 8;
/** Comparison limits when the environment sets none, by kind of account. */
const COMPARE_DEFAULTS = { guest: 4, user: 8, admin: 8 };

/**
 * An invalid limit in the environment (or a storage size an administrator typed); its message
 * says what is expected. platform.mjs turns it into a ConfigurationError at startup.
 */
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
/**
 * The comparison limit for an account (null for a guest): `account` may be a session
 * (`isAdmin`) or an oc_users row (`is_admin`).
 */
export function compareLimit(limits, account) {
  if (!account) return limits.guest;
  return account.isAdmin || account.is_admin ? limits.admin : limits.user;
}

/** Cross-timeline links a timeline may have (#422) when the environment sets no limit. */
export const DEFAULT_LINK_LIMIT = 10000;
/**
 * How many links to entities on other timelines a timeline may have (#422), from
 * TIMELINE_LINK_LIMIT: a whole number from 1, or "unlimited" (Infinity). Unset or empty,
 * 10,000. A link counts against both its timelines.
 */
export function linkLimit(env = process.env) {
  const text = env.TIMELINE_LINK_LIMIT?.trim().replaceAll(/[_,]/g, '');
  if (!text) return DEFAULT_LINK_LIMIT;
  if (text.toLowerCase() === 'unlimited') return Infinity;
  const value = /^\d+$/.test(text) ? Number(text) : NaN;
  if (!Number.isSafeInteger(value) || value < 1)
    throw new LimitError('TIMELINE_LINK_LIMIT must be a whole number of at least 1, or unlimited.');
  return value;
}

/** Size units, lower-cased, to bytes: none or b, decimal (kb…tb) and binary (kib…tib). */
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
  // Exact arithmetic in bigints: the digits without the point, times the unit, divided by
  // the power of ten the fraction's length gives (so 1.5GiB is 15 × 1024³ / 10).
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
 * The largest `.och` file exchanged with the server, in bytes, from TIMELINE_FILE_BYTES: a
 * storage size from 1 MiB to 1 GiB (such as `128MiB`). Unset or empty, 64 MiB (#202). It
 * bounds uploads, exports and och-convert's input and output, and sets its memory limit.
 */
export function timelineFileBytes(env = process.env) {
  const text = env.TIMELINE_FILE_BYTES?.trim();
  if (!text) return 64 * 1024 * 1024;
  const bytes = storageBytes(text);
  if (bytes < 1024n * 1024n || bytes > 1024n ** 3n)
    throw new LimitError('TIMELINE_FILE_BYTES must be from 1MiB to 1GiB.');
  return Number(bytes);
}
/** A file limit for messages: `64 MiB`, or `1.5 MiB`. */
export function mebibytes(bytes) {
  return `${Number((bytes / 1024 / 1024).toFixed(1))} MiB`;
}
/**
 * How many moments a timeline may hold, and as many durations and relationships, from
 * TIMELINE_ENTRY_LIMIT: a whole number from 1,000, or "unlimited" (Infinity). Unset or
 * empty, 200,000.
 */
/**
 * The most digits this server accepts in a time, as an exact fraction in lowest terms, from
 * TIME_DIGIT_LIMIT: `<numerator>/<denominator>` digits (each at least 20), or `unlimited`;
 * 1000/65 unless set (core's DEFAULT_TIME_DIGITS). Unlimited keeps times as unbounded on the
 * server as everywhere else, at a cost the operator accepts: anyone who may save a timeline
 * can then make the server spend minutes reading times of thousands of digits.
 */
export function timeDigits(env = process.env) {
  const text = env.TIME_DIGIT_LIMIT?.trim().replaceAll(/[_,]/g, '');
  if (!text) return DEFAULT_TIME_DIGITS;
  if (text.toLowerCase() === 'unlimited') return UNBOUNDED_TIME_DIGITS;
  const match = /^(\d+)\/(\d+)$/.exec(text);
  const [numerator, denominator] = match ? [Number(match[1]), Number(match[2])] : [NaN, NaN];
  if (!(numerator >= 20 && denominator >= 20 && numerator <= 1e6 && denominator <= 1e6))
    throw new LimitError(
      'TIME_DIGIT_LIMIT must be <numerator>/<denominator> digits, each from 20 to 1000000 (such as 1000/65), or unlimited.',
    );
  return { numerator, denominator };
}
/** Applies TIME_DIGIT_LIMIT to this process's parsing of times (core's parseTime). */
export function applyTimeDigits(env = process.env) {
  const limit = timeDigits(env);
  setTimeDigitLimit(limit);
  return limit;
}
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
