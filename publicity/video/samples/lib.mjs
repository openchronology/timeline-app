// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// Helpers the sample timelines share: exact times from dates and years, entity builders, and
// the plugins list.

/** Seconds since 1970 UTC of an ISO date or date-time, as an exact rational string. */
export function at(iso) {
  const ms = Date.parse(iso.length === 10 ? iso + 'T00:00:00Z' : iso);
  if (Number.isNaN(ms)) throw new Error(`Bad date ${iso}`);
  return `${BigInt(ms) / 1000n}/1`;
}
/** A Julian year (365.25 days) in seconds, the unit of the years presets. */
export const YEAR = 31557600n;
/** 2000-01-01T00:00:00Z: the Geological ages plugin's reference year. */
export const Y2000 = 946684800n;
/** The time `years` (a decimal string or number, may be fractional) before 2000 CE, exactly. */
export function yearsBefore2000(years) {
  const [whole, frac = ''] = String(years).split('.');
  const denominator = 10n ** BigInt(frac.length);
  const numerator = (BigInt(whole) * denominator + BigInt(frac || 0)) * YEAR;
  const t = Y2000 * denominator - numerator;
  const g = gcd(t < 0n ? -t : t, denominator);
  return `${t / g}/${denominator / g}`;
}
function gcd(a, b) {
  while (b) [a, b] = [b, a % b];
  return a || 1n;
}
/** A moment. */
export function m(id, time, title, o = {}) {
  const metadata = {
    title,
    ...(o.notes ? { description: o.notes } : {}),
    ...(o.tags ? { tags: o.tags } : {}),
  };
  if (o.sources) metadata.sources = o.sources;
  for (const key of [
    'color',
    'shape',
    'shapeSize',
    'headingLevel',
    'approximateAgeYears',
    'datePrecision',
    'historicalDate',
    'calendar',
    'stack',
  ])
    if (o[key] !== undefined) metadata[key] = o[key];
  return { id, time, metadata };
}
/** A duration between two fixed times. */
export function d(id, start, end, title, o = {}) {
  const metadata = {
    title,
    ...(o.notes ? { description: o.notes } : {}),
    ...(o.tags ? { tags: o.tags } : {}),
  };
  if (o.sources) metadata.sources = o.sources;
  if (o.color) metadata.color = o.color;
  return { id, start, end, metadata };
}
/** A relationship between two entities: ids beginning "d:" are durations. */
export function rel(a, b) {
  const side = (id) => (id.startsWith('d:') ? { duration: id.slice(2) } : { moment: id });
  return { a: side(a), b: side(b) };
}
export const plugins = (...manifests) => manifests.map((manifest) => ({ manifest, enabled: true }));
/** The Timeline theme plugin with its settings. */
export function theme(core, settings) {
  return { manifest: core.TIMELINE_THEME, enabled: true, settings };
}
/** A Wikipedia article's address. */
export const wiki = (title) => `https://en.wikipedia.org/wiki/${title}`;
