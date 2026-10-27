// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// Time presentation (docs/time-presentation.md): how a timeline's exact stored times are written
// and read (as rationals, decimals, scientific or SI numbers, Gregorian dates or a custom
// script), with its unit, scale and origin, and the ruler each draws.
import { Rational as Q } from 'rational-ordered-map';
import { compileCustom, CUSTOM_EXAMPLE } from './custom-time.js';
import {
  decimalExponent,
  parseNumber,
  printNumber,
  power,
  printSI,
  parseSI,
  withoutUnit,
} from './numeric.js';
import {
  printCalendar,
  printCalendarSpan,
  parseCalendar,
  describeCalendar,
} from './calendar-presentation.js';
import { unitsPerPixel, validateContext } from './view-context.js';
import type { PresentationContext } from './view-context.js';
import { planRuler, validateRulerPolicy } from './ruler.js';
import type { RulerPolicy, RulerPlan } from './ruler.js';
export type { PresentationContext } from './view-context.js';
export { compileCustom, CUSTOM_EXAMPLE, parseNumber, printNumber };

/**
 * A timeline's saved time display settings, as stored in `.ochx` JSON, `.och` SQLite and
 * `oc_timelines.presentation`. Numbers are kept as canonical exact strings so they survive
 * every format without rounding. Displayed value = (stored − origin) / scale.
 */
export interface TimePresentation {
  version: 1;
  mode: 'rational' | 'float' | 'scientific' | 'si' | 'gregorian' | 'custom';
  /** Digits shown by the float, scientific and SI printers (1 to 30). */
  significantDigits: number;
  /** The unit label printed after numbers and accepted after them when parsing. */
  unit: string;
  /** Stored coordinates per displayed unit, and stored coordinate of displayed zero. */
  scale: string;
  origin: string;
  /** The fixed timezone offset for Gregorian dates, in minutes east of UTC (±1439). */
  offsetMinutes: number;
  /**
   * Whether labels adapt to the view (calendar labels omit what the view makes obvious;
   * numeric ones switch to Δ offsets when zoomed past their digits). Absent means true.
   */
  adaptiveLabels?: boolean;
  /** The ruler's graduation; absent means automatic for the mode. */
  ruler?: RulerPolicy;
  /** Custom printer/parser source, kept (and syntax-checked) even when another mode is chosen. */
  source?: string;
}
/** Exact rational coordinates, unscaled, with no unit: what files without settings mean. */
export const DEFAULT_PRESENTATION: Readonly<TimePresentation> = Object.freeze({
  version: 1,
  mode: 'rational',
  significantDigits: 6,
  unit: '',
  scale: '1/1',
  origin: '0/1',
  offsetMinutes: 0,
});
/** The unit menu's choices: stored coordinates are seconds, so each scale is seconds per unit. */
export const UNIT_PRESETS = [
  { label: 'Coordinates', unit: '', scale: '1' },
  { label: 'Seconds', unit: 's', scale: '1' },
  { label: 'Minutes', unit: 'minutes', scale: '60' },
  { label: 'Hours', unit: 'hours', scale: '3600' },
  { label: 'Days', unit: 'days', scale: '86400' },
  { label: 'Julian years (365.25 days)', unit: 'years', scale: '31557600' },
  { label: 'Millions of Julian years', unit: 'million years', scale: '31557600000000' },
] as const;

/**
 * Checks untrusted settings (from a file, the server or a form) and returns them in
 * canonical form: scale and origin reduced to canonical exact rationals, and only known
 * fields kept. Throws a readable error on any invalid field. Custom source is compiled to
 * check its syntax but never run, which makes this safe on the server.
 */
