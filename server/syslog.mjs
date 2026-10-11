// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
/**
 * Syslog messages as timeline moments: parsing (RFC 5424 and the BSD format of RFC 3164),
 * TCP framing (RFC 6587), routing rules, and the moment each message becomes. No I/O here;
 * the receiver (syslog-receiver.mjs) listens and sends moments through the API.
 */
import { exactSeconds, isoTime, parseZone, wallToUtc } from './log-time.mjs';
import { compileRoutes as compileLogRoutes } from './log-routes.mjs';

export const FACILITIES = [
  'kern',
  'user',
  'mail',
  'daemon',
  'auth',
  'syslog',
  'lpr',
  'news',
  'uucp',
  'cron',
  'authpriv',
  'ftp',
  'ntp',
  'security',
  'console',
  'solaris-cron',
  'local0',
  'local1',
  'local2',
  'local3',
  'local4',
  'local5',
  'local6',
  'local7',
];
export const SEVERITIES = ['emerg', 'alert', 'crit', 'err', 'warning', 'notice', 'info', 'debug'];
/** Largest message accepted, in bytes: syslog relays commonly allow 64 KiB. */
export const MAX_MESSAGE_BYTES = 65536;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Exact Unix seconds as a reduced fraction string ("n/d"), the timeline time format. */
const unixSeconds = (milliseconds, fraction = '') =>
  exactSeconds(BigInt(Math.floor(milliseconds / 1000)), fraction);
const UTC = parseZone('UTC');
const nil = (value) => (value === '-' ? null : value);

/** RFC 5424 STRUCTURED-DATA: `[id key="value" ...]...`, unescaping \" \\ and \]. */
function structuredData(text) {
  if (text.startsWith('-')) return { data: null, rest: text.slice(1) };
  const data = {};
  let i = 0;
  while (text[i] === '[') {
    const close = /^\[([^\s\]="]{1,32})/.exec(text.slice(i));
    if (!close) throw new Error('Invalid structured data.');
    const id = close[1];
    const params = (data[id] ??= {});
    i += close[0].length;
    while (text[i] === ' ') {
      const name = /^ ([^\s\]="]{1,32})="/.exec(text.slice(i));
      if (!name) throw new Error('Invalid structured data parameter.');
      i += name[0].length;
      let value = '';
      for (; i < text.length && text[i] !== '"'; i++) {
        if (text[i] === '\\' && ['"', '\\', ']'].includes(text[i + 1])) i++;
        value += text[i];
      }
      if (text[i] !== '"') throw new Error('Unterminated structured data value.');
      i++;
      params[name[1]] = value;
    }
    if (text[i] !== ']') throw new Error('Invalid structured data element.');
    i++;
  }
  return { data, rest: text.slice(i) };
}

/**
 * Parses one message. `received` (milliseconds) supplies missing parts: BSD messages carry
 * no year or time zone, so their time is read in `zone` (UTC unless set) and in the year that
 * puts it nearest to receipt, or by a `years` clock (log-time.mjs YearClock) for files.
 * rsyslog's ISO lines ("2026-10-09T08:15:01.123+02:00 host app[pid]: …", which relays
 * forward) keep their time. Messages that match no format are kept whole, received now.
 */
export function parseSyslog(text, received = Date.now(), { zone = UTC, years = null } = {}) {
  if (typeof text !== 'string') throw new Error('A syslog message must be text.');
  const line = text.replace(/[\r\n]+$/, '').replace(/^﻿/, '');
  const pri = /^<(\d{1,3})>/.exec(line);
  const priority = pri && Number(pri[1]) <= 191 ? Number(pri[1]) : 13; // user.notice
  const base = {
    facility: FACILITIES[priority >> 3],
    severity: SEVERITIES[priority & 7],
    time: unixSeconds(received),
    host: null,
    app: null,
    procid: null,
    msgid: null,
    structuredData: null,
  };
  const body = pri ? line.slice(pri[0].length) : line;
  const modern = /^1 (\S+) (\S+) (\S+) (\S+) (\S+) /.exec(body);
  if (modern) {
    const [, stamp, host, app, procid, msgid] = modern;
    let time = base.time;
    if (stamp !== '-') {
      const parts =
        /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,6}))?(Z|[+-]\d{2}:\d{2})$/.exec(
          stamp,
        );
      if (!parts) throw new Error('Invalid RFC 5424 timestamp.');
      const [, y, mo, d, h, mi, s, fraction = '', zone] = parts;
      const offset =
        zone === 'Z'
          ? 0
          : (zone[0] === '-' ? -1 : 1) * (Number(zone.slice(1, 3)) * 60 + Number(zone.slice(4)));
      const ms = Date.UTC(+y, +mo - 1, +d, +h, +mi, +s) - offset * 60000;
      if (!Number.isFinite(ms)) throw new Error('Invalid RFC 5424 timestamp.');
      time = unixSeconds(ms, fraction.replace(/0+$/, ''));
    }
    const { data, rest } = structuredData(body.slice(modern[0].length));
    return {
      ...base,
      format: 'rfc5424',
      time,
      host: nil(host),
      app: nil(app),
      procid: nil(procid),
      msgid: nil(msgid),
      structuredData: data,
      message: rest.replace(/^ /, '').replace(/^﻿/, ''),
    };
  }
  const tagged = (format, time, host, rest) => {
    const tag = /^([^\s:[\]]{1,48})(?:\[([^\]]{1,128})\])?: ?(.*)$/s.exec(rest);
    return {
      ...base,
      format,
      time,
      host,
      app: tag ? tag[1] : null,
      procid: tag?.[2] ?? null,
      message: tag ? tag[3] : rest,
    };
  };
  const iso = /^(\d{4}-\d{2}-\d{2}T\S+) (\S+) (.*)$/s.exec(body);
  if (iso) {
    let time;
    try {
      time = isoTime(iso[1], zone).time;
    } catch {
      time = null;
    }
    if (time) return tagged('rfc3339', time, iso[2], iso[3]);
  }
  const bsd = /^([A-Z][a-z]{2}) ([ \d]\d) (\d{2}):(\d{2}):(\d{2}) (\S+) (.*)$/s.exec(body);
  if (bsd && MONTHS.includes(bsd[1])) {
    const [, month, day, h, mi, s, host, rest] = bsd;
    if (years)
      return tagged('rfc3164', years.read(`${month} ${day} ${h}:${mi}:${s}`).time, host, rest);
    const year = new Date(received).getUTCFullYear();
    // The year that puts the time nearest to receipt (messages near New Year).
    const at = (y) => wallToUtc(zone, y, MONTHS.indexOf(month) + 1, Number(day), +h, +mi, +s);
    const ms = [year - 1, year, year + 1]
      .map(at)
      .reduce((a, b) => (Math.abs(b - received) < Math.abs(a - received) ? b : a));
    return tagged('rfc3164', unixSeconds(ms), host, rest);
  }
  return { ...base, format: 'unknown', message: body };
}

