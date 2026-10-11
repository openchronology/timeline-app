// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
/**
 * Log lines as entries for the importer (docs/log-import.md): each format turns an entry's
 * text into named fields, a severity and an exact time (Unix seconds as "n/d", keeping
 * fractions). Built-in formats cover syslog files, RFC 5424, Apache and nginx access and
 * error logs, JSON lines and journald; custom formats are regexes with named groups, or
 * JSON field mappings, from the configuration. No I/O here.
 */
import { parseSyslog, SEVERITIES, FACILITIES } from './syslog.mjs';
import {
  parseZone,
  isoTime,
  apacheTime,
  ctimeTime,
  nginxTime,
  epochSeconds,
  YearClock,
} from './log-time.mjs';
export * from './log-time.mjs';

/** Common level names (and syslog numbers 0–7) as syslog severities. */
export function severityOf(level) {
  if (level === null || level === undefined || level === '') return null;
  const text = String(level).trim().toLowerCase();
  if (/^[0-7]$/.test(text)) return SEVERITIES[Number(text)];
  if (SEVERITIES.includes(text)) return text;
  const names = {
    emergency: 'emerg',
    panic: 'emerg',
    critical: 'crit',
    fatal: 'crit',
    error: 'err',
    eror: 'err',
    severe: 'err',
    warn: 'warning',
    information: 'info',
    informational: 'info',
    trace: 'debug',
    verbose: 'debug',
    fine: 'debug',
    finer: 'debug',
    finest: 'debug',
  };
  if (names[text]) return names[text];
  if (/^trace\d$/.test(text)) return 'debug';
  return null;
}

/** Field types: values of these kinds, or null when absent or unreadable. */
export function typed(value, type = 'string') {
  if (value === undefined || value === null || value === '' || value === '-') return null;
  switch (type) {
    case 'string':
      return typeof value === 'string' ? value : JSON.stringify(value);
    case 'int': {
      const text = String(value).trim();
      return /^-?\d{1,15}$/.test(text) ? Number(text) : null;
    }
    case 'number': {
      const n = typeof value === 'number' ? value : Number(String(value).trim());
      return Number.isFinite(n) ? n : null;
    }
    case 'bool': {
      const text = String(value).trim().toLowerCase();
      return ['true', '1', 'yes', 'on'].includes(text)
        ? true
        : ['false', '0', 'no', 'off'].includes(text)
          ? false
          : null;
    }
    case 'json':
      if (typeof value !== 'string') return value;
      try {
        return JSON.parse(value);
      } catch {
        return value;
      }
    default:
      throw new Error(`Unknown field type: ${type}`);
  }
}
export const TYPES = ['string', 'int', 'number', 'bool', 'json'];
const TIME_READERS = [
  'iso',
  'apache',
  'ctime',
  'nginx',
  'syslog',
  'epoch-s',
  'epoch-ms',
  'epoch-us',
  'epoch-ns',
];

/** "GET /path HTTP/1.1" as method, path and protocol; "-" (no value) as empty. */
const request = (fields) => {
  for (const key of Object.keys(fields)) if (fields[key] === '-') fields[key] = null;
  const parts = /^(\S+) (\S+)(?: (\S+))?$/.exec(fields.request ?? '');
  if (parts) [fields.method, fields.path, fields.protocol] = [parts[1], parts[2], parts[3] ?? null];
  if (/^\d{3}$/.test(fields.status ?? '')) fields.status_class = fields.status[0] + 'xx';
  return fields;
};
/** Access log severities: server errors, client errors, the rest. */
const httpSeverity = (fields) =>
  /^5/.test(fields.status ?? '') ? 'err' : /^4/.test(fields.status ?? '') ? 'warning' : 'info';
