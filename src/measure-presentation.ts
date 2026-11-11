// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// The official measure formats (#573, #585): how a measure's values and totals are written and
// read, the analogue of the time presentations. Each format serves one type. Fractions
// (`mpq`) are written as floating point, in scientific or engineering notation, or as improper
// fractions; whole numbers (`mpz`) as fixed decimal values, such as currency (`$1,234.56` for
// 123456 cents). Every format has a scale (shown = stored × scale), a prefix and a unit, and
// prints and parses exactly: nothing passes through binary floating point, and parsing refuses
// what it would have to round. Plugins never provide formats.
import { Rational as Q } from 'rational-ordered-map';
import { parseNumber, printNumber, fixedDecimal, decimalExponent, power } from './numeric.js';
import type { MeasureType } from './measures.js';

export type MeasureMode = 'decimal' | 'scientific' | 'engineering' | 'fraction' | 'fixed';
/** The official formats, by the type each serves, in the order the editor offers them. */
export const MEASURE_FORMATS: readonly {
  mode: MeasureMode;
  type: MeasureType;
  label: string;
  example: string;
}[] = [
  { mode: 'decimal', type: 'mpq', label: 'Floating point', example: '1,234.57' },
  { mode: 'scientific', type: 'mpq', label: 'Scientific notation', example: '1.23457e+3' },
  { mode: 'engineering', type: 'mpq', label: 'Engineering notation', example: '1.23457e3' },
  { mode: 'fraction', type: 'mpq', label: 'Improper fraction', example: '7/2' },
  { mode: 'fixed', type: 'mpz', label: 'Fixed decimal (such as currency)', example: '$1,234.56' },
];
/** The format a measure of `type` has when it names none. */
export const DEFAULT_MEASURE_MODE: Record<MeasureType, MeasureMode> = {
  mpq: 'fraction',
  mpz: 'fixed',
};
export interface MeasurePresentation {
  mode: MeasureMode;
  /** Displayed value per stored one, an exact rational: `1/100` shows cents as dollars. */
  scale?: string;
  /** Fixed: the decimal places shown (0 to 30); typed values may have no more. */
  decimals?: number;
  /** Floating point, scientific and engineering: the significant digits shown (1 to 30). */
  significantDigits?: number;
  /** Written before the number, such as `$`. */
  prefix?: string;
  /** Written after it, such as `h` or `kWh`. */
  unit?: string;
  /** Thousands separated by commas (fixed and floating point). Absent means true. */
  grouping?: boolean;
}
/**
 * What a printed value is for: an entity's value, a summary's total, an input's text (exact,
 * so it reads back the same), a tooltip (exact where the label rounds), or an axis or other
 * tight space (abbreviated, as `$1.2M`).
 */
export type MeasurePurpose = 'value' | 'total' | 'input' | 'tooltip' | 'axis';
export interface MeasurePresenter {
  print(value: Q, purpose?: MeasurePurpose): string;
  /** Typed text as a stored value; throws a readable error for text it would have to round. */
  parse(text: string): Q;
}

const PRINTABLE = /^[^\u0000-\u001f\u007f]*$/;
/** The formats a measure of `type` may use. */
export function measureModes(type: MeasureType): MeasureMode[] {
  return MEASURE_FORMATS.filter((f) => f.type === type).map((f) => f.mode);
}
/**
 * A presentation of a measure of `type`, validated and in canonical form: an official format
 * for its type, and only what that format reads.
 */
