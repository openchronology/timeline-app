// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// The background chart (#289): how many moments lie across the view, as a smooth curve. It
// reads the view's summaries, which every timeline has (in the browser, on the desktop and
// from a server), so it costs what the view already cost: no moment is read again.
import { Rational as Q } from 'rational-ordered-map';
import type { FrameGroup } from './core.js';

/** How far apart the curve's points are, in pixels. */
export const CHART_STEP = 6;

/**
 * The relative number of moments at points CHART_STEP pixels apart across a view `width`
 * pixels wide, each from 0 to 1 (the most): the summaries' moments, each group's at its middle,
 * smoothed by a bell curve `spread` pixels wide (its standard deviation). Near the view's edges,
 * where the moments beyond it aren't known, the curve is weighed by what lies inside, so it
 * doesn't fall away there. `x` places a time in the view. Null when no moment is in view.
 */
export function momentCurve(
  groups: readonly Pick<FrameGroup, 'first' | 'last' | 'count'>[],
  x: (time: string) => number,
  width: number,
  spread: number,
): number[] | null {
  const values = momentDensity(groups, x, width, spread);
  const most = values ? Math.max(...values) : 0;
  return most > 0 ? values!.map((v) => v / most) : null;
}
/**
 * A chart's series as curves stacked beneath its total (#434): each series' moments smoothed as
 * momentCurve smooths the total's, added to those of the series before it, relative to the
 * total's most (`most`, from momentDensity) and at most 1. So two moments together, of two
 * series, put the first at one and the second at two: the second is one more, of its kind. Each
 * is its top and the top of the series beneath it (zero for the first); null when none of its
 * moments is in view.
 */
export function stackedCurves(
  series: readonly (readonly Pick<FrameGroup, 'first' | 'last' | 'count'>[])[],
  x: (time: string) => number,
  width: number,
  spread: number,
  most: number,
): ({ top: number[]; floor: number[] } | null)[] {
  let floor: number[] | null = null;
  return series.map((groups) => {
    const values = momentDensity(groups, x, width, spread);
    if (!values || !(most > 0) || !values.some((v) => v > 0)) return null;
    const below = floor ?? values.map(() => 0),
      top = values.map((v, i) => Math.min(1, below[i] + v / most));
    floor = top;
    return { top, floor: below };
  });
}
/**
 * The smoothed number of moments at points CHART_STEP pixels apart, as momentCurve describes,
 * before it is made relative to the most. Null when no moment is in view.
 */
export function momentDensity(
  groups: readonly Pick<FrameGroup, 'first' | 'last' | 'count'>[],
  x: (time: string) => number,
  width: number,
  spread: number,
): number[] | null {
  if (!(width > 0)) return null;
  const n = Math.ceil(width / CHART_STEP) + 1,
    mass = new Float64Array(n);
  let any = false;
  for (const group of groups) {
    const count = Number(group.count);
    if (!(count > 0)) continue;
    const at = (x(group.first) + x(group.last)) / 2 / CHART_STEP;
    if (!(at >= -0.5 && at <= n - 0.5)) continue;
    // Shared by the two points either side, so a moment moves smoothly as the view pans.
    const i = Math.max(0, Math.min(n - 1, Math.floor(at))),
      f = Math.max(0, Math.min(1, at - i));
    mass[i] += count * (1 - f);
    if (i + 1 < n) mass[i + 1] += count * f;
    else mass[i] += count * f;
    any = true;
  }
  if (!any) return null;
  const sigma = Math.max(1, spread / CHART_STEP),
    reach = Math.ceil(3 * sigma),
    kernel = Array.from({ length: 2 * reach + 1 }, (_, k) =>
      Math.exp(-((k - reach) ** 2) / (2 * sigma * sigma)),
    );
  const values = new Array<number>(n);
  for (let i = 0; i < n; i++) {
    let sum = 0,
      weight = 0;
    for (let k = Math.max(0, i - reach); k <= Math.min(n - 1, i + reach); k++) {
      const w = kernel[k - i + reach];
      sum += mass[k] * w;
      weight += w;
    }
    values[i] = sum / weight;
  }
  return values;
}

/**
 * The curve as SVG paths: `line` along its top, and `area` closed down to `base`, from `left`
 * across `width` pixels, its highest point at `top`; or, given a `floor` curve, down to that
 * (a stacked series' band). Between points it is a Catmull-Rom spline (as cubic Béziers), kept
 * from dipping below the base.
 */
