// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
import assert from 'node:assert/strict';
import test from 'node:test';
import { compileRoutes, parseSyslog, syslogFrames, syslogMoment } from '../server/syslog.mjs';
import { SyslogIngest } from '../server/syslog-receiver.mjs';
import { TimelineWriter, BATCH_LIMIT, BATCH_MIN, SLOW_SAVE } from '../server/timeline-writer.mjs';

const received = Date.UTC(2026, 9, 10, 12, 0, 0);
const A = '11111111-1111-4111-8111-111111111111',
  B = '22222222-2222-4222-8222-222222222222',
  C = '33333333-3333-4333-8333-333333333333';

test('RFC 5424 messages keep exact times, fields and structured data', () => {
  const entry = parseSyslog(
    '<34>1 2026-10-10T12:34:56.120Z web-1 nginx 42 ID47 [origin ip="192.0.2.1"][x@1 a="q\\"\\]\\\\"] ﻿Request failed',
    received,
  );
  assert.deepEqual(entry, {
    format: 'rfc5424',
    facility: 'auth',
    severity: 'crit',
    time: '44790892403/25', // 1791635696.12 Unix seconds, exactly
    host: 'web-1',
    app: 'nginx',
    procid: '42',
    msgid: 'ID47',
    structuredData: { origin: { ip: '192.0.2.1' }, 'x@1': { a: 'q"]\\' } },
    message: 'Request failed',
  });
  // Offsets convert to UTC; nil fields are null; microseconds stay exact.
  const offset = parseSyslog('<165>1 2026-10-10T14:34:56.000001+02:00 - - - - - hello', received);
  assert.equal(offset.time, '1791635696000001/1000000');
  assert.equal(offset.facility, 'local4');
  assert.equal(offset.severity, 'notice');
  assert.equal(offset.host, null);
  assert.equal(offset.structuredData, null);
  // A nil timestamp means "when received".
  assert.equal(parseSyslog('<14>1 - h a - - - x', received).time, received / 1000 + '/1');
  assert.throws(() => parseSyslog('<14>1 2026-13-99 h a - - - x', received), /timestamp/);
  assert.throws(() => parseSyslog('<14>1 - h a - - [broken x', received), /structured/);
});

test('BSD messages get the year nearest to receipt; unknown text is kept whole', () => {
  const entry = parseSyslog('<38>Oct 10 12:34:56 gateway sshd[812]: Failed password', received);
  assert.equal(entry.format, 'rfc3164');
  assert.equal(entry.time, Date.UTC(2026, 9, 10, 12, 34, 56) / 1000 + '/1');
  assert.deepEqual(
    [entry.host, entry.app, entry.procid, entry.message],
    ['gateway', 'sshd', '812', 'Failed password'],
  );
  assert.equal(entry.facility, 'auth');
  assert.equal(entry.severity, 'info');
  // Sent just after New Year, received just before it: last year, not next.
  const late = parseSyslog('<13>Dec 31 23:59:59 h app: x', Date.UTC(2027, 0, 1, 0, 0, 2));
  assert.equal(late.time, Date.UTC(2026, 11, 31, 23, 59, 59) / 1000 + '/1');
  const early = parseSyslog('<13>Jan  1 00:00:05 h app: x', Date.UTC(2026, 11, 31, 23, 59, 0));
  assert.equal(early.time, Date.UTC(2027, 0, 1, 0, 0, 5) / 1000 + '/1');
  const plain = parseSyslog('just some text\n', received);
  assert.deepEqual(
    [plain.format, plain.message, plain.facility, plain.severity],
    ['unknown', 'just some text', 'user', 'notice'],
  );
  assert.equal(parseSyslog('<999>x', received).severity, 'notice');
});

