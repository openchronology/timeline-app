// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// The log importer: times and zones, built-in and custom formats, moments, routes and filters,
// repeatable entry IDs, batches, progress, and plain, gzipped and standard input.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile, utimes } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import { Readable } from 'node:stream';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  compileFormat,
  epochSeconds,
  isoTime,
  apacheTime,
  ctimeTime,
  nginxTime,
  parseZone,
  severityOf,
  typed,
  YearClock,
} from '../server/log-formats.mjs';
import {
  compileMapping,
  compileTemplate,
  compileValue,
  EntryIds,
  checkMoment,
} from '../server/log-mapping.mjs';
import { compileRoutes, parseFilter } from '../server/log-routes.mjs';
import { compileRoutes as syslogRoutes, parseSyslog } from '../server/syslog.mjs';
import { main, EXIT, Progress, batchLimit, storageEstimate, HELP } from '../server/import-logs.mjs';

const UTC = parseZone('UTC');
const at = (...parts) => `${Date.UTC(...parts) / 1000}/1`;
const A = '6f1c0000-0000-4000-8000-000000000001',
  B = '0b7e0000-0000-4000-8000-000000000002',
  C = 'c3d90000-0000-4000-8000-000000000003';

test('times are exact Unix seconds from each log time format, zones included', () => {
  // 0.123456 s = 1929/15625 s.
  assert.equal(
    isoTime('2026-10-09T08:15:01.123456+02:00', UTC).time,
    `${(Date.UTC(2026, 9, 9, 6, 15, 1) / 1000) * 15625 + 1929}/15625`,
  );
  assert.equal(isoTime('2026-10-09T06:15:01Z', UTC).time, at(2026, 9, 9, 6, 15, 1));
  assert.equal(
    isoTime('2026-10-09 08:15:01,500', parseZone('+02:00')).time,
    `${(Date.UTC(2026, 9, 9, 6, 15, 1) / 1000) * 2 + 1}/2`,
  );
  assert.equal(apacheTime('[10/Oct/2026:13:55:36 -0700]', UTC).time, at(2026, 9, 10, 20, 55, 36));
  assert.equal(
    ctimeTime('Fri Oct 09 08:15:01.25 2026', UTC).time,
    `${(Date.UTC(2026, 9, 9, 8, 15, 1) / 1000) * 4 + 1}/4`,
  );
  assert.equal(
    nginxTime('2026/10/09 08:15:01', parseZone('-0500')).time,
    at(2026, 9, 9, 13, 15, 1),
  );
  // Epoch numbers in any unit stay exact; negative ones too.
  assert.equal(epochSeconds('1760004901123456', 'us'), '27500076580054/15625');
  assert.equal(epochSeconds('1760004901.5'), '3520009803/2');
  assert.equal(epochSeconds('1760004901000', 'ms'), '1760004901/1');
  assert.equal(epochSeconds('1', 'ns'), '1/1000000000');
  assert.equal(epochSeconds('-1.5'), '-3/2');
  assert.throws(() => epochSeconds('1e9'), /epoch/);
  assert.throws(() => parseZone('Mars/Olympus'), /time zone/);
  assert.throws(() => isoTime('2026-13-01T00:00:00Z', UTC), /ISO/);
  // An IANA zone follows daylight saving time: Berlin is UTC+2 in summer and UTC+1 in winter.
  const berlin = parseZone('Europe/Berlin');
  assert.equal(isoTime('2026-07-01T12:00:00', berlin).time, at(2026, 6, 1, 10, 0, 0));
  assert.equal(isoTime('2026-12-01T12:00:00', berlin).time, at(2026, 11, 1, 11, 0, 0));
  // Just after the spring change (02:00 → 03:00 on 29 March 2026).
  assert.equal(isoTime('2026-03-29T03:30:00', berlin).time, at(2026, 2, 29, 1, 30, 0));
});

