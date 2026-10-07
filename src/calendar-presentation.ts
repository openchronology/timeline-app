// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
import { Rational as Q } from 'rational-ordered-map';
import { parseTimestamp, printTimestamp } from './calendar.js';
import { decimalExponent, fixedDecimal, parseNumber, printNumber } from './numeric.js';
import { unitsPerPixel } from './view-context.js';
import type { PresentationContext } from './view-context.js';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAY = Q.from(86400n),
  HOUR = Q.from(3600n),
  MINUTE = Q.from(60n);
function parts(time: Q, offset: number) {
  const full = printTimestamp(time.floor(), offset);
  const match = /^([+-]?\d+)-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(Z|[+-]\d{2}:\d{2})$/.exec(
    full,
  )!;
  return {
    year: match[1],
    month: match[2],
    day: match[3],
    hour: match[4],
    minute: match[5],
    second: match[6],
    zone: match[7],
  };
}
function eraYear(year: string): string {
  const y = BigInt(year);
  return `${y > 0n ? y : 1n - y} ${y > 0n ? 'CE' : 'BCE'}`;
}
function eraTimestamp(text: string): string {
  return text.replace(/^([+-]?\d+)(.*)$/, (_, year: string, rest: string) => {
    const y = BigInt(year);
    return `${String(y > 0n ? y : 1n - y).padStart(4, '0')}${rest} ${y > 0n ? 'CE' : 'BCE'}`;
  });
}
function normalizeEra(text: string): string {
  const match = /^(\d+)(.*?)\s+(BCE|CE)(?=\s|$)(.*)$/i.exec(text);
  if (!match) return text;
  const year = BigInt(match[1]);
  if (year === 0n) throw new Error('BCE/CE dates have no year zero.');
  const y = match[3].toUpperCase() === 'BCE' ? 1n - year : year;
  return (
    (y < 0n ? '-' + String(-y).padStart(4, '0') : String(y).padStart(4, '0')) + match[2] + match[4]
  );
}
const date = (p: ReturnType<typeof parts>) => {
  const [year, era] = eraYear(p.year).split(' ');
  return `${year.padStart(4, '0')}-${p.month}-${p.day} ${era}`;
};
function deepYear(year: string): string {
  const y = BigInt(year);
  if (y <= -1000000n) return printNumber(Q.from(2000n - y, 1000000n), 6) + ' mya';
  if (y >= 1000000n) return printNumber(Q.from(y - 2000n, 1000000n), 6) + ' Myr after 2000 CE';
  return eraYear(year);
}
function precision(context: PresentationContext): Q {
  return unitsPerPixel(context).mul(
    Q.parseDecimal((context.spacingPixels ?? (context.purpose === 'axis' ? 115 : 6)).toString()),
  );
}
function abbreviatedDate(p: ReturnType<typeof parts>, base: ReturnType<typeof parts>): string {
  return p.year === base.year ? `${p.month}-${p.day}` : date(p);
}
/** Input/tooltip text remains an exact isomorphism; chart text intentionally omits invisible detail. */
export function printCalendar(time: Q, offset: number, context?: PresentationContext): string {
  if (!context || context.purpose === 'input' || context.purpose === 'tooltip')
    return eraTimestamp(printTimestamp(time, offset));
  const resolution = precision(context),
    base = parts(context.left, offset);
  if (resolution.compare(Q.from(1n, 1000000n)) < 0)
    return 'Δ ' + printNumber(time.sub(context.left), 6) + 's';
  const decimals =
    resolution.compare(Q.one) < 0 ? Math.min(6, Math.max(0, -decimalExponent(resolution))) : 0;
  // Only subsecond rounding can carry into another minute/day. Whole calendar fields denote buckets.
  const rounded = decimals > 0 ? Q.parseDecimal(fixedDecimal(time, decimals)) : time;
  const p = parts(rounded, offset),
    end = parts(context.left.add(context.span), offset);
  if (resolution.compare(Q.from(31557600n)) >= 0)
    return resolution.compare(Q.from(315576000000n)) >= 0 ? deepYear(p.year) : eraYear(p.year);
  if (resolution.compare(Q.from(2419200n)) >= 0)
    return base.year === end.year && p.year === base.year
      ? MONTHS[Number(p.month) - 1]
      : `${eraYear(p.year).split(' ')[0]}-${p.month} ${eraYear(p.year).split(' ')[1]}`;
  const shortDate = abbreviatedDate(p, base);
  if (resolution.compare(DAY) >= 0) return shortDate;
  // Pick fields once for the entire window. Crossing a minute/hour/day must not
  // expand just the labels on the far side of that boundary into full dates.
  const dayView = context.span.compare(DAY) <= 0;
  const hourView = context.span.compare(HOUR) <= 0;
  const minuteView = context.span.compare(MINUTE) <= 0;
  const seconds = Q.from(BigInt(p.second)).add(rounded.sub(rounded.floor()));
  const secondText = decimals
    ? fixedDecimal(seconds, decimals).padStart(3 + decimals, '0')
    : p.second;
  let clock: string;
  if (resolution.compare(HOUR) >= 0) clock = `${p.hour}h`;
  else if (resolution.compare(MINUTE) >= 0)
    clock = hourView ? `${p.minute}m` : `${p.hour}:${p.minute}`;
  else if (minuteView) clock = `${secondText}s`;
  else if (hourView) clock = `${p.minute}m ${secondText}s`;
  else clock = `${p.hour}:${p.minute}:${secondText}`;
  return (dayView ? '' : shortDate + ' ') + clock;
}