test('TCP framing handles octet counting and lines across chunk boundaries', () => {
  const messages = [];
  const feed = syslogFrames((m) => messages.push(m), 100);
  const counted = '<13>1 - h a - - - two\nlines';
  feed(Buffer.from(`${Buffer.byteLength(counted)} ${counted.slice(0, 10)}`));
  feed(Buffer.from(counted.slice(10) + '<13>Oct 10 12:00:00 h a: one'));
  feed(Buffer.from(' line\n\n<13>Oct 10 12:00:00 h a: é\n'));
  assert.deepEqual(messages, [
    counted,
    '<13>Oct 10 12:00:00 h a: one line',
    '<13>Oct 10 12:00:00 h a: é',
  ]);
  assert.throws(() => feed(Buffer.from('500 ' + 'x'.repeat(10))), /size limit/);
  const long = syslogFrames(() => {}, 100);
  assert.throws(() => long(Buffer.from('<13>' + 'x'.repeat(200))), /size limit/);
});

test('routes match in order, with continue, thresholds and a default', () => {
  const routes = compileRoutes({
    routes: [
      { timeline: A, host: ['web-*', 'edge-?'], severity: 'err', continue: true },
      { timeline: B, app: 'SSHD', facility: ['auth', 'authpriv'] },
      { timeline: A, msgid: 'deploy' },
    ],
    default: C,
  });
  const route = (fields) =>
    routes.route({
      host: null,
      app: null,
      msgid: null,
      facility: 'user',
      severity: 'info',
      ...fields,
    });
  assert.deepEqual(routes.timelines, [A, B, C]);
  assert.deepEqual(route({ host: 'web-3', severity: 'crit' }), [A]);
  // continue: an error from a web host that is also sshd on auth goes to both.
  assert.deepEqual(route({ host: 'web-3', severity: 'err', app: 'sshd', facility: 'auth' }), [
    A,
    B,
  ]);
  // Less severe than "err" does not match the first route.
  assert.deepEqual(route({ host: 'web-3', severity: 'warning' }), [C]);
  assert.deepEqual(route({ host: 'edge-1', severity: 'alert' }), [A]);
  assert.deepEqual(route({ host: 'edge-10', severity: 'alert' }), [C]);
  assert.deepEqual(route({ msgid: 'DEPLOY' }), [A]);
  assert.deepEqual(compileRoutes({ routes: [{ timeline: A, app: 'x' }] }).route({ app: 'y' }), []);
  for (const [config, message] of [
    [[], /JSON object/],
    [{ routes: [] }, /at least one route/],
    [{ default: 'nope' }, /default syslog timeline/],
    [{ routes: [{ host: 'x' }] }, /timeline UUID/],
    [{ routes: [{ timeline: A, severity: 'loud' }] }, /unknown severity/],
    [{ routes: [{ timeline: A, facility: 'disk' }] }, /unknown facility/],
    [{ routes: [{ timeline: A, hostname: 'x' }] }, /unknown settings: hostname/],
    [{ routes: [{ timeline: A, host: [] }] }, /pattern/],
    [{ routes: [], extra: 1 }, /Unknown syslog routing setting/],
  ])
    assert.throws(() => compileRoutes(config), message);
});

test('messages become tagged moments with the first line as title', () => {
  const entry = parseSyslog('<11>1 - db-1 postgres 77 - - checkpoint\nslow by 3s', received);
  const moment = syslogMoment(entry, 'syslog:x');
  assert.equal(moment.id, 'syslog:x');
  assert.equal(moment.metadata.title, 'checkpoint');
  assert.equal(moment.metadata.description, 'checkpoint\nslow by 3s');
  assert.deepEqual(moment.metadata.tags, [
    'syslog',
    'severity:err',
    'facility:user',
    'host:db-1',
    'app:postgres',
  ]);
  assert.deepEqual(moment.metadata.syslog, {
    format: 'rfc5424',
    facility: 'user',
    severity: 'err',
    host: 'db-1',
    app: 'postgres',
    procid: '77',
  });
  const long = syslogMoment(parseSyslog('x'.repeat(300), received), 'y');
  assert.equal(long.metadata.title.length, 200);
  assert.equal(long.metadata.description.length, 300);
  assert.equal(
    syslogMoment(parseSyslog('<14>1 - - cron - - - ', received), 'z').metadata.title,
    'cron info',
  );
});

