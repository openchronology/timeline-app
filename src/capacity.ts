// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
/**
 * When to suggest another platform for a timeline. Thresholds come from the capacity
 * benchmarks (docs/capacity.md): in the browser, opening, redrawing and the pause after an
 * edit grow with the timeline, and cross the 100 ms and 1 s responsiveness limits at sizes
 * that depend on the device. So the browser advice follows this device's own measurements,
 * with a moment count as a fallback. The desktop app and the platform stay fast up to the
 * per-timeline limit; the desktop advice only follows measurements on a slow computer.
 */
export const LIMIT = 200000;
export const THRESHOLDS = {
  /** Browser: opening (reading, indexing and drawing) slower than this, in ms. */
  open: 1500,
  /** Browser: median redraw slower than this, in ms. */
  redraw: 150,
  /** Browser: median pause after an edit (redraw and draft save) longer than this, in ms. */
  edit: 100,
  /** Browser: moments at which to advise even without measurements. */
  moments: 20000,
  /** Desktop: median whole-view query slower than this, in ms. */
  view: 1000,
  /** Every platform: entities of one kind at which to warn about the limit. */
  nearLimit: 150000,
};
/** Recent measurements on this device for the open timeline. */
export interface Measurements {
  open?: number;
  redraws: number[];
  edits: number[];
  views: number[];
}
export interface Counts {
  moments: number;
  durations?: number;
  relationships?: number;
}
export type Platform = 'browser' | 'desktop' | 'platform';
export type Advice =
  | { kind: 'limit'; entity: 'moments' | 'durations' | 'relationships'; count: number }
  | { kind: 'browser'; reason: 'open' | 'redraw' | 'edit' | 'size' }
  | { kind: 'desktop'; reason: 'view' };
/** Recent samples kept, and the samples needed before a median counts as consistent. */
export const SAMPLES = 5;
const median = (values: number[], needed: number) => {
  if (values.length < needed) return undefined;
  const sorted = [...values].slice(-SAMPLES).sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
};
/** Adds a sample, keeping the most recent few. */
export function record(samples: number[], value: number) {
  samples.push(value);
  if (samples.length > SAMPLES) samples.splice(0, samples.length - SAMPLES);
}
/** The advice for a timeline, most important first: the limit, then the platform. */
export function advise(platform: Platform, m: Measurements, counts: Counts): Advice[] {
  const advice: Advice[] = [];
  for (const entity of ['moments', 'durations', 'relationships'] as const) {
    const count = counts[entity];
    if (count !== undefined && count >= THRESHOLDS.nearLimit)
      advice.push({ kind: 'limit', entity, count });
  }
  if (platform === 'browser') {
    const redraw = median(m.redraws, 3),
      edit = median(m.edits, 2);
    const reason =
      m.open !== undefined && m.open > THRESHOLDS.open
        ? 'open'
        : redraw !== undefined && redraw > THRESHOLDS.redraw
          ? 'redraw'
          : edit !== undefined && edit > THRESHOLDS.edit
            ? 'edit'
            : counts.moments >= THRESHOLDS.moments
              ? 'size'
              : null;
    if (reason) advice.push({ kind: 'browser', reason });
  }
  if (platform === 'desktop') {
    const view = median(m.views, 3);
    if (view !== undefined && view > THRESHOLDS.view)
      advice.push({ kind: 'desktop', reason: 'view' });
  }
  return advice;
}
