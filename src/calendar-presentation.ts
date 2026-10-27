// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// Gregorian time presentation: stored seconds written and read as calendar dates in a fixed
// zone offset, exact in inputs and tooltips, and on the chart only as precise as the view shows.
import { Rational as Q } from 'rational-ordered-map';
import { parseTimestamp, printTimestamp } from './calendar.js';
import {
  decimalExponent,
  fixedDecimal,
  parseNumber,
  printNumber,
  printSI,
  parseSI,
} from './numeric.js';
import { labelResolution, unitsPerPixel } from './view-context.js';
import type { PresentationContext } from './view-context.js';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
// Stored Gregorian times are seconds since 1970-01-01T00:00:00Z (Unix time, no leap seconds).
const DAY = Q.from(86400n),
  HOUR = Q.from(3600n),
  MINUTE = Q.from(60n);
/**
 * The local calendar fields of a time's whole second in a fixed offset (minutes east of
 * UTC), as zero-padded strings taken from the ISO timestamp. Years are astronomical
 * (year 0 is 1 BCE, -1 is 2 BCE) and may have any number of digits; `zone` is `Z` or `±hh:mm`.
 */
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
/** An astronomical year as a BCE/CE year: 1 → `1 CE`, 0 → `1 BCE`, -43 → `44 BCE`. */
function eraYear(year: string): string {
  const y = BigInt(year);
  return `${y > 0n ? y : 1n - y} ${y > 0n ? 'CE' : 'BCE'}`;
}
/**
 * An ISO timestamp with its astronomical year rewritten as a BCE/CE year (padded to four
 * digits) and the era appended: `-0043-03-15T…Z` → `0044-03-15T…Z BCE`. normalizeEra undoes it.
 */
function eraTimestamp(text: string): string {
  return text.replace(/^([+-]?\d+)(.*)$/, (_, year: string, rest: string) => {
    const y = BigInt(year);
    return `${String(y > 0n ? y : 1n - y).padStart(4, '0')}${rest} ${y > 0n ? 'CE' : 'BCE'}`;
  });
}
/**
 * The inverse of the era labels: text starting with a year and carrying a `BCE` or `CE` word
 * gets the astronomical year back (`44 BCE` → `-0043`, `0044-03-15T…Z BCE` →
 * `-0043-03-15T…Z`) with the era word removed. Text without an era is returned unchanged.
 * Throws for year zero, which BCE/CE numbering skips.
 */
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
/** A full date label, `yyyy-mm-dd CE` (or BCE). */
const date = (p: ReturnType<typeof parts>) => {
  const [year, era] = eraYear(p.year).split(' ');
  return `${year.padStart(4, '0')}-${p.month}-${p.day} ${era}`;
};
/**
 * A year label for views spanning millennia. Within a million years of the present it is a
 * BCE/CE year; further back it is an age before 2000 CE in the largest power-of-1000 unit
 * that fits (`mya` million years ago, `bya` billion, … `qya`, then plain scientific years
 * ago); further ahead, an SI count of years after 2000 CE. parseCalendar reads all three.
 */
function deepYear(year: string): string {
  const y = BigInt(year);
  if (y <= -1000000n) {
    const age = Q.from(2000n - y);
    const exponent = Math.max(6, Math.floor(decimalExponent(age) / 3) * 3);
    const units: Record<number, string> = {
      6: 'mya',
      9: 'bya',
      12: 'tya',
      15: 'pya',
      18: 'eya',
      21: 'zya',
      24: 'yya',
      27: 'rya',
      30: 'qya',
    };
    return units[exponent]
      ? printNumber(age.div(Q.from(10n ** BigInt(exponent))), 6) + ' ' + units[exponent]
      : printNumber(age, 6, true) + ' years ago';
  }
  if (y >= 1000000n) return printSI(Q.from(y - 2000n), 6, 'yr') + ' after 2000 CE';
  return eraYear(year);
}
/**
 * The time between neighbouring labels in this view (labelResolution): a ruler tick's exact
 * interval, else seconds per pixel times the label spacing. A label never needs fields finer
 * than this.
 */