export function validatePresentation(value: unknown): TimePresentation {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Invalid time presentation settings.');
  const raw = value as Record<string, unknown>;
  const modes = ['rational', 'float', 'scientific', 'si', 'gregorian', 'custom'];
  if (raw.version !== 1 || typeof raw.mode !== 'string' || !modes.includes(raw.mode))
    throw new Error('Unsupported time presentation version or mode.');
  if (
    !Number.isInteger(raw.significantDigits) ||
    Number(raw.significantDigits) < 1 ||
    Number(raw.significantDigits) > 30
  )
    throw new Error('Significant digits must be between 1 and 30.');
  if (
    typeof raw.unit !== 'string' ||
    raw.unit.length > 80 ||
    /[\u0000-\u001f\u007f]/.test(raw.unit)
  )
    throw new Error('Unit labels must be at most 80 printable characters.');
  if (
    typeof raw.scale !== 'string' ||
    typeof raw.origin !== 'string' ||
    raw.scale.length > 8192 ||
    raw.origin.length > 8192
  )
    throw new Error('Scale and origin must be exact numbers of at most 8192 characters.');
  // Decimal or scientific input can expand when written as a reduced fraction (1e-300
  // becomes a 301-digit denominator), so the canonical form is limited too.
  const scale = parseNumber(raw.scale),
    origin = parseNumber(raw.origin);
  if (scale.toString().length > 8192 || origin.toString().length > 8192)
    throw new Error('Canonical scale and origin must fit within 8192 characters.');
  if (scale.compare(Q.zero) <= 0) throw new Error('Unit scale must be positive.');
  if (!Number.isInteger(raw.offsetMinutes) || Math.abs(Number(raw.offsetMinutes)) > 1439)
    throw new Error('Timezone offset must be integer minutes between -1439 and 1439.');
  if (raw.mode === 'custom' && raw.source === undefined)
    throw new Error('Custom presentation needs source code.');
  if (raw.adaptiveLabels !== undefined && typeof raw.adaptiveLabels !== 'boolean')
    throw new Error('Adaptive labels must be true or false.');
  if (raw.source !== undefined) {
    if (typeof raw.source !== 'string') throw new Error('Custom source must be text.');
    compileCustom(raw.source); // Syntax validation only: never execute user source on the server.
  }
  return {
    version: 1,
    mode: raw.mode as TimePresentation['mode'],
    significantDigits: Number(raw.significantDigits),
    unit: raw.unit,
    scale: scale.toString(),
    origin: origin.toString(),
    offsetMinutes: Number(raw.offsetMinutes),
    ...(raw.adaptiveLabels === undefined ? {} : { adaptiveLabels: raw.adaptiveLabels as boolean }),
    ...(typeof raw.source === 'string' ? { source: raw.source } : {}),
    ...(raw.ruler === undefined ? {} : { ruler: validateRulerPolicy(raw.ruler) }),
  };
}

/**
 * A timeline's span, from its first moment to its last, as its own time display writes
 * times, as precise as the span's length calls for (#338: the browser's cards). Gregorian
 * dates read in ages, years, months, days or clock times (printCalendarSpan); numbers in
 * the timeline's unit with enough digits to tell the ends apart at about a hundredth of the
 * span (rational coordinates as decimals); a custom script prints each end as it does for
 * inputs, and if it fails, the ends read as SI seconds, which stored times are.
 */
export function printTimeSpan(settings: TimePresentation | undefined, first: Q, last: Q): string {
  const options = settings ? validatePresentation(settings) : DEFAULT_PRESENTATION;
  const both = (print: (time: Q) => string) => {
    const [a, b] = [print(first), print(last)];
    return a === b ? a : `${a} – ${b}`;
  };
  if (options.mode === 'custom') {
    const span = last.compare(first) > 0 ? last.sub(first) : Q.one;
    try {
      const presenter = compileCustom(options.source!);
      return both((time) =>
        presenter.print(time, { left: first, span, widthPixels: 240, purpose: 'input' }),
      );
    } catch {
      return both((time) => printSI(time, 4, 's'));
    }
  }
  const scale = Q.parse(options.scale),
    origin = Q.parse(options.origin);
  const value = (time: Q) => time.sub(origin).div(scale);
  if (options.mode === 'gregorian')
    return printCalendarSpan(value(first), value(last), options.offsetMinutes);
  const unit = options.unit.trim(),
    span = value(last).sub(value(first)),
    largest = Math.max(decimalExponent(value(first)), decimalExponent(value(last)));
  // Digits from the ends' size down to a hundredth of the span (3 for a span alone).
  const digits = Math.max(
    3,
    Math.min(15, span.numerator === 0n ? 3 : largest - decimalExponent(span) + 3),
  );
  if (options.mode === 'si') return both((time) => printSI(value(time), digits, unit));
  // The unit once, after both numbers: "1809 – 1865 years".
  return (
    both((time) => printNumber(value(time), digits, options.mode === 'scientific')) +
    (unit ? ' ' + unit : '')
  );
}
/**
 * A presentation ready to use. `print` and `parse` convert between stored rationals and
 * text; with a viewport context (purpose `axis`, `event` or `input`) labels may adapt to
 * the view, and parsing reads such labels back relative to the same view. `describe` gives
 * the line of context shown with adaptive labels (absent for custom code). `rules` plans the
 * ruler's ticks for a view, in stored coordinates. All of them throw on invalid input.
 */
export interface TimePresenter {
  print(time: Q, context?: PresentationContext): string;
  parse(text: string, context?: PresentationContext): Q;
  describe?(context: PresentationContext): string;
  rules(context: PresentationContext): RulerPlan;
}
/**
 * Builds the presenter for some settings (validated here; none means the default). Built-in
 * modes apply scale and origin around their printers and parsers. Custom code receives raw
 * stored times instead and handles its own units, so scale and origin are ignored for it
 * (also when planning its ruler). Throws when the settings are invalid.
 */
