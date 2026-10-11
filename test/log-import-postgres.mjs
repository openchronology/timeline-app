// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// The log importer against PostgreSQL through the HTTP API with an API key: a mixed set of
// gzipped and plain logs imported twice keeps one moment per entry (no duplicates), with
// the expected times, metadata, routes and durations; batches wait for each save, so a
// large file loses nothing; and an import that does not fit the quota writes nothing.
import assert from 'node:assert/strict';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile, utimes } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import pg from 'pg';
import { createApplication } from '../server/http.mjs';
import { PostgresStore } from '../server/store.mjs';
import { main, EXIT } from '../server/import-logs.mjs';
import { validateDocument } from '../dist/core.mjs';

if (!process.env.DATABASE_URL) throw new Error('Use a dedicated PostgreSQL test database.');
// Bulk imports are paced by the API key's rate limit; this test raises it, as an operator
// importing large logs would.
process.env.API_KEY_REQUESTS_PER_MINUTE = '1000';
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
await pool.query(await readFile(new URL('../server/schema.sql', import.meta.url), 'utf8'));
const app = createApplication({ pool, passwordCheck: async () => {} });
await new Promise((resolve) => app.listen(0, '127.0.0.1', resolve));
const api = `http://127.0.0.1:${app.address().port}`;
const owner = randomUUID(),
  token = `och_key_${randomBytes(16).toString('hex')}_${randomBytes(32).toString('hex')}`,
  dir = await mkdtemp(join(tmpdir(), 'och-log-import-'));
