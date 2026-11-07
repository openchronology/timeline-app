// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// Desktop sign-in by device code: the app starts a request and polls with its device code
// while the person approves the short user code in a browser where they are signed in, after
// seeing which computer asked, from where and when, and typing the code their desktop app shows.
import { randomBytes } from 'node:crypto';
import { isIP } from 'node:net';
import { addressKey, limitAddress, tokenHash } from './auth.mjs';
import { HttpError } from './store.mjs';
/**
 * Desktop sign-in through the system browser (oc_device_logins), in the manner of the OAuth
 * device authorization grant. Two secrets per request: the device code, 256 random bits that
 * only the desktop app's native process holds (stored hashed), and the short user code the
 * person types into the approval page and approves in the browser. Passwords, second factors
 * and the resulting session never pass through the desktop's webview.
 *
 * The approval page cannot know who opened its link, so it shows what the server saw when the
 * request started (time, client address, User-Agent, and the computer's name and system as the
 * app reported them) and warns when that address is on another network than the approving
 * browser's, in the manner of RFC 8628 §5.4. Approving a request from another network, or one
 * whose network can't be compared, takes a second, explicit confirmation, checked here as well
 * as on the page. Each approval is emailed to the account too.
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
/** The systems the desktop app is built for, as Rust's `std::env::consts::OS` names them. */
const PLATFORMS = { linux: 'Linux', macos: 'macOS', windows: 'Windows' };
/**
 * The computer the desktop app says it runs on, as recorded for the approval page: its name
 * (printable, at most 64 characters) and its system (Linux, macOS or Windows), each null when
 * not given. Like the User-Agent, whoever starts a request chooses them.
 */
function computer(value) {
  const name = String(value?.name ?? '')
    .replace(/\p{C}/gu, '')
    .trim()
    .slice(0, 64);
  return {
    name: name || null,
    platform: Object.hasOwn(PLATFORMS, value?.platform ?? '') ? PLATFORMS[value.platform] : null,
  };
}
/** An address as compared: IPv4 written as such (also when mapped into IPv6), else as given. */
function plain(address) {
  const text = String(address ?? '').trim(),
    mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(text);
  return mapped ? mapped[1] : text;
}
/** The first four 16-bit groups (the /64 network) of an IPv6 address. */
function prefix(address) {
  const [head, tail] = address.split('%')[0].split('::'),
    left = head ? head.split(':') : [],
    right = tail ? tail.split(':') : [];
  // A trailing IPv4 part is two groups; only the network part matters, so it counts as two.
  if (right.at(-1)?.includes('.') || (tail === undefined && left.at(-1)?.includes('.')))
    (tail === undefined ? left : right).push('0');
  const zeros = tail === undefined ? [] : Array(8 - left.length - right.length).fill('0');
  return [...left, ...zeros, ...right].slice(0, 4).map((group) => parseInt(group, 16));
}
/**
 * Whether two client addresses are on the same network, as far as the server can tell: 'same'
 * for one IPv4 address (a household or an office behind one public address), one IPv6 /64 (a
 * network, whose devices pick their own last 64 bits), or both loopback; 'different' when they
 * differ; 'unknown' when either is missing or they are of different kinds (on a network with
 * both, a computer and a browser may each use either).
 */