test('classic syslog years come from the file time and step across New Year', () => {
  const clock = new YearClock({ reference: Date.UTC(2027, 0, 2), zone: UTC });
  assert.equal(clock.read('Dec 31 23:59:58').time, at(2026, 11, 31, 23, 59, 58));
  assert.equal(clock.read('Jan  1 00:00:03').time, at(2027, 0, 1, 0, 0, 3));
  // A line a little out of order does not step the year again.
  assert.equal(clock.read('Jan  1 00:00:01').time, at(2027, 0, 1, 0, 0, 1));
  // A later file's lines never land after its modification time.
  const june = new YearClock({ reference: Date.UTC(2026, 5, 15), zone: UTC });
  assert.equal(june.read('Dec 30 10:00:00').time, at(2025, 11, 30, 10, 0, 0));
  assert.equal(june.read('Jun 14 10:00:00').time, at(2026, 5, 14, 10, 0, 0));
  // --year fixes the first line's year; a zone reads the wall clock.
  const fixed = new YearClock({ year: 2020, zone: parseZone('+02:00') });
  assert.equal(fixed.read('Mar  1 12:00:00').time, at(2020, 2, 1, 10, 0, 0));
});

test('the receiver reads ISO file-format lines and classic lines in a configured zone', () => {
  const received = Date.UTC(2026, 9, 10, 12, 0, 0);
  const iso = parseSyslog(
    '<30>2026-10-10T13:59:58.5+02:00 web-1 nginx[44]: worker exited',
    received,
  );
  assert.deepEqual(
    [iso.format, iso.time, iso.host, iso.app, iso.procid, iso.message, iso.severity],
    [
      'rfc3339',
      `${(Date.UTC(2026, 9, 10, 11, 59, 58) / 1000) * 2 + 1}/2`,
      'web-1',
      'nginx',
      '44',
      'worker exited',
      'info',
    ],
  );
  const bare = parseSyslog('2026-10-10T11:59:58Z web-1 cron: x', received);
  assert.equal(bare.format, 'rfc3339');
  const local = parseSyslog('<13>Oct 10 13:59:58 h app: x', received, {
    zone: parseZone('+02:00'),
  });
  assert.equal(local.time, at(2026, 9, 10, 11, 59, 58));
  // Unchanged without a zone: UTC.
  assert.equal(
    parseSyslog('<13>Oct 10 13:59:58 h app: x', received).time,
    at(2026, 9, 10, 13, 59, 58),
  );
});

const read = (name, line, options = {}, definition = {}) =>
  compileFormat(name, definition, { zone: UTC, ...options }).read(line);
