// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// Desktop sign-in by device code: the app starts a request and polls with its device code
// while the person approves the short user code in a browser where they are signed in, after
// seeing where and when the request was started and typing the code their desktop app shows.
import { randomBytes } from 'node:crypto';
import { tokenHash } from './auth.mjs';
import { HttpError } from './store.mjs';
/**
 * Desktop sign-in through the system browser (oc_device_logins), in the manner of the OAuth
 * device authorization grant. Two secrets per request: the device code, 256 random bits that
 * only the desktop app's native process holds (stored hashed), and the short user code the
 * person types into the approval page and approves in the browser. Passwords, second factors
 * and the resulting session never pass through the desktop's webview.
 *
 * The approval page cannot know who opened its link, so it shows what the server saw when the
 * request started (time, client address, User-Agent) and warns when that address differs from
 * the approving browser's, in the manner of RFC 8628 §5.4; each approval is emailed to the
 * account as well.
 */
/**
 * Refuses all but a browser session (401 signed out, 403 otherwise): approving desktop sign-ins
 * is done on the website, where the account signed in, never from another desktop session or
 * an API key.
 */
function browser(session) {
  if (!session) throw new HttpError(401, 'Sign in to continue.');
  if (session.kind !== 'web')
    throw new HttpError(403, 'Approve desktop connections in a browser signed in to the site.');
}
/**
 * The User-Agent header as recorded for the approval page: printable characters only, at most
 * 200 of them, or null when there is none. Whoever starts a request chooses it, so the page
 * presents it as reported, never as verified.
 */
