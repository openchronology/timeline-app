// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
/**
 * Time differences: the units a time presentation recognises for offsets, such as the offset
 * that aligns a track when comparing timelines. A difference is exact, in stored coordinates,
 * and written as one or more amounts with units, `2 years 3 days` or `-1 h 30 min`; a leading
 * sign applies to the whole difference.
 */
import { Rational as Q } from 'rational-ordered-map';
import { compileCustomDifference } from './custom-time.js';
import { decimalExponent, parseNumber } from './numeric.js';
import { DEFAULT_PRESENTATION, validatePresentation } from './presentation.js';
import type { TimePresentation } from './presentation.js';

export interface DifferenceUnit {
  /** Printed name, singular. */
  name: string;
  /** Printed name for other amounts, when it differs. */
  plural?: string;
  /** Other spellings it is read from. */
  aliases: string[];
  /** Whether its words are read in any case (`Days`); symbols such as `ms` and `Ms` never are. */
  caseless?: boolean;
  /** Its size in stored coordinates. */
  size: Q;
}
export interface TimeDifference {
  /** Units it reads, largest first; empty when only plain numbers are read. */
  units: DifferenceUnit[];
  /** What a number without a unit means, or null if every amount needs a unit. */
  plain: string | null;
  parse(text: string): Q;
  print(difference: Q): string;
}

const SECOND = Q.one,
  MINUTE = Q.from(60n),
  HOUR = Q.from(3600n),
  DAY = Q.from(86400n),
  WEEK = Q.from(604800n),
  // The Gregorian calendar's mean year, 365.2425 days, which 400 years repeat exactly.
  YEAR = Q.from(31556952n),
  MONTH = YEAR.div(Q.from(12n));
const ten = (exponent: number) =>
  exponent >= 0 ? Q.from(10n ** BigInt(exponent)) : Q.from(1n, 10n ** BigInt(-exponent));

/** Fixed-length time units in seconds; years and months are means of the Gregorian calendar. */
const TIME_UNITS: { name: string; plural?: string; aliases: string[]; seconds: Q }[] = [
  { name: 'year', plural: 'years', aliases: ['yr', 'yrs', 'a'], seconds: YEAR },
  { name: 'month', plural: 'months', aliases: ['mo'], seconds: MONTH },
  { name: 'week', plural: 'weeks', aliases: ['wk', 'wks', 'w'], seconds: WEEK },
  { name: 'day', plural: 'days', aliases: ['d'], seconds: DAY },
  { name: 'h', aliases: ['hour', 'hours', 'hr', 'hrs'], seconds: HOUR },
  { name: 'min', aliases: ['minute', 'minutes', 'mins'], seconds: MINUTE },
  { name: 's', aliases: ['second', 'seconds', 'sec', 'secs'], seconds: SECOND },
  ...(
    [
      ['ms', 'millisecond', -3],
      ['µs', 'microsecond', -6],
      ['ns', 'nanosecond', -9],
      ['ps', 'picosecond', -12],
      ['fs', 'femtosecond', -15],
      ['as', 'attosecond', -18],
    ] as const
  ).map(([name, word, exponent]) => ({
    name,
    aliases: [word, word + 's', ...(name === 'µs' ? ['us', 'μs'] : [])],
    seconds: ten(exponent),
  })),
];
/** Units without a calendar (seconds and smaller), when a presentation's unit names one. */
const FIXED_TIME = TIME_UNITS.filter((u) => u.name !== 'year' && u.name !== 'month');
/** Units a difference is printed in: weeks and months are read but not printed. */
const PRINTED = ['year', 'day', 'h', 'min', 's'];
const SUBSECOND = ['ms', 'µs', 'ns', 'ps', 'fs', 'as'];
const SI_PREFIXES: [string, number][] = [
  ['Q', 30],
  ['R', 27],
  ['Y', 24],
  ['Z', 21],
  ['E', 18],
  ['P', 15],
  ['T', 12],
  ['G', 9],
  ['M', 6],
  ['k', 3],
  ['h', 2],
  ['da', 1],
  ['', 0],
  ['d', -1],
  ['c', -2],
  ['m', -3],
  ['µ', -6],
  ['n', -9],
  ['p', -12],
  ['f', -15],
  ['a', -18],
  ['z', -21],
  ['y', -24],
  ['r', -27],
  ['q', -30],
];