test('built-in formats read real-world lines', () => {
  const access = read(
    'apache-combined',
    '127.0.0.1 - frank [10/Oct/2000:13:55:36 -0700] "GET /apache_pb.gif HTTP/1.0" 200 2326 "http://www.example.com/start.html" "Mozilla/4.08 [en] (Win98; I ;Nav)"',
  );
  assert.equal(access.time, at(2000, 9, 10, 20, 55, 36));
  assert.deepEqual(
    [
      access.fields.method,
      access.fields.path,
      access.fields.status,
      access.fields.bytes,
      access.fields.ident,
      access.fields.status_class,
      access.severity,
    ],
    ['GET', '/apache_pb.gif', 200, 2326, null, '2xx', 'info'],
  );
  const common = read(
    'apache-common',
    '10.1.2.3 - - [10/Oct/2026:13:55:36 +0000] "POST /login HTTP/1.1" 401 -',
  );
  assert.deepEqual(
    [common.fields.status, common.fields.bytes, common.severity],
    [401, null, 'warning'],
  );
  // Escaped quotes in the user agent, and fields nginx configurations append.
  const nginx = read(
    'nginx-combined',
    '203.0.113.9 - - [09/Oct/2026:08:15:01 +0200] "GET /a?b=\\"c\\" HTTP/2.0" 502 157 "-" "Mozilla \\"quoted\\"" "198.51.100.2" rt=0.042',
  );
  assert.deepEqual(
    [nginx.fields.status, nginx.fields.agent, nginx.fields.extra, nginx.severity],
    [502, 'Mozilla \\"quoted\\"', '"198.51.100.2" rt=0.042', 'err'],
  );
  const apache24 = read(
    'apache-error',
    "[Fri Oct 09 08:15:01.123456 2026] [proxy_fcgi:error] [pid 4242:tid 140] [client 10.0.0.1:5678] AH01071: Got error 'Primary script unknown'",
  );
  assert.deepEqual(
    [apache24.fields.module, apache24.fields.pid, apache24.fields.client, apache24.severity],
    ['proxy_fcgi', 4242, '10.0.0.1:5678', 'err'],
  );
  const apache22 = read(
    'apache-error',
    '[Fri Oct 09 08:15:03 2026] [notice] Apache/2.2.22 configured -- resuming normal operations',
  );
  assert.deepEqual([apache22.fields.module, apache22.severity], [null, 'notice']);
  const nginxError = read(
    'nginx-error',
    '2026/10/09 08:15:01 [crit] 1234#0: *57 connect() to unix:/run/php/php-fpm.sock failed (2: No such file or directory) while connecting to upstream, client: 10.0.0.9, server: example.org, request: "GET / HTTP/1.1", upstream: "fastcgi://unix:/run/php/php-fpm.sock:", host: "example.org"',
  );
  assert.deepEqual(
    [
      nginxError.fields.connection,
      nginxError.fields.client,
      nginxError.fields.server,
      nginxError.fields.request,
      nginxError.severity,
    ],
    [57, '10.0.0.9', 'example.org', 'GET / HTTP/1.1', 'crit'],
  );
  // Syslog files: ISO and classic lines (no priority, so no severity), and forwarded ones.
  const iso = read(
    'syslog',
    '2026-10-09T08:15:01.123456+02:00 host1 systemd[1]: Started Session 4 of user root.',
  );
  assert.deepEqual(
    [iso.fields.host, iso.fields.app, iso.fields.procid, iso.fields.message, iso.severity],
    ['host1', 'systemd', '1', 'Started Session 4 of user root.', null],
  );
  const classic = read('syslog', 'Oct  9 08:15:01 host1 kernel: [ 1.234] usb 1-1: new device', {
    reference: Date.UTC(2026, 9, 10),
  });
  assert.equal(classic.time, at(2026, 9, 9, 8, 15, 1));
  const forwarded = read('syslog', '<34>Oct  9 08:15:01 host1 su: BAD SU', {
    reference: Date.UTC(2026, 9, 10),
  });
  assert.deepEqual([forwarded.severity, forwarded.fields.facility], ['crit', 'auth']);
  const rfc = read(
    'rfc5424',
    '<165>1 2003-10-11T22:14:15.003Z mymachine.example.com evntslog - ID47 [exampleSDID@32473 iut="3"] An application event',
  );
  assert.deepEqual(
    [rfc.time, rfc.fields.msgid, rfc.fields.structuredData, rfc.severity],
    [
      `${(Date.UTC(2003, 9, 11, 22, 14, 15) / 1000) * 1000 + 3}/1000`,
      'ID47',
      { 'exampleSDID@32473': { iut: '3' } },
      'notice',
    ],
  );
  assert.throws(() => read('rfc5424', 'no priority here'), /priority/);
  // JSON lines: the time field is found and read by its shape.
  const json = read(
    'jsonl',
    '{"ts":1760004901.25,"level":"WARN","msg":"disk 91%","disk":{"used":91}}',
  );
  assert.deepEqual(
    [json.time, json.severity, json.fields.message, json.fields.disk],
    ['7040019605/4', 'warning', 'disk 91%', { used: 91 }],
  );
  assert.equal(
    read('jsonl', '{"time":"2026-10-09T08:15:01Z","message":"x"}').time,
    at(2026, 9, 9, 8, 15, 1),
  );
  assert.equal(read('jsonl', '{"@timestamp":1760004901000,"message":"x"}').time, '1760004901/1');
  const journal = read(
    'journald',
    '{"__REALTIME_TIMESTAMP":"1760004902000000","MESSAGE":[72,105],"PRIORITY":"3","SYSLOG_IDENTIFIER":"app","_HOSTNAME":"box","SYSLOG_FACILITY":"10"}',
  );
  assert.deepEqual(
    [journal.fields.message, journal.severity, journal.fields.app, journal.fields.facility],
    ['Hi', 'err', 'app', 'authpriv'],
  );
  assert.throws(() => read('jsonl', 'not json'), /JSON/);
  assert.throws(() => read('apache-common', 'garbage'), /does not match/);
});

