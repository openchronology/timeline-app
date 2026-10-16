// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// Following the real journal end to end (#151): entries written with systemd-cat reach a
// timeline through the journald receiver (journalctl → API key → PostgreSQL); stopped and
// started again, it resumes after the last entry sent, missing nothing written meanwhile and
// sending nothing twice; and importing the same entries afterwards with och-import-logs
// adds nothing, since a live entry and an imported one are the same moment.
// Skipped (with a message) where this account cannot read the system journal.
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import pg from 'pg';
import { createApplication } from '../server/http.mjs';
import { PostgresStore } from '../server/store.mjs';
import { main as importLogs } from '../server/import-logs.mjs';
import { validateDocument } from '../dist/core.mjs';
if (!process.env.DATABASE_URL) throw new Error('Use a dedicated PostgreSQL test database.');

const tag = 'och-journald-' + randomBytes(4).toString('hex');
const write = (lines) =>
  execFileSync('systemd-cat', ['-t', tag], { input: lines.join('\n') + '\n' });
const journal = () =>
  execFileSync('journalctl', ['-o', 'json', '--no-pager', '-t', tag], { encoding: 'utf8' });
// Can this account read what it writes to the system journal?
let readable = false;
try {
  write(['probe']);
  for (let i = 0; i < 20 && !readable; i++) {
    readable = journal().includes('"probe"');
    if (!readable) await delay(100);
  }
} catch {}
if (!readable) {
  console.log('SKIP journald live: this account cannot write to and read the system journal.');
  process.exit(0);
}

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
await pool.query(await readFile(new URL('../server/schema.sql', import.meta.url), 'utf8'));
const app = createApplication({ pool });
await new Promise((resolve) => app.listen(0, '127.0.0.1', resolve));
const api = `http://127.0.0.1:${app.address().port}`;
const owner = randomUUID(),
  key = `och_key_${randomBytes(16).toString('hex')}_${randomBytes(32).toString('hex')}`,
  state = await mkdtemp(join(tmpdir(), 'och-journald-'));
let receiver = null,
  logs = '';
/** Starts the receiver, following this test's entries; resolves once it follows. */
async function start(timeline) {
  const child = spawn(process.execPath, ['server/journald-receiver.mjs'], {
    env: {
      ...process.env,
      OCH_API_URL: api,
      OCH_API_KEY: key,
      JOURNALD_TIMELINE: timeline,
      JOURNALD_MATCHES: `SYSLOG_IDENTIFIER=${tag}`,
      JOURNALD_SINCE: '-1min',
      JOURNALD_CURSOR_FILE: join(state, 'cursor'),
      JOURNALD_FLUSH_MS: '200',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  for (const s of [child.stdout, child.stderr])
    s.on('data', (c) => (logs = (logs + c).slice(-8000)));
  for (let i = 0; i < 100 && !logs.includes('journald: following'); i++) await delay(50);
  assert(logs.includes('journald: following'), logs);
  receiver = child;
  return child;
}
async function stop() {
  const exited = new Promise((done) => receiver.once('exit', done));
  receiver.kill('SIGTERM');
  const code = await exited;
  receiver = null;
  return code;
}
const titles = async (timeline) =>
  (
    await pool.query(
      "SELECT event->'metadata'->>'title' AS title FROM oc_moments WHERE timeline_id=$1 AND id LIKE 'log:%' ORDER BY title",
      [timeline],
    )
  ).rows.map((r) => r.title);
async function until(timeline, count) {
  for (let i = 0; i < 300; i++) {
    if ((await titles(timeline)).length >= count) return titles(timeline);
    await delay(100);
  }
  assert.fail(`Expected ${count} moments, have ${(await titles(timeline)).length}.\n${logs}`);
}
try {
  await pool.query(
    'INSERT INTO oc_users(id,username,email_verified_at,quota_bypass) VALUES($1,$2,now(),true)',
    [owner, 'journald_' + owner.slice(0, 8)],
  );
  await pool.query(
    "INSERT INTO oc_api_keys(id,user_id,name,prefix,token_hash,scopes,expires_at) VALUES($1,$2,'journald',$3,$4,ARRAY['timelines:read','timelines:write'],now()+interval '1 day')",
    [randomUUID(), owner, key.slice(0, 20), createHash('sha256').update(key).digest('hex')],
  );
  const timeline = (
    await new PostgresStore(pool).create(
      owner,
      validateDocument({
        format: 'openchronology',
        version: 1,
        title: 'Journal',
        description: '',
        events: [],
      }),
    )
  ).id;

  // Live: what is written to the journal reaches the timeline.
  await start(timeline);
  write(['first entry', 'second entry']);
  assert.deepEqual(await until(timeline, 3), ['first entry', 'probe', 'second entry']);
  // Stopped, it keeps its place; what is written meanwhile arrives once it is back.
  assert.equal(await stop(), 0);
  assert.match(await readFile(join(state, 'cursor'), 'utf8'), /^s=/);
  write(['written while stopped']);
  await start(timeline);
  write(['after restart']);
  assert.deepEqual(await until(timeline, 5), [
    'after restart',
    'first entry',
    'probe',
    'second entry',
    'written while stopped',
  ]);
  await delay(500);
  assert.equal((await titles(timeline)).length, 5, 'Nothing is sent twice.');
  assert.equal(await stop(), 0);

  // The same entries imported afterwards are the same moments: none is added.
  const output = { write() {} };
  const code = await importLogs(['--format', 'journald', '--timeline', timeline, '--quiet', '-'], {
    env: { OCH_API_URL: api, OCH_API_KEY: key },
    stdin: Readable.from([journal()]),
    stdout: output,
    stderr: output,
  });
  assert.equal(code, 0);
  assert.equal((await titles(timeline)).length, 5, 'Importing them again adds nothing.');
  console.log('PASS journald live: following, resuming after a restart, and matching imports.');
} finally {
  if (receiver) await stop();
  await rm(state, { recursive: true, force: true });
  await pool.query('DELETE FROM oc_timelines WHERE owner_id=$1', [owner]);
  await pool.query('DELETE FROM oc_users WHERE id=$1', [owner]);
  app.close();
  await pool.end();
}
