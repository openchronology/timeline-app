// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
/**
 * Log entries as moments (docs/log-import.md): title, notes and tags from templates over the
 * entry's fields, metadata from a JSON template with typed values, a severity from a field
 * or text rules, an optional duration, and IDs derived from each entry's text, so that
 * importing the same log again overwrites its moments instead of adding them twice.
 */
import { createHash } from 'node:crypto';
import { Q, validateTags, validateDocument } from '../dist/core.mjs';
import { SEVERITIES } from './syslog.mjs';
import { epochSeconds, severityOf, typed, TYPES } from './log-formats.mjs';

const TITLE_LENGTH = 200,
  NOTES_LENGTH = 16384;
const RESERVED = ['title', 'description', 'tags'];

/** A field by name, or by dotted path into objects ("http.status"). */
function fieldValue(fields, name) {
  if (name in fields) return fields[name];
  let value = fields;
  for (const part of name.split('.')) value = value?.[part];
  return value;
}
const shown = (value) =>
  value === undefined || value === null
    ? ''
    : typeof value === 'string'
      ? value
      : JSON.stringify(value);
/**
 * A text template: "{field}" (or "{a.b}") is replaced by the field, "{{" and "}}" by braces.
 * Returns the text and whether every field it names had a value.
 */
export function compileTemplate(template, where = 'Template') {
  if (typeof template !== 'string') throw new Error(`${where} must be text.`);
  const parts = [];
  let i = 0;
  while (i < template.length) {
    if (template.startsWith('{{', i) || template.startsWith('}}', i)) {
      parts.push(template[i]);
      i += 2;
    } else if (template[i] === '{') {
      const end = template.indexOf('}', i);
      const name = end < 0 ? '' : template.slice(i + 1, end).trim();
      if (!/^[A-Za-z_@][A-Za-z0-9_.@-]{0,63}$/.test(name))
        throw new Error(`${where}: invalid field reference in "${template}".`);
      parts.push({ name });
      i = end + 1;
    } else {
      parts.push(template[i]);
      i++;
    }
  }
  return (fields) => {
    let complete = true;
    const text = parts
      .map((part) => {
        if (typeof part === 'string') return part;
        const value = shown(fieldValue(fields, part.name));
        if (!value) complete = false;
        return value;
      })
      .join('');
    return { text, complete };
  };
}

const empty = (value) =>
  value === null ||
  value === undefined ||
  value === '' ||
  (Array.isArray(value) && !value.length) ||
  (typeof value === 'object' && !Array.isArray(value) && !Object.keys(value).length);
/**
 * A metadata template: any JSON. Strings are text templates; objects with "$field" (a
 * field), "$template" (a text template) or "$const" (a constant) are values, converted by
 * an optional "type" (string, int, number, bool, json); other objects and arrays nest.
 * Empty values (null, "", [], {}) are dropped unless `keepEmpty`.
 */
export function compileValue(spec, where = 'Metadata', keepEmpty = false) {
  if (typeof spec === 'string') {
    const template = compileTemplate(spec, where);
    return (fields) => template(fields).text;
  }
  if (spec === null || typeof spec !== 'object') return () => spec;
  if (Array.isArray(spec)) {
    const items = spec.map((item, i) => compileValue(item, `${where}[${i}]`, keepEmpty));
    return (fields) => items.map((item) => item(fields)).filter((v) => keepEmpty || !empty(v));
  }
  const special = Object.keys(spec).filter((k) => k.startsWith('$'));
  if (special.length) {
    const extra = Object.keys(spec).filter(
      (k) => !['$field', '$template', '$const', 'type'].includes(k),
    );
    if (special.length !== 1 || extra.length)
      throw new Error(
        `${where}: use one of "$field", "$template" or "$const", with an optional "type".`,
      );
    if (spec.type !== undefined && !TYPES.includes(spec.type))
      throw new Error(`${where}: unknown type ${spec.type} (use ${TYPES.join(', ')}).`);
    if ('$const' in spec) return () => spec.$const;
    if ('$field' in spec) {
      if (typeof spec.$field !== 'string') throw new Error(`${where}: "$field" names a field.`);
      return (fields) => {
        const value = fieldValue(fields, spec.$field);
        return spec.type ? typed(value, spec.type) : (value ?? null);
      };
    }
    const template = compileTemplate(spec.$template, where);
    return (fields) => typed(template(fields).text, spec.type ?? 'string');
  }
  const members = Object.entries(spec).map(([key, value]) => [
    key,
    compileValue(value, `${where}.${key}`, keepEmpty),
  ]);
  return (fields) => {
    const result = {};
    for (const [key, member] of members) {
      const value = member(fields);
      if (keepEmpty || !empty(value)) result[key] = value;
    }
    return result;
  };
}

