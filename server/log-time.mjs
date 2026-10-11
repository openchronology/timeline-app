// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
/**
 * Exact times for logs: Unix seconds as reduced "n/d" strings, keeping fractions, from ISO
 * 8601, Apache, ctime, nginx, classic syslog and epoch times, in fixed or IANA time zones.
 * Shared by the syslog receiver (syslog.mjs) and the log importer (log-formats.mjs).
 */
export const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

const gcd = (a, b) => {
  while (b) [a, b] = [b, a % b];
  return a < 0n ? -a : a;
};
/** Whole Unix seconds plus a decimal fraction (its digits), as a reduced "n/d" string. */
export function exactSeconds(whole, fraction = '') {
  const digits = fraction.replace(/0+$/, '');
  const denominator = 10n ** BigInt(digits.length);
  const numerator = BigInt(whole) * denominator + BigInt(digits || '0');
  const divisor = gcd(numerator, denominator) || 1n;
  return `${numerator / divisor}/${denominator / divisor}`;
}
/** A decimal number of seconds (or another unit) as exact seconds. */
export function epochSeconds(value, unit = 's') {
  const text = typeof value === 'number' ? String(value) : String(value ?? '').trim();
  const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(text);
  if (!match) throw new Error(`Invalid epoch time: ${text.slice(0, 40)}`);
  const scale = { s: 0, ms: 3, us: 6, ns: 9 }[unit];
  if (scale === undefined) throw new Error(`Unknown epoch unit: ${unit}`);
  // Shift the decimal point left by the unit's digits, exactly.
  const digits = match[2] + (match[3] ?? ''),
    point = match[2].length - scale;
  const whole = point > 0 ? digits.slice(0, point) : '0',
    fraction = point > 0 ? digits.slice(point) : '0'.repeat(-point) + digits;
  const time = exactSeconds(BigInt(whole), fraction);
  return match[1] && time !== '0/1' ? '-' + time : time;
}

/**
 * Time zones: "UTC", a fixed offset ("+02:00", "-0700") or an IANA name ("Europe/Berlin"),
 * whose offset follows daylight saving time. "local" is the importer's own zone.
 */
export function parseZone(text = 'UTC') {
  if (text === 'UTC' || text === 'Z') return { name: 'UTC', fixed: 0 };
  const offset = /^([+-])(\d{2}):?(\d{2})$/.exec(text);
  if (offset)
    return {
      name: text,
      fixed: (offset[1] === '-' ? -1 : 1) * (Number(offset[2]) * 60 + Number(offset[3])),
    };
  const name = text === 'local' ? Intl.DateTimeFormat().resolvedOptions().timeZone : text;
  let format;
  try {
    format = new Intl.DateTimeFormat('en-US', {
      timeZone: name,
      hourCycle: 'h23',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
    });
  } catch {
    throw new Error(`Unknown time zone: ${text}`);
  }
  return { name, format };
}
/** The zone's offset from UTC, in minutes, at a UTC instant (milliseconds). */
function offsetAt(zone, ms) {
  if (zone.fixed !== undefined) return zone.fixed;
  const parts = Object.fromEntries(
    zone.format.formatToParts(new Date(ms)).map((p) => [p.type, Number(p.value)]),
  );
  const wall = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );
  return Math.round((wall - Math.floor(ms / 1000) * 1000) / 60000);
}
/** A wall-clock time in a zone as UTC milliseconds (whole seconds). */
export function wallToUtc(zone, year, month, day, hour, minute, second) {
  const wall = Date.UTC(year, month - 1, day, hour, minute, second);
  if (!Number.isFinite(wall)) throw new Error('Invalid date.');
  // Twice, so that times beside a daylight-saving change take the offset in force then.
  const first = wall - offsetAt(zone, wall) * 60000;
  return wall - offsetAt(zone, first) * 60000;
}
const time = (ms, fraction) => ({ time: exactSeconds(BigInt(ms / 1000), fraction), ms });
const offsetMinutes = (text) =>
  text === 'Z' || text === 'z'
    ? 0
    : (text[0] === '-' ? -1 : 1) * (Number(text.slice(1, 3)) * 60 + Number(text.slice(-2)));

