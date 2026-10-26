// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
/**
 * Plugin suites (#78): named packages of plugins installed together, such as the plugins a
 * history class or a causal analysis uses. A suite carries its plugins' full definitions, so
 * it installs the same offline, on the desktop and from any server, custom plugins included.
 */
import {
  validatePluginManifest,
  MOMENT_STACKS,
  MOMENT_SHAPES,
  MOMENT_SHAPES_2,
  MOMENT_COLORS,
  MOMENT_ICONS,
  DURATION_BACKGROUNDS,
  EXPAND_ON_HOVER,
  RICH_TEXT_NOTES,
  MOMENT_HEADINGS,
  PRESUMPTIVE_OUTLINE,
  RELATIONSHIP_ARROWS,
} from './plugins.js';
import type { InstalledPlugin, PluginManifest } from './plugins.js';

export interface PluginSuite {
  apiVersion: 1;
  id: string;
  version: number;
  name: string;
  description: string;
  plugins: PluginManifest[];
}
/** A timeline holds at most this many plugins, so a suite does too. */
export const SUITE_PLUGINS = 32;
/** A suite's definitions, serialized, as a timeline's plugin settings are limited. */
export const SUITE_BYTES = 128 * 1024;

function record(value: unknown, keys: string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('A plugin suite must be an object.');
  const unknown = Object.keys(value).find((key) => !keys.includes(key));
  if (unknown) throw new Error(`Unsupported plugin suite property: ${unknown}.`);
  return value as Record<string, unknown>;
}
function text(value: unknown, max: number, what: string): string {
  if (typeof value !== 'string' || !value.trim() || value.length > max)
    throw new Error(`A suite ${what} is required, at most ${max} characters.`);
  return value.trim();
}
export function validatePluginSuite(value: unknown): PluginSuite {
  const s = record(value, ['apiVersion', 'id', 'version', 'name', 'description', 'plugins']);
  if (
    s.apiVersion !== 1 ||
    typeof s.id !== 'string' ||
    !/^[a-z][a-z0-9-]{0,63}$/.test(s.id) ||
    !Number.isSafeInteger(s.version) ||
    (s.version as number) < 1
  )
    throw new Error('Unsupported plugin suite ID, version or API.');
  if (!Array.isArray(s.plugins) || !s.plugins.length || s.plugins.length > SUITE_PLUGINS)
    throw new Error(`A plugin suite holds one to ${SUITE_PLUGINS} plugins.`);
  const plugins = s.plugins.map((p) => validatePluginManifest(p));
  if (new Set(plugins.map((p) => p.id)).size !== plugins.length)
    throw new Error('A plugin suite holds each plugin once.');
  const suite: PluginSuite = {
    apiVersion: 1,
    id: s.id,
    version: s.version as number,
    name: text(s.name, 100, 'name'),
    description: typeof s.description === 'string' ? s.description.slice(0, 2000) : '',
    plugins,
  };
  if (new TextEncoder().encode(JSON.stringify(suite)).length > SUITE_BYTES)
    throw new Error('A plugin suite is limited to 128 KiB.');
  return suite;
}
/** A suite made from plugins, such as a timeline's: its ID is a slug of its name. */
export function suiteFromPlugins(
  details: { name: string; description?: string; id?: string; version?: number },
  plugins: readonly PluginManifest[],
): PluginSuite {
  const slug =
    details.id ||
    details.name
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .replace(/^[^a-z]+/, '')
      .slice(0, 29)
      .replace(/-+$/, '');
  return validatePluginSuite({
    apiVersion: 1,
    id: slug || 'suite',
    version: details.version ?? 1,
    name: details.name,
    description: details.description ?? '',
    plugins,
  });
}
/**
 * A timeline's plugins with a suite added: its plugins the timeline lacks are appended,
 * enabled, in the suite's order. A plugin the timeline already has stays as it is (its
 * version and whether it is enabled), so adding a suite never changes an installed plugin.
 */