export function network(a, b) {
  const x = plain(a),
    y = plain(b),
    loopback = (address) => /^127\./.test(address) || address === '::1';
  if (loopback(x) && loopback(y)) return 'same';
  const kind = isIP(x);
  if (!kind || kind !== isIP(y)) return 'unknown';
  if (kind === 4) return x === y ? 'same' : 'different';
  const [px, py] = [prefix(x), prefix(y)];
  return px.every((group, i) => group === py[i]) ? 'same' : 'different';
}
export class DeviceAuth {
  /** `auth` is the Auth instance, for its pool, sessions and rate limits. */
  constructor(auth) {
    this.auth = auth;
    this.pool = auth.pool;
  }
  /**
   * Starts a desktop sign-in for client address `ip` (rate-limited), recording `ip`, the
   * request's `userAgent` header and the computer the app describes in `device` (`{ name,
   * platform }`, either may be missing) for the approval page. Result: the device code (for the app to
   * keep and poll with), the ten-character user code and the page to approve it on, the polling
   * interval (three seconds) and the lifetime (ten minutes).
   */
  async start(ip, userAgent, device) {
    await this.auth.rateLimit(addressKey(ip));
    const deviceCode = randomBytes(32).toString('hex'),
      alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    // 32 symbols without the look-alikes 0, O, 1 and I; 256 is a multiple of 32, so taking each
    // random byte modulo 32 is unbiased. Ten symbols give 50 bits.
    const userCode = [...randomBytes(10)].map((n) => alphabet[n % alphabet.length]).join('');
    // Sweeps expired requests (oc_device_expiry), then records this one, unapproved (no user),
    // for ten minutes. user_code is unique; a collision would fail this insert.
    await this.pool.query('DELETE FROM oc_device_logins WHERE expires_at<=now()');
    const { name, platform } = computer(device);
    await this.pool.query(
      "INSERT INTO oc_device_logins(device_hash,user_code,expires_at,client_address,user_agent,device_name,device_platform) VALUES($1,$2,now()+interval '10 minutes',$3,$4,$5,$6)",
      [
        tokenHash(deviceCode),
        userCode,
        String(ip ?? 'unknown').slice(0, 64),
        client(userAgent),
        name,
        platform,
      ],
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
   * client address and User-Agent it started from, the computer's name and system as the app
   * gave them, and whether that address is on this browser's network (`network`, as
   * `network()` answers it; `sameAddress`, the exact address, for pages from before). Throws 400 if the request expired, was approved or never existed.
   */
  async describe(session, req, code) {
    browser(session);
    if (!/^[A-Z2-9]{10}$/.test(code ?? '')) throw new HttpError(400, 'Invalid desktop code.');
    const address = req.clientAddress ?? req.socket.remoteAddress ?? 'unknown';
    // Its own key, so opening the page does not use up the address's sign-in attempts.
    await this.auth.rateLimit(
      'device-request:' + addressKey(address),
      10,
      'Too many requests. Please wait a minute.',
    );
    const { rows } = await this.pool.query(
      'SELECT created_at,expires_at,client_address,user_agent,device_name,device_platform FROM oc_device_logins WHERE user_code=$1 AND user_id IS NULL AND expires_at>now()',
      [code],
    );
    if (!rows.length) throw new HttpError(400, 'Desktop request expired or was already approved.');
    const row = rows[0];
    return {
      requestedAt: row.created_at,
      expiresAt: row.expires_at,
      clientAddress: row.client_address,
      userAgent: row.user_agent,
      deviceName: row.device_name,
      devicePlatform: row.device_platform,
      // A request recorded before these columns existed has no address; it is not this one.
      sameAddress: row.client_address === address,
      network: network(row.client_address, address),
    };
  }
  /**
   * Approves the desktop request with user code `code` for the signed-in account. Needs a
   * browser session (not a desktop or API one), its CSRF token and a sign-in within five
   * minutes (so an old, unattended browser session cannot be used to hand out desktop
   * sessions), and is rate-limited per address. Records whether this browser session completed
   * two-factor authentication, which the desktop session inherits, and emails the account about
   * the approval. A request from another network than this browser's, or one whose network
   * can't be compared (`network()`), is approved only with `otherNetwork` true: the person
   * confirmed a second time that it is theirs (409 otherwise). Throws 400 if the request
   * expired or was already approved.
   */
  async approve(session, req, code, otherNetwork = false) {
    browser(session);
    this.auth.require(session, req);
    if (
      !Number.isFinite(new Date(session.created_at).getTime()) ||
      Date.now() - new Date(session.created_at).getTime() > 5 * 60000
    )
      throw new HttpError(403, 'Sign in again before approving a desktop connection.');
    if (!/^[A-Z2-9]{10}$/.test(code ?? '')) throw new HttpError(400, 'Invalid desktop code.');
    const address = req.clientAddress ?? req.socket.remoteAddress ?? 'unknown';
    await this.auth.rateLimit(limitAddress(req));
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
        'UPDATE oc_device_logins SET user_id=$2,mfa_verified=$3 WHERE user_code=$1 AND user_id IS NULL AND expires_at>now() RETURNING created_at,client_address,device_name,device_platform',
        [code, session.id, !!live.mfa_verified],
      );
      if (!claimed.rows.length)
        throw new HttpError(400, 'Desktop request expired or was already approved.');
      const {
        created_at: started,
        client_address: from,
        device_name: name,
        device_platform: platform,
      } = claimed.rows[0];
      // Checked here as well as on the page, so the second confirmation can't be skipped by
      // calling this directly; throwing rolls the claim back.
      if (!otherNetwork && network(from, address) !== 'same')
        throw new HttpError(
          409,
          'This request came from another network than this browser. Confirm that you started it yourself to approve it.',
        );
      // Sent only if the approval commits. The User-Agent is left out: the requester chose it.
      // The computer's name is the requester's too, so it is quoted as the name it gave.
      const named = name
        ? ` on a computer that called itself "${name}"${platform ? ` (${platform})` : ''}`
        : '';
      await security.notify(
        c,
        user,
        'A desktop app was signed in to your OpenChronology account, approved in your browser. ' +
          `It started signing in${named} at ${new Date(started).toUTCString()} ` +
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
