// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// The Next.js platform's per-address limits without a trusted proxy (TRUST_PROXY=0): each
// connecting address gets its own sign-in limit, and headers a client sends cannot change the
// address it is counted under. Run on its own against a dedicated PostgreSQL test database:
// node test/next-client-address-postgres.mjs (after npm run build; Linux, where every
// 127.x.y.z address is the machine's own).
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { request } from 'node:http';
import { resolve } from 'node:path';
import { readFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import pg from 'pg';
if (!process.env.DATABASE_URL) throw new Error('Use a dedicated PostgreSQL test database.');
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
await pool.query(await readFile(new URL('../server/schema.sql', import.meta.url), 'utf8'));
await pool.query('DELETE FROM oc_auth_attempts');
const port = Number(process.env.PLATFORM_TEST_PORT ?? 5198),
  origin = `http://127.0.0.1:${port}`;
const env = { ...process.env };
for (const key of Object.keys(env)) if (key.startsWith('OAUTH_')) delete env[key];
Object.assign(env, {
  NODE_ENV: 'production',
  APP_ORIGIN: origin,
  OCH_APP_ROOT: process.cwd(),
  TRUST_PROXY: '0',
  CHALLENGE_PROVIDER: 'off',
  NEXT_TELEMETRY_DISABLED: '1',
  PORT: String(port),
  HOSTNAME: '127.0.0.1',
});
const child = spawn(
  process.execPath,
  [resolve(process.env.PLATFORM_TEST_SERVER ?? 'platform/.next/standalone/platform/server.cjs')],
  { env, stdio: ['ignore', 'pipe', 'pipe'] },
);
let logs = '',
  exited = false;
for (const s of [child.stdout, child.stderr])
  s.on('data', (c) => {
    logs = (logs + c).slice(-12000);
  });
child.on('exit', () => {
  exited = true;
});
let attempt = 0;
/**
 * A failed sign-in sent from the local address `from`, with `headers`; resolves its status. Each
 * names another account, so that only the address's limit is reached.
 */
function signIn(from, headers = {}) {
  const body = JSON.stringify({ username: `nobody${attempt++}`, password: 'wrong password' });
  return new Promise((done, fail) => {
    const req = request(
      origin + '/api/auth/login',
      {
        method: 'POST',
        localAddress: from,
        headers: {
          Origin: origin,
          Cookie: 'oc_login=check',
          'X-CSRF-Token': 'check',
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
          ...headers,
        },
      },
      (res) => {
        res.resume();
        res.on('end', () => done(res.statusCode));
      },
    );
    req.on('error', fail);
    req.end(body);
  });
}
try {
  let ready = false;
  for (let i = 0; i < 100 && !ready; i++) {
    if (exited) throw new Error(logs);
    try {
      ready = (await fetch(origin + '/healthz', { signal: AbortSignal.timeout(500) })).ok;
    } catch {}
    if (!ready) await delay(200);
  }
  assert(ready, logs);
  // Ten attempts a minute from one address, whatever it claims to be forwarded for.
  for (let i = 0; i < 10; i++)
    assert.equal(await signIn('127.0.0.2', { 'X-Forwarded-For': `192.0.2.${i}` }), 401, logs);
  assert.equal(await signIn('127.0.0.2'), 429);
  assert.equal(await signIn('127.0.0.2', { 'X-Forwarded-For': '192.0.2.200' }), 429);
  // The header the server passes the address on in, forged by a client, is overwritten.
  assert.equal(await signIn('127.0.0.2', { 'X-OC-Peer-Address': 'forged 192.0.2.201' }), 429);
  // Another address has its own limit.
  assert.equal(await signIn('127.0.0.3'), 401, logs);
  // A proxy on this machine forwarding for clients, without TRUST_PROXY, is pointed out.
  assert.match(logs, /TRUST_PROXY is not 1/);
  console.log('Next.js per-address limits: ok');
} finally {
  child.kill('SIGTERM');
  await pool.end();
}