export function validateMeasurePresentation(
  value: unknown,
  type: MeasureType,
): MeasurePresentation {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('A measure’s presentation must be an object.');
  const raw = value as Record<string, unknown>;
  const known = ['mode', 'scale', 'decimals', 'significantDigits', 'prefix', 'unit', 'grouping'];
  if (Object.keys(raw).some((k) => !known.includes(k)))
    throw new Error(`A measure’s presentation has only ${known.join(', ')}.`);
  const modes = measureModes(type);
  if (!modes.includes(raw.mode as MeasureMode))
    throw new Error(
      `A ${type === 'mpz' ? 'whole-number (mpz)' : 'fraction (mpq)'} measure’s format is ${modes.join(' or ')}.`,
    );
  const mode = raw.mode as MeasureMode;
  const result: MeasurePresentation = { mode };
  if (raw.scale !== undefined) {
    if (typeof raw.scale !== 'string' || raw.scale.length > 200)
      throw new Error('A measure’s scale is an exact number as text, such as "1/100".');
    const scale = parseNumber(raw.scale);
    if (scale.compare(Q.zero) <= 0) throw new Error('A measure’s scale must be positive.');
    if (scale.toString() !== '1/1') result.scale = scale.toString();
  }
  const whole = (key: string, min: number, max: number) => {
    const v = raw[key];
    if (v === undefined) return undefined;
    if (!Number.isInteger(v) || (v as number) < min || (v as number) > max)
      throw new Error(`A measure’s ${key} must be a whole number from ${min} to ${max}.`);
    return v as number;
  };
  const decimals = whole('decimals', 0, 30),
    digits = whole('significantDigits', 1, 30);
  if (mode === 'fixed') result.decimals = decimals ?? 0;
  if (mode === 'decimal' || mode === 'scientific' || mode === 'engineering')
    result.significantDigits = digits ?? 6;
  for (const [key, max] of [
    ['prefix', 16],
    ['unit', 40],
  ] as const) {
    const v = raw[key];
    if (v === undefined || v === '') continue;
    if (typeof v !== 'string' || v.length > max || !PRINTABLE.test(v) || v !== v.trim())
      throw new Error(`A measure’s ${key} is at most ${max} printable characters.`);
    if (/[\d.,/+-]/.test(v.slice(-1)) && key === 'prefix')
      throw new Error('A measure’s prefix can’t end in a digit, sign or separator.');
    if (/^[\d.,/+-]/.test(v) && key === 'unit')
      throw new Error('A measure’s unit can’t start with a digit, sign or separator.');
    result[key] = v;
  }
  if (raw.grouping !== undefined) {
    if (typeof raw.grouping !== 'boolean')
      throw new Error('A measure’s grouping is true or false.');
    if (!raw.grouping && (mode === 'fixed' || mode === 'decimal')) result.grouping = false;
  }
  return result;
}

/** Groups an unsigned number's whole digits by thousands. */
function group(digits: string): string {
  const [whole, fraction] = digits.split('.');
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return fraction === undefined ? grouped : grouped + '.' + fraction;
}
/** Whether a rational has a finite decimal expansion, and how many places it needs. */
function decimalPlaces(value: Q): number | null {
  let d = value.denominator,
    twos = 0,
    fives = 0;
  while (d % 2n === 0n) {
    d /= 2n;
    twos++;
  }
  while (d % 5n === 0n) {
    d /= 5n;
    fives++;
  }
  return d === 1n ? Math.max(twos, fives) : null;
}
/** A rational exactly: a decimal when it has a short one, otherwise a fraction. */
function exactText(value: Q, minPlaces = 0): string {
  const places = decimalPlaces(value);
  if (places !== null && places <= 30) return fixedDecimal(value, Math.max(places, minPlaces));
  return fractionText(value);
}
/** An improper fraction: `7/2`, or a whole number alone. */
function fractionText(value: Q): string {
  return value.denominator === 1n ? value.numerator.toString() : value.toString();
}
/**
 * Engineering notation: `digits` significant digits and an exponent that is a multiple of
 * three, so the mantissa is at least 1 and below 1000 (`12.3e3`).
 */
function printEngineering(value: Q, digits: number): string {
  if (value.numerator === 0n) return '0e0';
  // Rounded to the digits first, which may carry it up an order of magnitude.
  const rounded = parseNumber(printNumber(value, digits, true));
  const exponent = Math.floor(decimalExponent(rounded) / 3) * 3;
  const mantissa = printNumber(rounded.div(power(exponent)), digits);
  return `${mantissa}e${exponent}`;
}
const ABBREVIATIONS: [bigint, string][] = [
  [10n ** 12n, 'T'],
  [10n ** 9n, 'B'],
  [10n ** 6n, 'M'],
  [10n ** 3n, 'K'],
];

/**
 * The printer and parser of a measure of `type` with presentation `presentation` (its type's
 * default format when absent). Values are stored values; each is shown as stored × scale.
 */
