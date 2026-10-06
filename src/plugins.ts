/** Versioned, declarative UI capabilities. Manifests are data, never executable code. */
export interface PluginField {
  kind: 'text' | 'multiline' | 'image-url' | 'stack' | 'color';
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
  marker?: { kind: 'image' | 'color'; metadataKey: string };
}
export interface InstalledPlugin {
  manifest: PluginManifest;
  enabled: boolean;
}
const reserved = new Set(['title', 'description', '__proto__', 'prototype', 'constructor']);
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
    if (!['text', 'multiline', 'image-url', 'stack', 'color'].includes(f.kind as string))
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
    if (m.kind !== 'image' && m.kind !== 'color') throw new Error('Unsupported marker component.');
    result.marker = { kind: m.kind, metadataKey: key(m.metadataKey) };
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
  return image;
}
export function pluginMetadata(
  plugins: readonly InstalledPlugin[] = [],
  metadata: Record<string, unknown> = {},
) {
  const result: Record<string, unknown> = {};
  for (const { manifest, enabled } of plugins)
    if (enabled) {
      for (const name of [
        ...manifest.fields.map((f) => f.metadataKey),
        ...(manifest.marker ? [manifest.marker.metadataKey] : []),
      ])
        if (typeof metadata[name] === 'string')
          result[name] = (metadata[name] as string).slice(0, 10000);
      for (const field of manifest.fields)
        if (field.kind === 'stack' && Array.isArray(metadata[field.metadataKey]))
          result[field.metadataKey] = metadata[field.metadataKey];
    }
  return result;
}
export const MOMENT_ICONS: PluginManifest = validatePluginManifest({
  apiVersion: 1,
  id: 'moment-icons',
  version: 1,
  name: 'Moment icons',
  description:
    'Show a circular image on each moment, enlarge it on hover, and edit its image URL in the details panel.',
  fields: [{ kind: 'image-url', metadataKey: 'iconUrl', label: 'Moment icon URL' }],
  marker: { kind: 'image', metadataKey: 'iconUrl' },
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
  version: 1,
  name: 'Moment stacks',
  description:
    'Keep ordered entries inside a moment, sharing its time and the timeline’s other metadata plugins. Stacks cannot be nested.',
  fields: [{ kind: 'stack', metadataKey: 'stack', label: 'Moment stack' }],
});
export const COLOR_SWATCHES = [
  { name: 'Default', value: '' },
  { name: 'Good', value: '#35804b' },
  { name: 'Warning', value: '#d4a319' },
  { name: 'Bad', value: '#cb4545' },
  { name: 'Information', value: '#69b7dd' },
  { name: 'Disabled', value: '#92999d' },
  { name: 'Important', value: '#9366c0' },
  { name: 'In progress', value: '#dc8b36' },
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
  return color;
}
export const MOMENT_COLORS: PluginManifest = validatePluginManifest({
  apiVersion: 1,
  id: 'moment-colors',
  version: 1,
  name: 'Moment colors',
  description:
    'Choose semantic color swatches or a custom color for moments and stack entries. Color also outlines icon markers.',
  fields: [{ kind: 'color', metadataKey: 'color', label: 'Moment color' }],
  marker: { kind: 'color', metadataKey: 'color' },
});
export const BUILTIN_PLUGINS: readonly PluginManifest[] = [
  MOMENT_ICONS,
  MOMENT_STACKS,
  MOMENT_COLORS,
];