export function createPresenter(settings?: TimePresentation): TimePresenter {
  const options = settings ? validatePresentation(settings) : DEFAULT_PRESENTATION;
  const scale = options.mode === 'custom' ? Q.one : Q.parse(options.scale),
    origin = options.mode === 'custom' ? Q.zero : Q.parse(options.origin);
  const unit = options.unit.trim(),
    suffix = unit ? ' ' + unit : '';
  // The view in displayed units, (stored − origin) / scale, which the calendar printer and
  // ruler planner work in. Only left and span change; pixel widths stay as they are.
  const calendarContext = (context: PresentationContext): PresentationContext => ({
    ...context,
    left: context.left.sub(origin).div(scale),
    span: context.span.div(scale),
    ...(context.labelInterval ? { labelInterval: context.labelInterval.div(scale) } : {}),
  });
  // When Δ offsets read in a finer time unit (#242), they count from a round base, a whole
  // number of that unit's powers of ten past the origin, so labels read "Δ 1 s, Δ 2 s" and
  // don't change while panning within a step; the ruler steps in that unit too. Otherwise
  // they count from the view's left edge.
  const finerFor = (context?: PresentationContext) =>
    context &&
    options.mode !== 'si' &&
    relativeContext(options, context.left.sub(origin).div(scale), context)
      ? finerUnit(scale, context.span)
      : null;
  const finerScale = (finer: NonNullable<ReturnType<typeof finerUnit>>) =>
    finer === 'seconds' ? Q.one : Q.parse(finer.scale);
  const relativeBase = (context: PresentationContext): Q => {
    const finer = finerFor(context);
    if (!finer) return context.left;
    const step = finerScale(finer),
      span = context.span.div(step);
    let exponent = decimalExponent(span);
    if (power(exponent).compare(span) < 0) exponent++;
    const block = power(exponent).mul(step);
    return origin.add(context.left.sub(origin).div(block).floor().mul(block));
  };
  const rules = (context: PresentationContext): RulerPlan => {
    validateContext(context);
    const finer = finerFor(context);
    if (finer) {
      const step = finerScale(finer);
      const plan = planRuler(
        { ...context, left: context.left.sub(origin).div(step), span: context.span.div(step) },
        { kind: 'decimal' },
        options.offsetMinutes,
      );
      return {
        ...plan,
        ticks: plan.ticks.map((tick) => ({
          ...tick,
          time: origin.add(tick.time.mul(step)),
          interval: tick.interval.mul(step),
          labels: tick.labels.map((label) => ({ ...label, interval: label.interval.mul(step) })),
        })),
      };
    }
    const plan = planRuler(
      calendarContext(context),
      options.ruler ?? { kind: options.mode === 'gregorian' ? 'gregorian' : 'decimal' },
      options.offsetMinutes,
    );
    // Ticks were planned in displayed units; map them back to stored coordinates. Times
    // take the full affine map, intervals (differences) only the scale.
    return {
      ...plan,
      ticks: plan.ticks.map((tick) => ({
        ...tick,
        time: origin.add(tick.time.mul(scale)),
        interval: tick.interval.mul(scale),
        labels: tick.labels.map((label) => ({ ...label, interval: label.interval.mul(scale) })),
      })),
    };
  };
  if (options.mode === 'custom') return { ...compileCustom(options.source!), rules };
  return {
    rules,
    describe(context) {
      validateContext(context);
      return options.mode === 'gregorian' && options.adaptiveLabels !== false
        ? describeCalendar(options.offsetMinutes, calendarContext(context))
        : relativeContext(options, context.left.sub(origin).div(scale), context)
          ? `Δ from ${baseText(relativeBase(context).sub(origin).div(scale), unitsPerPixel(context).div(scale), options.significantDigits)}${suffix}`
          : '';
    },
    print(time, context) {
      validateContext(context);
      const value = time.sub(origin).div(scale);
      if (options.mode === 'gregorian')
        return printCalendar(
          value,
          options.offsetMinutes,
          context && options.adaptiveLabels !== false ? calendarContext(context) : undefined,
        );
      if (options.mode === 'rational') return value.toString() + suffix;
      // Zoomed in past the significant digits, every label would print the same; print each
      // as its difference from the view's left edge instead, which `describe` names.
      if (
        relativeContext(options, context ? context.left.sub(origin).div(scale) : value, context)
      ) {
        const delta = time.sub(context!.left).div(scale);
        // In a large time unit, the offsets read in a smaller one (#242).
        const finer = finerFor(context);
        if (finer === 'seconds')
          return 'Δ ' + printSI(time.sub(relativeBase(context!)), options.significantDigits, 's');
        if (finer) {
          const amount = printNumber(
            time.sub(relativeBase(context!)).div(finerScale(finer)),
            options.significantDigits,
          );
          // "1 hour", not "1 hours" (the presets' units are plural).
          return `Δ ${amount} ${/^-?1$/.test(amount) ? finer.unit.slice(0, -1) : finer.unit}`;
        }
        return (
          'Δ ' +
          (options.mode === 'si'
            ? printSI(delta, options.significantDigits, unit)
            : printNumber(delta, options.significantDigits) + suffix)
        );
      }
      if (options.mode === 'si') return printSI(value, options.significantDigits, unit);
      return printNumber(value, options.significantDigits, options.mode === 'scientific') + suffix;
    },
    parse(text, context) {
      validateContext(context);
      // A Δ label is relative to the view's left edge: parse the difference with the origin
      // removed (so it is only scaled), then add it to the left edge. Parsing it in a
      // different view than it was printed in gives a different time.
      if (options.mode !== 'gregorian' && text.trim().startsWith('Δ ')) {
        if (!context) throw new Error('Relative labels require viewport context.');
        const offset = text.trim().slice(2).trim();
        // An offset in a smaller time unit than the display's (#242), from its round base.
        if (finerFor(context) && !(unit && offset.endsWith(unit))) {
          const base = relativeBase(context);
          for (const preset of UNIT_PRESETS)
            for (const name of [preset.unit, preset.unit.slice(0, -1)])
              if (preset.unit && preset.unit !== 's' && offset.endsWith(' ' + name))
                return base.add(
                  parseNumber(offset.slice(0, -name.length)).mul(Q.parse(preset.scale)),
                );
          return base.add(parseSI(offset, 's'));
        }
        return context.left.add(
          createPresenter({ ...options, origin: '0/1' }).parse(text.trim().slice(2)),
        );
      }
      let value: Q;
      if (options.mode === 'gregorian')
        value = parseCalendar(
          text,
          options.offsetMinutes,
          context ? calendarContext(context) : undefined,
        );
      else if (options.mode === 'si') value = parseSI(text, unit);
      else value = parseNumber(withoutUnit(text, unit));
      return origin.add(value.mul(scale));
    },
  };
}