/** A fake API: records saves, and can be told to answer with other statuses. */
function fakeApi() {
  const api = { revision: '1', saves: [], answers: [], loads: 0 };
  api.fetcher = async (url, options) => {
    const path = new URL(url).pathname;
    assert.equal(
      options.headers.Authorization,
      'Bearer och_key_' + 'a'.repeat(32) + '_' + 'b'.repeat(64),
    );
    const json = (status, value, headers = {}) => ({
      status,
      json: async () => value,
      headers: { get: (name) => headers[name] ?? null },
    });
    if (options.method === undefined) {
      api.loads++;
      return json(200, {
        id: path.split('/')[3],
        revision: api.revision,
        title: 'Logs',
        description: '',
        presentation: { mode: 'gregorian' },
        plugins: null,
      });
    }
    const body = JSON.parse(options.body);
    const answer = api.answers.shift();
    if (answer) return json(answer.status, answer.value ?? {}, answer.headers);
    if (body.revision !== api.revision) return json(409, { error: 'changed' });
    api.saves.push({ path, body });
    api.revision = String(Number(api.revision) + 1);
    return json(200, { revision: api.revision });
  };
  return api;
}
const quiet = { warn() {}, error() {} };
const ingestFor = (api, options = {}) =>
  new SyslogIngest({
    api: 'https://timescale.info',
    key: 'och_key_' + 'a'.repeat(32) + '_' + 'b'.repeat(64),
    routes: compileRoutes({ routes: [{ timeline: A, app: 'web' }], default: B }),
    fetcher: api.fetcher,
    flushMs: 5,
    log: quiet,
    ...options,
  });
const message = (app, text) => `<14>1 2026-10-10T12:00:00Z host ${app} - - - ${text}`;

test('ingest batches per timeline and keeps the timeline settings', async () => {
  const api = fakeApi(),
    ingest = ingestFor(api);
  for (let i = 0; i < 3; i++) ingest.accept(message('web', 'w' + i));
  ingest.accept(message('db', 'd'));
  assert(await ingest.drain(2000));
  assert.deepEqual(
    api.saves.map((s) => [s.path, s.body.changes.map((c) => c.event.metadata.title)]).sort(),
    [
      [`/api/timelines/${A}/changes`, ['w0', 'w1', 'w2']],
      [`/api/timelines/${B}/changes`, ['d']],
    ].sort(),
  );
  const save = api.saves[0].body;
  assert.deepEqual(save.settings, {
    format: 'openchronology',
    version: 1,
    title: 'Logs',
    description: '',
    presentation: { mode: 'gregorian' },
  });
  for (const change of save.changes) assert.equal(change.id, change.event.id);
  assert.equal(new Set(api.saves.flatMap((s) => s.body.changes.map((c) => c.id))).size, 4);
  assert.deepEqual(ingest.stats, {
    received: 4,
    invalid: 0,
    unmatched: 0,
    queued: 4,
    sent: 4,
    dropped: 0,
    rejected: 0,
  });
});

test('ingest refetches on conflicts and retries temporary failures without losing moments', async () => {
  const api = fakeApi(),
    ingest = ingestFor(api);
  ingest.accept(message('web', 'first'));
  assert(await ingest.drain(2000));
  // Someone else saved meanwhile: the next save conflicts, refetches and succeeds.
  api.revision = '10';
  ingest.closed = false;
  ingest.accept(message('web', 'after conflict'));
  // Then the server is briefly unavailable and rate-limits once.
  api.answers.push({ status: 503 }, { status: 429, headers: { 'retry-after': '0' } });
  assert(await ingest.drain(10000));
  const titles = api.saves.flatMap((s) => s.body.changes.map((c) => c.event.metadata.title));
  assert.deepEqual(titles, ['first', 'after conflict']);
  assert(api.loads >= 3, 'Each failure refetches the revision.');
  assert.equal(ingest.stats.sent, 2);
  assert.equal(ingest.stats.rejected, 0);
});

