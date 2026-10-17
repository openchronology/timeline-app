// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// The time axis's ruler: ticks and labels at exact positions, by decimal, Gregorian or custom
// steps, crossfading between levels as the view zooms.
import { Rational as Q } from 'rational-ordered-map';
import { dayNumber, dateParts } from './calendar.js';
import { decimalExponent, parseNumber } from './numeric.js';
import { validateContext, unitsPerPixel } from './view-context.js';
import type { PresentationContext } from './view-context.js';

/**
 * How the ruler is graduated (docs/time-presentation.md#ruler-graduations-and-breakpoints):
 * powers of ten, civil calendar units, or a ladder of increasing exact steps (canonical
 * rational strings, in displayed units, aligned to displayed zero).
 */
export type RulerPolicy =
  { kind: 'decimal' } | { kind: 'gregorian' } | { kind: 'steps'; steps: string[] };
/**
 * One mark on the ruler at an exact time. `level` is its strongest role: a minor
 * subdivision, a labelled major mark, or a calendar boundary coarser than the labels (a
 * new day or month). `label` says whether any layer labels it.
 */
export interface RulerTick {
  time: Q;
  level: 'minor' | 'major' | 'boundary';
  label: boolean;
  /** Interval used to choose the detail in this tick's label. */
  interval: Q;
  /** Spatial alpha weights; recomputed from zoom, never elapsed time. */
  opacity: number;
  majorOpacity: number;
  boundaryOpacity: number;
  labelOpacity: number;
  /**
   * The label versions to draw, each with the interval its detail is chosen for and its
   * weight; two while levels crossfade, so differing calendar detail can fade between them.
   */
  labels: { interval: Q; opacity: number }[];
}
/** The visible ticks in time order, and the name of the labelled step (`hour`, `1/10` …). */
export interface RulerPlan {
  ticks: RulerTick[];
  graduation: string;
}
/** At most this many ticks per plan, however wide the view; planning throws beyond it. */
const MAX_TICKS = 512;
const pow10 = (exponent: number): Q =>
  exponent >= 0 ? Q.from(10n ** BigInt(exponent)) : Q.from(1n, 10n ** BigInt(-exponent));
/** Integer division rounding toward negative infinity (bigint `/` truncates toward zero). */
const floorDiv = (n: bigint, d: bigint) => n / d - (n < 0n && n % d ? 1n : 0n);

/**
 * Checks an untrusted ruler policy and returns it canonical: custom steps must be 2 to 32
 * positive, strictly increasing exact numbers of at most 1,024 characters (as written and
 * once reduced), and come back as canonical rational strings. Throws a readable error
 * otherwise.
 */
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

/**
 * One graduation level. `nominal` is its typical length, used only to choose levels and
 * label detail. Ticks are placed either every `step` from `anchor` (fixed lengths), or
 * every `months` or `years` on real calendar dates, whose lengths vary.
 */
interface Level {
  name: string;
  nominal: Q;
  step?: Q;
  anchor?: Q;
  months?: bigint;
  years?: bigint;
}
/** A fixed-length level, aligned to `anchor` (zero by default), named after its step. */
function fixed(step: Q, name = step.toString(), anchor = Q.zero): Level {
  return { step, nominal: step, name, anchor };
}
/** The smallest `base × 10^k` (k any integer) at least `target`. */
function decimalLevel(target: Q, base = Q.one): Level {
  const relative = target.div(base);
  let exponent = decimalExponent(relative);
  if (pow10(exponent).compare(relative) < 0) exponent++;
  return fixed(base.mul(pow10(exponent)));
}
/**
 * A level's tick times within the view (both edges inclusive), in time order. Starts at the
 * first tick at or after the left edge, found directly by floor division (or by month or
 * year arithmetic) rather than by stepping from zero, so huge or far-off times cost the
 * same as small ones. Throws past MAX_TICKS.
 */
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
  // Calendar levels: count months as year × 12 + (month − 1), or whole years, from year
  // zero, so multi-month and multi-year steps stay aligned for negative years too.
  const [year, month] = dateParts(context.left.div(Q.from(86400n)).floor().numerator);
  // The time of the first day of month (or year) number `index`.
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
/**
 * The Gregorian ladder for a label target (seconds per label), finest first: decimal
 * fractions of a second down to the target's precision, 1 and 10 seconds, minutes and
 * hours in usual multiples, day, week (Mondays: 4 days after the Thursday epoch), month,
 * quarter and year; then, for targets beyond a year, a decimal multiple of years and a
 * tenth of it.
 */
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

