import { Rational as Q } from 'rational-ordered-map';
import { dayNumber, dateParts } from './calendar.js';
import { decimalExponent, parseNumber } from './numeric.js';
import { validateContext, unitsPerPixel } from './view-context.js';
import type { PresentationContext } from './view-context.js';

export type RulerPolicy =
  | { kind: 'decimal' }
  | { kind: 'gregorian' }
  | { kind: 'steps'; steps: string[] };
export interface RulerTick {
  time: Q;
  level: 'minor' | 'major' | 'boundary';
  label: boolean;
  /** Interval used to choose the detail in this tick's label. */
  interval: Q;
}
export interface RulerPlan {
  ticks: RulerTick[];
  graduation: string;
}
const MAX_TICKS = 512;
const pow10 = (exponent: number): Q =>
  exponent >= 0 ? Q.from(10n ** BigInt(exponent)) : Q.from(1n, 10n ** BigInt(-exponent));
const floorDiv = (n: bigint, d: bigint) => n / d - (n < 0n && n % d ? 1n : 0n);

export function validateRulerPolicy(value: unknown): RulerPolicy {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Invalid ruler graduation settings.');
  const raw = value as Record<string, unknown>;
  if (raw.kind === 'decimal' || raw.kind === 'gregorian') return { kind: raw.kind };
  if (
    raw.kind !== 'steps' ||
    !Array.isArray(raw.steps) ||
    raw.steps.length < 2 ||
    raw.steps.length > 32
  )
    throw new Error('Custom graduation needs 2–32 increasing exact steps.');
  let previous = Q.zero;
  const steps = raw.steps.map((text) => {
    if (typeof text !== 'string' || text.length > 1024)
      throw new Error('Each ruler step must be an exact number of at most 1024 characters.');
    const step = parseNumber(text);
    if (step.compare(previous) <= 0 || step.toString().length > 1024)
      throw new Error(
        'Ruler steps must be positive, strictly increasing, and at most 1024 characters.',
      );
    previous = step;
    return step.toString();
  });
  return { kind: 'steps', steps };
}

interface Level {
  name: string;
  nominal: Q;
  step?: Q;
  anchor?: Q;
  months?: bigint;
  years?: bigint;
}
function fixed(step: Q, name = step.toString(), anchor = Q.zero): Level {
  return { step, nominal: step, name, anchor };
}
function decimalLevel(target: Q, base = Q.one): Level {
  const relative = target.div(base);
  let exponent = decimalExponent(relative);
  if (pow10(exponent).compare(relative) < 0) exponent++;
  return fixed(base.mul(pow10(exponent)));
}
function bounds(context: PresentationContext, level: Level): Q[] {
  const right = context.left.add(context.span);
  const result: Q[] = [];
  if (level.step) {
    const step = level.step,
      anchor = level.anchor ?? Q.zero;
    let first = anchor.add(context.left.sub(anchor).div(step).floor().mul(step));
    if (first.compare(context.left) < 0) first = first.add(step);
    for (let time = first; time.compare(right) <= 0; time = time.add(step)) {
      if (result.length >= MAX_TICKS) throw new Error('Ruler exceeds its visible tick budget.');
      result.push(time);
    }
    return result;
  }
  const [year, month] = dateParts(context.left.div(Q.from(86400n)).floor().numerator);
  const at = (index: bigint): Q =>
    level.months
      ? Q.from(
          dayNumber(floorDiv(index, 12n), index - floorDiv(index, 12n) * 12n + 1n, 1n) * 86400n,
        )
      : Q.from(dayNumber(index, 1n, 1n) * 86400n);
  const step = level.months ?? level.years!;
  let index = floorDiv(level.months ? year * 12n + month - 1n : year, step) * step;
  if (at(index).compare(context.left) < 0) index += step;
  for (let time = at(index); time.compare(right) <= 0; index += step, time = at(index)) {
    if (result.length >= MAX_TICKS) throw new Error('Ruler exceeds its visible tick budget.');
    result.push(time);
  }
  return result;
}
function calendarLevels(target: Q): Level[] {
  // Arbitrary precision below seconds; larger graduations use real civil units.
  const exponent = Math.min(0, decimalExponent(target) - 1);
  const levels = [
    ...new Set([exponent, Math.min(1, exponent + 1), Math.min(1, exponent + 2), 0, 1]),
  ]
    .sort((a, b) => a - b)
    .map((e) => fixed(pow10(e)));
  for (const [seconds, name] of [
    [60, 'minute'],
    [300, '5 minutes'],
    [900, '15 minutes'],
    [1800, '30 minutes'],
    [3600, 'hour'],
    [10800, '3 hours'],
    [21600, '6 hours'],
    [43200, '12 hours'],
    [86400, 'day'],
    [604800, 'week'],
  ] as const)
    levels.push(
      fixed(Q.from(BigInt(seconds)), name, seconds === 604800 ? Q.from(345600n) : Q.zero),
    );
  levels.push(
    { name: 'month', nominal: Q.from(2629800n), months: 1n },
    { name: 'quarter', nominal: Q.from(7889400n), months: 3n },
    { name: 'year', nominal: Q.from(31557600n), years: 1n },
  );
  if (target.compare(Q.from(31557600n)) > 0) {
    const years = decimalLevel(target, Q.from(31557600n)).step!;
    const count = years.div(Q.from(31557600n)).numerator;
    // Coarse years stay aligned to year zero, including negative and enormous years.
    if (count > 10n)
      levels.push({
        name: `${count / 10n} years`,
        nominal: years.div(Q.from(10n)),
        years: count / 10n,
      });
    levels.push({ name: `${count} years`, nominal: years, years: count });
  }
  return levels;
}

