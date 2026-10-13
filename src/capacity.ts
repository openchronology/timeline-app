// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
import { DEFAULT_ENTRY_LIMIT } from './entry-limit.js';
/**
 * When to suggest another platform for a timeline. Thresholds come from the capacity
 * benchmarks (docs/capacity.md): in the browser, opening, navigating and the pause after an
 * edit grow with the timeline, and cross the 100 ms and 1 s responsiveness limits at sizes
 * that depend on the device. So the browser advice follows this device's own measurements
 * of what its user waits for (from an input to the frame that shows its result),
 * with a moment count as a fallback. The desktop app and the platform stay fast up to the
 * per-timeline limit; the desktop advice only follows measurements on a slow computer.
 * LIMIT is the default limit, which a server may change (entry-limit.ts).
 */
export const LIMIT = DEFAULT_ENTRY_LIMIT;
export const THRESHOLDS = {
  /** Browser: opening (reading, indexing and drawing) until painted, slower than this, in ms. */
  open: 1500,
  /**
   * Browser: the median wait from a zoom, pan or pinch input until its view is painted,
   * longer than this, in ms.
   */
  navigation: 150,
  /**
   * Browser: moments from which slow navigation is advised. Below this, zooming and panning
   * cost mostly the drawing every platform does in the browser, so another platform would
   * not be faster: a device slow there is slow everywhere.
   */
  navigationMoments: 1000,
  /** Browser: median pause after an edit (redraw and draft save) longer than this, in ms. */
  edit: 100,
  /** Browser: moments at which to advise even without measurements. */
  moments: 20000,
  /** Desktop: median whole-view query slower than this, in ms. */
  view: 1000,
  /** Every platform: entities of one kind at which to warn about the default limit. */
  nearLimit: 150000,
};
/**
 * How quickly interactions must respond, checked by the UI benchmarks (bench/ui.mjs). They
 * follow the thresholds above: within a platform's comfortable size every interaction meets
 * its budget, and past it the advice above must already be showing.
 */
export const BUDGETS = {
  /** A click, key or tap until its result is painted: feels instant. */
  response: THRESHOLDS.edit,
  /** Zooming, panning or fitting until the new view is drawn. */
  view: THRESHOLDS.navigation,
  /**
   * The longest frame during a continuous gesture (drag, wheel, pinch): the view may drop
   * frames while it redraws, but never stalls longer than one view may take.
   */
  frame: THRESHOLDS.navigation,
  /** Search results, separations and lists: users keep their attention for about 1 s. */
  results: 1000,
  /** Opening a timeline. */
  open: THRESHOLDS.open,
  /** Desktop: a whole-view query. */
  desktopView: THRESHOLDS.view,
};
/**
 * The largest timelines (in moments) each platform handles comfortably (docs/capacity.md),
 * from the UI benchmarks on hosted runners: every interaction meets its budget there.
 * `slowBrowser` is a phone or slower computer, measured with the CPU throttled 4×.
 */
export const COMFORTABLE = {
  browser: 10000,
  slowBrowser: 1000,
  desktop: LIMIT,
  platform: LIMIT,
};
/** Recent measurements on this device for the open timeline. */
export interface Measurements {
  open?: number;
  /** Waits from navigation inputs until their views were painted. */
  navigation: number[];
  edits: number[];
  views: number[];
  /**
   * What this device last measured as slow for the timeline, if anything: the advice holds
   * once measurements were consistently slow, though later quick ones (a small pan after
   * slow zooming) bring the median down.
   */
  slow?: { reason: 'open' | 'navigation' | 'edit'; ms: number };
}
export interface Counts {
  moments: number;
  durations?: number;
  relationships?: number;
  /** The timeline's entry limit, when not the default (a server's; Infinity for none). */
  limit?: number;
}
/** Entities of one kind at which to warn about a limit: the same share of it as by default. */
export function nearLimit(limit = LIMIT): number {
  return Number.isFinite(limit) ? Math.ceil((limit * THRESHOLDS.nearLimit) / LIMIT) : Infinity;
}
export type Platform = 'browser' | 'desktop' | 'platform';
export type Advice =
  | { kind: 'limit'; entity: 'moments' | 'durations' | 'relationships'; count: number }
  | { kind: 'browser'; reason: 'open' | 'navigation' | 'edit' | 'size' }
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
    if (count !== undefined && count >= nearLimit(counts.limit))
      advice.push({ kind: 'limit', entity, count });
  }
  if (platform === 'browser') {
    const navigation = median(m.navigation, 3),
      edit = median(m.edits, 2);
    const measured =
      m.open !== undefined && m.open > THRESHOLDS.open
        ? { reason: 'open' as const, ms: m.open }
        : navigation !== undefined &&
            navigation > THRESHOLDS.navigation &&
            counts.moments >= THRESHOLDS.navigationMoments
          ? { reason: 'navigation' as const, ms: navigation }
          : edit !== undefined && edit > THRESHOLDS.edit
            ? { reason: 'edit' as const, ms: edit }
            : null;
    if (measured) m.slow = measured;
    const reason = m.slow?.reason ?? (counts.moments >= THRESHOLDS.moments ? 'size' : null);
    if (reason) advice.push({ kind: 'browser', reason });
  }
  if (platform === 'desktop') {
    const view = median(m.views, 3);
    if (view !== undefined && view > THRESHOLDS.view)
      advice.push({ kind: 'desktop', reason: 'view' });
  }
  return advice;
}