test('custom formats: named groups, typed fields and severity rules', () => {
  const format = compileFormat(
    'deploys',
    {
      pattern:
        '^(?<at>\\S+) deploy (?<service>\\S+) v(?<version>\\d+) took=(?<seconds>[\\d.]+) ok=(?<ok>\\w+)$',
      time: { field: 'at', as: 'iso' },
      types: { version: 'int', seconds: 'number', ok: 'bool' },
      severity: {
        rules: [{ contains: 'ok=false', field: 'line', severity: 'err' }],
        default: 'info',
      },
    },
    { zone: UTC },
  );
  const entry = format.read('2026-10-09T08:15:01Z deploy api v42 took=12.5 ok=true');
  assert.deepEqual(entry.fields, {
    at: '2026-10-09T08:15:01Z',
    service: 'api',
    version: 42,
    seconds: 12.5,
    ok: true,
  });
  assert.throws(
    () => compileFormat('Bad Name', { pattern: 'x', time: { field: 'x', as: 'iso' } }),
    /Format names/,
  );
  assert.throws(
    () => compileFormat('x', { pattern: '(', time: { field: 'x', as: 'iso' } }),
    /invalid pattern/,
  );
  assert.throws(
    () => compileFormat('x', { pattern: 'x', time: { field: 'x', as: 'sundial' } }),
    /time reader/,
  );
  assert.throws(
    () =>
      compileFormat('x', {
        pattern: '(?<a>x)',
        time: { field: 'a', as: 'iso' },
        types: { a: 'date' },
      }),
    /unknown type/,
  );
  assert.equal(severityOf('FATAL'), 'crit');
  assert.equal(severityOf('trace3'), 'debug');
  assert.equal(severityOf(4), 'warning');
  assert.equal(severityOf('chatty'), null);
  assert.equal(typed('-', 'int'), null);
  assert.equal(typed('12.5', 'int'), null);
  assert.deepEqual(typed('{"a":[1]}', 'json'), { a: [1] });
});

test('moments: templates, typed metadata, tags, severity rules and durations', () => {
  const definition = {
    pattern:
      '^(?<at>\\S+) (?<method>\\S+) (?<path>\\S+) (?<status>\\d+) (?<ms>\\d+)(?: (?<vhost>\\S+))?$',
    time: { field: 'at', as: 'iso' },
    types: { status: 'int', ms: 'int' },
    title: '{method} {path} → {status}',
    tags: ['http', 'vhost:{vhost}', 'status:{status}', 'Bad,Tag {method}'],
    metadata: {
      source: { url: 'https://example.org{path}', status: { $field: 'status', type: 'int' } },
      flags: [{ $const: 'imported' }, '{vhost}'],
      ratio: { $template: '{ms}', type: 'number' },
      nothing: { empty: '{vhost}' },
    },
    severity: {
      rules: [{ match: '\\s5\\d\\d\\s', field: 'line', severity: 'err' }],
      default: 'info',
    },
    duration: { field: 'ms', unit: 'ms' },
  };
  const format = compileFormat('web', definition, { zone: UTC });
  const mapping = compileMapping(format, definition);
  const line = '2026-10-09T08:15:01Z GET /api 503 250';
  const { moment, duration } = mapping.build(format.read(line), line, 'log:x');
  assert.equal(moment.metadata.title, 'GET /api → 503');
  // Without a vhost, the vhost tag and empty metadata are left out; tags are made valid.
  assert.deepEqual(moment.metadata.tags, ['http', 'status:503', 'bad_tag get']);
  assert.deepEqual(moment.metadata.source, { url: 'https://example.org/api', status: 503 });
  assert.deepEqual(moment.metadata.flags, ['imported']);
  assert.equal(moment.metadata.ratio, 250);
  assert.equal('nothing' in moment.metadata, false);
  assert.equal(moment.metadata.web.severity, 'err');
  assert.equal(moment.metadata.description, line);
  // The duration ends at the logged time and starts the request's length earlier.
  assert.deepEqual(
    [duration.id, duration.start, duration.end],
    ['log:x.d', `${(Date.UTC(2026, 9, 9, 8, 15, 1) / 1000) * 4 - 1}/4`, moment.time],
  );
  checkMoment({ moment, duration });
  // keepFields: false leaves only what the template builds.
  const lean = compileMapping(format, { ...definition, keepFields: false }).build(
    format.read(line),
    line,
    'log:y',
  );
  assert.equal('web' in lean.moment.metadata, false);
  assert.throws(() => compileMapping(format, { metadata: { title: 'x' } }), /title/);
  assert.throws(() => compileValue({ $field: 'a', $const: 1 }), /one of/);
  assert.throws(() => compileTemplate('{ bad field }'), /field reference/);
  assert.deepEqual(compileTemplate('{{literal}} {a.b}')({ a: { b: 'x' } }), {
    text: '{literal} x',
    complete: true,
  });
  // A plugin key with a value its plugin can't read is sent as given: each plugin handles
  // its own metadata (#157).
  const stacked = compileMapping(format, {
    ...definition,
    metadata: { stack: 'not a list' },
  }).build(format.read(line), line, 'log:z');
  checkMoment(stacked);
  assert.equal(stacked.moment.metadata.stack, 'not a list');
});