const precision = labelResolution;
/** `mm-dd` when the year is the view's left-edge year (parseCalendar fills it in), else a full date. */
function abbreviatedDate(p: ReturnType<typeof parts>, base: ReturnType<typeof parts>): string {
  return p.year === base.year ? `${p.month}-${p.day}` : date(p);
}
/**
 * Input/tooltip text remains an exact isomorphism; chart text intentionally omits invisible detail.
 *
 * Without a context, or for inputs and tooltips, prints the full exact timestamp with its
 * era (fractional seconds exactly, as a decimal or `{+n/d}`). For axis and moment labels,
 * the fields shown follow the label resolution: years (or deep-time ages from 10,000 years
 * per label), months from 28 days, dates from a day, then a clock in hours, minutes or
 * seconds (with up to six decimals). Fields the whole view shares are omitted (the date
 * within a day's view, the hour within an hour's) and are restored from the view by
 * parseCalendar. Below a millisecond of resolution in a view of a second or less, labels
 * become Δ offsets from the left edge in SI seconds.
 */
export function printCalendar(time: Q, offset: number, context?: PresentationContext): string {
  if (!context || context.purpose === 'input' || context.purpose === 'tooltip')
    return eraTimestamp(printTimestamp(time, offset));
  const resolution = precision(context),
    base = parts(context.left, offset);
  if (relativeCalendar(context)) return 'Δ ' + printSI(time.sub(context.left), 6, 's');
  const decimals =
    resolution.compare(Q.one) < 0 ? Math.min(6, Math.max(0, -decimalExponent(resolution))) : 0;
  // Only subsecond rounding can carry into another minute/day. Whole calendar fields denote buckets.
  const rounded = decimals > 0 ? Q.parseDecimal(fixedDecimal(time, decimals)) : time;
  const p = parts(rounded, offset),
    end = parts(context.left.add(context.span), offset);
  // Julian years (365.25 days), ten thousand of them, and 28 days (the shortest month).
  if (resolution.compare(Q.from(31557600n)) >= 0)
    return resolution.compare(Q.from(315576000000n)) >= 0 ? deepYear(p.year) : eraYear(p.year);
  // Month names alone only while the whole view lies within one year.
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
  // Whole seconds from the calendar fields plus the (rounded) fraction; padded so that one
  // digit seconds still print as `05.25`.
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

/**
 * A span of time from `first` to `last` as dates, as precise as its length calls for (#338):
 * deep-time ages from 10,000 years (`66 mya – 2000 CE`), years from two years (`1809 CE –
 * 1865 CE`), months from 60 days (`Mar 1944 CE – Aug 1945 CE`), days from two days
 * (`6 Jun 1944 CE – 25 Aug 1944 CE`), then minutes from two hours and seconds below, with
 * the zone. One time alone when both ends read the same.
 */
export function printCalendarSpan(first: Q, last: Q, offset: number): string {
  const span = last.sub(first),
    at = (seconds: bigint) => span.compare(Q.from(seconds)) >= 0;
  const day = (p: ReturnType<typeof parts>) =>
    `${Number(p.day)} ${MONTHS[Number(p.month) - 1]} ${eraYear(p.year)}`;
  const zone = (p: ReturnType<typeof parts>) => (p.zone === 'Z' ? 'UTC' : 'UTC' + p.zone);
  let text: (p: ReturnType<typeof parts>) => string;
  if (at(315576000000n)) text = (p) => deepYear(p.year);
  else if (at(2n * 31557600n)) text = (p) => eraYear(p.year);
  else if (at(60n * 86400n)) text = (p) => `${MONTHS[Number(p.month) - 1]} ${eraYear(p.year)}`;
  else if (at(2n * 86400n)) text = day;
  else if (at(2n * 3600n)) text = (p) => `${day(p)} ${p.hour}:${p.minute}`;
  else text = (p) => `${day(p)} ${p.hour}:${p.minute}:${p.second}`;
  const a = parts(first, offset),
    b = parts(last, offset);
  const clock = !at(2n * 86400n);
  const [from, to] = [text(a), text(b)];
  // Within a day, the end needs only its clock.
  const end =
    clock && a.year === b.year && a.month === b.month && a.day === b.day
      ? to.slice(day(b).length + 1)
      : to;
  const suffix = clock ? ' ' + zone(a) : '';
  return from === to ? from + suffix : `${from} – ${end}${suffix}`;
}

/**
 * A time written on its own (#344), for a page about one moment rather than a view: always its
 * full date with its era, at the time's own precision. The start of a year is that year
 * (`91 BCE`, or an age in deep time), the start of a month its year and month (`1781-09 CE`),
 * midnight its date (`1781-09-09 CE`); other times add their clock, to the minute, the second
 * or exactly (`1781-09-09 CE 14:30 UTC`), with the zone.
 */
export function printCalendarAlone(time: Q, offset: number): string {
  const p = parts(time, offset);
  if (time.equals(time.floor()) && p.hour === '00' && p.minute === '00' && p.second === '00') {
    if (p.month === '01' && p.day === '01') return deepYear(p.year);
    const [year, era] = eraYear(p.year).split(' ');
    return p.day === '01' ? `${year}-${p.month} ${era}` : date(p);
  }
  // The exact clock as the full timestamp writes it, fraction and all, without needless seconds.
  const clock = /T(\d{2}:\d{2}):(\d{2}.*?)(Z|[+-]\d{2}:\d{2})$/.exec(printTimestamp(time, offset))!;
  const zone = clock[3] === 'Z' ? 'UTC' : 'UTC' + clock[3];
  return `${date(p)} ${clock[1]}${clock[2] === '00' ? '' : ':' + clock[2]} ${zone}`;
}

/**
 * The caption above the chart that supplies what adaptive labels omit: the dates the view
 * spans, the base hour or minute for short clock labels, and the zone; the Δ origin when
 * labels are relative; or the range of ages in deep time.
 */
export function describeCalendar(offset: number, context: PresentationContext): string {
  const base = parts(context.left, offset),
    end = parts(context.left.add(context.span), offset);
  const zone = offset === 0 ? 'UTC' : 'UTC' + base.zone;
  // The common caption must explain relative event labels even when ruler labels
  // still have enough space to use absolute fractional seconds.
  if (relativeCalendar(context))
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

/**
 * Abbreviations resolve against the left bound's local calendar fields, never the host clock.
 *
 * Reads, in order: deep-time ages (`1.5 mya`, `3 Myr after 2000 CE`, which must come to whole
 * years and mean 1 January of that year); without a context, a bare year, year-month or
 * date (midnight in the offset); a full ISO timestamp, with or without an era; and, with a
 * context, everything printCalendar writes for a view: Δ offsets, short dates, years,
 * year-months, month names and clock labels, with omitted fields taken from the left edge.
 * Throws on anything else, and on seconds of 60 or more.
 */
export function parseCalendar(text: string, offset: number, context?: PresentationContext): Q {
  const age =
    /^([+]?[\d]+(?:\.\d+)?(?:e[+-]?\d+)?)\s+(mya|bya|tya|pya|eya|zya|yya|rya|qya|years ago|[kMGTPEZYRQ]?yr after 2000 CE)$/i.exec(
      text.trim(),
    );
  if (age) {
    const exponents: Record<string, number> = {
      mya: 6,
      bya: 9,
      tya: 12,
      pya: 15,
      eya: 18,
      zya: 21,
      yya: 24,
      rya: 27,
      qya: 30,
      'years ago': 0,
    };
    const future = /after 2000 CE$/i.test(age[2]);
    const years = future
      ? parseSI(age[1] + ' ' + age[2].replace(/ after 2000 CE$/i, ''), 'yr')
      : parseNumber(age[1]).mul(Q.from(10n ** BigInt(exponents[age[2].toLowerCase()])));
    if (!years.equals(years.floor()))
      throw new Error('Geological age labels must resolve to whole calendar years.');
    // The value is whole, so its canonical string is `n/1` and the numerator is the count.
    const amount = BigInt(years.floor().toString().split('/')[0]);
    const y = !future ? 2000n - amount : 2000n + amount;
    const year = y < 0n ? '-' + String(-y).padStart(4, '0') : String(y).padStart(4, '0');
    // Any time's parts carry the offset's zone suffix; the epoch is just a convenient one.
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
  const delta = /^Δ\s+(.+)$/.exec(value);
  if (delta) return context.left.add(parseSI(delta[1], 's'));
  let year = base.year,
    month = base.month,
    day = base.day;
  let hour = '00',
    minute = '00',
    seconds = Q.zero;
  let clock = value;
  // The calendar unit a clock label leaves out (a day for `14h`, an hour for `05m`): the
  // label repeats every cycle, which matters at the left edge below.
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

/**
 * Whether calendar labels become Δ seconds from the left edge: in views of a second or less
 * where six pixels cover less than a millisecond. describeCalendar then names the origin.
 */
function relativeCalendar(context: PresentationContext): boolean {
  return (
    context.span.compare(Q.one) <= 0 &&
    unitsPerPixel(context).mul(Q.from(6n)).compare(Q.from(1n, 1000n)) < 0
  );
}
