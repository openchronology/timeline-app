// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// Plugins (docs/plugins.md): manifests of the fields moments and durations carry (images, stacks,
// colors, shapes, headings and more), their validation, the built-in plugins and the library,
// and reading each field's value.
import { compilePluginScript } from './custom-time.js';
import { contentLabels, CONTENT_LABELS_KEY } from './content-labels.js';
/** Versioned host components and optional source interpreted by our bounded language. */
export interface PluginField {
  kind:
    | 'text'
    | 'multiline'
    | 'image-url'
    | 'stack'
    | 'color'
    | 'shape'
    | 'size'
    | 'links'
    | 'heading'
    | 'font'
    | 'toggle';
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
  marker?: {
    kind: 'image' | 'color' | 'shape' | 'size' | 'heading' | 'outline';
    metadataKey: string;
  };
  hover?: { kind: 'card' };
  summary?: { kind: 'radial' };
  notes?: { kind: 'markdown' };
  /** An image behind the timeline where a duration lies (durations only). */
  background?: { kind: 'image'; metadataKey: string };
  /**
   * Settings of the whole timeline, set in the plugin list rather than on its moments and
   * durations (#223), such as the address of the timeline's background image.
   */
  settings?: PluginSetting[];
  /** An image behind the whole timeline, beneath durations' backgrounds: a setting's value. */
  backdrop?: { kind: 'image'; setting: string };
  /** The timeline's colors and fonts (#230): each theme role's setting, by role. */
  theme?: PluginTheme;
  /** Entities the plugin applies to; omitted means moments, plus durations for colors/cards. */
  targets?: PluginTarget[];
  /** Metadata computed in the browser for the plugins to read, never saved (#122). */
  derive?: PluginDerivation[];
  source?: string;
}
export type PluginTarget = 'moments' | 'durations';
/**
 * A timeline-wide plugin setting: the HTTPS address of an image, a color, a font family, or a
 * text size (a percentage of the usual size, #267).
 */
export interface PluginSetting {
  kind: 'image-url' | 'color' | 'font' | 'text-size';
  key: string;
  label: string;
}
/**
 * What a theme can set on the timeline (#230): label text and the measure (axis, tick marks
 * and their times) each a color, a font and a size (#267), the halo's color, the default
 * marker and duration colors, and the background color.
 */
export const THEME_ROLES = [
  'text',
  'textFont',
  'textSize',
  'measure',
  'measureFont',
  'measureSize',
  'halo',
  'marker',
  'duration',
  'background',
] as const;
export type ThemeRole = (typeof THEME_ROLES)[number];
export type PluginTheme = Partial<Record<ThemeRole, string>>;
const themeKind = (role: ThemeRole): PluginSetting['kind'] =>
  role.endsWith('Font') ? 'font' : role.endsWith('Size') ? 'text-size' : 'color';
/** Where a derived value is read: a tag's value (`severity` reads `severity:err`), or a path. */
export type DerivationSource = { tag: string } | { path: string };
/**
 * A value derived from a moment's or duration's metadata (#122): the first source that has
 * one, through the map when given (sources whose value it doesn't map are passed over), set
 * as `metadataKey` where the entity has no value there already.
 */