const ACCESS = {
  pattern:
    '^(?<client>\\S+) (?<ident>\\S+) (?<user>\\S+) \\[(?<time>[^\\]]+)\\] "(?<request>(?:[^"\\\\]|\\\\.)*)" (?<status>\\d{3}|-) (?<bytes>\\d+|-)',
  time: { field: 'time', as: 'apache' },
  types: { status: 'int', bytes: 'int' },
  derive: request,
  severity: httpSeverity,
  title: '{method} {path} → {status}',
  tags: ['http', 'status:{status_class}', 'method:{method}'],
};
const COMBINED = '(?: "(?<referer>(?:[^"\\\\]|\\\\.)*)" "(?<agent>(?:[^"\\\\]|\\\\.)*)")';
/** Syslog program tags: "app[pid]: message". */
const tagged = (fields) => {
  const tag = /^([^\s:[\]]{1,48})(?:\[([^\]]{1,128})\])?: ?(.*)$/s.exec(fields.rest ?? '');
  fields.app = tag ? tag[1] : null;
  fields.procid = tag?.[2] ?? null;
  fields.message = tag ? tag[3] : (fields.rest ?? '');
  delete fields.rest;
  return fields;
};
const SYSLOG_TAGS = [
  'syslog',
  'severity:{severity}',
  'facility:{facility}',
  'host:{host}',
  'app:{app}',
];

/**
 * Built-in formats. Each has a pattern with named groups (or a JSON reader), how to read its
 * time, field types, a severity, and the default title, notes and tags (see log-mapping.mjs).
 */
export const BUILTIN_FORMATS = {
  syslog: {
    description:
      'Syslog files: rsyslog ISO lines, classic "Mmm dd hh:mm:ss" lines and lines with a priority.',
    read: 'syslog',
    title: '{message}',
    tags: SYSLOG_TAGS,
    metadataKey: 'syslog',
  },
  rfc5424: {
    description: 'RFC 5424 (and RFC 3164) lines with a <priority>.',
    read: 'rfc5424',
    title: '{message}',
    tags: SYSLOG_TAGS,
    metadataKey: 'syslog',
  },
  'apache-common': {
    ...ACCESS,
    pattern: ACCESS.pattern + '$',
    description: 'Apache common log format.',
  },
  'apache-combined': {
    ...ACCESS,
    pattern: ACCESS.pattern + COMBINED + '$',
    description: 'Apache combined log format (with referer and user agent).',
  },
  'nginx-combined': {
    ...ACCESS,
    // nginx's default "combined" format; trailing fields some configurations add are kept.
    pattern: ACCESS.pattern + COMBINED + '(?: (?<extra>.*))?$',
    description: "nginx's default combined access log format.",
  },
  'apache-error': {
    description: 'Apache 2.2 and 2.4 error logs.',
    pattern:
      '^\\[(?<time>[^\\]]+)\\] \\[(?:(?<module>[^:\\]]+):)?(?<level>[a-z]+\\d?)\\](?: \\[pid (?<pid>\\d+)(?::tid (?<tid>\\d+))?\\])?(?: \\[client (?<client>[^\\]]+)\\])? (?<message>.*)$',
    time: { field: 'time', as: 'ctime' },
    types: { pid: 'int', tid: 'int' },
    severity: (fields) => severityOf(fields.level),
    title: '{message}',
    tags: ['apache', 'severity:{severity}', 'module:{module}'],
  },
  'nginx-error': {
    description: 'nginx error logs.',
    pattern:
      '^(?<time>\\d{4}/\\d{2}/\\d{2} \\d{2}:\\d{2}:\\d{2}) \\[(?<level>[a-z]+)\\] (?<pid>\\d+)#(?<tid>\\d+): (?:\\*(?<connection>\\d+) )?(?<message>.*)$',
    time: { field: 'time', as: 'nginx' },
    types: { pid: 'int', tid: 'int', connection: 'int' },
    derive: (fields) => {
      // "…, client: 1.2.3.4, server: example.org, request: "GET / HTTP/1.1""
      for (const [, key, value] of (fields.message ?? '').matchAll(
        /, (client|server|request|upstream|host): "?([^",]*)"?/g,
      ))
        fields[key] ??= value;
      return fields;
    },
    severity: (fields) => severityOf(fields.level),
    title: '{message}',
    tags: ['nginx', 'severity:{severity}', 'server:{server}'],
  },
  jsonl: {
    description: 'One JSON object per line; set the time (and message and level) fields.',
    json: true,
    time: { field: ['time', 'timestamp', '@timestamp', 'ts', 'date'], as: 'auto' },
    message: ['message', 'msg', 'text'],
    level: ['level', 'severity', 'lvl', 'loglevel'],
    title: '{message}',
    tags: ['severity:{severity}'],
  },
  journald: {
    description: 'journalctl -o json.',
    json: true,
    time: { field: '__REALTIME_TIMESTAMP', as: 'epoch-us' },
    message: ['MESSAGE'],
    level: ['PRIORITY'],
    derive: (fields) => {
      fields.host = fields._HOSTNAME ?? null;
      fields.app = fields.SYSLOG_IDENTIFIER ?? fields._COMM ?? null;
      fields.procid = fields._PID ?? fields.SYSLOG_PID ?? null;
      fields.unit = fields._SYSTEMD_UNIT ?? null;
      const facility = Number(fields.SYSLOG_FACILITY);
      fields.facility = Number.isInteger(facility) ? (FACILITIES[facility] ?? null) : null;
      return fields;
    },
    title: '{message}',
    tags: ['journald', 'severity:{severity}', 'host:{host}', 'app:{app}', 'unit:{unit}'],
  },
};