export function describeCalendar(offset: number, context: PresentationContext): string {
  const base = parts(context.left, offset),
    end = parts(context.left.add(context.span), offset);
  const zone = offset === 0 ? 'UTC' : 'UTC' + base.zone;
  // The common caption must explain relative event labels even when ruler labels
  // still have enough space to use absolute fractional seconds.
  const eventResolution = unitsPerPixel(context).mul(
    Q.parseDecimal(Math.min(6, context.spacingPixels ?? 6).toString()),
  );
  if (eventResolution.compare(Q.from(1n, 1000000n)) < 0)
    return `Δ from ${eraTimestamp(printTimestamp(context.left, offset))} · ${zone}`;
  if (precision(context).compare(Q.from(315576000000n)) >= 0)
    return `${deepYear(base.year)} → ${deepYear(end.year)} · ages relative to 2000 CE`;
  const dates = date(base) === date(end) ? date(base) : `${date(base)} → ${date(end)}`;
  if (context.span.compare(MINUTE) <= 0) {
    const start = `${base.hour}:${base.minute}`,
      finish = `${end.hour}:${end.minute}`;
    return `${dates} · base ${start}${start === finish ? '' : ' → ' + finish} · ${zone}`;
  }
  if (context.span.compare(HOUR) <= 0) {
    const start = `${base.hour}:00`,
      finish = `${end.hour}:00`;
    return `${dates} · base ${start}${start === finish ? '' : ' → ' + finish} · ${zone}`;
  }
  return `${dates} · ${zone}`;
}