export function chartPaths(
  values: readonly number[],
  left: number,
  width: number,
  top: number,
  base: number,
  floor?: readonly number[],
) {
  const r = (v: number) => Math.round(v * 10) / 10;
  const points = (values: readonly number[]) =>
    values.map((v, i) => [left + Math.min(width, i * CHART_STEP), base - v * (base - top)]);
  /** The spline through `pts`, from the first, as path commands after its move. */
  const spline = (pts: number[][]) => {
    let path = '';
    for (let i = 0; i + 1 < pts.length; i++) {
      const p0 = pts[Math.max(0, i - 1)],
        p1 = pts[i],
        p2 = pts[i + 1],
        p3 = pts[Math.min(pts.length - 1, i + 2)];
      const c1y = Math.min(base, p1[1] + (p2[1] - p0[1]) / 6),
        c2y = Math.min(base, p2[1] - (p3[1] - p1[1]) / 6);
      path += `C${r(p1[0] + (p2[0] - p0[0]) / 6)} ${r(c1y)} ${r(p2[0] - (p3[0] - p1[0]) / 6)} ${r(c2y)} ${r(p2[0])} ${r(p2[1])}`;
    }
    return path;
  };
  const pts = points(values);
  const line = `M${r(pts[0][0])} ${r(pts[0][1])}${spline(pts)}`;
  if (floor) {
    const under = points(floor).reverse();
    const area = `${line}L${r(under[0][0])} ${r(under[0][1])}${spline(under)}Z`;
    return { line, area };
  }
  const area = `M${r(pts[0][0])} ${r(base)}L${line.slice(1)}L${r(pts.at(-1)![0])} ${r(base)}Z`;
  return { line, area };
}

/**
 * A measure's balance across the view (#595) as steps: from `before` at the view's start, each
 * group's change applied at its middle (as momentDensity places its moments), to `after`. Points are [x, value], relative from 0 (the lowest balance in view, or zero
 * when that is higher) to 1 (the highest, or zero when that is lower). Null when it stays flat
 * at zero.
 */
export function balanceSteps(
  groups: readonly Pick<FrameGroup, 'first' | 'last' | 'balanceAfter'>[],
  measure: string,
  before: number,
  after: number,
  x: (time: string) => number,
  width: number,
): { steps: [number, number][]; zero: number } | null {
  if (!(width > 0)) return null;
  const raw: [number, number][] = [[0, before]];
  for (const group of groups) {
    const text = group.balanceAfter?.[measure];
    if (text === undefined) continue;
    const at = Math.max(0, Math.min(width, (x(group.first) + x(group.last)) / 2));
    raw.push([at, rationalNumber(text)]);
  }
  // Changes in view with no summary to place them (only drawn durations'): at its end.
  if (raw.at(-1)![1] !== after) raw.push([width, after]);
  const values = raw.map(([, v]) => v);
  const low = Math.min(0, ...values),
    high = Math.max(0, ...values);
  if (!(high > low)) return null;
  const scale = (v: number) => (v - low) / (high - low);
  return { steps: raw.map(([at, v]) => [at, scale(v)]), zero: scale(0) };
}
/** Canonical rational text ("-7/2", "12") as an approximate number. */
export function rationalNumber(text: string) {
  return Q.parse(text.includes('/') ? text : text + '/1').toApproximateNumber();
}
/**
 * Steps as SVG paths (#595): `line`, level until each step's x and then straight up or down to
 * its value, across `width` pixels from `left`; and `area`, closed down to the zero line. Its
 * highest value is at `top`, its lowest at `base`.
 */
export function stepPaths(
  steps: readonly [number, number][],
  zero: number,
  left: number,
  width: number,
  top: number,
  base: number,
) {
  const r = (v: number) => Math.round(v * 10) / 10;
  const y = (v: number) => r(base - v * (base - top));
  let line = `M${r(left)} ${y(steps[0][1])}`;
  for (const [at, v] of steps.slice(1)) line += `H${r(left + at)}V${y(v)}`;
  line += `H${r(left + width)}`;
  const area = `${line}V${y(zero)}H${r(left)}Z`;
  return { line, area };
}