test('routes and filters compare fields: patterns, numbers, severities', () => {
  const routes = compileRoutes({
    routes: [
      { timeline: A, status: ['>=500'], continue: true },
      { timeline: B, vhost: ['shop.*', 'api.*'], method: ['POST', 'PUT'] },
      { timeline: B, 'http.version': '2*' },
    ],
    default: C,
  });
  assert.deepEqual(routes.route({ status: 503, vhost: 'shop.example', method: 'POST' }), [A, B]);
  assert.deepEqual(routes.route({ status: 200, vhost: 'shop.example', method: 'POST' }), [B]);
  assert.deepEqual(routes.route({ status: 200, vhost: 'shop.example', method: 'GET' }), [C]);
  assert.deepEqual(routes.route({ status: '502', vhost: 'other' }), [A]);
  assert.deepEqual(routes.route({ http: { version: '2.0' } }), [B]);
  assert.deepEqual(routes.route({ status: null }), [C]);
  const only = (text, entry) => parseFilter(text)(entry);
  assert(only('status>=400', { status: 404 }));
  assert(!only('status>=400', { status: 200 }));
  assert(!only('status>=400', { status: null }));
  assert(only('host=web-*', { host: 'WEB-3' }));
  assert(only('host!=web-*', { host: 'db-1' }));
  assert(only('severity>=warning', { severity: 'err' }));
  assert(!only('severity>=warning', { severity: 'info' }));
  assert(only('severity=info', { severity: 'info' }));
  assert.throws(() => parseFilter('status'), /Invalid filter/);
  assert.throws(() => parseFilter('status>=abc'), /number/);
  assert.throws(
    () => compileRoutes({ routes: [{ timeline: A, 'bad field!': 'x' }] }),
    /field name/,
  );
  // The receiver keeps its own settings: other fields are refused there.
  assert.throws(
    () => syslogRoutes({ routes: [{ timeline: A, status: '>=500' }] }),
    /unknown settings: status/,
  );
});

test('entry IDs repeat on re-import and stay distinct for identical lines', () => {
  const ids = new EntryIds('log', 4);
  const a = ids.next('line', '1/1'),
    b = ids.next('line', '1/1'),
    c = ids.next('other', '2/1'),
    d = ids.next('line', '1/1');
  assert.match(a, /^log:[0-9a-f]{32}$/);
  assert.deepEqual([b, d], [a + '.1', a + '.2']);
  assert.notEqual(c, a);
  const again = new EntryIds('log', 4);
  assert.deepEqual(
    ['line', 'line', 'other', 'line'].map((t, i) => again.next(t, i === 2 ? '2/1' : '1/1')),
    [a, b, c, d],
  );
  // Beyond the window of recent times, counts restart (documented).
  for (let i = 3; i < 10; i++) ids.next('x', `${i}/1`);
  assert.equal(ids.next('line', '1/1'), a);
  assert(/^[A-Za-z0-9_.:-]{1,128}$/.test(d));
});

