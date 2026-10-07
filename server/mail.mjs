// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
import { randomUUID } from 'node:crypto';
import { seal, unseal, encryptionKey } from './security-crypto.mjs';
export function mailFromEnv(env = process.env, fetcher = fetch) {
  if (!env.RESEND_API_KEY && !env.AUTH_EMAIL_FROM) return null;
  if (!env.RESEND_API_KEY || !env.AUTH_EMAIL_FROM || /[\r\n]/.test(env.AUTH_EMAIL_FROM))
    throw new Error('Configure RESEND_API_KEY and AUTH_EMAIL_FROM together.');
  return {
    async send(message, id) {
      const response = await fetcher('https://api.resend.com/emails', {
        method: 'POST',
        redirect: 'error',
        signal: AbortSignal.timeout(10000),
        headers: {
          Authorization: 'Bearer ' + env.RESEND_API_KEY,
          'Content-Type': 'application/json',
          'Idempotency-Key': id,
        },
        body: JSON.stringify({
          from: env.AUTH_EMAIL_FROM,
          to: [message.to],
          subject: message.subject,
          text: message.text,
        }),
      });
      await response.body?.cancel();
      if (!response.ok) throw new Error('Email delivery unavailable.');
    },
  };
}
export async function queueMail(client, key, message) {
  const id = randomUUID();
  await client.query(
    "INSERT INTO oc_mail_outbox(id,payload,expires_at) VALUES($1,$2,now()+interval '24 hours')",
    [id, seal(JSON.stringify(message), key, 'mail:' + id)],
  );
  return id;
}
export async function flushMail(pool, mailer, key, limit = 20) {
  if (!mailer || !key) return;
  const client = await pool.connect();
  try {
    await client.query('DELETE FROM oc_mail_outbox WHERE expires_at<=now()');
    for (const table of [
      'oc_registrations',
      'oc_auth_challenges',
      'oc_email_tokens',
      'oc_mfa_setups',
    ])
      await client.query('DELETE FROM ' + table + ' WHERE expires_at<=now()');
    for (let i = 0; i < limit; i++) {
      await client.query('BEGIN');
      const { rows } = await client.query(
        'SELECT * FROM oc_mail_outbox WHERE next_attempt_at<=now() AND expires_at>now() ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1',
      );
      if (!rows[0]) {
        await client.query('COMMIT');
        break;
      }
      const row = rows[0];
      try {
        await mailer.send(JSON.parse(unseal(row.payload, key, 'mail:' + row.id)), row.id);
        await client.query('DELETE FROM oc_mail_outbox WHERE id=$1', [row.id]);
      } catch {
        await client.query(
          "UPDATE oc_mail_outbox SET attempts=attempts+1,next_attempt_at=now()+($2*interval '1 second') WHERE id=$1",
          [row.id, Math.min(3600, 30 * 2 ** Math.min(row.attempts, 7))],
        );
      }
      await client.query('COMMIT');
    }
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}
export { encryptionKey };
