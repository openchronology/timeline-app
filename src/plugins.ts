// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
import { compilePluginScript } from './custom-time.js';
/** Versioned host components and optional source interpreted by our bounded language. */
export interface PluginField {
  kind: 'text' | 'multiline' | 'image-url' | 'stack' | 'color' | 'shape' | 'size' | 'links';
  metadataKey: string;
  label: string;
}
export interface PluginManifest {
  apiVersion: 1;
  id: string;
  version: number;
  name: string;
  description: string;
  fields: PluginField[];
  marker?: { kind: 'image' | 'color' | 'shape' | 'size'; metadataKey: string };
  hover?: { kind: 'card' };
  summary?: { kind: 'radial' };
  notes?: { kind: 'markdown' };
  /** Entities the plugin applies to; omitted means moments, plus durations for colors/cards. */
  targets?: PluginTarget[];
  source?: string;
}
export type PluginTarget = 'moments' | 'durations';
export interface InstalledPlugin {
  manifest: PluginManifest;
  enabled: boolean;
}
export const MOMENT_SHAPE_NAMES = [
  'circle',
  'diamond',
  'square',
  'triangle',
  'pentagon',
  'hexagon',
  'octagon',
  'star',
  'terminator',
  'process',
  'document',
  'parallelogram',
] as const;
export type MomentShape = (typeof MOMENT_SHAPE_NAMES)[number];
export function shapeValue(value: unknown): MomentShape | null {
  return typeof value === 'string' && (MOMENT_SHAPE_NAMES as readonly string[]).includes(value)
    ? (value as MomentShape)
    : null;
}
export const MOMENT_SIZES = ['small', 'medium', 'large'] as const;
export type MomentSize = (typeof MOMENT_SIZES)[number];
export function sizeValue(value: unknown): MomentSize | null {
  return typeof value === 'string' && (MOMENT_SIZES as readonly string[]).includes(value)
    ? (value as MomentSize)
    : null;
}
type Effects = {
  size?: MomentSize;
  shape?: MomentShape;
  color?: string;
  icon?: string;
  card?: boolean;
  expand?: boolean;
};
const compiledScripts = new Map<string, ReturnType<typeof compilePluginScript>>();
function manifestEffects(manifest: PluginManifest, metadata: Record<string, unknown>): Effects {
  if (!manifest.source) return {};
  let effects: Effects = {};
  try {
    let script = compiledScripts.get(manifest.source);
    if (!script) {
      script = compilePluginScript(manifest.source);
      if (compiledScripts.size >= 64) compiledScripts.delete(compiledScripts.keys().next().value!);
      compiledScripts.set(manifest.source, script);
    }
    const output = script((name, args) => {
      const value = args[0];
      const text = () => {
        if (typeof value !== 'string') throw new Error('Plugin arguments must be text.');
        return value;
      };
      switch (name) {
        case 'get': {
          const key = text();
          if (
            !manifest.fields.some((f) => f.metadataKey === key) &&
            !['title', 'description'].includes(key)
          )
            throw new Error('Undeclared metadata field.');
          const raw = metadata[key];
          return typeof raw === 'string'
            ? raw.slice(0, 2048)
            : typeof raw === 'number' || typeof raw === 'boolean'
              ? String(raw)
              : '';
        }
        case 'shape': {
          const shape = shapeValue(text());
          return JSON.stringify(shape ? { shape } : {});
        }
        case 'size': {
          const size = sizeValue(text());
          return JSON.stringify(size ? { size } : {});
        }
        case 'color': {
          const color = colorValue(text());
          return JSON.stringify(color ? { color } : {});
        }
        case 'icon': {
          const key = text();
          if (!manifest.fields.some((f) => f.metadataKey === key && f.kind === 'image-url'))
            throw new Error('Images must come from a declared image URL field.');
          const icon = imageURL(metadata[key]);
          return JSON.stringify(icon && icon.length < 1800 ? { icon } : {});
        }
        case 'expand':
          return '{"expand":true}';
        case 'card':
          return '{"card":true}';
        case 'none':
          return '{}';
        case 'merge': {
          if (typeof args[1] !== 'string') throw new Error('Expected plugin effects.');
          return JSON.stringify({ ...JSON.parse(text()), ...JSON.parse(args[1]) });
        }
        default:
          throw new Error('Unavailable plugin API method.');
      }
    });
    const raw = JSON.parse(output);
    // Return values are validated even when a script returns a literal JSON string.
    if (
      !raw ||
      typeof raw !== 'object' ||
      Array.isArray(raw) ||
      Object.keys(raw).some(
        (k) => !['shape', 'size', 'color', 'icon', 'card', 'expand'].includes(k),
      )
    )
      throw new Error('Invalid plugin effects.');
    if (raw.size !== undefined) {
      const size = sizeValue(raw.size);
      if (!size) throw new Error('Invalid size.');
      effects.size = size;
    }
    if (raw.shape !== undefined) {
      const shape = shapeValue(raw.shape);
      if (!shape) throw new Error('Invalid shape.');
      effects.shape = shape;
    }
    if (raw.color !== undefined) {
      const color = colorValue(raw.color);
      if (!color) throw new Error('Invalid color.');
      effects.color = color;
    }
    if (raw.expand !== undefined) {
      if (typeof raw.expand !== 'boolean') throw new Error('Invalid expansion flag.');
      effects.expand = raw.expand;
    }
    if (raw.card !== undefined) {
      if (typeof raw.card !== 'boolean') throw new Error('Invalid card flag.');
      effects.card = raw.card;
    }
    if (raw.icon !== undefined) {
      const icon = imageURL(raw.icon);
      if (
        !icon ||
        !manifest.fields.some(
          (f) => f.kind === 'image-url' && imageURL(metadata[f.metadataKey]) === icon,
        )
      )
        throw new Error('Image must match an explicitly configured image URL.');
      effects.icon = icon;
    }
  } catch {
    effects = {};
  } // A faulty script cannot stop the timeline rendering.
  return effects;
}
function scriptEffects(
  plugins: readonly InstalledPlugin[],
  metadata: Record<string, unknown>,
): Effects {
  const effects: Effects = {};
  for (const { manifest, enabled } of plugins)
    if (enabled) {
      if (manifest.marker?.kind === 'shape') {
        const shape = shapeValue(metadata[manifest.marker.metadataKey]);
        if (shape) effects.shape = shape;
      }
      if (manifest.marker?.kind === 'color') {
        const color = colorValue(metadata[manifest.marker.metadataKey]);
        if (color) effects.color = color;
      }
      if (manifest.marker?.kind === 'image') {
        const icon = imageURL(metadata[manifest.marker.metadataKey]);
        if (icon) effects.icon = icon;
      }
      if (manifest.hover) effects.card = true;
      Object.assign(effects, manifestEffects(manifest, metadata));
    }
  return effects;
}
export function pluginShape(
  plugins: readonly InstalledPlugin[] = [],
  metadata: Record<string, unknown> = {},
): MomentShape {
  return scriptEffects(plugins, metadata).shape ?? 'circle';
}
export function pluginSize(
  plugins: readonly InstalledPlugin[] = [],
  metadata: Record<string, unknown> = {},
): MomentSize {
  return scriptEffects(plugins, metadata).size ?? 'medium';
}
const reserved = new Set([
  'title',
  'description',
  'durations',
  '__proto__',
  'prototype',
  'constructor',
]);
function object(value: unknown, keys: string[]): Record<string, unknown> {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).some((key) => !keys.includes(key))
  )
    throw new Error('Invalid plugin definition.');
  return value as Record<string, unknown>;
}
function text(value: unknown, max: number) {
  if (typeof value !== 'string' || !value.trim() || value.length > max)
    throw new Error('Invalid plugin text.');
  return value;
}
function key(value: unknown) {
  if (
    typeof value !== 'string' ||
    !/^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(value) ||
    reserved.has(value)
  )
    throw new Error('Invalid or reserved plugin metadata key.');
  return value;
}
export function validatePluginManifest(value: unknown): PluginManifest {
  const p = object(value, [
    'apiVersion',
    'id',
    'version',
    'name',
    'description',
    'fields',
    'marker',
    'hover',
    'summary',
    'notes',
    'targets',
    'source',
  ]);
  if (
    p.apiVersion !== 1 ||
    typeof p.id !== 'string' ||
    !/^[a-z][a-z0-9-]{0,63}$/.test(p.id) ||
    !Number.isSafeInteger(p.version) ||
    (p.version as number) < 1
  )
    throw new Error('Unsupported plugin ID, version or API.');
  if (!Array.isArray(p.fields) || p.fields.length > 8)
    throw new Error('A plugin supports at most eight fields.');
  const keys = new Set<string>();
  const fields = p.fields.map((value) => {
    const f = object(value, ['kind', 'metadataKey', 'label']);
    if (
      !['text', 'multiline', 'image-url', 'stack', 'color', 'shape', 'size', 'links'].includes(
        f.kind as string,
      )
    )
      throw new Error('Unsupported plugin component.');
    const metadataKey = key(f.metadataKey);
    if (keys.has(metadataKey)) throw new Error('Duplicate plugin field.');
    keys.add(metadataKey);
    return { kind: f.kind as PluginField['kind'], metadataKey, label: text(f.label, 100) };
  });
  const result: PluginManifest = {
    apiVersion: 1,
    id: p.id,
    version: p.version as number,
    name: text(p.name, 100),
    description: text(p.description, 2000),
    fields,
  };
  if (p.marker !== undefined) {
    const m = object(p.marker, ['kind', 'metadataKey']);
    if (m.kind !== 'image' && m.kind !== 'color' && m.kind !== 'shape')
      throw new Error('Unsupported marker component.');
    result.marker = { kind: m.kind, metadataKey: key(m.metadataKey) };
  }
  if (p.hover !== undefined) {
    const hover = object(p.hover, ['kind']);
    if (hover.kind !== 'card') throw new Error('Unsupported hover component.');
    result.hover = { kind: 'card' };
  }
  if (p.summary !== undefined) {
    const summary = object(p.summary, ['kind']);
    if (summary.kind !== 'radial') throw new Error('Unsupported summary component.');
    result.summary = { kind: 'radial' };
  }
  if (p.notes !== undefined) {
    const notes = object(p.notes, ['kind']);
    if (notes.kind !== 'markdown') throw new Error('Unsupported notes component.');
    result.notes = { kind: 'markdown' };
  }
  if (p.targets !== undefined) {
    if (
      !Array.isArray(p.targets) ||
      !p.targets.length ||
      p.targets.some((t) => t !== 'moments' && t !== 'durations') ||
      new Set(p.targets).size !== p.targets.length
    )
      throw new Error('Plugin targets are "moments" and/or "durations".');
    result.targets = p.targets as PluginTarget[];
  }
  if (p.source !== undefined) {
    result.source = text(p.source, 16384);
    compilePluginScript(result.source);
  }
  return result;
}
export function validateInstalledPlugins(value: unknown): InstalledPlugin[] {
  if (
    !Array.isArray(value) ||
    value.length > 32 ||
    new TextEncoder().encode(JSON.stringify(value)).length > 131072
  )
    throw new Error('Expected at most 32 plugins and 128 KiB of settings.');
  const ids = new Set<string>();
  return value.map((raw) => {
    const entry = object(raw, ['manifest', 'enabled']);
    const manifest = validatePluginManifest(entry.manifest);
    if (typeof entry.enabled !== 'boolean' || ids.has(manifest.id))
      throw new Error('Invalid or duplicate installed plugin.');
    ids.add(manifest.id);
    return { manifest, enabled: entry.enabled };
  });
}
/** Explicit HTTPS URLs without embedded credentials. Cross-origin images load anonymously with no referrer. */
export function imageURL(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim() || value.length > 4096) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' &&
      url.href.length <= 4096 &&
      !url.username &&
      !url.password &&
      !!url.hostname
      ? url.href
      : null;
  } catch {
    return null;
  }
}
/** Explicit outbound references; never fetched or interpreted by the plugin. */
export function sourceLinks(value: unknown): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 100)
    throw new Error('Sources must be an array of at most 100 HTTPS links.');
  return value.map((raw) => {
    const url = imageURL(raw);
    if (!url) throw new Error('Use HTTPS links without embedded credentials.');
    return url;
  });
}
export const MOMENT_SOURCES: PluginManifest = validatePluginManifest({
  apiVersion: 1,
  id: 'moment-sources',
  version: 1,
  name: 'Sources',
  description: 'Show and edit a series of source links for moments and stack entries.',
  fields: [{ kind: 'links', metadataKey: 'sources', label: 'Sources' }],
  source: 'function render(moment: string, api: PluginAPI): string { return api.none(); }',
});
export const DATING_CONTEXT: PluginManifest = validatePluginManifest({
  apiVersion: 1,
  id: 'dating-context',
  version: 1,
  name: 'Dating context',
  description:
    'Explain the precision and coordinate convention of a moment. An exact stored coordinate can still represent an approximate age or a calendar-day marker.',
  fields: [
    { kind: 'text', metadataKey: 'datePrecision', label: 'Date precision' },
    { kind: 'multiline', metadataKey: 'coordinateConvention', label: 'Coordinate convention' },
  ],
  source: 'function render(moment: string, api: PluginAPI): string { return api.none(); }',
});
export const HISTORICAL_DATES: PluginManifest = validatePluginManifest({
  apiVersion: 1,
  id: 'historical-dates',
  version: 1,
  name: 'Historical dates',
  description:
    'Retain an original historical date and its calendar separately from the timeline coordinate and display calendar, such as a Julian date on a Gregorian timeline.',
  fields: [
    { kind: 'text', metadataKey: 'historicalDate', label: 'Original historical date' },
    { kind: 'text', metadataKey: 'calendar', label: 'Original calendar' },
  ],
  source: 'function render(moment: string, api: PluginAPI): string { return api.none(); }',
});
export const GEOLOGICAL_AGES: PluginManifest = validatePluginManifest({
  apiVersion: 1,
  id: 'geological-ages',
  version: 1,
  name: 'Geological ages',
  description:
    'Record an approximate geological age in years before reference year 2000 CE. This annotation does not change the exact coordinate or claim a more precise scientific estimate.',
  fields: [
    {
      kind: 'text',
      metadataKey: 'approximateAgeYears',
      label: 'Approximate age (years before 2000 CE)',
    },
  ],
  source: 'function render(moment: string, api: PluginAPI): string { return api.none(); }',
});
/**
 * Colors and hover cards apply to durations by default; stacks, shapes, sizes, icons and
 * summary expansion are moment-only. Older saved manifests have no targets and follow this.
 */