export interface PluginDerivation {
  metadataKey: string;
  from: DerivationSource[];
  map?: Record<string, string>;
}
export interface InstalledPlugin {
  manifest: PluginManifest;
  enabled: boolean;
  /** Values of the manifest's timeline-wide `settings`, by key (#223). */
  settings?: Record<string, string>;
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
/**
 * How a marker or duration band is outlined (#325): `solid`, the usual look, or `dashed`, as
 * charts draw presumptive (unconfirmed) events and conditions.
 */
export const OUTLINE_STYLES = ['solid', 'dashed'] as const;
export type OutlineStyle = (typeof OUTLINE_STYLES)[number];
export function outlineValue(value: unknown): OutlineStyle | null {
  return typeof value === 'string' && (OUTLINE_STYLES as readonly string[]).includes(value)
    ? (value as OutlineStyle)
    : null;
}
/**
 * A toggle field's value (#325): on when the metadata holds `true` (or the text `"true"`, as
 * hand-written metadata might), off for anything else, missing or not. Its editor stores
 * `true` and removes the key when switched off.
 */
export function toggleValue(value: unknown): boolean {
  return value === true || value === 'true';
}
/** Heading levels a moment can take (#110): shown as its title alone, sized by level. */
export const HEADING_LEVELS = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'] as const;
export type HeadingLevel = (typeof HEADING_LEVELS)[number];
export function headingValue(value: unknown): HeadingLevel | null {
  return typeof value === 'string' && (HEADING_LEVELS as readonly string[]).includes(value)
    ? (value as HeadingLevel)
    : null;
}
/** Heading fonts offered by name; any installed family can be entered too. */
export const HEADING_FONTS = [
  { label: 'Times New Roman (serif)', value: '"Times New Roman", Times, serif' },
  { label: 'Georgia', value: 'Georgia, serif' },
  { label: 'Garamond', value: 'Garamond, "EB Garamond", serif' },
  { label: 'Palatino', value: 'Palatino, "Palatino Linotype", "Book Antiqua", serif' },
  { label: 'Helvetica (sans-serif)', value: 'Helvetica, Arial, sans-serif' },
  { label: 'System interface', value: 'system-ui, sans-serif' },
  { label: 'Courier (monospace)', value: '"Courier New", Courier, monospace' },
  { label: 'Cursive', value: 'cursive' },
] as const;
export const DEFAULT_HEADING_FONT = HEADING_FONTS[0].value;
/**
 * A CSS font family list: names of installed fonts, optionally quoted, separated by commas.
 * Nothing else (no URLs, functions or other properties), and no web font is downloaded.
 */
/** The text sizes a theme can choose (#267), as percentages of the usual size. */
export const TEXT_SIZE = { min: 50, max: 200 } as const;
/**
 * A text size as saved: a whole percentage of the usual size, from TEXT_SIZE.min to .max, as
 * a string ("125"); a number or a string with a trailing "%" is accepted. Anything else is
 * null.
 */
export function textSizeValue(value: unknown): string | null {
  const text = typeof value === 'number' ? String(value) : typeof value === 'string' ? value : '';
  const match = /^\s*(\d{1,3})\s*%?\s*$/.exec(text);
  if (!match) return null;
  const percent = Number(match[1]);
  return percent >= TEXT_SIZE.min && percent <= TEXT_SIZE.max ? String(percent) : null;
}
export function fontValue(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  if (!text || text.length > 200) return null;
  const family = /^(?:"[A-Za-z0-9 _-]{1,60}"|'[A-Za-z0-9 _-]{1,60}'|[A-Za-z][A-Za-z0-9 _-]{0,59})$/;
  return text.split(',').every((part) => family.test(part.trim())) ? text : null;
}
type Effects = {
  size?: MomentSize;
  shape?: MomentShape;
  color?: string;
  icon?: string;
  card?: boolean;
  expand?: boolean;
  heading?: { level: HeadingLevel; font: string };
  outline?: OutlineStyle;
};
/** The text at a source: a tag's value, or a text, number or true/false at a path. */
function sourceValue(source: DerivationSource, metadata: Record<string, unknown>): string | null {
  if ('tag' in source) {
    const prefix = source.tag + ':';
    const tags = Array.isArray(metadata.tags) ? metadata.tags : [];
    const found = tags.find(
      (t): t is string => typeof t === 'string' && t.startsWith(prefix) && t.length > prefix.length,
    );
    return found ? found.slice(prefix.length) : null;
  }
  let value: unknown = metadata;
  for (const part of source.path.split('.')) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    value = Object.hasOwn(value, part) ? (value as Record<string, unknown>)[part] : undefined;
  }
  return typeof value === 'string'
    ? value.slice(0, 2048)
    : typeof value === 'number' || typeof value === 'boolean'
      ? String(value)
      : null;
}
function derivedValue(rule: PluginDerivation, metadata: Record<string, unknown>): string | null {
  for (const source of rule.from) {
    const value = sourceValue(source, metadata);
    if (value === null) continue;
    if (!rule.map) return value;
    if (Object.hasOwn(rule.map, value)) return rule.map[value];
  }
  return null;
}
/**
 * Metadata as the enabled plugins see it (#122): the entity's own, with each derivation of
 * each plugin applied in order. A derivation sets its key only where nothing has, the entity
 * or an earlier derivation, so a color chosen for a moment still wins, and a later
 * derivation can read what an earlier one set. It is computed wherever the metadata is
 * drawn and never saved. Without derivations, the metadata itself.
 */