/** One layer's plan, with the nominal lengths of the labelled level and its neighbours. */
interface LevelPlan extends RulerPlan {
  previous: Q;
  major: Q;
  next: Q;
}
/** Smoothstep: 0 below 0, 1 above 1, an S-curve with zero slope at both ends between. */
const smooth = (value: number) => {
  const t = Math.max(0, Math.min(1, value));
  return t * t * (3 - 2 * t);
};
// Only bounded, dimensionless ratios become numbers. Absolute time stays rational.
/** How far `value` is from `start` to `finish`, smoothed, in [0, 1]. */
function fade(value: Q, start: Q, finish: Q): number {
  if (value.compare(start) <= 0) return 0;
  if (value.compare(finish) >= 0) return 1;
  return smooth(value.sub(start).div(finish.sub(start)).toApproximateNumber());
}
/**
 * Plans one layer of the ruler: the labelled (major) level is the first with a nominal
 * length of at least `majorTarget`; minor subdivisions are levels at least `minorTarget`
 * long, fading in from that length to twice it; calendar boundaries coarser than the
 * labels fade in as the view widens toward their length. Ticks of different levels at
 * the same time are merged into one with the strongest role. Gregorian levels are laid out
 * in local time (shifted by the zone offset) so that midnights and month starts fall on
 * local dates.
 */
function planLevel(
  context: PresentationContext,
  checked: RulerPolicy,
  offsetMinutes: number,
  majorTarget: Q,
  minorTarget: Q,
): LevelPlan {
  let major: Level, minor: Level | undefined;
  let previous: Q,
    next: Q,
    minors: Level[] = [],
    boundaries: Level[] = [];
  if (checked.kind === 'decimal') {
    major = decimalLevel(majorTarget);
    minor = fixed(major.step!.div(Q.from(10n)));
    previous = minor.nominal;
    next = major.nominal.mul(Q.from(10n));
  } else {
    const levels =
      checked.kind === 'gregorian'
        ? calendarLevels(majorTarget)
        : checked.steps.map((step) => fixed(Q.parse(step)));
    const index = levels.findIndex((level) => level.nominal.compare(majorTarget) >= 0);
    // Past either end of a custom ladder, or above the calendar's years, continue with
    // decimal powers of the end step.
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
    // The neighbouring levels, which set the crossfade's range: the ladder's own where the
    // major level is one of its entries, else a factor of ten either way.
    previous = major.nominal.div(Q.from(10n));
    next = major.nominal.mul(Q.from(10n));
    if (
      index >= 0 &&
      !(checked.kind === 'steps' && index === 0 && !major.nominal.equals(levels[0].nominal))
    ) {
      previous = levels[index - 1]?.nominal ?? previous;
      next = levels[index + 1]?.nominal ?? next;
    }
    if (checked.kind === 'gregorian') {
      // At 10 seconds and below, a tenth of the step (decimal subdivision of seconds).
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
      // Coarser subdivisions already exist while the finest one fades away.
      // This keeps irregular week/month boundaries stable as density changes.
      if (minor)
        minors = levels.filter(
          (level) =>
            level.nominal.compare(minor!.nominal) >= 0 && level.nominal.compare(major.nominal) < 0,
        );
      // Natural boundaries coarser than the labels, once the view spans at least half of one.
      boundaries = levels.filter(
        (level) =>
          ['minute', 'hour', 'day', 'month', 'year'].includes(level.name) &&
          level.nominal.compare(major.nominal) > 0 &&
          level.nominal.compare(context.span.mul(Q.from(2n))) <= 0,
      );
    }
  }
  const shift = checked.kind === 'gregorian' ? Q.from(BigInt(offsetMinutes) * 60n) : Q.zero;
  const localContext = { ...context, left: context.left.add(shift) };
  // Ticks by exact time; levels are inserted from finest to coarsest, so the later, stronger
  // role wins while opacities keep their maximum.
  const ticks = new Map<string, RulerTick>();
  const insert = (level: Level, weight: RulerTick['level'], label: boolean, opacity: number) => {
    if (opacity === 0) return;
    for (const localTime of bounds(localContext, level)) {
      const time = localTime.sub(shift),
        key = time.toString();
      const existing = ticks.get(key);
      ticks.set(key, {
        time,
        level: weight,
        label: label || existing?.label === true,
        interval: existing?.label ? existing.interval : level.nominal,
        opacity: Math.max(opacity, existing?.opacity ?? 0),
        majorOpacity: Math.max(weight !== 'minor' ? opacity : 0, existing?.majorOpacity ?? 0),
        boundaryOpacity: Math.max(
          weight === 'boundary' ? opacity : 0,
          existing?.boundaryOpacity ?? 0,
        ),
        labelOpacity: label ? opacity : (existing?.labelOpacity ?? 0),
        labels: label ? [{ interval: level.nominal, opacity }] : (existing?.labels ?? []),
      });
    }
  };
  for (const subdivision of minors.length ? minors : minor ? [minor] : []) {
    insert(
      subdivision,
      'minor',
      false,
      fade(subdivision.nominal, minorTarget, minorTarget.mul(Q.from(2n))),
    );
  }
  insert(major, 'major', true, 1);
  for (const boundary of boundaries)
    insert(
      boundary,
      'boundary',
      false,
      fade(context.span, boundary.nominal.div(Q.from(2n)), boundary.nominal),
    );
  const sorted = [...ticks.values()].sort((a, b) => a.time.compare(b.time));
  if (sorted.length > MAX_TICKS) throw new Error('Ruler exceeds its visible tick budget.');
  return { ticks: sorted, graduation: major.name, previous, major: major.nominal, next };
}