export function pluginTargets(manifest: PluginManifest): PluginTarget[] {
  return (
    manifest.targets ??
    (manifest.marker?.kind === 'color' || manifest.hover ? ['moments', 'durations'] : ['moments'])
  );
}
const DURATION_FIELDS = new Set<PluginField['kind']>(['text', 'multiline', 'color', 'links']);
/** The subset of each plugin that applies to duration bands and their editor. */
export function durationPlugins(plugins: readonly InstalledPlugin[] = []): InstalledPlugin[] {
  return plugins
    .filter((p) => pluginTargets(p.manifest).includes('durations'))
    .map(({ manifest, enabled }) => {
      const { summary: _summary, marker, ...rest } = manifest;
      return {
        enabled,
        manifest: {
          ...rest,
          // Built-in labels name moments ("Moment color"); in the duration editor say "Color".
          fields: manifest.fields
            .filter((f) => DURATION_FIELDS.has(f.kind))
            .map((f) => ({
              ...f,
              label: f.label.replace(/^Moment (\w)/, (_, c) => c.toUpperCase()),
            })),
          ...(marker?.kind === 'color' ? { marker } : {}),
        },
      };
    });
}
/** Moment rendering ignores plugins that explicitly target only durations. */
export function momentPlugins(plugins: readonly InstalledPlugin[] = []): InstalledPlugin[] {
  return plugins.filter((p) => pluginTargets(p.manifest).includes('moments'));
}
export function pluginFields(plugins: readonly InstalledPlugin[] = []): PluginField[] {
  const fields = new Map<string, PluginField>();
  for (const { manifest, enabled } of plugins)
    if (enabled)
      for (const field of manifest.fields) {
        fields.delete(field.metadataKey);
        fields.set(field.metadataKey, field);
      }
  return [...fields.values()];
}
export function pluginMarker(
  plugins: readonly InstalledPlugin[] = [],
  metadata: Record<string, unknown> = {},
): string | null {
  let image: string | null = null;
  for (const { manifest, enabled } of plugins)
    if (enabled && manifest.marker?.kind === 'image') {
      const candidate = imageURL(metadata[manifest.marker.metadataKey]);
      if (candidate) image = candidate;
    }
  return scriptEffects(plugins, metadata).icon ?? image;
}
export function pluginMetadata(
  plugins: readonly InstalledPlugin[] = [],
  metadata: Record<string, unknown> = {},
) {
  const result: Record<string, unknown> = {};
  for (const { manifest, enabled } of plugins)
    if (enabled) {
      if (manifest.hover || manifest.source)
        for (const key of ['title', 'description'])
          if (typeof metadata[key] === 'string')
            result[key] = key === 'title' ? metadata[key] : metadata[key].slice(0, 2000);
      if ((manifest.hover || manifest.source) && Array.isArray(metadata.sources))
        result.sources = metadata.sources.filter((v) => imageURL(v)).slice(0, 100);
      for (const name of [
        ...manifest.fields.map((f) => f.metadataKey),
        ...(manifest.marker ? [manifest.marker.metadataKey] : []),
      ])
        if (typeof metadata[name] === 'string')
          result[name] = (metadata[name] as string).slice(0, 10000);
      for (const field of manifest.fields)
        if (
          (field.kind === 'stack' || field.kind === 'links') &&
          Array.isArray(metadata[field.metadataKey])
        )
          result[field.metadataKey] = metadata[field.metadataKey];
    }
  return result;
}
export const MOMENT_ICONS: PluginManifest = validatePluginManifest({
  apiVersion: 1,
  id: 'moment-icons',
  version: 2,
  name: 'Moment icons',
  description:
    'Show a circular image on each moment, enlarge it on hover, and edit its image URL in the details panel.',
  fields: [{ kind: 'image-url', metadataKey: 'iconUrl', label: 'Moment icon URL' }],
  marker: { kind: 'image', metadataKey: 'iconUrl' },
  source: 'function render(moment: string, api: PluginAPI): string { return api.icon("iconUrl"); }',
});
export interface StackEntry {
  id: string;
  metadata: Record<string, unknown>;
}
export function stackEntries(
  value: unknown,
  stackKeys: readonly string[] = ['stack'],
): StackEntry[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new Error('A moment stack must be an array.');
  const ids = new Set<string>();
  return value.map((raw) => {
    const entry = object(raw, ['id', 'metadata']);
    if (
      typeof entry.id !== 'string' ||
      !/^[A-Za-z0-9_.:-]{1,128}$/.test(entry.id) ||
      ids.has(entry.id)
    )
      throw new Error('Stack entry IDs must be unique ASCII identifiers.');
    ids.add(entry.id);
    const metadata = entry.metadata;
    if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata))
      throw new Error('Stack entry metadata must be an object.');
    const copy = JSON.parse(JSON.stringify(metadata)) as Record<string, unknown>;
    for (const field of ['title', 'description'])
      if (copy[field] !== undefined && typeof copy[field] !== 'string')
        throw new Error('Stack titles and notes must be text.');
    if (['stack', ...stackKeys].some((key) => Object.hasOwn(copy, key)))
      throw new Error('Stack entries cannot contain another stack.');
    return { id: entry.id, metadata: copy };
  });
}
export function validateStackMetadata(
  metadata: Record<string, unknown>,
  plugins: readonly InstalledPlugin[] = [],
) {
  const keys = [
    ...new Set([
      'stack',
      ...plugins.flatMap((p) =>
        p.manifest.fields.filter((f) => f.kind === 'stack').map((f) => f.metadataKey),
      ),
    ]),
  ];
  for (const key of keys) if (Object.hasOwn(metadata, key)) stackEntries(metadata[key], keys);
}
export const MOMENT_STACKS: PluginManifest = validatePluginManifest({
  apiVersion: 1,
  id: 'moment-stacks',
  version: 2,
  name: 'Moment stacks',
  description:
    'Keep ordered entries inside a moment, sharing its time and the timeline’s other metadata plugins. Stacks cannot be nested.',
  fields: [{ kind: 'stack', metadataKey: 'stack', label: 'Moment stack' }],
  source: 'function render(moment: string, api: PluginAPI): string { return api.none(); }',
});
export const COLOR_SWATCHES = [
  { name: 'Default', value: '' },
  { name: 'Good', value: '#5f8b67' },
  { name: 'Warning', value: '#d6ad4c' },
  { name: 'Bad', value: '#bc6663' },
  { name: 'Information', value: '#7aadc4' },
  { name: 'Disabled', value: '#9aa49f' },
  { name: 'Important', value: '#9a82b3' },
  { name: 'In progress', value: '#c89360' },
] as const;
export function colorValue(value: unknown): string | null {
  return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value) ? value.toLowerCase() : null;
}
export function pluginColor(
  plugins: readonly InstalledPlugin[] = [],
  metadata: Record<string, unknown> = {},
): string | null {
  let color: string | null = null;
  for (const { manifest, enabled } of plugins)
    if (enabled && manifest.marker?.kind === 'color') {
      const candidate = colorValue(metadata[manifest.marker.metadataKey]);
      if (candidate) color = candidate;
    }
  return scriptEffects(plugins, metadata).color ?? color;
}
export const MOMENT_COLORS: PluginManifest = validatePluginManifest({
  apiVersion: 1,
  id: 'moment-colors',
  version: 2,
  name: 'Moment colors',
  description:
    'Choose muted semantic swatches or a custom color for moments and stack entries while preserving their white borders.',
  fields: [{ kind: 'color', metadataKey: 'color', label: 'Moment color' }],
  marker: { kind: 'color', metadataKey: 'color' },
  source:
    'function render(moment: string, api: PluginAPI): string { return api.color(api.get("color")); }',
});
export const RICH_TEXT_NOTES: PluginManifest = validatePluginManifest({
  apiVersion: 1,
  id: 'rich-text-notes',
  version: 1,
  name: 'Rich text notes',
  description:
    'Edit moment and stack notes visually, storing portable Markdown. Hover cards render safe headings, emphasis, lists, code and HTTPS links. HTML and images are not executed.',
  fields: [],
  notes: { kind: 'markdown' },
  source: 'function render(moment: string, api: PluginAPI): string { return api.none(); }',
});
export function pluginRichText(plugins: readonly InstalledPlugin[] = []) {
  return plugins.some((p) => p.enabled && p.manifest.notes?.kind === 'markdown');
}
export const FOCUS_ON_HOVER: PluginManifest = validatePluginManifest({
  apiVersion: 1,
  id: 'focus-on-hover',
  version: 2,
  name: 'Focus on hover',
  description:
    'Expand moments into a card with their title, the first lines of notes, and any icon image. Also works on stack entries.',
  fields: [],
  hover: { kind: 'card' },
  source: 'function render(moment: string, api: PluginAPI): string { return api.card(); }',
});
export function pluginFocus(
  plugins: readonly InstalledPlugin[] = [],
  metadata: Record<string, unknown> = {},
) {
  return (
    scriptEffects(plugins, metadata).card ??
    plugins.some((p) => p.enabled && p.manifest.hover?.kind === 'card')
  );
}
export const EXPAND_ON_HOVER: PluginManifest = validatePluginManifest({
  apiVersion: 1,
  id: 'expand-on-hover',
  version: 1,
  name: 'Expand on hover',
  description:
    'Hover or focus a summary of two to five moments to fan out its members radially for individual inspection. Larger summaries stay collapsed.',
  fields: [],
  summary: { kind: 'radial' },
  source: 'function render(moment: string, api: PluginAPI): string { return api.expand(); }',
});
export function pluginExpand(plugins: readonly InstalledPlugin[] = []) {
  return (
    scriptEffects(plugins, {}).expand ??
    plugins.some((p) => p.enabled && p.manifest.summary?.kind === 'radial')
  );
}
const LEGACY_MOMENT_SHAPES: PluginManifest = validatePluginManifest({
  apiVersion: 1,
  id: 'moment-shapes',
  version: 1,
  name: 'Moment shapes',
  description:
    'Choose geometric and flowchart symbols for moments and stack entries: decisions, processes, documents and more.',
  fields: [{ kind: 'shape', metadataKey: 'shape', label: 'Moment shape' }],
  marker: { kind: 'shape', metadataKey: 'shape' },
  source:
    'function render(moment: string, api: PluginAPI): string { return api.shape(api.get("shape")); }',
});
export const MOMENT_SHAPES = validatePluginManifest({
  ...LEGACY_MOMENT_SHAPES,
  version: 2,
  fields: [
    ...LEGACY_MOMENT_SHAPES.fields,
    { kind: 'size', metadataKey: 'shapeSize', label: 'Moment size' },
  ],
  source:
    'function render(moment: string, api: PluginAPI): string { return api.merge(api.shape(api.get("shape")), api.size(api.get("shapeSize"))); }',
});
export const PLUGIN_EXAMPLE = {
  apiVersion: 1,
  id: 'status-symbols',
  version: 1,
  name: 'Status symbols',
  description: 'A scripted status field controls the moment shape and color.',
  fields: [{ kind: 'text', metadataKey: 'status', label: 'Status' }],
  source:
    'function render(moment: string, api: PluginAPI): string { const status = api.lower(api.get("status")); return status === "blocked" ? api.merge(api.shape("diamond"), api.color("#bc6663")) : api.merge(api.shape("circle"), api.color("#5f8b67")); }',
};
// Keep previously published declarative versions available at their original detail URLs.
const LEGACY_PLUGINS = [MOMENT_ICONS, MOMENT_STACKS, MOMENT_COLORS, FOCUS_ON_HOVER].map(
  ({ source, ...manifest }) => validatePluginManifest({ ...manifest, version: 1 }),
);
export const BUILTIN_PLUGINS: readonly PluginManifest[] = [
  ...LEGACY_PLUGINS,
  LEGACY_MOMENT_SHAPES,
  MOMENT_ICONS,
  MOMENT_STACKS,
  MOMENT_COLORS,
  FOCUS_ON_HOVER,
  MOMENT_SHAPES,
  MOMENT_SOURCES,
  DATING_CONTEXT,
  HISTORICAL_DATES,
  GEOLOGICAL_AGES,
  RICH_TEXT_NOTES,
  EXPAND_ON_HOVER,
];

export function isOfficialPlugin(manifest: PluginManifest): boolean {
  return BUILTIN_PLUGINS.some((official) => JSON.stringify(official) === JSON.stringify(manifest));
}