export function derivedMetadata(
  plugins: readonly InstalledPlugin[] = [],
  metadata: Record<string, unknown> = {},
): Record<string, unknown> {
  let view: Record<string, unknown> | null = null;
  for (const { manifest, enabled } of plugins)
    if (enabled && manifest.derive)
      for (const rule of manifest.derive) {
        const current: Record<string, unknown> = view ?? metadata;
        if (current[rule.metadataKey] !== undefined) continue;
        const value = derivedValue(rule, current);
        if (value === null) continue;
        view = { ...current, [rule.metadataKey]: value };
      }
  return view ?? metadata;
}
/** The top-level metadata keys a plugin's derivations read and set. */
export function derivationKeys(manifest: PluginManifest): string[] {
  const keys = new Set<string>();
  for (const rule of manifest.derive ?? []) {
    keys.add(rule.metadataKey);
    for (const source of rule.from) keys.add('tag' in source ? 'tags' : source.path.split('.')[0]);
  }
  return [...keys];
}
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
            !manifest.derive?.some((d) => d.metadataKey === key) &&
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
        case 'outline': {
          const outline = outlineValue(text());
          return JSON.stringify(outline ? { outline } : {});
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
        (k) => !['shape', 'size', 'color', 'icon', 'card', 'expand', 'outline'].includes(k),
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
    if (raw.outline !== undefined) {
      const outline = outlineValue(raw.outline);
      if (!outline) throw new Error('Invalid outline.');
      effects.outline = outline;
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
  stored: Record<string, unknown>,
): Effects {
  const metadata = derivedMetadata(plugins, stored);
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
      if (manifest.marker?.kind === 'outline' && toggleValue(metadata[manifest.marker.metadataKey]))
        effects.outline = 'dashed';
      if (manifest.marker?.kind === 'image') {
        const icon = imageURL(metadata[manifest.marker.metadataKey]);
        if (icon) effects.icon = icon;
      }
      if (manifest.marker?.kind === 'heading') {
        const level = headingValue(metadata[manifest.marker.metadataKey]);
        const font = manifest.fields.find((f) => f.kind === 'font');
        if (level)
          effects.heading = {
            level,
            font: (font && fontValue(metadata[font.metadataKey])) || DEFAULT_HEADING_FONT,
          };
      }
      if (manifest.hover) effects.card = true;
      Object.assign(effects, manifestEffects(manifest, metadata));
    }
  return effects;
}
/** A moment shown as a heading: its level and font, or null for an ordinary moment. */
export function pluginHeading(
  plugins: readonly InstalledPlugin[] = [],
  metadata: Record<string, unknown> = {},
): { level: HeadingLevel; font: string } | null {
  return scriptEffects(plugins, metadata).heading ?? null;
}
export function pluginShape(
  plugins: readonly InstalledPlugin[] = [],
  metadata: Record<string, unknown> = {},
): MomentShape {
  return scriptEffects(plugins, metadata).shape ?? 'circle';
}
/**
 * How a moment, stack entry or duration is outlined (#325): dashed where an enabled outline
 * marker's toggle is on or a script asks for it, otherwise solid. Later plugins win.
 */
