// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// The background chart (#289): how many moments lie across the view, as a smooth curve. It
// reads the view's summaries, which every timeline has (in the browser, on the desktop and
// from a server), so it costs what the view already cost: no moment is read again.
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
  let most = 0;
  for (let i = 0; i < n; i++) {
    let sum = 0,
      weight = 0;
    for (let k = Math.max(0, i - reach); k <= Math.min(n - 1, i + reach); k++) {
      const w = kernel[k - i + reach];
      sum += mass[k] * w;
      weight += w;
    }
    values[i] = sum / weight;
    most = Math.max(most, values[i]);
  }
  return most > 0 ? values.map((v) => v / most) : null;
}

/**
 * The curve as SVG paths: `line` along its top, and `area` closed down to `base`, from `left`
 * across `width` pixels, its highest point at `top`. Between points it is a Catmull-Rom spline
 * (as cubic Béziers), kept from dipping below the base.
 */
export function chartPaths(
  values: readonly number[],
  left: number,
  width: number,
  top: number,
  base: number,
) {
  const r = (v: number) => Math.round(v * 10) / 10;
  const pts = values.map((v, i) => [
    left + Math.min(width, i * CHART_STEP),
    base - v * (base - top),
  ]);
  let line = `M${r(pts[0][0])} ${r(pts[0][1])}`;
  for (let i = 0; i + 1 < pts.length; i++) {
    const p0 = pts[Math.max(0, i - 1)],
      p1 = pts[i],
      p2 = pts[i + 1],
      p3 = pts[Math.min(pts.length - 1, i + 2)];
    const c1y = Math.min(base, p1[1] + (p2[1] - p0[1]) / 6),
      c2y = Math.min(base, p2[1] - (p3[1] - p1[1]) / 6);
    line += `C${r(p1[0] + (p2[0] - p0[0]) / 6)} ${r(c1y)} ${r(p2[0] - (p3[0] - p1[0]) / 6)} ${r(c2y)} ${r(p2[0])} ${r(p2[1])}`;
  }
  const area = `M${r(pts[0][0])} ${r(base)}L${line.slice(1)}L${r(pts.at(-1)![0])} ${r(base)}Z`;
  return { line, area };
}