/** A tag from a template: lowercase, without commas or control characters, 1–64 long. */
const cleanTag = (text) =>
  text
    .normalize('NFC')
    .toLowerCase()
    .replace(/[\x00-\x1f\x7f,]/g, '_')
    .trim()
    .slice(0, 64)
    .trim();

/**
 * Severity rules for logs without levels: `{ contains | match, field?, severity }`, checked
 * in order against the message (or the named field); the first that matches applies.
 */
function compileSeverity(config = {}, where = 'Severity') {
  if (!config || typeof config !== 'object' || Array.isArray(config))
    throw new Error(`${where} must be an object.`);
  const check = (s) => {
    if (!SEVERITIES.includes(s)) throw new Error(`${where}: unknown severity ${s}.`);
    return s;
  };
  if (config.default !== undefined) check(config.default);
  const map = Object.fromEntries(
    Object.entries(config.map ?? {}).map(([k, v]) => [k.toLowerCase(), check(v)]),
  );
  const rules = (config.rules ?? []).map((rule, i) => {
    const at = `${where} rule ${i + 1}`;
    if (!rule || (rule.contains === undefined) === (rule.match === undefined))
      throw new Error(`${at}: use "contains" (text) or "match" (a regex), and "severity".`);
    check(rule.severity);
    let test;
    if (rule.match !== undefined) {
      let pattern;
      try {
        pattern = new RegExp(rule.match, 'i');
      } catch (error) {
        throw new Error(`${at}: invalid regex (${error.message}).`);
      }
      test = (text) => pattern.test(text);
    } else {
      const needle = String(rule.contains).toLowerCase();
      test = (text) => text.toLowerCase().includes(needle);
    }
    return { field: rule.field ?? 'message', test, severity: rule.severity };
  });
  return (fields, read) => {
    if (config.field) {
      const value = fieldValue(fields, config.field);
      const mapped =
        value === undefined || value === null ? null : map[String(value).toLowerCase()];
      const level = mapped ?? severityOf(value);
      if (level) return level;
    } else if (read) return read;
    for (const rule of rules)
      if (rule.test(shown(fieldValue(fields, rule.field)))) return rule.severity;
    return config.default ?? null;
  };
}

/**
 * IDs from each entry's text and its occurrence among identical entries at the same time:
 * the same log imported again gets the same IDs (and overwrites), while repeated identical
 * lines stay distinct. Identical entries can only share a time, and logs written as
 * requests finish interleave times a little, so the counts of the last `window` distinct
 * times are kept; memory stays bounded however long the log.
 */
export class EntryIds {
  constructor(prefix = 'log', window = 1024) {
    this.prefix = prefix;
    this.window = window;
    this.times = new Map();
  }
  next(text, time) {
    let seen = this.times.get(time);
    if (seen) {
      // Most recently seen last, so the oldest time is the first to go.
      this.times.delete(time);
      this.times.set(time, seen);
    } else {
      seen = new Map();
      this.times.set(time, seen);
      if (this.times.size > this.window) this.times.delete(this.times.keys().next().value);
    }
    const hash = createHash('sha256').update(text).digest('hex').slice(0, 32);
    const occurrence = seen.get(hash) ?? 0;
    seen.set(hash, occurrence + 1);
    return `${this.prefix}:${hash}${occurrence ? '.' + occurrence.toString(36) : ''}`;
  }
}

/**
 * The mapping of a compiled format (log-formats.mjs) to moments, with the configuration's
 * overrides: `title`, `notes` (templates), `tags` (templates), `metadata` (a JSON template),
 * `keepFields` (also store every field under metadata.<format>, default true), `severity`
 * (a field, map and rules) and `duration` (`{ field, unit }`: a span ending at the time).
 */
