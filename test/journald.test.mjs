// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// Following the journal (#151; server/journald-receiver.mjs): the journalctl command, moments
// as the importer makes them, IDs from cursors (stable however journalctl orders fields), the
// cursor kept once sent, and restarting after the last entry read.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm, chmod } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { JournaldIngest, journalCommand, followJournal } from '../server/journald-receiver.mjs';
import { compileRoutes } from '../server/log-routes.mjs';

const A = '11111111-1111-4111-8111-111111111111',
  B = '22222222-2222-4222-8222-222222222222',
  key = 'och_key_' + 'a'.repeat(32) + '_' + 'b'.repeat(64);
/** A fake API recording saves. */
function fakeApi() {
  const api = { revision: '1', saves: [] };
  api.fetcher = async (url, options) => {
    const json = (status, value) => ({
      status,
      json: async () => value,
      headers: { get: () => null },
    });
    if (options.method === undefined)
      return json(200, { revision: api.revision, title: 'Logs', description: '' });
    const body = JSON.parse(options.body);
    if (body.revision !== api.revision) return json(409, { error: 'changed' });
    api.saves.push({ path: new URL(url).pathname, body });
    api.revision = String(Number(api.revision) + 1);
    return json(200, { revision: api.revision });
  };
  return api;
}
const quiet = { warn() {}, error() {} };
const ingestFor = (api, options = {}) =>
  new JournaldIngest({
    api: 'https://timescale.info',
    key,
    routes: compileRoutes({ routes: [{ timeline: A, unit: 'forgejo.service' }], default: B }),
    fetcher: api.fetcher,
    flushMs: 5,
    log: quiet,
    ...options,
  });
/** A journal entry, as journalctl -o json prints it (fields in `order`). */
const entry = (n, unit = 'forgejo.service', order = null) => {
  const fields = {
    __CURSOR: `s=abc;i=${n.toString(16)};b=boot;m=1;t=6;x=f`,
    __REALTIME_TIMESTAMP: String(1792000000000000 + n * 1000),
    MESSAGE: `request ${n}`,
    PRIORITY: '6',
    SYSLOG_IDENTIFIER: 'forgejo',
    _SYSTEMD_UNIT: unit,
    _HOSTNAME: 'forge',
    _PID: '42',
  };
  const keys = order ?? Object.keys(fields);
  return JSON.stringify(Object.fromEntries(keys.map((k) => [k, fields[k]])));
};
const settle = async (ingest) => {
  for (let i = 0; i < 200 && !ingest.idle; i++) await delay(5);
  await ingest.saving;
};