test('journal entries are named by their cursor, however journalctl orders their fields', () => {
  // journalctl prints an entry's fields in a different order from one run to the next (#151).
  const format = compileFormat('journald', {}, { zone: UTC });
  const fields = {
    __CURSOR: 's=1;i=2;b=3',
    __REALTIME_TIMESTAMP: '1760004902000000',
    MESSAGE: 'same entry',
    _HOSTNAME: 'box',
  };
  const lines = [
    JSON.stringify(fields),
    JSON.stringify(Object.fromEntries(Object.entries(fields).reverse())),
  ];
  const id = (line) => {
    const entry = format.read(line);
    return new EntryIds('log').next(format.identity(entry, line), entry.time);
  };
  assert.notEqual(lines[0], lines[1]);
  assert.equal(id(lines[0]), id(lines[1]));
  // Other formats are named by their text, as before.
  const plain = compileFormat('jsonl', {}, { zone: UTC });
  const text = '{"time":"2026-10-09T08:15:01Z","message":"x"}';
  assert.equal(plain.identity(plain.read(text), text), text);
});

test('batches grow with the timeline, and the estimate follows the server', () => {
  assert.equal(batchLimit(0), 64);
  assert.equal(batchLimit(800), 400);
  assert.equal(batchLimit(1e9), 4999);
  // Each save is charged the versions it keeps, as well as the timeline's growth.
  const estimate = (start, batches) => storageEstimate(new Map([['t', { start, batches }]]));
  const batch = { entries: 1000, moments: 1000, bytes: 1e5 };
  assert.equal(
    estimate({ count: 0, bytes: 0, history: true }, [batch, batch]),
    Math.round(2 * 1e5 * 2.1),
  );
  // A timeline whose history is not kept as rows yet is copied once, by its first save.
  assert.equal(
    estimate({ count: 100000, bytes: 5e6, history: false }, [batch]),
    Math.round(5e6 * 1.1 + 1e5 * 2.1),
  );
  assert.equal(estimate({ count: 100000, bytes: 5e6, history: false }, []), 0);
  // One that keeps no saved history is charged only its growth.
  assert.equal(
    estimate({ count: 100000, bytes: 5e6, history: false, keepHistory: false }, [batch, batch]),
    2e5,
  );
});

test('progress redraws on a terminal, summarizes elsewhere, and is silent when quiet', () => {
  let now = 0;
  const sink = (isTTY) => {
    const out = { isTTY, text: '', write: (t) => ((out.text += t), true) };
    return out;
  };
  const tty = sink(true),
    progress = new Progress({ stream: tty, total: 1000, now: () => now });
  progress.stats.bytes = 500;
  progress.stats.entries = 10;
  progress.stats.saved.set(A, 7);
  progress.tick();
  now = 100;
  progress.tick(); // too soon to redraw
  now = 1000;
  progress.stats.bytes = 1000;
  progress.tick();
  assert.equal(tty.text.split('\r\x1b[K').length - 1, 2);
  assert.match(tty.text, /500 B\/1000 B 50% · 10 entries · saved 6f1c0000 7/);
  progress.finish('Done.');
  assert(tty.text.endsWith('\r\x1b[KDone.\n'));
  const pipe = sink(false),
    plain = new Progress({ stream: pipe, now: () => now });
  plain.tick();
  now += 5000;
  plain.tick();
  now += 6000;
  plain.tick();
  assert.equal(pipe.text.split('\n').length - 1, 2);
  assert(!pipe.text.includes('\r'));
  const quiet = sink(true);
  new Progress({ stream: quiet, quiet: true }).tick();
  assert.equal(quiet.text, '');
});