test('ingest drops refused batches and the oldest moments past its queue limit', async () => {
  const api = fakeApi(),
    errors = [],
    ingest = ingestFor(api, { queueLimit: 2, log: { warn() {}, error: (m) => errors.push(m) } });
  api.answers.push({ status: 403, value: { error: 'Write access is required.' } });
  ingest.accept(message('web', 'refused'));
  assert(await ingest.drain(2000));
  assert.equal(ingest.stats.rejected, 1);
  assert.match(errors[0], /refused 1 moments \(403: Write access is required\.\)/);
  // Three arrive before a flush can run; the oldest is dropped.
  ingest.closed = false;
  ingest.flushMs = 10000;
  for (const text of ['a', 'b', 'c']) ingest.accept(message('web', text));
  assert(await ingest.drain(2000));
  assert.deepEqual(
    api.saves.at(-1).body.changes.map((c) => c.event.metadata.title),
    ['b', 'c'],
  );
  assert.equal(ingest.stats.dropped, 1);
  ingest.close();
  assert.throws(() => ingestFor(api, { key: 'secret' }), /OCH_API_KEY/);
  assert.throws(() => ingestFor(api, { api: 'timescale.info' }), /OCH_API_URL/);
});

test('the writer splits batches and adapts their size to how long saves take', async () => {
  const api = fakeApi();
  let clock = 0,
    took = 100;
  const fetcher = api.fetcher;
  api.fetcher = async (url, options) => {
    if (options.method) clock += took;
    return fetcher(url, options);
  };
  const writer = new TimelineWriter({
    api: 'https://timescale.info',
    key: 'och_key_' + 'a'.repeat(32) + '_' + 'b'.repeat(64),
    fetcher: api.fetcher,
    now: () => clock,
  });
  const moment = (i) => ({ id: 'm' + i, time: i + '/1', metadata: { title: 'm' + i } });
  const moments = (n) => Array.from({ length: n }, (_, i) => moment(i));
  const sizes = () => api.saves.splice(0).map((s) => s.body.changes.length);
  // Over the limit: split, the durations after every moment (they may name them).
  await writer.send(A, {
    moments: moments(BATCH_LIMIT + 10),
    durations: [{ id: 'd', start: { moment: 'm1' }, end: '5/1', metadata: { title: 'd' } }],
  });
  const saves = api.saves.splice(0);
  assert.deepEqual(
    saves.map((s) => [s.body.changes.length, s.body.durationChanges?.length ?? 0]),
    [
      [BATCH_LIMIT, 0],
      [10, 1],
    ],
  );
  // Slow saves halve the next ones, down to BATCH_MIN.
  took = SLOW_SAVE;
  await writer.send(A, { moments: moments(BATCH_LIMIT) });
  assert.deepEqual(sizes(), [BATCH_LIMIT]);
  assert.equal(writer.limit(A), BATCH_LIMIT / 2);
  for (let i = 0; i < 12; i++) await writer.send(A, { moments: moments(writer.limit(A)) });
  assert.equal(writer.limit(A), BATCH_MIN);
  // Fast full saves let them grow again; other timelines are unaffected.
  took = 100;
  assert.equal(writer.limit(B), BATCH_LIMIT);
  await writer.send(A, { moments: moments(BATCH_MIN) });
  assert.equal(writer.limit(A), BATCH_MIN * 1.5);
  // Saves the server stopped as too slow are sent again halved; at BATCH_MIN they fail.
  sizes();
  while (writer.limit(A) < 1000) await writer.send(A, { moments: moments(writer.limit(A)) });
  const limit = writer.limit(A);
  sizes();
  api.answers.push({ status: 503, value: { error: 'slow' } }, { status: 503, value: {} });
  await writer.send(A, { moments: moments(limit) });
  const quarter = Math.floor(Math.floor(limit / 2) / 2);
  assert.deepEqual(sizes().slice(0, 1), [quarter]);
  for (let i = 0; i < 20; i++) api.answers.push({ status: 503, value: {} });
  await assert.rejects(
    writer.send(A, { moments: moments(writer.limit(A)) }),
    (e) => e.status === 503,
  );
  assert.equal(writer.limit(A), BATCH_MIN);
});