export function pluginOutline(
  plugins: readonly InstalledPlugin[] = [],
  metadata: Record<string, unknown> = {},
): OutlineStyle {
  return scriptEffects(plugins, metadata).outline ?? 'solid';
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
  'tags',
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
/**
 * Derivations as a manifest declares them: one to eight, each of one to 16 sources and a
 * map of at most 64 values. Paths are one to four metadata keys joined by dots; tags are as
 * tags are stored (lowercase), without the colon.
 */
function derivations(value: unknown): PluginDerivation[] {
  if (!Array.isArray(value) || !value.length || value.length > 8)
    throw new Error('A plugin derives one to eight values.');
  return value.map((raw) => {
    const d = object(raw, ['metadataKey', 'from', 'map']);
    if (!Array.isArray(d.from) || !d.from.length || d.from.length > 16)
      throw new Error('A derived value has one to 16 sources.');
    const from = d.from.map((rawSource): DerivationSource => {
      const source = object(rawSource, ['tag', 'path']);
      if (Object.keys(source).length !== 1) throw new Error('A source is a tag or a path.');
      if (source.tag !== undefined) {
        if (
          typeof source.tag !== 'string' ||
          !/^[^\x00-\x1f\x7f,:A-Z]{1,63}$/.test(source.tag) ||
          source.tag.trim() !== source.tag
        )
          throw new Error('A source tag is a lowercase tag name without its colon.');
        return { tag: source.tag };
      }
      if (typeof source.path !== 'string' || !source.path) throw new Error('Invalid source path.');
      const parts = source.path.split('.');
      if (
        parts.length > 4 ||
        parts.some(
          (part) =>
            !/^[A-Za-z0-9_-]{1,64}$/.test(part) ||
            ['__proto__', 'prototype', 'constructor'].includes(part),
        )
      )
        throw new Error('A source path is one to four metadata keys joined by dots.');
      return { path: source.path };
    });
    const rule: PluginDerivation = { metadataKey: key(d.metadataKey), from };
    if (d.map !== undefined) {
      if (!d.map || typeof d.map !== 'object' || Array.isArray(d.map))
        throw new Error('A derivation map is an object of text values.');
      const entries = Object.entries(d.map as Record<string, unknown>);
      if (
        entries.length > 64 ||
        entries.some(
          ([from, to]) =>
            !from ||
            from.length > 128 ||
            ['__proto__', 'prototype', 'constructor'].includes(from) ||
            typeof to !== 'string' ||
            to.length > 256,
        )
      )
        throw new Error('A derivation maps at most 64 values of at most 256 characters.');
      rule.map = Object.fromEntries(entries) as Record<string, string>;
    }
    return rule;
  });
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
    'background',
    'settings',
    'backdrop',
    'theme',
    'targets',
    'derive',
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
      ![
        'text',
        'multiline',
        'image-url',
        'stack',
        'color',
        'shape',
        'size',
        'links',
        'heading',
        'font',
        'toggle',
      ].includes(f.kind as string)
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
    if (!['image', 'color', 'shape', 'heading', 'outline'].includes(m.kind as string))
      throw new Error('Unsupported marker component.');
    result.marker = {
      kind: m.kind as NonNullable<PluginManifest['marker']>['kind'],
      metadataKey: key(m.metadataKey),
    };
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
  if (p.background !== undefined) {
    const background = object(p.background, ['kind', 'metadataKey']);
    if (background.kind !== 'image') throw new Error('Unsupported background component.');
    result.background = { kind: 'image', metadataKey: key(background.metadataKey) };
  }
  if (p.settings !== undefined) {
    if (!Array.isArray(p.settings) || !p.settings.length || p.settings.length > 12)
      throw new Error('A plugin has one to twelve timeline settings.');
    const settingKeys = new Set<string>();
    result.settings = p.settings.map((value) => {
      const setting = object(value, ['kind', 'key', 'label']);
      if (typeof setting.kind !== 'string' || !Object.hasOwn(SETTING_VALUES, setting.kind))
        throw new Error('Unsupported plugin setting.');
      const settingKey = key(setting.key);
      if (settingKeys.has(settingKey)) throw new Error('Duplicate plugin setting.');
      settingKeys.add(settingKey);
      return {
        kind: setting.kind as PluginSetting['kind'],
        key: settingKey,
        label: text(setting.label, 100),
      };
    });
  }
  if (p.backdrop !== undefined) {
    const backdrop = object(p.backdrop, ['kind', 'setting']);
    if (
      backdrop.kind !== 'image' ||
      !result.settings?.some((s) => s.key === backdrop.setting && s.kind === 'image-url')
    )
      throw new Error("A timeline background reads one of its plugin's image settings.");
    result.backdrop = { kind: 'image', setting: backdrop.setting as string };
  }
  if (p.theme !== undefined) {
    const theme = object(p.theme, [...THEME_ROLES]);
    const roles = THEME_ROLES.filter((role) => theme[role] !== undefined);
    if (!roles.length)
      throw new Error("A theme sets at least one of the timeline's colors, fonts or sizes.");
    result.theme = {};
    for (const role of roles) {
      if (!result.settings?.some((s) => s.key === theme[role] && s.kind === themeKind(role)))
        throw new Error(`A theme's ${role} reads one of its plugin's ${themeKind(role)} settings.`);
      result.theme[role] = theme[role] as string;
    }
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
  if (p.derive !== undefined) result.derive = derivations(p.derive);
  // The script is only checked here to be text of at most 16 KiB. It is compiled before it
  // runs, in the browser; the server compiles scripts it is given only in a sandbox (#157,
  // server/plugin-sandbox.mjs), and never runs them.
  if (p.source !== undefined) result.source = text(p.source, 16384);
  return result;
}
/**
 * Refuses a plugin whose script does not compile, with the compiler's message. The browser
 * checks plugins it publishes or installs; the server never calls this outside its sandbox.
 */
export function checkPluginScript(manifest: PluginManifest) {
  if (manifest.source !== undefined) compilePluginScript(manifest.source);
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
    const entry = object(raw, ['manifest', 'enabled', 'settings']);
    const manifest = validatePluginManifest(entry.manifest);
    if (typeof entry.enabled !== 'boolean' || ids.has(manifest.id))
      throw new Error('Invalid or duplicate installed plugin.');
    ids.add(manifest.id);
    const settings = pluginSettings(manifest, entry.settings);
    return { manifest, enabled: entry.enabled, ...(settings ? { settings } : {}) };
  });
}
/** Each kind of timeline setting's value, and what to say of one that isn't. */
const SETTING_VALUES: Record<
  PluginSetting['kind'],
  { value: (given: unknown) => string | null; expected: string }