const sink = () => {
  const out = { isTTY: false, text: '', write: (t) => ((out.text += t), true) };
  return out;
};
const run = async (argv, extra = {}) => {
  const stdout = sink(),
    stderr = sink();
  const code = await main(argv, { env: {}, stdout, stderr, ...extra });
  return { code, stdout: stdout.text, stderr: stderr.text };
};
test('the command reads plain, gzipped and standard input, joining multi-line entries', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'och-log-test-'));
  try {
    const app = [
      '2026-10-09 08:15:01,123 ERROR [main] Request failed',
      'java.lang.IllegalStateException: boom',
      '\tat com.example.App.run(App.java:42)',
      '2026-10-09 08:15:02,000 INFO  [main] Recovered',
      '',
    ].join('\n');
    await writeFile(join(dir, 'app.log.gz'), gzipSync(app));
    await writeFile(
      join(dir, 'config.json'),
      JSON.stringify({
        formats: {
          app: {
            pattern: '^(?<ts>\\S+ \\S+) (?<level>[A-Z]+) +\\[(?<thread>[^\\]]+)\\] (?<message>.*)$',
            time: { field: 'ts', as: 'iso' },
            multiline: { start: '^\\d{4}-' },
          },
        },
      }),
    );
    const result = await run([
      '--config',
      join(dir, 'config.json'),
      '--format',
      'app',
      '--timezone',
      'UTC',
      '--dry-run',
      '--quiet',
      '--sample',
      '5',
      join(dir, 'app.log.gz'),
    ]);
    assert.equal(result.code, EXIT.ok, result.stderr);
    const plan = JSON.parse(result.stdout);
    assert.equal(plan.entries, 2);
    assert.match(plan.samples[0].moment.metadata.description, /boom\n\tat com\.example/);
    assert.equal(plan.samples[0].moment.metadata.app.severity, 'err');
    assert.deepEqual(plan.timelines, { '(no timeline)': 2 });
    // Standard input, a classic syslog line in a given year, and a filter.
    const stdin = Readable.from(['Oct  9 08:15:01 h a: kept\nOct  9 08:15:02 h b: dropped\n']);
    const piped = await run(
      [
        '--format',
        'syslog',
        '--year',
        '2025',
        '--timezone',
        'UTC',
        '--only',
        'app=a',
        '--dry-run',
        '--quiet',
        '-',
      ],
      { stdin },
    );
    const pipedPlan = JSON.parse(piped.stdout);
    assert.deepEqual([pipedPlan.entries, pipedPlan.filtered], [2, 1]);
    assert.equal(pipedPlan.samples[0].moment.time, at(2025, 9, 9, 8, 15, 1));
    // --since and --until bound the times imported.
    await writeFile(
      join(dir, 'times.log'),
      'Oct  9 08:00:00 h a: early\nOct  9 09:00:00 h a: late\n',
    );
    await utimes(join(dir, 'times.log'), new Date('2026-10-10'), new Date('2026-10-10'));
    const bounded = JSON.parse(
      (
        await run([
          '--format',
          'syslog',
          '--timezone',
          'UTC',
          '--since',
          '2026-10-09T08:30:00Z',
          '--dry-run',
          '--quiet',
          join(dir, 'times.log'),
        ])
      ).stdout,
    );
    assert.deepEqual(
      [bounded.filtered, bounded.samples.map((s) => s.moment.metadata.title)],
      [1, ['late']],
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('the command reports usage errors with exit code 2 and prints help', async () => {
  const help = await run(['--help']);
  assert.equal(help.code, EXIT.ok);
  assert.equal(help.stdout, HELP);
  for (const [argv, message] of [
    [[], /Name the log files/],
    [['--format', 'nope', 'x'], /Unknown format nope/],
    [['--format', 'syslog', 'x'], /--timeline/],
    [['--format', 'syslog', '--timezone', 'Nowhere/Here', '--dry-run', 'x'], /time zone/],
    [['--format', 'syslog', '--only', 'oops', '--dry-run', 'x'], /Invalid filter/],
    [['--format', 'syslog', '--year', '99', '--dry-run', 'x'], /four-digit/],
    [['--format', 'syslog', '--dry-run', '/does/not/exist'], /cannot read/],
    [['--format', 'syslog', '--timeline', A, 'x'], /OCH_API_URL/],
  ]) {
    const result = await run(argv);
    assert.equal(result.code, EXIT.usage, `${argv.join(' ')}: ${result.stderr}`);
    assert.match(result.stderr, message);
  }
});