/**
 * The finer time unit Δ offsets read in when a display counts in a large one (#242): only
 * when the view is shorter than one displayed unit (so offsets in it would be small
 * fractions) and the display's scale is one of the unit presets (whose stored coordinates
 * are seconds), the largest preset smaller than it that the view spans at least once, or
 * 'seconds' (printed with SI prefixes) when the view is shorter than a minute. Null when
 * the display's scale isn't a preset, or nothing finer exists.
 */
function finerUnit(scale: Q, span: Q): (typeof UNIT_PRESETS)[number] | 'seconds' | null {
  if (
    span.compare(scale) >= 0 ||
    !UNIT_PRESETS.some((preset) => preset.unit && Q.parse(preset.scale).equals(scale))
  )
    return null;
  let best: (typeof UNIT_PRESETS)[number] | null = null;
  for (const preset of UNIT_PRESETS) {
    if (!preset.unit || preset.unit === 's') continue;
    const step = Q.parse(preset.scale);
    if (step.compare(scale) < 0 && span.compare(step) >= 0)
      if (!best || step.compare(Q.parse(best.scale)) > 0) best = preset;
  }
  if (best) return best;
  return scale.compare(Q.one) > 0 ? 'seconds' : null;
}
/**
 * The base Δ labels are relative to, for the line of context: a decimal with just the
 * digits the view resolves (one pixel spans `pixel`), marked ≈ when it isn't exact, rather
 * than a fraction of huge integers. Δ labels still parse against the exact view.
 */
function baseText(base: Q, pixel: Q, significantDigits: number): string {
  if (base.denominator === 1n) return base.toString();
  const digits = Math.min(
    30,
    Math.max(significantDigits, decimalExponent(base) - decimalExponent(pixel) + 3),
  );
  const text = printNumber(base, digits);
  return parseNumber(text).equals(base) ? text : '≈ ' + text;
}
/**
 * Whether numeric labels should be printed as Δ differences from the view's left edge: only
 * for adaptive float, scientific and SI displays, on the axis or moment labels, and when one
 * pixel spans less (in displayed units) than the last significant digit of `value` (the
 * left edge, in displayed units), i.e. when neighbouring labels would print identically.
 * Never when that value is zero, which has no significant digits to run out of.
 */
function relativeContext(
  options: TimePresentation,
  value: Q,
  context?: PresentationContext,
): boolean {
  return (
    !!context &&
    options.adaptiveLabels !== false &&
    !['rational', 'gregorian', 'custom'].includes(options.mode) &&
    ['axis', 'event'].includes(context.purpose) &&
    value.numerator !== 0n &&
    unitsPerPixel(context)
      .div(Q.parse(options.scale))
      .compare(power(decimalExponent(value) - options.significantDigits + 1)) < 0
  );
}