/** Abbreviations resolve against the left bound's local calendar fields, never the host clock. */
export function parseCalendar(text: string, offset: number, context?: PresentationContext): Q {
  const age = /^([+]?[\d]+(?:\.\d+)?)\s+(mya|Myr after 2000 CE)$/i.exec(text.trim());
  if (age) {
    const years = parseNumber(age[1]).mul(Q.from(1000000n));
    if (!years.equals(years.floor()))
      throw new Error('Geological age labels must resolve to whole calendar years.');
    const amount = BigInt(years.floor().toString().split('/')[0]);
    const y = age[2].toLowerCase() === 'mya' ? 2000n - amount : 2000n + amount;
    const year = y < 0n ? '-' + String(-y).padStart(4, '0') : String(y).padStart(4, '0');
    const zone = offset === 0 ? 'Z' : parts(Q.zero, offset).zone;
    return parseTimestamp(`${year}-01-01T00:00:00${zone}`);
  }
  const value = normalizeEra(text.trim());
  if (!context && /^[+-]?\d{4,}(?:-\d{2}(?:-\d{2})?)?$/.test(value)) {
    const components = /^([+-]?\d+)(?:-(\d{2})(?:-(\d{2}))?)?$/.exec(value)!;
    const zone = offset === 0 ? 'Z' : parts(Q.zero, offset).zone;
    return parseTimestamp(
      `${components[1]}-${components[2] ?? '01'}-${components[3] ?? '01'}T00:00:00${zone}`,
    );
  }
  if (!context || value.includes('T')) return parseTimestamp(value);
  const base = parts(context.left, offset);
  const delta = /^Δ\s+(.+)s$/.exec(value);
  if (delta) return context.left.add(parseNumber(delta[1]));
  let year = base.year,
    month = base.month,
    day = base.day;
  let hour = '00',
    minute = '00',
    seconds = Q.zero;
  let clock = value;
  let cycle: Q | undefined;
  const fullDate = /^([+-]?\d{4,})-(\d{2})-(\d{2})(?:\s+(.*))?$/.exec(value);
  const shortDate = /^(\d{2})-(\d{2})(?:\s+(.*))?$/.exec(value);
  if (fullDate) {
    [year, month, day] = fullDate.slice(1, 4);
    clock = fullDate[4] ?? '';
  } else if (shortDate) {
    [month, day] = shortDate.slice(1, 3);
    clock = shortDate[3] ?? '';
  } else if (/^[+-]?\d{4,}$/.test(value)) {
    year = value;
    month = day = '01';
    clock = '';
  } else {
    const ym = /^([+-]?\d{4,})-(\d{2})$/.exec(value);
    if (ym) {
      year = ym[1];
      month = ym[2];
      day = '01';
      clock = '';
    } else if (MONTHS.includes(value)) {
      month = String(MONTHS.indexOf(value) + 1).padStart(2, '0');
      day = '01';
      clock = '';
    }
  }
  if (clock) {
    const h = /^(\d{2})h$/.exec(clock),
      m = /^(\d{2})m$/.exec(clock);
    const s = /^(?:(\d{2})m\s+)?(\d{2}(?:\.\d+)?)s$/.exec(clock);
    const hm = /^(\d{2}):(\d{2})(?::(\d{2}(?:\.\d+)?))?$/.exec(clock);
    if (h) {
      hour = h[1];
      cycle = DAY;
    } else if (m) {
      hour = base.hour;
      minute = m[1];
      cycle = HOUR;
    } else if (s) {
      hour = base.hour;
      minute = s[1] ?? base.minute;
      seconds = parseNumber(s[2]);
      cycle = s[1] ? HOUR : MINUTE;
    } else if (hm) {
      hour = hm[1];
      minute = hm[2];
      seconds = parseNumber(hm[3] ?? '0');
      cycle = DAY;
    } else throw new Error('Expected a full timestamp or a contextual Gregorian label.');
  }
  if (seconds.compare(MINUTE) >= 0) throw new Error('Seconds must be below 60.');
  let result = parseTimestamp(`${year}-${month}-${day}T${hour}:${minute}:00${base.zone}`).add(
    seconds,
  );
  // A short clock label may wrap across the omitted calendar unit. Prefer the
  // occurrence in the visible window; explicitly supplied dates never roll.
  if (!fullDate && !shortDate && cycle && result.compare(context.left) < 0) {
    const next = result.add(cycle);
    if (next.compare(context.left.add(context.span)) <= 0) result = next;
  }
  return result;
}
