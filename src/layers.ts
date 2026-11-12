// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
/**
 * The parts of a timeline a reader can hide (#618): its moments, durations, their backgrounds,
 * relationships, the balances at the view's edges, and each chart. The charts are whatever the
 * timeline draws: the moments chart a plugin adds, and each measure's chart, its own or a chart
 * plugin's, so a plugin that declares a chart gets a switch without doing anything more. Hiding
 * is the reader's: it changes nothing in the timeline, and is kept in the tab.
 */

/** A switch in the Show dialog: what it hides, under which heading, and the chart's color. */
export interface LayerSwitch {
  key: string;
  label: string;
  group: 'timeline' | 'charts';
  /** What draws it, for a chart: a plugin's name, or the measure itself. */
  source?: string;
  color?: string | null;
}
/** The timeline's own parts, each a layer of the stage. */
export const TIMELINE_LAYERS: readonly LayerSwitch[] = [
  { key: 'moments', label: 'Moments', group: 'timeline' },
  { key: 'durations', label: 'Durations', group: 'timeline' },
  { key: 'backgrounds', label: 'Backgrounds', group: 'timeline' },
  { key: 'relationships', label: 'Relationships', group: 'timeline' },
  { key: 'balances', label: 'Balances at the edges', group: 'timeline' },
];
/** The key of the moments chart's switch. */
export const MOMENTS_CHART = 'chart:moments';
/** The key of a measure's chart's switch. */
export const measureChartLayer = (measure: string) => `chart:measure:${measure}`;
/**
 * The switches for what a timeline shows: its own parts, then the moments chart if a plugin
 * draws one, then each charted measure in the order they're drawn.
 */
export function layerSwitches(charts: {
  moments: { color: string | null; plugin?: string } | null;
  measures: { measure: string; label: string; color: string | null; plugin?: string }[];
}): LayerSwitch[] {
  return [
    ...TIMELINE_LAYERS,
    ...(charts.moments
      ? [
          {
            key: MOMENTS_CHART,
            label: 'Moments chart',
            group: 'charts' as const,
            color: charts.moments.color,
            ...(charts.moments.plugin ? { source: charts.moments.plugin } : {}),
          },
        ]
      : []),
    ...charts.measures.map((chart) => ({
      key: measureChartLayer(chart.measure),
      label: chart.label,
      group: 'charts' as const,
      color: chart.color,
      ...(chart.plugin ? { source: chart.plugin } : {}),
    })),
  ];
}
/** At most this many hidden parts are kept, each key at most KEY characters. */
const LIMIT = 256,
  KEY = 300;
/** The hidden parts from stored text, read as untrusted: anything malformed is dropped. */
export function readHiddenLayers(text: string | null | undefined): Set<string> {
  let value: unknown;
  try {
    value = JSON.parse(text ?? '');
  } catch {
    return new Set();
  }
  if (!Array.isArray(value)) return new Set();
  return new Set(
    value
      .filter((key): key is string => typeof key === 'string' && !!key && key.length <= KEY)
      .slice(0, LIMIT),
  );
}