const pick = (object, names) => {
  for (const name of [names].flat())
    if (object[name] !== undefined && object[name] !== null) return name;
  return null;
};
/** journald encodes non-UTF-8 messages as byte arrays. */
const text = (value) =>
  Array.isArray(value) && value.every((b) => Number.isInteger(b) && b >= 0 && b < 256)
    ? Buffer.from(value).toString('utf8')
    : value;

/**
 * A format ready to read entries: built-in (by name, optionally extended by `definition`)
 * or custom (`pattern` or `json`). `options` are the time zone (parsed) and year rules.
 */
export function compileFormat(
  name,
  definition = {},
  { zone = parseZone('UTC'), year = null, reference } = {},
) {
  if (typeof name !== 'string' || !/^[a-z][a-z0-9-]{0,39}$/.test(name))
    throw new Error(`Format names are 1–40 lowercase letters, digits and hyphens: ${name}`);
  const base = definition.extends ?? (BUILTIN_FORMATS[name] ? name : null);
  if (base !== null && !BUILTIN_FORMATS[base]) throw new Error(`Unknown format: ${base}`);
  const format = { ...(base ? BUILTIN_FORMATS[base] : {}), ...definition, name };
  if (!format.read && !format.json && !format.pattern)
    throw new Error(
      `Format ${name} needs a "pattern" (a regex with named groups) or "json": true.`,
    );
  let pattern = null;
  if (format.pattern) {
    try {
      pattern = new RegExp(format.pattern, 's');
    } catch (error) {
      throw new Error(`Format ${name}: invalid pattern (${error.message}).`);
    }
  }
  for (const [field, type] of Object.entries(format.types ?? {}))
    if (!TYPES.includes(type))
      throw new Error(`Format ${name}: unknown type ${type} for ${field}.`);
  const reader = format.time?.as;
  if (format.time && reader !== 'auto' && !TIME_READERS.includes(reader))
    throw new Error(
      `Format ${name}: unknown time reader ${reader} (use ${TIME_READERS.join(', ')}).`,
    );
  if (!format.read && !format.time)
    throw new Error(`Format ${name} needs a "time": {"field", "as"}.`);
  const zoneOf = format.timezone ? parseZone(format.timezone) : zone;
  const clock = new YearClock({ year, reference, zone: zoneOf });
  const readTime = (value, as) => {
    switch (as) {
      case 'iso':
        return isoTime(value, zoneOf);
      case 'apache':
        return apacheTime(value, zoneOf);
      case 'ctime':
        return ctimeTime(value, zoneOf);
      case 'nginx':
        return nginxTime(value, zoneOf);
      case 'syslog':
        return clock.read(value);
      case 'auto':
        if (typeof value === 'number' || /^\d+(\.\d+)?$/.test(String(value)))
          // Epoch numbers: seconds, or milliseconds, microseconds, nanoseconds by size.
          return readTime(
            value,
            ['epoch-s', 'epoch-ms', 'epoch-us', 'epoch-ns'][
              Math.min(3, Math.max(0, Math.floor((String(value).split('.')[0].length - 10) / 3)))
            ],
          );
        return isoTime(value, zoneOf);
      default: {
        const ms = { 'epoch-s': 's', 'epoch-ms': 'ms', 'epoch-us': 'us', 'epoch-ns': 'ns' }[as];
        const t = epochSeconds(value, ms);
        const [n, d] = t.split('/');
        return { time: t, ms: Number((BigInt(n) * 1000n) / BigInt(d)) };
      }
    }
  };
  const finish = (fields, timing, severity) => {
    for (const [field, type] of Object.entries(format.types ?? {}))
      if (field in fields) fields[field] = typed(fields[field], type);
    return { fields, time: timing.time, ms: timing.ms, severity };
  };
  return {
    name,
    format,
    /** Fields, severity and exact time of one entry, or an error for text it cannot read. */
    read(entry) {
      if (format.read === 'rfc5424' || (format.read === 'syslog' && /^<\d{1,3}>/.test(entry))) {
        if (!/^<\d{1,3}>/.test(entry)) throw new Error('Expected a <priority>.');
        const parsed = parseSyslog(entry, clock.reference, { zone: zoneOf, years: clock });
        if (parsed.format === 'unknown') throw new Error('Not a syslog message.');
        const { time: t, ...fields } = parsed;
        const [n, d] = t.split('/');
        return {
          fields,
          time: t,
          ms: Number((BigInt(n) * 1000n) / BigInt(d)),
          severity: fields.severity,
        };
      }
      if (format.read === 'syslog') {
        // rsyslog's file format (ISO time) or the classic one; files carry no priority.
        const iso = /^(\d{4}-\d{2}-\d{2}T\S+) (\S+) (.*)$/s.exec(entry);
        const classic = iso
          ? null
          : /^([A-Z][a-z]{2} +\d{1,2} \d{2}:\d{2}:\d{2}(?:\.\d{1,9})?) (\S+) (.*)$/s.exec(entry);
        const parts = iso ?? classic;
        if (!parts) throw new Error('Not a syslog line.');
        const fields = tagged({ host: parts[2], rest: parts[3] });
        const timing = iso ? isoTime(parts[1], zoneOf) : clock.read(parts[1]);
        return finish(fields, timing, null);
      }
      let fields;
      if (format.json) {
        let value;
        try {
          value = JSON.parse(entry);
        } catch {
          throw new Error('Invalid JSON.');
        }
        if (!value || typeof value !== 'object' || Array.isArray(value))
          throw new Error('Expected a JSON object.');
        fields = { ...value };
        const message = pick(fields, format.message ?? []);
        if (message !== null) fields.message = text(fields[message]);
        const level = pick(fields, format.level ?? []);
        if (level !== null) fields.level = fields[level];
      } else {
        const match = pattern.exec(entry);
        if (!match) throw new Error('The line does not match the format.');
        fields = { ...match.groups };
        for (const key of Object.keys(fields)) if (fields[key] === undefined) fields[key] = null;
      }
      if (format.derive) fields = format.derive(fields);
      const timeField = pick(fields, format.time.field);
      if (timeField === null) throw new Error('The entry has no time.');
      const timing = readTime(fields[timeField], format.time.as);
      const severity =
        typeof format.severity === 'function'
          ? format.severity(fields)
          : format.severity?.field
            ? severityOf(fields[format.severity.field])
            : severityOf(fields.level);
      return finish(fields, timing, severity);
    },
  };
}