function client(userAgent) {
  const text = String(userAgent ?? '')
    .replace(/[^\x20-\x7e]/g, '')
    .trim()
    .slice(0, 200);
  return text || null;
}
export class DeviceAuth {
  /** `auth` is the Auth instance, for its pool, sessions and rate limits. */
  constructor(auth) {
    this.auth = auth;
    this.pool = auth.pool;
  }
  /**
   * Starts a desktop sign-in for client address `ip` (rate-limited), recording `ip` and the
   * request's `userAgent` header for the approval page. Result: the device code (for the app to
   * keep and poll with), the ten-character user code and the page to approve it on, the polling
   * interval (three seconds) and the lifetime (ten minutes).
   */
  async start(ip, userAgent) {
    await this.auth.rateLimit(ip);
    const deviceCode = randomBytes(32).toString('hex'),
      alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    // 32 symbols without the look-alikes 0, O, 1 and I; 256 is a multiple of 32, so taking each
    // random byte modulo 32 is unbiased. Ten symbols give 50 bits.
    const userCode = [...randomBytes(10)].map((n) => alphabet[n % alphabet.length]).join('');
    // Sweeps expired requests (oc_device_expiry), then records this one, unapproved (no user),
    // for ten minutes. user_code is unique; a collision would fail this insert.
    await this.pool.query('DELETE FROM oc_device_logins WHERE expires_at<=now()');
    await this.pool.query(
      "INSERT INTO oc_device_logins(device_hash,user_code,expires_at,client_address,user_agent) VALUES($1,$2,now()+interval '10 minutes',$3,$4)",
      [tokenHash(deviceCode), userCode, String(ip ?? 'unknown').slice(0, 64), client(userAgent)],
    );
    return {
      deviceCode,
      userCode,
      verificationUri: this.auth.origin + '/connect/desktop/' + userCode,
      interval: 3,
      expiresIn: 600,
    };
  }
  /**
   * What the approval page shows about the pending desktop request with user code `code`, to a
   * signed-in browser session (ten a minute per address): when it started and expires, the
   * client address and User-Agent it started from, and whether that address is the one this
   * browser is using. Throws 400 if the request expired, was approved or never existed.
   */
  async describe(session, req, code) {
    browser(session);
    if (!/^[A-Z2-9]{10}$/.test(code ?? '')) throw new HttpError(400, 'Invalid desktop code.');
    const address = req.clientAddress ?? req.socket.remoteAddress ?? 'unknown';
    // Its own key, so opening the page does not use up the address's sign-in attempts.
    await this.auth.rateLimit(
      'device-request:' + address,
      10,
      'Too many requests. Please wait a minute.',
    );
    const { rows } = await this.pool.query(
      'SELECT created_at,expires_at,client_address,user_agent FROM oc_device_logins WHERE user_code=$1 AND user_id IS NULL AND expires_at>now()',
      [code],
    );
    if (!rows.length) throw new HttpError(400, 'Desktop request expired or was already approved.');
    const row = rows[0];
    return {
      requestedAt: row.created_at,
      expiresAt: row.expires_at,
      clientAddress: row.client_address,
      userAgent: row.user_agent,
      // A request recorded before these columns existed has no address; it is not this one.
      sameAddress: row.client_address === address,
    };
  }
  /**
   * Approves the desktop request with user code `code` for the signed-in account. Needs a
   * browser session (not a desktop or API one), its CSRF token and a sign-in within five
   * minutes (so an old, unattended browser session cannot be used to hand out desktop
   * sessions), and is rate-limited per address. Records whether this browser session completed
   * two-factor authentication, which the desktop session inherits, and emails the account about
   * the approval. Throws 400 if the request expired or was already approved.
   */
  async approve(session, req, code) {
    browser(session);
    this.auth.require(session, req);
    if (
      !Number.isFinite(new Date(session.created_at).getTime()) ||
      Date.now() - new Date(session.created_at).getTime() > 5 * 60000
    )
      throw new HttpError(403, 'Sign in again before approving a desktop connection.');
    if (!/^[A-Z2-9]{10}$/.test(code ?? '')) throw new HttpError(400, 'Invalid desktop code.');
    await this.auth.rateLimit(req.clientAddress ?? req.socket.remoteAddress ?? 'unknown');
    const security = this.auth.security;
    const result = await security.transaction(async (c) => {
      // Takes the account lock security changes take, then re-reads the session under it: a
      // password change or two-factor change that revoked this session (and deleted pending
      // desktop sign-ins) either finished first, and the session is gone, or waits for this
      // approval and then deletes it.
      const user = (await c.query('SELECT * FROM oc_users WHERE id=$1 FOR UPDATE', [session.id]))
        .rows[0];
      const live = await this.auth.session(req, c);
      this.auth.require(live, req);
      // Claims the request only if it is still unapproved and unexpired; the condition on
      // user_id makes approval one-time even with concurrent approvals.
      const claimed = await c.query(
        'UPDATE oc_device_logins SET user_id=$2,mfa_verified=$3 WHERE user_code=$1 AND user_id IS NULL AND expires_at>now() RETURNING created_at,client_address',
        [code, session.id, !!live.mfa_verified],
      );
      if (!claimed.rows.length)
        throw new HttpError(400, 'Desktop request expired or was already approved.');
      // Sent only if the approval commits. The User-Agent is left out: the requester chose it.
      const { created_at: started, client_address: from } = claimed.rows[0];
      await security.notify(
        c,
        user,
        'A desktop app was signed in to your OpenChronology account, approved in your browser. ' +
          `It started signing in at ${new Date(started).toUTCString()} ` +
          `from ${from ?? 'an unknown address'}. If this was not you, choose ` +
          'Sign out other sessions on your account page and change your password.',
      );
      return { ok: true };
    });
    security.deliver();
    return result;
  }
  /**
   * The desktop app's poll with its device code. Result: `{ pending: true }` until approved,
   * then a desktop session (once: the request is consumed). Throws 400 for an unknown, expired
   * or consumed request, or a poll sooner than three seconds after the last.
   */
  async poll(code) {
    if (!/^[a-f0-9]{64}$/.test(code ?? '')) throw new HttpError(400, 'Invalid desktop request.');
    // Records the poll and enforces the interval in one statement: a request polled within the
    // last three seconds matches no row, as does an unknown or expired one. RETURNING gives the
    // approving account, if any.
    const { rows } = await this.pool.query(
      "UPDATE oc_device_logins SET last_poll_at=now() WHERE device_hash=$1 AND expires_at>now() AND (last_poll_at IS NULL OR last_poll_at<=now()-interval '3 seconds') RETURNING user_id",
      [tokenHash(code)],
    );
    if (!rows.length)
      throw new HttpError(
        400,
        'Desktop request expired, was used, or is being polled too quickly.',
      );
    if (!rows[0].user_id) return { pending: true };
    return this.auth.security.transaction(async (c) => {
      const user = (
        await c.query('SELECT * FROM oc_users WHERE id=$1 FOR UPDATE', [rows[0].user_id])
      ).rows[0];
      // Consumes the approved request (DELETE … RETURNING) in the transaction that issues the
      // session, so only one poll gets it; a request revoked meanwhile by a security change is
      // already gone.
      const consumed = await c.query(
        'DELETE FROM oc_device_logins WHERE device_hash=$1 AND user_id IS NOT NULL AND expires_at>now() RETURNING user_id,mfa_verified',
        [tokenHash(code)],
      );
      if (!user || !consumed.rows.length)
        throw new HttpError(400, 'Desktop request was already consumed or revoked.');
      return this.auth.issue(user, 'desktop', consumed.rows[0].mfa_verified, c);
    });
  }
}