/**
 * Exact anchored geometry with spatial crossfades between neighboring levels.
 *
 * Plans the ruler for a view, in the view's own units (the presenter maps them to stored
 * coordinates). Label and subdivision targets come from the pixel size: labels need
 * 70 (calendar) or 90 pixels at the text scale, and at least 1/32 of the width; minor marks
 * 9 pixels, and at least 1/192 of the width, which bounds the work on very wide screens.
 * Near a breakpoint the next coarser layer is planned too and the two are blended by
 * smoothstep of the zoom depth (never elapsed time), so zooming reverses a fade and
 * panning only moves marks. Throws on an invalid context, policy or offset, or past
 * MAX_TICKS.
 */
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
  // Labels need room for how large they appear, so smaller text fits more of them. Minor marks
  // stay at least 6 pixels apart to remain distinguishable lines.
  const text = context.textScale ?? 1;
  const majorTarget = pixel.mul(
    Q.parseDecimal(
      Math.max(
        (checked.kind === 'gregorian' ? 70 : 90) * text,
        40,
        context.widthPixels / 32,
      ).toFixed(3),
    ),
  );
  // Reserve room for both spatial layers, including non-nested calendar marks.
  const minorTarget = pixel.mul(
    Q.parseDecimal(Math.max(9 * text, 6, context.widthPixels / 192).toFixed(3)),
  );
  const fine = planLevel(context, checked, offsetMinutes, majorTarget, minorTarget);
  // Crossfade over the last factor of two before the breakpoint (where the label target
  // reaches the major level's length), or from the previous level if that is closer.
  const start =
    fine.previous.compare(fine.major.div(Q.from(2n))) > 0
      ? fine.previous
      : fine.major.div(Q.from(2n));
  const blend = fade(majorTarget, start, fine.major);
  const layers: [LevelPlan, number][] = [[fine, 1 - blend]];
  if (blend > 0)
    layers.push([planLevel(context, checked, offsetMinutes, fine.next, minorTarget), blend]);
  // Combine the layers tick by tick: weights add up (they sum to one across layers), both
  // layers' label versions are kept, and the stronger role wins.
  const merged = new Map<string, RulerTick>();
  for (const [plan, alpha] of layers) {
    if (alpha === 0) continue;
    for (const tick of plan.ticks) {
      const key = tick.time.toString(),
        existing = merged.get(key);
      if (!existing)
        merged.set(key, {
          ...tick,
          opacity: tick.opacity * alpha,
          majorOpacity: tick.majorOpacity * alpha,
          boundaryOpacity: tick.boundaryOpacity * alpha,
          labelOpacity: tick.labelOpacity * alpha,
          labels: tick.labels.map((label) => ({ ...label, opacity: label.opacity * alpha })),
        });
      else {
        existing.opacity += tick.opacity * alpha;
        existing.majorOpacity += tick.majorOpacity * alpha;
        existing.boundaryOpacity += tick.boundaryOpacity * alpha;
        existing.labelOpacity += tick.labelOpacity * alpha;
        existing.labels.push(
          ...tick.labels.map((label) => ({ ...label, opacity: label.opacity * alpha })),
        );
        existing.label ||= tick.label;
        if (tick.level === 'boundary' || (tick.level === 'major' && existing.level === 'minor'))
          existing.level = tick.level;
      }
    }
  }
  const ticks = [...merged.values()].sort((a, b) => a.time.compare(b.time));
  if (ticks.length > MAX_TICKS) throw new Error('Ruler exceeds its visible tick budget.');
  return { ticks, graduation: fine.graduation };
}