/** Exact text for a rational: a decimal when it terminates, otherwise `n/d`. */
export function exactText(value: Q): string {
  let d = value.denominator,
    twos = 0,
    fives = 0;
  while (d % 2n === 0n) ((d /= 2n), twos++);
  while (d % 5n === 0n) ((d /= 5n), fives++);
  if (d !== 1n) return value.toString();
  const places = Math.max(twos, fives);
  if (!places) return value.numerator.toString();
  const scaled = value.mul(ten(places)).numerator,
    digits = (scaled < 0n ? -scaled : scaled).toString().padStart(places + 1, '0');
  return (
    (scaled < 0n ? '-' : '') +
    digits.slice(0, -places) +
    '.' +
    digits.slice(-places)
  ).replace(/\.?0+$/, '');
}
const amount = (value: Q, unit: { name: string; plural?: string }) =>
  `${exactText(value)} ${unit.plural && value.compare(Q.one) !== 0 ? unit.plural : unit.name}`;

/** The unit a presentation's unit label names, in seconds, if it is a fixed time unit. */
function secondsOf(label: string): Q | null {
  const unit = FIXED_TIME.find((u) => matches(u, label));
  return unit ? unit.seconds : null;
}
function matches(
  unit: { name: string; plural?: string; aliases: string[]; caseless?: boolean },
  text: string,
) {
  const spellings = [unit.name, unit.plural ?? '', ...unit.aliases].filter(Boolean);
  return spellings.some((s) =>
    unit.caseless !== false && s.length > 2 ? s.toLowerCase() === text.toLowerCase() : s === text,
  );
}
function seconds(scale: Q, units = TIME_UNITS): DifferenceUnit[] {
  return units.map((u) => ({
    name: u.name,
    ...(u.plural ? { plural: u.plural } : {}),
    aliases: u.aliases,
    caseless: true,
    size: u.seconds.mul(scale),
  }));
}

