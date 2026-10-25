// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// A timeline's theme (#230): the colors, fonts and text sizes (#267) a theme plugin sets, as the
// `--timeline-*` properties the stylesheet reads on the timeline's stage, with the shades worked
// out from them.
import type { PluginTheme } from './plugins.js';

const mix = (color: string, percent: number, other = 'transparent') =>
  `color-mix(in srgb, ${color} ${percent}%, ${other})`;

/** Near-black or white, whichever reads better on a `#rrggbb` color. */
export function textOn(color: string) {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(color.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.18 ? '#1b1f1c' : '#ffffff';
}

/**
 * How large a theme draws the labels' and the measure's text (#267): 1 is the usual size. The
 * layout spaces label rows, stems and tick labels by these.
 */
export function themeScales(theme: PluginTheme) {
  const scale = (percent?: string) => (percent ? Number(percent) / 100 : 1);
  return { text: scale(theme.textSize), measure: scale(theme.measureSize) };
}

/** The stage's custom properties for a theme; roles it doesn't set are left out. */
export function themeProperties(theme: PluginTheme): Record<string, string> {
  const properties: Record<string, string> = {};
  const set = (name: string, value: string) => (properties[`--timeline-${name}`] = value);
  if (theme.text) {
    set('text', theme.text);
    set('text-soft', mix(theme.text, 65));
  }
  if (theme.textFont) set('text-font', theme.textFont);
  if (theme.textSize) set('text-scale', String(themeScales(theme).text));
  if (theme.measure) {
    set('measure', theme.measure);
    set('measure-soft', mix(theme.measure, 70));
    set('measure-faint', mix(theme.measure, 30));
  }
  if (theme.measureFont) set('measure-font', theme.measureFont);
  if (theme.measureSize) set('measure-scale', String(themeScales(theme).measure));
  if (theme.halo) {
    set('halo', theme.halo);
    set('halo-backing', mix(theme.halo, 72));
    set('heading-backing', mix(theme.halo, 90));
  }
  if (theme.marker) {
    set('marker', theme.marker);
    set('marker-group', mix(theme.marker, 85, '#000'));
    set('marker-strong', mix(theme.marker, 70, '#000'));
    set('marker-selected', mix(theme.marker, 55, '#000'));
  }
  if (theme.duration) {
    set('duration', theme.duration);
    set('duration-text', textOn(theme.duration));
  }
  if (theme.background) set('background', theme.background);
  return properties;
}