> = {
  'image-url': { value: (given) => imageURL(given), expected: 'enter an HTTPS image address.' },
  color: { value: (given) => colorValue(given), expected: 'enter a color such as #1f3a5f.' },
  font: { value: (given) => fontValue(given), expected: 'use font names separated by commas.' },
  'text-size': {
    value: (given) => textSizeValue(given),
    expected: `choose a size from ${TEXT_SIZE.min}% to ${TEXT_SIZE.max}%.`,
  },
};
/** A timeline setting's value as saved, or null when it isn't one of its kind. */
export function settingValue(setting: PluginSetting, given: unknown): string | null {
  return SETTING_VALUES[setting.kind].value(given);
}
/**
 * An installed plugin's timeline settings (#223): the values of the settings its manifest
 * declares, each an HTTPS image address, a color or a font family list by its kind. Values for
 * settings it no longer declares (after an update, say) are dropped; empty ones are left out.
 * Nothing set gives undefined.
 */
function pluginSettings(manifest: PluginManifest, value: unknown) {
  if (value === undefined) return undefined;
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Plugin settings must be an object.');
  const settings: Record<string, string> = {};
  for (const setting of manifest.settings ?? []) {
    const given = (value as Record<string, unknown>)[setting.key];
    if (given === undefined || given === '') continue;
    const valid = settingValue(setting, given);
    if (!valid) throw new Error(`${setting.label}: ${SETTING_VALUES[setting.kind].expected}`);
    settings[setting.key] = valid;
  }
  return Object.keys(settings).length ? settings : undefined;
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
 * Colors, outlines and hover cards apply to durations by default, and backgrounds only to
 * them; stacks, shapes, sizes, icons and summary expansion are moment-only. Older saved
 * manifests have no targets and follow this.
 */
export function pluginTargets(manifest: PluginManifest): PluginTarget[] {
  return (
    manifest.targets ??
    (manifest.background
      ? ['durations']
      : manifest.marker?.kind === 'color' || manifest.marker?.kind === 'outline' || manifest.hover
        ? ['moments', 'durations']
        : ['moments'])
  );
}
const DURATION_FIELDS = new Set<PluginField['kind']>([
  'text',
  'multiline',
  'color',
  'links',
  'image-url',
  'toggle',
]);
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
          ...(marker?.kind === 'color' || marker?.kind === 'outline' ? { marker } : {}),
        },
      };
    });
}
/**
 * A duration's background image: the last enabled background plugin's valid image URL. Bands
 * carry string metadata of at most 256 characters, so a longer URL shows no background.
 */
/**
 * The timeline's theme (#230): for each role, the last enabled theme plugin's value that is
 * set. Roles none sets keep the default look.
 */