export function createMeasurePresenter(
  type: MeasureType,
  presentation?: MeasurePresentation,
  label = 'This measure',
): MeasurePresenter {
  const p: MeasurePresentation = presentation ?? { mode: DEFAULT_MEASURE_MODE[type] };
  const scale = p.scale ? Q.parse(p.scale) : Q.from(1n);
  const prefix = p.prefix ?? '',
    unit = p.unit ?? '';
  const grouped = p.grouping !== false && (p.mode === 'fixed' || p.mode === 'decimal');
  const digits = p.significantDigits ?? 6;
  const decorate = (number: string) => {
    const negative = number.startsWith('-');
    const body = negative ? number.slice(1) : number;
    return (negative ? '−' : '') + prefix + body + (unit ? ' ' + unit : '');
  };
  const rounded = (shown: Q): string => {
    switch (p.mode) {
      case 'fixed': {
        const text = fixedDecimal(shown, p.decimals ?? 0);
        return grouped ? text.replace(/[\d.]+/, group) : text;
      }
      case 'decimal': {
        const text = printNumber(shown, digits);
        return grouped && !/e/.test(text) ? text.replace(/[\d.]+/, group) : text;
      }
      case 'scientific':
        return printNumber(shown, digits, true);
      case 'engineering':
        return printEngineering(shown, digits);
      case 'fraction':
        return fractionText(shown);
    }
  };
  const print = (value: Q, purpose: MeasurePurpose = 'value'): string => {
    const shown = value.mul(scale);
    if (purpose === 'input')
      return p.mode === 'fraction'
        ? fractionText(shown)
        : exactText(shown, p.mode === 'fixed' ? (p.decimals ?? 0) : 0);
    if (purpose === 'axis' && (p.mode === 'fixed' || p.mode === 'decimal')) {
      const magnitude = shown.abs();
      for (const [size, letter] of ABBREVIATIONS)
        if (magnitude.compare(Q.from(size)) >= 0)
          return decorate(printNumber(shown.div(Q.from(size)), 3) + letter);
    }
    const text = decorate(rounded(shown));
    if (purpose === 'tooltip' && p.mode !== 'fraction') {
      const plain = rounded(shown).replace(/,/g, '');
      if (!parseNumber(plain).equals(shown))
        return `${text} (exactly ${decorate(exactText(shown))})`;
    }
    return text;
  };
  const parse = (input: string): Q => {
    let text = input.trim().replace(/−/g, '-');
    if (!text) return Q.zero;
    let negative = false;
    if (/^[+-]/.test(text)) {
      negative = text[0] === '-';
      text = text.slice(1).trim();
    }
    if (prefix && text.startsWith(prefix)) text = text.slice(prefix.length).trim();
    if (!negative && /^[+-]/.test(text)) {
      negative = text[0] === '-';
      text = text.slice(1).trim();
    }
    if (unit && text.endsWith(unit)) text = text.slice(0, -unit.length).trim();
    // Thousands separators, only between digits in threes.
    if (/^\d{1,3}(,\d{3})+(\.\d*)?$/.test(text)) text = text.replace(/,/g, '');
    const fail = () => new Error(`${label}: “${input.trim()}” isn't a number.`);
    if (!text || /[^\d./eE+-]/.test(text)) throw fail();
    let shown: Q;
    try {
      shown = parseNumber(text);
    } catch {
      throw fail();
    }
    if (negative) shown = shown.neg();
    if (p.mode === 'fixed' && !text.includes('/') && !/e/i.test(text)) {
      const places = /\.(\d*)/.exec(text)?.[1].length ?? 0;
      if (places > (p.decimals ?? 0))
        throw new Error(
          `${label} takes at most ${p.decimals ?? 0} decimal places: “${input.trim()}” would be rounded.`,
        );
    }
    const stored = shown.div(scale);
    if (type === 'mpz' && stored.denominator !== 1n)
      throw new Error(
        scale.equals(Q.from(1n))
          ? `${label} is a whole number: “${input.trim()}” isn't one.`
          : `${label} is stored in steps of ${decorate(exactText(scale))}: “${input.trim()}” isn't a whole number of them.`,
      );
    return stored;
  };
  return { print, parse };
}
