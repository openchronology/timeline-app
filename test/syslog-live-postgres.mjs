// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
/**
 * Realtime timeline data, end to end: syslog over UDP and TCP → receiver → API (with an API
 * key) → PostgreSQL → the live event stream → an open editor, without reloading.
 *
 * Checks routing, live display, Follow latest, a server restart mid-stream (the receiver
 * retries, the viewer reconnects and catches up), a sustained-rate soak with no lost or
 * duplicated moments, and the owner choosing a time format while messages arrive (#123). The
 * soak doubles as a benchmark:
 *
 *   DATABASE_URL=... npm run bench:realtime        (100 messages/s for 60 s)
 *   SOAK_RATE=500 SOAK_SECONDS=30 DATABASE_URL=... node test/syslog-live-postgres.mjs
 */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createSocket } from 'node:dgram';
import { connect } from 'node:net';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import pg from 'pg';
import { chromium } from 'playwright';
import { PostgresStore } from '../server/store.mjs';
import { compileRoutes } from '../server/syslog.mjs';
import { SyslogIngest, listenSyslog } from '../server/syslog-receiver.mjs';
import { validateDocument } from '../dist/core.mjs';
import { passwordHash } from '../server/auth.mjs';
if (!process.env.DATABASE_URL) throw new Error('Use a dedicated PostgreSQL test database.');
// `--bench` (npm run bench:realtime) soaks longer and faster than the CI check.
const bench = process.argv.includes('--bench');
const rate = Number(process.env.SOAK_RATE ?? (bench ? 100 : 20)),
  seconds = Number(process.env.SOAK_SECONDS ?? (bench ? 60 : 10));
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
await pool.query(await readFile(new URL('../server/schema.sql', import.meta.url), 'utf8'));
const port = Number(process.env.PLATFORM_TEST_PORT ?? 5197),
  origin = `http://127.0.0.1:${port}`;

let server = null,
  logs = '';