export function pluginTheme(plugins: readonly InstalledPlugin[] = []): PluginTheme {
  const theme: PluginTheme = {};
  for (const { manifest, enabled, settings } of plugins)
    if (enabled && manifest.theme)
      for (const role of THEME_ROLES) {
        const key = manifest.theme[role],
          setting = manifest.settings?.find((s) => s.key === key);
        const value = setting && settingValue(setting, settings?.[setting.key]);
        if (value) theme[role] = value;
      }
  return theme;
}
/** The image behind the whole timeline (#223): the last enabled plugin's that has one set. */
export function pluginBackdrop(plugins: readonly InstalledPlugin[] = []): string | null {
  let image: string | null = null;
  for (const { manifest, enabled, settings } of plugins)
    if (enabled && manifest.backdrop) {
      const candidate = imageURL(settings?.[manifest.backdrop.setting]);
      if (candidate) image = candidate;
    }
  return image;
}
export function pluginBackground(
  plugins: readonly InstalledPlugin[] = [],
  stored: Record<string, unknown> = {},
): string | null {
  const metadata = derivedMetadata(plugins, stored);
  let image: string | null = null;
  for (const { manifest, enabled } of plugins)
    if (enabled && manifest.background) {
      const candidate = imageURL(metadata[manifest.background.metadataKey]);
      if (candidate) image = candidate;
    }
  return image;
}
/** The longest background URL a duration band carries (see durationOverview). */
export const BACKGROUND_URL_LIMIT = 256;
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
  stored: Record<string, unknown> = {},
): string | null {
  const metadata = derivedMetadata(plugins, stored);
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
        ...(manifest.background ? [manifest.background.metadataKey] : []),
      ])
        if (typeof metadata[name] === 'string')
          result[name] = (metadata[name] as string).slice(0, 10000);
        else if (metadata[name] === true) result[name] = true; // A toggle that is on (#325).
      for (const field of manifest.fields)
        if (
          (field.kind === 'stack' || field.kind === 'links') &&
          Array.isArray(metadata[field.metadataKey])
        )
          result[field.metadataKey] = metadata[field.metadataKey];
      // What its derivations read (#122), so the browser derives the same from an overview:
      // the keys they set, the tags they read and the values at their paths, nothing else.
      for (const rule of manifest.derive ?? []) {
        if (typeof metadata[rule.metadataKey] === 'string')
          result[rule.metadataKey] = (metadata[rule.metadataKey] as string).slice(0, 10000);
        for (const source of rule.from) projectSource(source, metadata, result);
      }
    }
  // Its sensitive-content labels (#115), so its images are blurred wherever they show.
  const labels = contentLabels(metadata[CONTENT_LABELS_KEY]);
  if (labels.length) result[CONTENT_LABELS_KEY] = labels;
  return result;
}
/** Copies what a derivation source reads into an overview's projection. */
function projectSource(
  source: DerivationSource,
  metadata: Record<string, unknown>,
  result: Record<string, unknown>,
) {
  if ('tag' in source) {
    const prefix = source.tag + ':';
    const tags = (Array.isArray(metadata.tags) ? metadata.tags : []).filter(
      (t): t is string => typeof t === 'string' && t.startsWith(prefix),
    );
    if (tags.length)
      result.tags = [...new Set([...((result.tags as string[] | undefined) ?? []), ...tags])];
    return;
  }
  const value = sourceValue(source, metadata);
  if (value === null) return;
  const parts = source.path.split('.');
  let target = result;
  for (const part of parts.slice(0, -1)) {
    const next = target[part];
    target = (target[part] =
      next && typeof next === 'object' && !Array.isArray(next) ? next : {}) as Record<
      string,
      unknown
    >;
  }
  target[parts.at(-1)!] = value.slice(0, 256);
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
/**
 * A stack's entries as the stack field reads them (#157): whatever metadata holds, reading
 * never throws. An entry is read when it is exactly an object of a unique ASCII ID and
 * metadata, whose title and notes (when given) are text and which holds no stack of its own;
 * any other entry, or a value that is not an array, is unreadable. Readers show what they
 * can; the details panel shows a stack with unreadable entries read-only, so editing never
 * drops them.
 */
export function readStack(
  value: unknown,
  stackKeys: readonly string[] = ['stack'],
): { entries: StackEntry[]; unreadable: number } {
  if (value === undefined) return { entries: [], unreadable: 0 };
  if (!Array.isArray(value)) return { entries: [], unreadable: 1 };
  const ids = new Set<string>();
  const entries: StackEntry[] = [];
  for (const raw of value) {
    try {
      const entry = stackEntry(raw, stackKeys);
      if (ids.has(entry.id)) throw new Error('Duplicate stack entry.');
      ids.add(entry.id);
      entries.push(entry);
    } catch {
      // Unreadable: counted below.
    }
  }
  return { entries, unreadable: value.length - entries.length };
}
/** The entries readStack can read. */
export function stackEntries(
  value: unknown,
  stackKeys: readonly string[] = ['stack'],
): StackEntry[] {
  return readStack(value, stackKeys).entries;
}
/** One stack entry, refused unless well formed: what the stack's editor writes. */
export function stackEntry(value: unknown, stackKeys: readonly string[] = ['stack']): StackEntry {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).some((key) => key !== 'id' && key !== 'metadata')
  )
    throw new Error('A stack entry is an ID and metadata.');
  const entry = value as Record<string, unknown>;
  if (typeof entry.id !== 'string' || !/^[A-Za-z0-9_.:-]{1,128}$/.test(entry.id))
    throw new Error('Stack entry IDs must be ASCII identifiers.');
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
  stored: Record<string, unknown> = {},
): string | null {
  const metadata = derivedMetadata(plugins, stored);
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
export const MOMENT_HEADINGS: PluginManifest = validatePluginManifest({
  apiVersion: 1,
  id: 'moment-headings',
  version: 1,
  name: 'Headings',
  description:
    'Let a moment act as a heading or marker: only its title shows, sized as a heading from level 1 to 6, and the title is what you click. Choose its font (Times New Roman by default). Headings still group into summaries with other moments.',
  fields: [
    { kind: 'heading', metadataKey: 'headingLevel', label: 'Heading level' },
    { kind: 'font', metadataKey: 'headingFont', label: 'Heading font' },
  ],
  marker: { kind: 'heading', metadataKey: 'headingLevel' },
  targets: ['moments'],
});
export const DURATION_BACKGROUNDS: PluginManifest = validatePluginManifest({
  apiVersion: 1,
  id: 'duration-backgrounds',
  version: 1,
  name: 'Duration backgrounds',
  description:
    'Show an image behind the timeline where a duration lies, centered between its visible start and end and filling the timeline. Smaller durations show above larger ones, and edges blend into each other.',
  fields: [{ kind: 'image-url', metadataKey: 'backgroundUrl', label: 'Background image URL' }],
  background: { kind: 'image', metadataKey: 'backgroundUrl' },
  targets: ['durations'],
});
export const TIMELINE_BACKGROUND: PluginManifest = validatePluginManifest({
  apiVersion: 1,
  id: 'timeline-background',
  version: 1,
  name: 'Timeline background',
  description:
    'Show one image behind the whole timeline, beneath any duration backgrounds. Set its address here in the plugin list: it belongs to the whole timeline, not to any one event.',
  fields: [],
  settings: [{ kind: 'image-url', key: 'imageUrl', label: 'Background image URL' }],
  backdrop: { kind: 'image', setting: 'imageUrl' },
});
/** The first Timeline theme (#230), with colors and fonts but no sizes; kept for its URL. */
const LEGACY_TIMELINE_THEME: PluginManifest = validatePluginManifest({
  apiVersion: 1,
  id: 'timeline-theme',
  version: 1,
  name: 'Timeline theme',
  description:
    "Choose the timeline's colors and fonts: its labels, its measure (the axis, tick marks and their times), the halo that keeps them readable over images, the default marker and duration colors, and a background color. Set them here in the plugin list; anything left blank keeps the usual look, and colors chosen for events still win.",
  fields: [],
  settings: [
    { kind: 'color', key: 'textColor', label: 'Label color' },
    { kind: 'font', key: 'textFont', label: 'Label font' },
    { kind: 'color', key: 'measureColor', label: 'Measure color' },
    { kind: 'font', key: 'measureFont', label: 'Measure font' },
    { kind: 'color', key: 'haloColor', label: 'Halo color' },
    { kind: 'color', key: 'markerColor', label: 'Marker color' },
    { kind: 'color', key: 'durationColor', label: 'Duration color' },
    { kind: 'color', key: 'backgroundColor', label: 'Background color' },
  ],
  theme: {
    text: 'textColor',
    textFont: 'textFont',
    measure: 'measureColor',
    measureFont: 'measureFont',
    halo: 'haloColor',
    marker: 'markerColor',
    duration: 'durationColor',
    background: 'backgroundColor',
  },
});
/** Timeline theme 2 (#267) adds the labels' and the measure's text sizes. */
export const TIMELINE_THEME: PluginManifest = validatePluginManifest({
  ...LEGACY_TIMELINE_THEME,
  version: 2,
  description:
    "Choose the timeline's colors, fonts and text sizes: its labels, its measure (the axis, tick marks and their times), the halo that keeps them readable over images, the default marker and duration colors, and a background color. Set them here in the plugin list; anything left blank keeps the usual look, and colors chosen for events still win.",
  settings: [
    { kind: 'color', key: 'textColor', label: 'Label color' },
    { kind: 'font', key: 'textFont', label: 'Label font' },
    { kind: 'text-size', key: 'textSize', label: 'Label size' },
    { kind: 'color', key: 'measureColor', label: 'Measure color' },
    { kind: 'font', key: 'measureFont', label: 'Measure font' },
    { kind: 'text-size', key: 'measureSize', label: 'Measure size' },
    { kind: 'color', key: 'haloColor', label: 'Halo color' },
    { kind: 'color', key: 'markerColor', label: 'Marker color' },
    { kind: 'color', key: 'durationColor', label: 'Duration color' },
    { kind: 'color', key: 'backgroundColor', label: 'Background color' },
  ],
  theme: {
    ...LEGACY_TIMELINE_THEME.theme,
    textSize: 'textSize',
    measureSize: 'measureSize',
  },
});
/**
 * Where log imports keep a severity (#122): the `severity:<level>` tag, and the severity in
 * each format's own metadata (server/log-formats.mjs), for formats that tag none (access logs)
 * or imports whose tags were changed.
 */
const SEVERITY_SOURCES: DerivationSource[] = [
  { tag: 'severity' },
  ...[
    'syslog',
    'journald',
    'jsonl',
    'apache-error',
    'nginx-error',
    'apache-common',
    'apache-combined',
    'nginx-combined',
  ].map((format) => ({ path: `${format}.severity` })),
];
export const LOG_SEVERITY_COLORS: PluginManifest = validatePluginManifest({
  apiVersion: 1,
  id: 'log-severity-colors',
  version: 1,
  name: 'Log severity colors',
  description:
    'Color imported log entries by severity, from any log format: debug gray, notice blue, warning yellow, errors red and anything more severe dark red; info keeps the default. A color chosen for an entry still wins, and nothing is saved: the colors are worked out as the timeline is drawn.',
  fields: [],
  derive: [
    {
      metadataKey: 'color',
      from: SEVERITY_SOURCES,
      map: {
        emerg: '#8f3f3c',
        alert: '#8f3f3c',
        crit: '#8f3f3c',
        err: '#bc6663',
        warning: '#d6ad4c',
        notice: '#7aadc4',
        debug: '#9aa49f',
      },
    },
  ],
  marker: { kind: 'color', metadataKey: 'color' },
});
/**
 * Presumptive outline (#325): marks moments, stack entries and durations as presumptive (not
 * yet confirmed by evidence), drawn with a dashed outline, as events and causal factors charts
 * draw presumptive events and conditions.
 */
export const PRESUMPTIVE_OUTLINE: PluginManifest = validatePluginManifest({
  apiVersion: 1,
  id: 'presumptive-outline',
  version: 1,
  name: 'Presumptive outline',
  description:
    'Mark moments, stack entries and durations as presumptive: not yet confirmed by evidence. They are drawn with a dashed outline, whatever their shape, color or icon, as events and causal factors charts draw presumptive events and conditions.',
  fields: [{ kind: 'toggle', metadataKey: 'presumptive', label: 'Presumptive (unconfirmed)' }],
  marker: { kind: 'outline', metadataKey: 'presumptive' },
  targets: ['moments', 'durations'],
});
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
  DURATION_BACKGROUNDS,
  TIMELINE_BACKGROUND,
  LEGACY_TIMELINE_THEME,
  TIMELINE_THEME,
  MOMENT_HEADINGS,
  LOG_SEVERITY_COLORS,
  PRESUMPTIVE_OUTLINE,
];