/** ISO 8601 date-times; without an offset, in `zone`. */
export function isoTime(text, zone) {
  const parts =
    /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(?:[.,](\d{1,9}))?)?(Z|z|[+-]\d{2}:?\d{2})?$/.exec(
      String(text).trim(),
    );
  if (!parts) throw new Error(`Invalid ISO time: ${String(text).slice(0, 40)}`);
  const [, y, mo, d, h, mi, s = '0', fraction = '', offset] = parts;
  if (+mo < 1 || +mo > 12 || +d < 1 || +d > 31 || +h > 23 || +mi > 59 || +s > 60)
    throw new Error(`Invalid ISO time: ${text}`);
  const ms =
    offset === undefined
      ? wallToUtc(zone, +y, +mo, +d, +h, +mi, +s)
      : Date.UTC(+y, +mo - 1, +d, +h, +mi, +s) - offsetMinutes(offset) * 60000;
  return time(ms, fraction);
}
/** Apache's "10/Oct/2026:13:55:36 -0700" (brackets optional). */
export function apacheTime(text, zone) {
  const parts =
    /^\[?(\d{2})\/([A-Z][a-z]{2})\/(\d{4}):(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,9}))?(?: ([+-]\d{4}))?\]?$/.exec(
      String(text).trim(),
    );
  const month = parts ? MONTHS.indexOf(parts[2]) + 1 : 0;
  if (!month) throw new Error(`Invalid Apache time: ${String(text).slice(0, 40)}`);
  const [, d, , y, h, mi, s, fraction = '', offset] = parts;
  const ms =
    offset === undefined
      ? wallToUtc(zone, +y, month, +d, +h, +mi, +s)
      : Date.UTC(+y, month - 1, +d, +h, +mi, +s) - offsetMinutes(offset) * 60000;
  return time(ms, fraction);
}
/** Apache error logs' "Fri Oct 09 08:15:01.123456 2026" (weekday optional), in `zone`. */
export function ctimeTime(text, zone) {
  const parts =
    /^(?:[A-Z][a-z]{2} )?([A-Z][a-z]{2}) +(\d{1,2}) (\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,9}))? (\d{4})$/.exec(
      String(text).trim(),
    );
  const month = parts ? MONTHS.indexOf(parts[1]) + 1 : 0;
  if (!month) throw new Error(`Invalid time: ${String(text).slice(0, 40)}`);
  const [, , d, h, mi, s, fraction = '', y] = parts;
  return time(wallToUtc(zone, +y, month, +d, +h, +mi, +s), fraction);
}
/** nginx error logs' "2026/10/09 08:15:01", in `zone`. */
export function nginxTime(text, zone) {
  const parts = /^(\d{4})\/(\d{2})\/(\d{2}) (\d{2}):(\d{2}):(\d{2})$/.exec(String(text).trim());
  if (!parts) throw new Error(`Invalid nginx time: ${String(text).slice(0, 40)}`);
  const [, y, mo, d, h, mi, s] = parts;
  return time(wallToUtc(zone, +y, +mo, +d, +h, +mi, +s), '');
}

/**
 * Years for classic syslog times ("Oct  9 08:15:01"), which have none. The first time takes
 * the latest year that puts it at or before `reference` (the file's modification time), or
 * `year` when given; later times keep it, stepping to the next year when a time falls more
 * than half a year before the previous one (a log crossing New Year). Out-of-order lines a
 * little earlier do not step.
 */
export class YearClock {
  constructor({ year = null, reference = Date.now(), zone = parseZone('UTC') } = {}) {
    this.fixed = year;
    this.reference = reference;
    this.zone = zone;
    this.year = null;
    this.last = null;
  }
  read(text) {
    const parts = /^([A-Z][a-z]{2}) +(\d{1,2}) (\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,9}))?$/.exec(
      String(text).trim(),
    );
    const month = parts ? MONTHS.indexOf(parts[1]) + 1 : 0;
    if (!month) throw new Error(`Invalid syslog time: ${String(text).slice(0, 40)}`);
    const [, , d, h, mi, s, fraction = ''] = parts;
    const at = (year) => wallToUtc(this.zone, year, month, +d, +h, +mi, +s);
    if (this.year === null) {
      if (this.fixed !== null) this.year = this.fixed;
      else {
        this.year = new Date(this.reference).getUTCFullYear() + 1;
        while (at(this.year) > this.reference) this.year--;
      }
    }
    let ms = at(this.year);
    if (this.last !== null && ms < this.last - 183 * 86400000) ms = at(++this.year);
    this.last = ms;
    return time(ms, fraction);
  }
}
