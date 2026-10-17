// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
/**
 * Editions (#197): offline files made for one use, such as causal factor analysis. An edition
 * changes only how its new timelines start: the plugin suites they have, how they show time,
 * and where an empty one opens. Files opened or imported keep their own settings.
 */
import { Rational as Q } from 'rational-ordered-map';
import { DEFAULT_PRESENTATION } from './presentation.js';
import type { TimePresentation } from './presentation.js';
import type { TimelineDocument } from './core.js';
import { CAUSAL_FACTOR_ANALYSIS } from './suites.js';
import type { PluginSuite } from './suites.js';

export interface Edition {
  /** Its file is openchronology-offline-<id>.html, published at openchronology.github.io/<id>. */
  id: string;
  /** Shown beside the brand, after "Offline". */
  name: string;
  description: string;
  /** Installed and enabled in each new timeline, in order. */
  suites: readonly PluginSuite[];
  /** Gregorian dates, in the computer's UTC offset when the timeline is made. */
  gregorian: boolean;
}

export const EDITIONS: readonly Edition[] = [
  {
    id: 'cfam',
    name: 'CFAM',
    description:
      'For causal factor analysis: the Causal factor analysis plugins enabled, Gregorian dates, and new timelines starting at today.',
    suites: [CAUSAL_FACTOR_ANALYSIS],
    gregorian: true,
  },
];
export function editionById(id: string | null | undefined): Edition | null {
  return EDITIONS.find((e) => e.id === id) ?? null;
}
/**
 * A new, empty timeline: the edition's plugins and time display when given. `offsetMinutes`
 * is the computer's offset east of UTC (as -new Date().getTimezoneOffset()).
 */
export function blankDocument(of: Edition | null = null, offsetMinutes = 0): TimelineDocument {
  const doc: TimelineDocument = {
    format: 'openchronology',
    version: 1,
    title: 'Untitled timeline',
    description: 'A short description for your timeline',
    events: [],
  };
  if (!of) return doc;
  const plugins = of.suites.flatMap((s) => s.plugins);
  if (plugins.length) doc.plugins = plugins.map((manifest) => ({ manifest, enabled: true }));
  if (of.gregorian) {
    const presentation: TimePresentation = {
      ...DEFAULT_PRESENTATION,
      mode: 'gregorian',
      offsetMinutes: Math.max(-1439, Math.min(1439, Math.trunc(offsetMinutes))),
    };
    doc.presentation = presentation;
  }
  return doc;
}
/** A week either side of `now`, in ms since the Unix epoch, as stored Gregorian seconds. */
export function aroundToday(now: number): { left: Q; span: Q } {
  const week = Q.from(7n * 86400n);
  return { left: Q.from(BigInt(Math.trunc(now)), 1000n).sub(week), span: week.add(week) };
}