/** All coordinates are exact. Work is bounded by visible graduations, not elapsed time. */
export function planRuler(
  context: PresentationContext,
  policy: RulerPolicy = { kind: 'decimal' },
  offsetMinutes = 0,
): RulerPlan {
  validateContext(context);
  const checked = validateRulerPolicy(policy);
  if (!Number.isInteger(offsetMinutes) || Math.abs(offsetMinutes) > 1439)
    throw new Error('Invalid ruler timezone offset.');
  const pixel = unitsPerPixel(context);
  // Keep even unusually wide viewports within a fixed DOM/work budget.
  const majorTarget = pixel.mul(
    Q.parseDecimal(
      Math.max(checked.kind === 'gregorian' ? 70 : 90, context.widthPixels / 32).toString(),
    ),
  );
  const minorTarget = pixel.mul(Q.parseDecimal(Math.max(9, context.widthPixels / 384).toString()));
  let major: Level, minor: Level | undefined, boundary: Level | undefined;
  if (checked.kind === 'decimal') {
    major = decimalLevel(majorTarget);
    minor = fixed(major.step!.div(Q.from(10n)));
  } else {
    const levels =
      checked.kind === 'gregorian'
        ? calendarLevels(majorTarget)
        : checked.steps.map((step) => fixed(Q.parse(step)));
    const index = levels.findIndex((level) => level.nominal.compare(majorTarget) >= 0);
    if (index < 0) {
      major = decimalLevel(majorTarget, levels.at(-1)!.nominal);
      minor = fixed(major.step!.div(Q.from(10n)));
    } else if (checked.kind === 'steps' && index === 0) {
      major = decimalLevel(majorTarget, levels[0].nominal);
      minor = fixed(major.step!.div(Q.from(10n)));
    } else {
      major = levels[index];
      minor = levels[index - 1];
    }
    if (checked.kind === 'gregorian') {
      if (major.step && major.step.compare(Q.from(10n)) <= 0) {
        minor = fixed(major.step.div(Q.from(10n)));
      } else {
        // Native subdivisions remain independent of label cadence: a year's
        // weekly marks can coexist with monthly or quarterly labels.
        const fits = (level: Level) =>
          level.nominal.compare(minorTarget) >= 0 && level.nominal.compare(major.nominal) < 0;
        minor =
          levels.find(
            (level) =>
              ['1/1', '10/1', 'minute', 'hour', 'day', 'week', 'month', 'year'].includes(
                level.name,
              ) && fits(level),
          ) ?? levels.find(fits);
      }
      // Only meaningful parents that fit the window get an extra boundary mark.
      boundary = levels.find(
        (level) =>
          ['minute', 'hour', 'day', 'month', 'year'].includes(level.name) &&
          level.nominal.compare(major.nominal) > 0 &&
          level.nominal.compare(context.span) <= 0,
      );
    }
  }
  const shift = checked.kind === 'gregorian' ? Q.from(BigInt(offsetMinutes) * 60n) : Q.zero;
  const localContext = { ...context, left: context.left.add(shift) };
  const ticks = new Map<string, RulerTick>();
  const insert = (level: Level, weight: RulerTick['level'], label: boolean) => {
    for (const localTime of bounds(localContext, level)) {
      const time = localTime.sub(shift);
      const existing = ticks.get(time.toString());
      // A calendar boundary may fall between regular week/hour marks.
      ticks.set(time.toString(), {
        time,
        level: weight,
        label: label || existing?.label === true,
        interval: existing?.label ? existing.interval : level.nominal,
      });
    }
  };
  if (minor && minor.nominal.compare(minorTarget) >= 0) insert(minor, 'minor', false);
  insert(major, 'major', true);
  if (boundary) insert(boundary, 'boundary', false);
  const sorted = [...ticks.values()].sort((a, b) => a.time.compare(b.time));
  if (sorted.length > MAX_TICKS) throw new Error('Ruler exceeds its visible tick budget.');
  return { ticks: sorted, graduation: major.name };
}
