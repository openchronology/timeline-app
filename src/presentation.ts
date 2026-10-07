// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
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
import { printCalendar, parseCalendar, describeCalendar } from './calendar-presentation.js';
import { unitsPerPixel, validateContext } from './view-context.js';
import type { PresentationContext } from './view-context.js';
import { planRuler, validateRulerPolicy } from './ruler.js';
import type { RulerPolicy, RulerPlan } from './ruler.js';
export type { PresentationContext } from './view-context.js';
export { compileCustom, CUSTOM_EXAMPLE, parseNumber, printNumber };

export interface TimePresentation {
  version: 1;
  mode: 'rational' | 'float' | 'scientific' | 'si' | 'gregorian' | 'custom';
  significantDigits: number;
  unit: string;
  /** Stored coordinates per displayed unit, and stored coordinate of displayed zero. */
  scale: string;
  origin: string;
  offsetMinutes: number;
  adaptiveLabels?: boolean;
  ruler?: RulerPolicy;
  source?: string;
}
export const DEFAULT_PRESENTATION: Readonly<TimePresentation> = Object.freeze({
  version: 1,
  mode: 'rational',
  significantDigits: 6,
  unit: '',
  scale: '1/1',
  origin: '0/1',
  offsetMinutes: 0,
});
export const UNIT_PRESETS = [
  { label: 'Coordinates', unit: '', scale: '1' },
  { label: 'Seconds', unit: 's', scale: '1' },
  { label: 'Minutes', unit: 'minutes', scale: '60' },
  { label: 'Hours', unit: 'hours', scale: '3600' },
  { label: 'Days', unit: 'days', scale: '86400' },
  { label: 'Julian years (365.25 days)', unit: 'years', scale: '31557600' },
  { label: 'Millions of Julian years', unit: 'million years', scale: '31557600000000' },
] as const;

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

export interface TimePresenter {
  print(time: Q, context?: PresentationContext): string;
  parse(text: string, context?: PresentationContext): Q;
  describe?(context: PresentationContext): string;
  rules(context: PresentationContext): RulerPlan;
}
export function createPresenter(settings?: TimePresentation): TimePresenter {
  const options = settings ? validatePresentation(settings) : DEFAULT_PRESENTATION;
  const scale = options.mode === 'custom' ? Q.one : Q.parse(options.scale),
    origin = options.mode === 'custom' ? Q.zero : Q.parse(options.origin);
  const unit = options.unit.trim(),
    suffix = unit ? ' ' + unit : '';
  const calendarContext = (context: PresentationContext): PresentationContext => ({
    ...context,
    left: context.left.sub(origin).div(scale),
    span: context.span.div(scale),
  });
  const rules = (context: PresentationContext): RulerPlan => {
    validateContext(context);
    const plan = planRuler(
      calendarContext(context),
      options.ruler ?? { kind: options.mode === 'gregorian' ? 'gregorian' : 'decimal' },
      options.offsetMinutes,
    );
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
          ? `Δ from ${context.left.sub(origin).div(scale).toString()}${suffix}`
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
      if (
        relativeContext(options, context ? context.left.sub(origin).div(scale) : value, context)
      ) {
        const delta = time.sub(context!.left).div(scale);
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
      if (options.mode !== 'gregorian' && text.trim().startsWith('Δ ')) {
        if (!context) throw new Error('Relative labels require viewport context.');
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