const TERM =
  /\s*(\d+\s*\/\s*\d+|(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?)\s*([^\s\d,.+\-−/][^\s\d,]*)?\s*,?/y;
/** Stands for a unit label of several words while a difference is read. */
const LABEL = '\uE000';
/** Reads `[sign] amount [unit] …` with these units; a plain number is `plain` units. */
function read(text: string, units: DifferenceUnit[], plain: Q | null): Q {
  let rest = text.trim().replace(/^Δ\s*/, '');
  let sign = Q.one;
  if (/^[+\-−]/.test(rest)) {
    if (rest[0] !== '+') sign = sign.neg();
    rest = rest.slice(1);
  }
  if (!rest.trim()) throw new Error('Enter a time difference, such as 2 days or 1 h 30 min.');
  let total = Q.zero,
    terms = 0,
    unitless = false;
  TERM.lastIndex = 0;
  while (TERM.lastIndex < rest.length) {
    const at = TERM.lastIndex,
      match = TERM.exec(rest);
    if (!match) throw new Error(`Unexpected “${rest.slice(at).trim()}” in the difference.`);
    if (++terms > 16) throw new Error('A difference has at most 16 amounts.');
    const value = parseNumber(match[1].replace(/\s+/g, ''));
    if (match[2] === undefined) {
      if (!plain) throw new Error(`Give a unit for ${match[1]}: ${listUnits(units)}.`);
      unitless = true;
      total = total.add(value.mul(plain));
      continue;
    }
    const unit = units.find((u) => matches(u, match[2]));
    if (!unit)
      throw new Error(
        units.length
          ? `Unknown unit “${match[2]}”; use ${listUnits(units)}.`
          : `This time display has no units: enter a number.`,
      );
    total = total.add(value.mul(unit.size));
  }
  if (unitless && terms > 1) throw new Error('Give a unit for every amount.');
  return total.mul(sign);
}
const listUnits = (units: DifferenceUnit[]) => units.map((u) => u.plural ?? u.name).join(', ');

/** Days (and years, on a calendar), hours, minutes and seconds, or one unit below a second. */
function printTime(difference: Q, scale: Q, calendar: boolean): string {
  if (difference.numerator === 0n) return '0 s';
  let rest = difference.abs().div(scale);
  const parts: string[] = [];
  if (rest.compare(Q.one) >= 0) {
    for (const name of PRINTED.filter((n) => calendar || n !== 'year')) {
      const unit = TIME_UNITS.find((u) => u.name === name)!;
      const count = name === 's' ? rest : rest.div(unit.seconds).floor();
      if (count.numerator === 0n) continue;
      parts.push(amount(count, unit));
      rest = rest.sub(count.mul(unit.seconds));
    }
  } else {
    const name =
      SUBSECOND.find((n) => rest.compare(TIME_UNITS.find((u) => u.name === n)!.seconds) >= 0) ??
      'as';
    const unit = TIME_UNITS.find((u) => u.name === name)!;
    parts.push(amount(rest.div(unit.seconds), unit));
  }
  return (difference.numerator < 0n ? '-' : '') + parts.join(' ');
}

/** The difference units of a time presentation. */
export function createDifference(settings?: TimePresentation): TimeDifference {
  const options = settings ? validatePresentation(settings) : DEFAULT_PRESENTATION;
  if (options.mode === 'custom') {
    const custom = compileCustomDifference(options.source!);
    return {
      units: [],
      plain: custom.parse ? null : 'coordinates',
      parse: custom.parse ?? ((text) => read(text, [], Q.one)),
      print: custom.print ?? exactText,
    };
  }
  const scale = Q.parse(options.scale),
    label = options.unit.trim();
  if (options.mode === 'gregorian')
    return {
      units: seconds(scale),
      plain: 's',
      parse: (text) => read(text, seconds(scale), scale),
      print: (difference) => printTime(difference, scale, true),
    };
  // Numeric displays: the display's own unit, and the other fixed time units when it names one.
  const perSecond = secondsOf(label);
  if (options.mode === 'si') {
    const base = perSecond ? scale.div(perSecond) : scale,
      symbol = perSecond ? 's' : label;
    const prefixed: DifferenceUnit[] = SI_PREFIXES.map(([prefix, exponent]) => ({
      name: prefix + symbol,
      aliases: prefix === 'µ' ? ['u' + symbol, 'μ' + symbol] : [],
      caseless: false,
      size: ten(exponent).mul(base),
    }));
    // Without a unit label a bare prefix (`3 k`) is the unit; hectoseconds and decaseconds
    // give way to hours and days.
    const units = [
      ...(perSecond ? seconds(base, FIXED_TIME).filter((u) => u.size.compare(base) > 0) : []),
      ...prefixed.filter((u) => u.name && !(perSecond && (u.name === 'hs' || u.name === 'das'))),
    ];
    return {
      units,
      plain: perSecond ? 's' : label || 'coordinates',
      parse: (text) => read(text, units, base),
      print(difference) {
        if (perSecond && difference.abs().compare(MINUTE.mul(base)) >= 0)
          return printTime(difference, base, false);
        const value = difference.div(base),
          exponent =
            value.numerator === 0n
              ? 0
              : Math.max(-30, Math.min(30, Math.floor(decimalExponent(value) / 3) * 3));
        const unit = prefixed.find((u) => u.size.compare(ten(exponent).mul(base)) === 0)!;
        const text = exactText(difference.div(unit.size));
        return unit.name ? `${text} ${unit.name}` : text;
      },
    };
  }
  if (perSecond) {
    const base = scale.div(perSecond),
      units = seconds(base, FIXED_TIME);
    return {
      units,
      plain: label,
      parse: (text) => read(text, units, scale),
      print: (difference) => printTime(difference, base, false),
    };
  }
  // Any other unit label is read whole, even of several words (`million years`).
  const units: DifferenceUnit[] = label
    ? [{ name: label, aliases: [LABEL], caseless: false, size: scale }]
    : [];
  return {
    units,
    plain: label || 'coordinates',
    parse: (text) => read(label ? text.split(label).join(' ' + LABEL + ' ') : text, units, scale),
    print: (difference) => exactText(difference.div(scale)) + (label ? ' ' + label : ''),
  };
}