/**
 * Splits a TCP stream into messages: octet counting ("<length> <message>") or, otherwise,
 * one message per line. Returns a function that takes chunks and calls `emit` per message.
 */
export function syslogFrames(emit, limit = MAX_MESSAGE_BYTES) {
  let buffer = Buffer.alloc(0);
  return (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);
    for (;;) {
      if (!buffer.length) return;
      const counted = /^(\d{1,6}) /.exec(buffer.subarray(0, 8).toString('latin1'));
      if (counted && buffer[0] !== 0x3c) {
        const length = Number(counted[1]);
        if (length > limit) throw new Error('Syslog frame exceeds the message size limit.');
        const start = counted[0].length;
        if (buffer.length < start + length) return;
        emit(buffer.subarray(start, start + length).toString('utf8'));
        buffer = buffer.subarray(start + length);
        continue;
      }
      const end = buffer.indexOf(0x0a);
      if (end < 0) {
        if (buffer.length > limit) throw new Error('Syslog line exceeds the message size limit.');
        return;
      }
      const message = buffer.subarray(0, end).toString('utf8');
      buffer = buffer.subarray(end + 1);
      if (message.trim()) emit(message);
    }
  };
}

/**
 * Compiles routing rules (log-routes.mjs): each route names a timeline and optional
 * conditions: `host`, `app`, `msgid` (glob patterns, case-insensitive; a list matches any),
 * `facility` (names) and `severity` (a name: that severity or more severe). A message goes
 * to the first route that matches, and also to later ones while matched routes set
 * `"continue": true`. Unmatched messages go to `default` when set and are otherwise dropped.
 */
export function compileRoutes(config) {
  return compileLogRoutes(config, { fields: ['host', 'app', 'msgid'], label: 'Syslog' });
}

const TITLE_LENGTH = 200,
  NOTES_LENGTH = 16384;
// Tags are 1–64 characters without commas or control characters (src/tags.ts).
const tag = (prefix, value) =>
  value
    ? `${prefix}:${value}`
        .normalize('NFC')
        .toLowerCase()
        .replace(/[\x00-\x1f\x7f,]/g, '_')
        .trim()
        .slice(0, 64)
    : null;
/**
 * The moment a message becomes. `id` must be unique per received message (the receiver
 * assigns it once, so retried batches overwrite rather than duplicate).
 */
export function syslogMoment(entry, id) {
  const text = entry.message.replace(/\s+$/, '');
  const firstLine = text.split('\n', 1)[0];
  return {
    id,
    time: entry.time,
    metadata: {
      title:
        (firstLine.length > TITLE_LENGTH
          ? firstLine.slice(0, TITLE_LENGTH - 1) + '…'
          : firstLine) || `${entry.app ?? 'syslog'} ${entry.severity}`,
      ...(text !== firstLine || firstLine.length > TITLE_LENGTH
        ? { description: text.slice(0, NOTES_LENGTH) }
        : {}),
      tags: [
        'syslog',
        tag('severity', entry.severity),
        tag('facility', entry.facility),
        tag('host', entry.host),
        tag('app', entry.app),
      ].filter(Boolean),
      syslog: Object.fromEntries(
        Object.entries({
          format: entry.format,
          facility: entry.facility,
          severity: entry.severity,
          host: entry.host,
          app: entry.app,
          procid: entry.procid,
          msgid: entry.msgid,
          structuredData: entry.structuredData,
        }).filter(([, v]) => v !== null && v !== undefined),
      ),
    },
  };
}
