// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// Email: the Resend sender RESEND_API_KEY and AUTH_EMAIL_FROM configure, and an outbox in
// PostgreSQL that keeps messages encrypted until flushMail sends them.
import { randomUUID } from 'node:crypto';
import { seal, unseal, encryptionKey } from './security-crypto.mjs';
/**
 * The Resend sender from RESEND_API_KEY and AUTH_EMAIL_FROM, or null when neither is set (email
 * features are then unavailable). Throws at start-up when only one is set, or when the sender
 * contains a line break (which could inject headers). `send(message, id)` posts one plain-text
 * message with a ten-second timeout and no redirects, and throws when Resend refuses it; `id`
 * is the Idempotency-Key, so a retry after a lost response does not send it twice.
 */
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
      // The answer's body is not needed; cancelling it frees the connection.
      await response.body?.cancel();
      if (!response.ok) throw new Error('Email delivery unavailable.');
    },
  };
}
/**
 * Queues `message` ({ to, subject, text }) in oc_mail_outbox through `client`, normally inside
 * the transaction of the change that sends it, so the email exists only if that change commits.
 * The message, which may hold a confirmation or reset link, is encrypted at rest (seal), with
 * its outbox id as authenticated data so it cannot be swapped into another row. It expires
 * unsent after 24 hours, the longest any link in it lasts. Result: the outbox id.
 */
export async function queueMail(client, key, message) {
  const id = randomUUID();
  await client.query(
    "INSERT INTO oc_mail_outbox(id,payload,expires_at) VALUES($1,$2,now()+interval '24 hours')",
    [id, seal(JSON.stringify(message), key, 'mail:' + id)],
  );
  return id;
}
/**
 * Sends up to `limit` queued messages that are due, oldest first, and tidies expired rows. Run
 * by the mail worker every five seconds and, without waiting, after a request queues mail
 * (AccountSecurity.deliver). Several may run at once, on several instances, without sending a
 * message twice (see below). A failed send is retried with exponential backoff: 30 seconds,
 * doubling, at most an hour, until the message expires.
 */
export async function flushMail(pool, mailer, key, limit = 20) {
  if (!mailer || !key) return;
  const client = await pool.connect();
  try {
    // Expired messages are dropped: their links no longer work.
    await client.query('DELETE FROM oc_mail_outbox WHERE expires_at<=now()');
    // The worker also sweeps the other expiring account records: pending registrations,
    // sign-in challenges, email links and authenticator setups (each has an expires_at index).
    // The table names are constants, so building the statement by concatenation is safe.
    for (const table of [
      'oc_registrations',
      'oc_auth_challenges',
      'oc_email_tokens',
      'oc_mfa_setups',
    ])
      await client.query('DELETE FROM ' + table + ' WHERE expires_at<=now()');
    for (let i = 0; i < limit; i++) {
      // One message per transaction. FOR UPDATE locks the row while it is sent; SKIP LOCKED makes
      // a concurrent flush take the next message instead of waiting for, or also sending, this
      // one. The oc_mail_outbox_pending index serves next_attempt_at.
      await client.query('BEGIN');
      const { rows } = await client.query(
        'SELECT * FROM oc_mail_outbox WHERE next_attempt_at<=now() AND expires_at>now() ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1',
      );
      if (!rows[0]) {
        await client.query('COMMIT');
        break;
      }
      const row = rows[0];
      // Sent: the row is deleted. Failed, or undecryptable: the attempt is counted and the next
      // one scheduled 30 seconds times two to the attempts so far (capped at 2^7), at most an
      // hour.
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