/** A page of a plugin library: the newest version of each plugin matching a search. */
export interface PluginLibraryPage {
  plugins: PluginManifest[];
  page: number;
  limit: number;
  total: number;
  pages: number;
  apiVersion: 1;
}
/**
 * Searches a fixed plugin library: the newest version of each plugin, in name order, whose
 * name, description or ID contains the search. The server's built-in library and apps with
 * no server (offline HTML, desktop) answer from the same definitions this way.
 */
export function searchPluginLibrary(
  manifests: readonly PluginManifest[],
  { search = '', page = 1, limit = 12 }: { search?: string; page?: number; limit?: number } = {},
): PluginLibraryPage {
  const latest = new Map<string, PluginManifest>();
  for (const p of manifests) {
    const known = latest.get(p.id);
    if (!known || known.version < p.version) latest.set(p.id, p);
  }
  const needle = search.trim().toLowerCase();
  const matching = [...latest.values()]
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : a.id.localeCompare(b.id)))
    .filter((p) => (p.name + ' ' + p.description + ' ' + p.id).toLowerCase().includes(needle));
  return {
    plugins: matching.slice((page - 1) * limit, page * limit),
    page,
    limit,
    total: matching.length,
    pages: Math.ceil(matching.length / limit),
    apiVersion: 1,
  };
}
export function isOfficialPlugin(manifest: PluginManifest): boolean {
  return BUILTIN_PLUGINS.some((official) => JSON.stringify(official) === JSON.stringify(manifest));
}