const created = [];
const output = () => {
  let text = '';
  return {
    write: (chunk) => ((text += chunk), true),
    isTTY: false,
    get text() {
      return text;
    },
  };
};
const run = async (...argv) => {
  const stdout = output(),
    stderr = output();
  const code = await main(argv, { env: { OCH_API_URL: api, OCH_API_KEY: token }, stdout, stderr });
  return { code, stdout: stdout.text, stderr: stderr.text };
};
try {
  await pool.query(
    'INSERT INTO oc_users(id,username,email_verified_at,quota_bytes) VALUES($1,$2,now(),$3)',
    [owner, 'importer_' + owner.slice(0, 8), 1 << 30],
  );
  await pool.query(
    "INSERT INTO oc_api_keys(id,user_id,name,prefix,token_hash,scopes,expires_at) VALUES($1,$2,'import',$3,$4,ARRAY['timelines:read','timelines:write'],now()+interval '1 day')",
    [randomUUID(), owner, token.slice(0, 20), createHash('sha256').update(token).digest('hex')],
  );
  const store = new PostgresStore(pool);
  const timeline = async (title) => {
    const t = await store.create(
      owner,
      validateDocument({
        format: 'openchronology',
        version: 1,
        title,
        description: '',
        events: [],
      }),
    );
    created.push(t.id);
    return t.id;
  };
  const web = await timeline('Web'),
    errors = await timeline('Server errors'),
    system = await timeline('System');
  const counts = async (id) =>
    (
      await pool.query(
        `SELECT (SELECT count(*)::int FROM oc_moments WHERE timeline_id=$1) AS moments,
                (SELECT count(*)::int FROM oc_duration_nodes WHERE timeline_id=$1) AS durations`,
        [id],
      )
    ).rows[0];
  const used = async () =>
    Number(
      (await pool.query('SELECT used_bytes FROM oc_users WHERE id=$1', [owner])).rows[0].used_bytes,
    );

  // Access logs with the request time at the end: two rotated gzipped files and the current
  // one. Entry i is logged at second i; every 97th is a server error; request times of 0 s
  // make no duration.
  const entry = (i) => ({
    i,
    status: i % 97 === 0 ? 503 : i % 13 === 0 ? 404 : 200,
    seconds: Date.UTC(2026, 9, 10) / 1000 + i,
    took: i % 1000,
  });
  const text = ({ i, status, took }) => {
    const second = String(i % 60).padStart(2, '0'),
      minute = String(Math.floor(i / 60) % 60).padStart(2, '0'),
      hour = String(Math.floor(i / 3600)).padStart(2, '0');
    return `10.0.${i % 256}.${i % 7} - - [10/Oct/2026:${hour}:${minute}:${second} +0000] "GET /item/${i} HTTP/1.1" ${status} ${100 + i} "-" "probe/${i % 5}" 0.${String(took).padStart(3, '0')}`;
  };
  const entries = Array.from({ length: 12500 }, (_, i) => entry(i));
  // Repeated identical lines stay separate moments: one right after the original, and one
  // after a line of another time (as when requests finish out of order).
  const lines = entries.map(text);
  lines.splice(6, 0, text(entries[5]));
  lines.splice(10, 0, text(entries[8]));
  const logged = [...entries, entries[5], entries[8]];
  const chunk = (a, b) => lines.slice(a, b).join('\n') + '\n';
  await writeFile(join(dir, 'access.log.2.gz'), gzipSync(chunk(0, 6000)));
  await writeFile(join(dir, 'access.log.1.gz'), gzipSync(chunk(6000, 12000)));
  await writeFile(join(dir, 'access.log'), chunk(12000, lines.length));
  const accessTotal = logged.length;
  const expected = (keep) => {
    const routed = logged.filter(keep);
    return { moments: routed.length, durations: routed.filter((e) => e.took > 0).length };
  };
  const toWeb = expected((e) => e.status < 500),
    toErrors = expected((e) => e.status >= 500);
  const serverErrors = toErrors.moments;
  const config = join(dir, 'import.json');
  await writeFile(
    config,
    JSON.stringify({
      formats: {
        timed: {
          extends: 'nginx-combined',
          pattern:
            '^(?<client>\\S+) (?<ident>\\S+) (?<user>\\S+) \\[(?<time>[^\\]]+)\\] "(?<request>[^"]*)" (?<status>\\d{3}) (?<bytes>\\d+) "(?<referer>[^"]*)" "(?<agent>[^"]*)" (?<request_time>[\\d.]+)$',
          types: { status: 'int', bytes: 'int', request_time: 'number' },
          duration: { field: 'request_time', unit: 's' },
          tags: ['http', 'status:{status_class}', 'agent:{agent}'],
          metadata: { source: { url: '{path}', code: { $field: 'status', type: 'int' } } },
        },
      },
      routes: [{ timeline: errors, status: '>=500', continue: true }],
      default: web,
    }),
  );
  const files = ['access.log.2.gz', 'access.log.1.gz', 'access.log'].map((f) => join(dir, f));

  // A dry run reports the routes and an estimate, and writes nothing.
  const dry = await run(
    '--config',
    config,
    '--format',
    'timed',
    '--timezone',
    'UTC',
    '--dry-run',
    '--quiet',
    ...files,
  );
  assert.equal(dry.code, EXIT.ok, dry.stderr);
  const plan = JSON.parse(dry.stdout);
  assert.equal(plan.entries, accessTotal);
  assert.deepEqual(plan.timelines, { [web]: toWeb.moments, [errors]: serverErrors });
  assert.equal(plan.fits, true);
  assert.deepEqual(await counts(web), { moments: 0, durations: 0 });

  const before = await used();
  const first = await run(
    '--config',
    config,
    '--format',
    'timed',
    '--timezone',
    'UTC',
    '--quiet',
    ...files,
  );
  assert.equal(first.code, EXIT.ok, first.stderr);
  // Every entry arrived, in more than two batches that each waited for the previous save.
  assert.deepEqual(await counts(web), toWeb);
  assert.deepEqual(await counts(errors), toErrors);
  const estimate = plan.estimatedBytes,
    charged = (await used()) - before;
  console.log(`storage: estimated ${estimate} bytes, charged ${charged}`);
  // The estimate follows the server's patches and snapshots closely.
  assert(
    Math.abs(charged - estimate) < charged * 0.15,
    `estimate ${estimate} vs charged ${charged}`,
  );

  // Exact times, typed metadata, tags and the duration ending at the entry.
  const { rows } = await pool.query(
    "SELECT event FROM oc_moments WHERE timeline_id=$1 AND event->'metadata'->>'title'='GET /item/97 → 503'",
    [errors],
  );
  assert.equal(rows.length, 1);
  const moment = rows[0].event;
  assert.equal(moment.time, String(Date.UTC(2026, 9, 10, 0, 1, 37) / 1000) + '/1');
  assert.deepEqual(moment.metadata.source, { url: '/item/97', code: 503 });
  assert.equal(moment.metadata.timed.status, 503);
  assert.equal(moment.metadata.timed.request_time, 0.097);
  assert.deepEqual(moment.metadata.tags, ['http', 'status:5xx', 'agent:probe/2']);
  const span = (
    await pool.query(
      "SELECT oc_qtext(first_time) AS f,oc_qtext(last_time) AS l FROM oc_duration_nodes WHERE timeline_id=$1 AND band->>'id'=$2",
      [errors, moment.id + '.d'],
    )
  ).rows[0];
  // The request took 0.097 s: the span starts that long before the logged time.
  assert.equal(span.l, moment.time);
  assert.equal(span.f, `${(Date.UTC(2026, 9, 10, 0, 1, 37) / 1000) * 1000 - 97}/1000`);

  // Classic syslog lines, gzipped, crossing New Year, in a fixed zone.
  const syslog = join(dir, 'syslog.1.gz');
  await writeFile(
    syslog,
    gzipSync(
      [
        'Dec 31 23:59:58 gateway sshd[812]: Accepted publickey for alice',
        'Jan  1 00:00:03 gateway CRON[901]: (root) CMD (run-parts /etc/cron.hourly)',
        'Jan  1 00:00:03 gateway CRON[901]: (root) CMD (run-parts /etc/cron.hourly)',
        'Jan  1 00:00:09 gateway kernel: [  12.3] usb 1-1: new high-speed USB device',
      ].join('\n') + '\n',
    ),
  );
  await utimes(syslog, new Date('2027-01-02T00:00:00Z'), new Date('2027-01-02T00:00:00Z'));
  const sys = await run(
    '--format',
    'syslog',
    '--timezone',
    '+02:00',
    '--timeline',
    system,
    '--quiet',
    syslog,
  );
  assert.equal(sys.code, EXIT.ok, sys.stderr);
  const times = (
    await pool.query(
      "SELECT event->>'time' AS t FROM oc_moments WHERE timeline_id=$1 ORDER BY event->>'time'",
      [system],
    )
  ).rows.map((r) => r.t);
  assert.deepEqual(times, [
    `${Date.UTC(2026, 11, 31, 21, 59, 58) / 1000}/1`,
    `${Date.UTC(2026, 11, 31, 22, 0, 3) / 1000}/1`,
    `${Date.UTC(2026, 11, 31, 22, 0, 3) / 1000}/1`,
    `${Date.UTC(2026, 11, 31, 22, 0, 9) / 1000}/1`,
  ]);

  // Importing everything again overwrites: the same moments, no duplicates.
  const snapshot = async () =>
    (
      await pool.query(
        'SELECT timeline_id,id,event FROM oc_moments WHERE timeline_id = ANY($1) ORDER BY 1,2',
        [[web, errors, system]],
      )
    ).rows;
  const once = await snapshot();
  const again = await run(
    '--config',
    config,
    '--format',
    'timed',
    '--timezone',
    'UTC',
    '--quiet',
    ...files,
  );
  const sysAgain = await run(
    '--format',
    'syslog',
    '--timezone',
    '+02:00',
    '--timeline',
    system,
    '--quiet',
    syslog,
  );
  assert.equal(again.code, EXIT.ok, again.stderr);
  assert.equal(sysAgain.code, EXIT.ok, sysAgain.stderr);
  assert.deepEqual(await snapshot(), once);
  assert.deepEqual(await counts(web), toWeb);

  // Over the quota: nothing is written, and the dry run says it would not fit.
  await pool.query('UPDATE oc_users SET quota_bytes=used_bytes+1000 WHERE id=$1', [owner]);
  const tight = await run(
    '--config',
    config,
    '--format',
    'timed',
    '--timezone',
    'UTC',
    '--dry-run',
    '--quiet',
    ...files,
  );
  assert.equal(JSON.parse(tight.stdout).fits, false);
  const revision = (await pool.query('SELECT revision FROM oc_timelines WHERE id=$1', [web]))
    .rows[0].revision;
  const refused = await run(
    '--config',
    config,
    '--format',
    'timed',
    '--timezone',
    'UTC',
    '--quiet',
    ...files,
  );
  assert.equal(refused.code, EXIT.quota, refused.stderr);
  assert.match(refused.stderr, /Nothing was written/);
  assert.equal(
    (await pool.query('SELECT revision FROM oc_timelines WHERE id=$1', [web])).rows[0].revision,
    revision,
  );
  console.log(
    `PASS log import: ${accessTotal} access entries in batches with durations and routes, classic syslog across New Year, re-imports overwrite, the quota is checked first.`,
  );
} finally {
  for (const id of created) await pool.query('DELETE FROM oc_timelines WHERE id=$1', [id]);
  await pool.query('DELETE FROM oc_api_keys WHERE user_id=$1', [owner]);
  await pool.query('DELETE FROM oc_storage_entries WHERE user_id=$1', [owner]);
  await pool.query('DELETE FROM oc_users WHERE id=$1', [owner]);
  await rm(dir, { recursive: true, force: true });
  await new Promise((resolve) => app.close(resolve));
  await pool.end();
}