export function addSuite(
  installed: readonly InstalledPlugin[],
  suite: PluginSuite,
): { plugins: InstalledPlugin[]; added: PluginManifest[]; kept: PluginManifest[] } {
  const present = new Set(installed.map((p) => p.manifest.id));
  const added = suite.plugins.filter((p) => !present.has(p.id)),
    kept = suite.plugins.filter((p) => present.has(p.id));
  if (installed.length + added.length > SUITE_PLUGINS)
    throw new Error(
      `A timeline holds at most ${SUITE_PLUGINS} plugins; remove ${installed.length + added.length - SUITE_PLUGINS} before adding this suite.`,
    );
  return {
    plugins: [...installed, ...added.map((manifest) => ({ manifest, enabled: true }))],
    added,
    kept,
  };
}

/** Version 1 of the suite as published, with Moment shapes 2; still served and recognized. */
export const CAUSAL_FACTOR_ANALYSIS_1: PluginSuite = validatePluginSuite({
  apiVersion: 1,
  id: 'causal-factor-analysis',
  version: 1,
  name: 'Causal factor analysis',
  description:
    'Trace how factors lead to an outcome: stack contributing factors on a moment, and tell kinds of factor apart by shape and color.',
  plugins: [MOMENT_STACKS, MOMENT_SHAPES_2, MOMENT_COLORS],
});
/**
 * Version 2 draws an Events and Causal Factors chart's conventions: ellipses for conditions
 * (Moment shapes 3, #324), dashed outlines for presumptive items (#325), and arrowheads on
 * relationships (#326).
 */
export const CAUSAL_FACTOR_ANALYSIS: PluginSuite = validatePluginSuite({
  apiVersion: 1,
  id: 'causal-factor-analysis',
  version: 2,
  name: 'Causal factor analysis',
  description:
    'Trace how factors lead to an outcome: stack contributing factors on a moment, tell kinds of factor apart by shape and color, draw conditions as ellipses and unconfirmed items dashed, and show cause and effect with arrows.',
  plugins: [MOMENT_STACKS, MOMENT_SHAPES, MOMENT_COLORS, PRESUMPTIVE_OUTLINE, RELATIONSHIP_ARROWS],
});
export const HISTORY_EDUCATION: PluginSuite = validatePluginSuite({
  apiVersion: 1,
  id: 'history-education',
  version: 1,
  name: 'History education',
  description:
    'Teach a period with pictures and structure: moment icons, backgrounds for eras, summaries that fan out on hover, rich notes, and headings for chapters and parts.',
  plugins: [MOMENT_ICONS, DURATION_BACKGROUNDS, EXPAND_ON_HOVER, RICH_TEXT_NOTES, MOMENT_HEADINGS],
});
export const OFFICIAL_SUITES: readonly PluginSuite[] = [
  CAUSAL_FACTOR_ANALYSIS,
  CAUSAL_FACTOR_ANALYSIS_1,
  HISTORY_EDUCATION,
];
export function isOfficialSuite(suite: PluginSuite): boolean {
  return OFFICIAL_SUITES.some((official) => JSON.stringify(official) === JSON.stringify(suite));
}

export interface SuiteLibraryPage {
  suites: PluginSuite[];
  page: number;
  limit: number;
  total: number;
  pages: number;
  apiVersion: 1;
}
/**
 * Searches a fixed suite library as searchPluginLibrary does plugins: the newest version of
 * each suite whose name, description, ID or plugins' names contain the search, by name.
 */
export function searchSuiteLibrary(
  suites: readonly PluginSuite[],
  { search = '', page = 1, limit = 12 }: { search?: string; page?: number; limit?: number } = {},
): SuiteLibraryPage {
  const latest = new Map<string, PluginSuite>();
  for (const s of suites) {
    const known = latest.get(s.id);
    if (!known || known.version < s.version) latest.set(s.id, s);
  }
  const needle = search.trim().toLowerCase();
  const matching = [...latest.values()]
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : a.id.localeCompare(b.id)))
    .filter((s) =>
      [s.name, s.description, s.id, ...s.plugins.map((p) => p.name)]
        .join(' ')
        .toLowerCase()
        .includes(needle),
    );
  return {
    suites: matching.slice((page - 1) * limit, page * limit),
    page,
    limit,
    total: matching.length,
    pages: Math.ceil(matching.length / limit),
    apiVersion: 1,
  };
}
