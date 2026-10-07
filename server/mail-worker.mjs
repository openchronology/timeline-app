// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
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
