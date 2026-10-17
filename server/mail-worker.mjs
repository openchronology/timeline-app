// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// The mail worker: a process that sends the queued email (mail.mjs) every five seconds, or once
// with --once. compose.yml and the packages run it as its own service.
import pg from 'pg';
import { setTimeout as delay } from 'node:timers/promises';
import { flushMail, mailFromEnv, encryptionKey } from './mail.mjs';
const mailer = mailFromEnv(),
  key = encryptionKey(process.env.AUTH_ENCRYPTION_KEY);
if (!mailer || !key)
  throw new Error(
    'Configure email delivery and AUTH_ENCRYPTION_KEY before starting the mail worker.',
  );
const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  max: 2,
  connectionTimeoutMillis: 10000,
  statement_timeout: 30000,
});
// SIGTERM or SIGINT (docker stop, Ctrl-C) ends the loop after the current flush, so a message
// being sent is finished and its row updated before the pool closes.
let stopped = false;
process.on('SIGTERM', () => {
  stopped = true;
});
process.on('SIGINT', () => {
  stopped = true;
});
try {
  do {
    await flushMail(pool, mailer, key);
    if (process.argv.includes('--once')) break;
    await delay(5000);
  } while (!stopped);
} finally {
  await pool.end();
}