export function compileMapping(format, config = {}) {
  const definition = { ...format.format, ...config };
  const where = `Format ${format.name}`;
  const title = compileTemplate(definition.title ?? '{message}', `${where} title`);
  const notes =
    definition.notes === undefined ? null : compileTemplate(definition.notes, `${where} notes`);
  if (definition.tags !== undefined && !Array.isArray(definition.tags))
    throw new Error(`${where}: tags are a list of templates.`);
  const tags = (definition.tags ?? []).map((t, i) => compileTemplate(t, `${where} tag ${i + 1}`));
  if (definition.metadata !== undefined) {
    if (
      !definition.metadata ||
      typeof definition.metadata !== 'object' ||
      Array.isArray(definition.metadata)
    )
      throw new Error(`${where}: metadata is a JSON object template.`);
    const reserved = Object.keys(definition.metadata).filter((k) => RESERVED.includes(k));
    if (reserved.length)
      throw new Error(
        `${where}: set ${reserved.join(', ')} with "title", "notes" and "tags", not metadata.`,
      );
  }
  const metadata = definition.metadata
    ? compileValue(definition.metadata, `${where} metadata`)
    : null;
  const key = definition.metadataKey ?? format.name;
  const severity = compileSeverity(
    typeof definition.severity === 'object' && definition.severity ? definition.severity : {},
    `${where} severity`,
  );
  let duration = null;
  if (definition.duration !== undefined) {
    const d = definition.duration;
    if (!d || typeof d.field !== 'string' || !['s', 'ms', 'us', 'ns'].includes(d.unit ?? 's'))
      throw new Error(`${where}: duration is { "field": name, "unit": "s" | "ms" | "us" | "ns" }.`);
    duration = d;
  }
  return {
    /** The moment (and duration, if any) for an entry read by the format. */
    build(entry, text, id) {
      // Severity rules and templates see the entry's text as "line" and, for formats
      // without one, as "message".
      const visible = { ...entry.fields, line: text, message: entry.fields.message ?? text };
      const level = severity(visible, entry.severity);
      const fields = { ...visible, severity: level, format: format.name };
      const firstLine = (title(fields).text || text).replace(/\s+$/, '').split('\n', 1)[0];
      const heading =
        (firstLine.length > TITLE_LENGTH
          ? firstLine.slice(0, TITLE_LENGTH - 1) + '…'
          : firstLine) || `${format.name} ${level ?? 'entry'}`;
      const body = (notes ? notes(fields).text : text).replace(/\s+$/, '');
      const tagList = [];
      for (const tag of tags) {
        const { text: value, complete } = tag(fields);
        const cleaned = cleanTag(value);
        if (complete && cleaned && !tagList.includes(cleaned)) tagList.push(cleaned);
      }
      const stored = Object.fromEntries(Object.entries(entry.fields).filter(([, v]) => !empty(v)));
      const meta = {
        title: heading,
        ...(body && body !== heading ? { description: body.slice(0, NOTES_LENGTH) } : {}),
        ...(tagList.length ? { tags: validateTags(tagList.slice(0, 40)) } : {}),
        ...(definition.keepFields === false
          ? {}
          : { [key]: { ...stored, ...(level ? { severity: level } : {}) } }),
        ...(metadata ? metadata(fields) : {}),
      };
      const moment = { id, time: entry.time, metadata: meta };
      let span = null;
      if (duration) {
        const length = typed(fieldValue(entry.fields, duration.field), 'number');
        if (length !== null && length > 0) {
          const start = Q.parse(entry.time).sub(
            Q.parse(epochSeconds(String(length), duration.unit ?? 's')),
          );
          span = { id: id + '.d', start: start.toString(), end: entry.time, metadata: meta };
        }
      }
      return { moment, duration: span };
    },
  };
}

const SETTINGS = {
  format: 'openchronology',
  version: 1,
  title: 'Import',
  description: '',
  events: [],
};
/** Checks a moment (and duration) as the server will, so a bad entry is refused alone. */
export function checkMoment({ moment, duration }) {
  validateDocument(
    { ...SETTINGS, events: [moment], ...(duration ? { durations: [duration] } : {}) },
    true,
  );
}