/** The production Next.js server (built with `npm run build`), as in next-postgres.mjs. */
async function startServer() {
  const env = {
    ...process.env,
    NODE_ENV: 'production',
    APP_ORIGIN: origin,
    OCH_APP_ROOT: process.cwd(),
    NEXT_TELEMETRY_DISABLED: '1',
    PORT: String(port),
    HOSTNAME: '127.0.0.1',
    // The soak saves about once a second per timeline; leave room for retries.
    API_KEY_REQUESTS_PER_MINUTE: '1000',
  };
  for (const key of Object.keys(env)) if (key.startsWith('OAUTH_')) delete env[key];
  const child = spawn(
    process.execPath,
    [resolve(process.env.PLATFORM_TEST_SERVER ?? 'platform/.next/standalone/platform/server.cjs')],
    { env, stdio: ['ignore', 'pipe', 'pipe'] },
  );
  let exited = false;
  for (const s of [child.stdout, child.stderr])
    s.on('data', (c) => (logs = (logs + c).slice(-12000)));
  child.on('exit', () => (exited = true));
  for (let i = 0; ; i++) {
    if (exited) throw new Error(logs);
    try {
      if ((await fetch(origin + '/healthz', { signal: AbortSignal.timeout(500) })).ok) break;
    } catch {}
    if (i > 150) throw new Error('Platform did not start:\n' + logs);
    await delay(200);
  }
  server = child;
}
async function stopServer() {
  if (!server || server.exitCode !== null) return;
  const exited = new Promise((done) => server.once('exit', done));
  // Open live streams keep Next.js from exiting on SIGTERM; like `docker stop`, kill it
  // after a grace period.
  server.kill('SIGTERM');
  if (!(await Promise.race([exited.then(() => true), delay(5000).then(() => false)]))) {
    server.kill('SIGKILL');
    await exited;
  }
}
/** Signs in over the API; the session's cookies, as [name, value] pairs. */
async function signIn(username, password) {
  const cookies = new Map();
  let csrf;
  for (const [path, data] of [['/api/session'], ['/api/auth/login', { username, password }]]) {
    const res = await fetch(origin + path, {
      method: data ? 'POST' : 'GET',
      headers: {
        Origin: origin,
        ...(cookies.size ? { Cookie: [...cookies].map(([k, v]) => `${k}=${v}`).join('; ') } : {}),
        ...(csrf ? { 'X-CSRF-Token': csrf } : {}),
        ...(data ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(data ? { body: JSON.stringify(data) } : {}),
    });
    for (const header of res.headers.getSetCookie()) {
      const [key, value] = header.split(';')[0].split('=');
      if (value) cookies.set(key, value);
      else cookies.delete(key);
    }
    const value = await res.json();
    assert(res.ok, `${path}: ${JSON.stringify(value)}`);
    csrf = value.csrf ?? csrf;
  }
  return [...cookies];
}

const owner = randomUUID(),
  token = `och_key_${randomBytes(16).toString('hex')}_${randomBytes(32).toString('hex')}`;
let browser, listening, ingest;
const now = Math.floor(Date.now() / 1000);
try {
  await pool.query(
    'INSERT INTO oc_users(id,username,email_verified_at,quota_bypass) VALUES($1,$2,now(),true)',
    [owner, 'syslog_' + owner.slice(0, 8)],
  );
  await pool.query(
    "INSERT INTO oc_api_keys(id,user_id,name,prefix,token_hash,scopes,expires_at) VALUES($1,$2,'syslog',$3,$4,ARRAY['timelines:read','timelines:write'],now()+interval '1 day')",
    [randomUUID(), owner, token.slice(0, 20), createHash('sha256').update(token).digest('hex')],
  );
  const store = new PostgresStore(pool);
  const create = async (title) => {
    const timeline = await store.create(
      owner,
      validateDocument({
        format: 'openchronology',
        version: 1,
        title,
        description: '',
        // An hour either side of now, so the opened view contains arriving messages.
        events: [
          { id: 'start', time: `${now - 3600}/1`, metadata: { title: 'An hour ago' } },
          { id: 'end', time: `${now + 3600}/1`, metadata: { title: 'An hour from now' } },
        ],
      }),
    );
    await pool.query("UPDATE oc_timelines SET visibility='public' WHERE id=$1", [timeline.id]);
    return timeline.id;
  };
  const web = await create('Web logs'),
    other = await create('Everything else');
  const stored = async (timeline) =>
    (
      await pool.query(
        "SELECT count(*)::int AS n, count(DISTINCT event->'metadata'->>'title')::int AS titles FROM oc_moments WHERE timeline_id=$1 AND id LIKE 'syslog:%'",
        [timeline],
      )
    ).rows[0];

  await startServer();
  ingest = new SyslogIngest({
    api: origin,
    key: token,
    routes: compileRoutes({ routes: [{ timeline: web, app: 'web*' }], default: other }),
    flushMs: 200,
    log: { warn() {}, error: (m) => console.error(m) },
  });
  listening = await listenSyslog(ingest, { port: 0 });
  const udp = createSocket('udp4');
  const sendUdp = (text) =>
    new Promise((done, fail) =>
      udp.send(Buffer.from(text), listening.udp, '127.0.0.1', (e) => (e ? fail(e) : done())),
    );
  const tcp = connect(listening.tcp, '127.0.0.1');
  await new Promise((done) => tcp.once('connect', done));
  const sendTcp = (text) => tcp.write(`${Buffer.byteLength(text)} ${text}`);
  const line = (app, title, at = Date.now()) =>
    `<14>1 ${new Date(at).toISOString()} host-1 ${app} - - - ${title}`;

  // An anonymous viewer of the public timeline; the page must never reload.
  browser = await chromium.launch(
    process.env.BROWSER_EXECUTABLE ? { executablePath: process.env.BROWSER_EXECUTABLE } : {},
  );
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  let loads = 0;
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('load', () => loads++);
  await page.goto(`${origin}/editor/frame#timeline/${web}`);
  await page.waitForFunction(() => document.getElementById('timeline-title').value === 'Web logs');
  const events = () =>
    page.evaluate(() =>
      Number(document.getElementById('event-count').textContent.split(' ')[0].replace(/\D/g, '')),
    );
  const visible = (count, timeout = 30000) =>
    page.waitForFunction(
      (n) =>
        Number(
          document.getElementById('event-count').textContent.split(' ')[0].replace(/\D/g, ''),
        ) >= n,
      count,
      { timeout },
    );
  assert.equal(await events(), 2);

  // Live: UDP and TCP messages appear without reloading; others are routed elsewhere.
  await sendUdp(line('web', 'Over UDP'));
  sendTcp(line('webapp', 'Over TCP'));
  await sendUdp(line('db', 'Routed to the default'));
  await visible(4);
  await page.locator('.event-marker[aria-label="Over UDP"], .event-marker.group').first().waitFor();
  assert.deepEqual(await stored(other), { n: 1, titles: 1 });

  // Follow latest: an idle viewer moves to moments arriving outside its view.
  await page.locator('#follow-latest-control').waitFor();
  await page.locator('#follow-latest').check();
  const left = await page.locator('#exact-left').inputValue();
  await sendUdp(line('web', 'Far ahead', (now + 30 * 86400) * 1000));
  await visible(5);
  await page.waitForFunction(
    (before) => document.getElementById('exact-left').value !== before,
    left,
    { timeout: 30000 },
  );
  await page.locator('#follow-latest').uncheck();

  // Restart the server mid-stream: the receiver keeps its queue and retries, and the viewer
  // reconnects and catches up.
  await stopServer();
  for (let i = 0; i < 5; i++) await sendUdp(line('web', 'During restart ' + i));
  await delay(1500);
  await startServer();
  await visible(10, 90000);
  assert.deepEqual(await stored(web), { n: 8, titles: 8 });

  // Soak: a steady rate for a while; every moment arrives once, and we measure how long a
  // viewer waits for each.
  const total = rate * seconds,
    sent = [],
    base = await events();
  await page.evaluate(() => {
    window.__counts = [];
    const node = document.getElementById('event-count');
    new MutationObserver(() =>
      window.__counts.push([Date.now(), Number(node.textContent.split(' ')[0].replace(/\D/g, ''))]),
    ).observe(node, { childList: true, characterData: true, subtree: true });
  });
  const started = Date.now();
  for (let i = 0; i < total; i++) {
    const due = started + (i * 1000) / rate;
    if (due > Date.now()) await delay(due - Date.now());
    sent.push(Date.now());
    if (i % 2) sendTcp(line('web', 'Soak ' + i));
    else await sendUdp(line('web', 'Soak ' + i));
  }
  try {
    await visible(base + total, 60000);
  } catch (error) {
    // Say where it fell behind: storing (receiver/API) or showing (live stream/viewer).
    throw new Error(
      `Soak incomplete: stored ${(await stored(web)).n - 8} of ${total}, viewer shows ${(await events()) - base}; receiver ${JSON.stringify(ingest.stats)}`,
      { cause: error },
    );
  }
  const counts = await page.evaluate(() => window.__counts);
  const latencies = sent.map((at, i) => {
    const seen = counts.find(([, count]) => count >= base + i + 1);
    return seen ? seen[0] - at : Infinity;
  });
  latencies.sort((a, b) => a - b);
  const percentile = (p) =>
    latencies[Math.min(latencies.length - 1, Math.floor(p * latencies.length))];
  const result = await stored(web);
  console.log(
    `soak: ${total} messages at ${rate}/s for ${seconds}s; viewer latency p50 ${percentile(0.5)} ms, p95 ${percentile(0.95)} ms, max ${latencies.at(-1)} ms; stored ${result.n} (${result.titles} distinct)`,
  );
  assert.deepEqual(result, { n: 8 + total, titles: 8 + total }, 'No moment lost or duplicated.');
  assert(percentile(0.95) < 10000, 'Viewers see new moments within seconds.');
  assert.equal(ingest.stats.dropped + ingest.stats.rejected + ingest.stats.invalid, 0);
  assert.equal(loads, 1, 'The viewer never reloaded.');
  assert.deepEqual(errors, []);

  // The owner picks a time format while messages arrive (#123): it is saved when chosen, on
  // whatever the receiver saved last, and is still there after a refresh.
  await pool.query('UPDATE oc_users SET password_hash=$2 WHERE id=$1', [
    owner,
    await passwordHash('syslog-owner-password-2026'),
  ]);
  const cookies = await signIn('syslog_' + owner.slice(0, 8), 'syslog-owner-password-2026');
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await context.addCookies(cookies.map(([name, value]) => ({ name, value, url: origin })));
  const tab = await context.newPage();
  tab.on('pageerror', (e) => errors.push(e.message));
  await tab.goto(`${origin}/timelines/${web}`);
  const editor = tab.frameLocator('iframe.editor-frame');
  await editor.locator('#publish-button').waitFor();
  let choosing = 0;
  const arriving = setInterval(
    () => void sendUdp(line('web', 'While choosing ' + choosing++)),
    150,
  );
  try {
    await editor.locator('#presentation-button').click();
    await editor.locator('#presentation-mode').selectOption('gregorian');
    await delay(500);
    await editor.locator('#presentation-save').click();
    await editor.locator('#presentation-dialog').waitFor({ state: 'hidden', timeout: 30000 });
    assert.equal(await editor.locator('#toast').textContent(), 'Display settings saved.');
    await delay(500);
  } finally {
    clearInterval(arriving);
  }
  const saved = await pool.query('SELECT presentation FROM oc_timelines WHERE id=$1', [web]);
  assert.equal(saved.rows[0].presentation?.mode, 'gregorian', 'Saved on the server.');
  await tab.reload();
  await editor.locator('#publish-button').waitFor();
  await editor.locator('#presentation-button').click();
  assert.equal(await editor.locator('#presentation-mode').inputValue(), 'gregorian');
  await editor.locator('#presentation-dialog button[data-close]').click();
  // Other edits wait for Save to server; leaving with them unsaved asks first. (Once every
  // message is saved and shown: a live update replaces a timeline with no unsaved edits.)
  for (let i = 0; (await stored(web)).n < 8 + total + choosing; i++) {
    assert(i < 100, 'The messages sent while choosing are saved.');
    await delay(200);
  }
  await delay(2000);
  await editor.locator('#timeline-title').fill('Web logs, renamed');
  await editor.locator('#timeline-title').press('Tab');
  const asked = new Promise((done) => tab.once('dialog', (dialog) => done(dialog)));
  void tab.evaluate(() => location.reload()).catch(() => {});
  const dialog = await asked;
  assert.equal(dialog.type(), 'beforeunload');
  await dialog.dismiss();
  await context.close();
  assert.deepEqual(errors, []);
  udp.close();
  tcp.end();
  console.log(
    'PASS realtime syslog: UDP/TCP routing, live display, Follow latest, restart catch-up, a sustained-rate soak without loss, and a time format saved while messages arrive.',
  );
} finally {
  ingest?.close();
  await listening?.close();
  await browser?.close();
  await stopServer();
  await pool.query('DELETE FROM oc_timelines WHERE owner_id=$1', [owner]);
  await pool.query('DELETE FROM oc_users WHERE id=$1', [owner]);
  await pool.end();
}