test('journalctl follows from the cursor, or from a time, here or over SSH', () => {
  assert.deepEqual(journalCommand({ units: ['forgejo.service'], since: '-1h' }), [
    'journalctl',
    [
      '--follow',
      '--output=json',
      '--no-pager',
      '--quiet',
      '--unit',
      'forgejo.service',
      '--since',
      '-1h',
    ],
  ]);
  const [, resumed] = journalCommand({ cursor: 's=1;i=2', matches: ['_UID=1000'] });
  assert.deepEqual(resumed.slice(-3), ['--after-cursor', 's=1;i=2', '_UID=1000']);
  // Over SSH the remote shell reads it: every argument is quoted, a ; included.
  const [ssh, args] = journalCommand({ host: 'admin@forge', cursor: "s=1;i='2" });
  assert.equal(ssh, 'ssh');
  assert.deepEqual(args.slice(0, 4), ['-o', 'BatchMode=yes', 'admin@forge', '--']);
  assert.match(args[4], /^'journalctl' '--follow' .* '--after-cursor' 's=1;i='\\''2'$/);
  const [, keyed] = journalCommand({
    host: 'forge',
    sshKey: '/etc/k',
    knownHosts: '/var/lib/x/known_hosts',
  });
  assert.deepEqual(keyed.slice(0, 8), [
    '-o',
    'BatchMode=yes',
    '-i',
    '/etc/k',
    '-o',
    'StrictHostKeyChecking=accept-new',
    '-o',
    'UserKnownHostsFile=/var/lib/x/known_hosts',
  ]);
});

test('entries become the importer’s moments, routed by unit, with IDs from their cursors', async () => {
  const api = fakeApi(),
    ingest = ingestFor(api);
  assert.deepEqual(ingest.accept(entry(1)), [A]);
  assert.deepEqual(ingest.accept(entry(2, 'cron.service')), [B]);
  assert.deepEqual(ingest.accept('not json'), []);
  await settle(ingest);
  const saved = Object.fromEntries(
    api.saves.map((s) => [s.path.split('/')[3], s.body.changes.map((c) => c.event)]),
  );
  const [moment] = saved[A];
  assert.equal(moment.metadata.title, 'request 1');
  assert.deepEqual(moment.metadata.tags, [
    'journald',
    'severity:info',
    'host:forge',
    'app:forgejo',
    'unit:forgejo.service',
  ]);
  assert.equal(moment.time, '1792000000001/1000');
  assert.equal(ingest.stats.invalid, 1);
  // journalctl orders an entry's fields differently from one run to the next; the moment is
  // the same one.
  const replayed = fakeApi(),
    again = ingestFor(replayed);
  const reordered = entry(1, 'forgejo.service', [
    '_PID',
    'MESSAGE',
    '__REALTIME_TIMESTAMP',
    '_HOSTNAME',
    '__CURSOR',
    'SYSLOG_IDENTIFIER',
    'PRIORITY',
    '_SYSTEMD_UNIT',
  ]);
  assert.notEqual(reordered, entry(1));
  again.accept(reordered);
  await settle(again);
  assert.equal(replayed.saves[0].body.changes[0].id, moment.id);
  ingest.close();
  again.close();
});

test('the cursor is kept once everything read is sent, and resumed from', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'och-journald-'));
  try {
    const cursorFile = join(dir, 'state', 'cursor');
    const api = fakeApi(),
      ingest = ingestFor(api, { cursorFile });
    assert.equal(await ingest.resume(), null);
    ingest.accept(entry(1));
    ingest.accept(entry(2));
    await settle(ingest);
    assert.equal((await readFile(cursorFile, 'utf8')).trim(), JSON.parse(entry(2)).__CURSOR);
    const next = ingestFor(fakeApi(), { cursorFile });
    assert.equal(await next.resume(), JSON.parse(entry(2)).__CURSOR);
    assert.equal(next.cursor, JSON.parse(entry(2)).__CURSOR);
    ingest.close();
    next.close();
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('journalctl is restarted after the last entry read when it stops', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'och-journald-'));
  try {
    // A stand-in journalctl: records its arguments, prints one entry per run, then stops.
    const calls = join(dir, 'calls'),
      fake = join(dir, 'journalctl');
    await writeFile(
      fake,
      `#!/usr/bin/env node
const { appendFileSync, readFileSync } = require('node:fs');
appendFileSync(${JSON.stringify(calls)}, JSON.stringify(process.argv.slice(2)) + '\\n');
const run = readFileSync(${JSON.stringify(calls)}, 'utf8').trim().split('\\n').length;
console.log(${JSON.stringify(entry(1))}.replace('i=1;', 'i=' + run + ';').replace('request 1', 'request ' + run));
`,
    );
    await chmod(fake, 0o755);
    const api = fakeApi(),
      ingest = ingestFor(api);
    const controller = new AbortController();
    const following = followJournal(
      ingest,
      { command: fake, units: ['forgejo.service'] },
      controller.signal,
      quiet,
    );
    for (let i = 0; i < 400 && ingest.stats.received < 2; i++) await delay(10);
    controller.abort();
    await following;
    const runs = (await readFile(calls, 'utf8'))
      .trim()
      .split('\n')
      .map((l) => JSON.parse(l));
    assert(runs.length >= 2, String(runs.length));
    assert(runs[0].includes('--since'));
    // The second run resumes after the entry the first printed.
    assert.deepEqual(
      runs[1].slice(runs[1].indexOf('--after-cursor'), runs[1].indexOf('--after-cursor') + 2),
      ['--after-cursor', 's=abc;i=1;b=boot;m=1;t=6;x=f'],
    );
    await settle(ingest);
    ingest.close();
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
