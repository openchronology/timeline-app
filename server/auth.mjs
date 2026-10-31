// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// Signing in: password hashing (scrypt), registration and sign-in with rate limits, issuing
// and reading session tokens, and the account age rules (#115). Account security, API keys
// and email build on it (account-security.mjs, api-keys.mjs, mail.mjs).
import { randomBytes, scrypt as scryptCallback, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';
import { availableParallelism } from 'node:os';
import { checkPasswordBreach } from './security-crypto.mjs';
import { ApiKeys } from './api-keys.mjs';
import { AccountSecurity } from './account-security.mjs';
import { mailFromEnv, encryptionKey } from './mail.mjs';
import { HttpError } from './store.mjs';
const scrypt = promisify(scryptCallback);
/** The refusal a rate limit gives unless its caller names another. */
const SIGN_IN_LIMIT = 'Too many sign-in attempts. Please wait a minute.';
/**
 * How many password derivations may run at once in this process: PASSWORD_HASH_CONCURRENCY
 * (1 to 64) when set, else one per CPU core the process may use, leaving at least one of
 * libuv's worker threads (UV_THREADPOOL_SIZE, default 4) free, since scrypt runs on that pool
 * alongside file and DNS work, and never fewer than two. Each derivation takes about 128 MiB, so
 * the cap bounds memory as well as CPU. Throws on a bad setting, at start-up (see Auth).
 */
export function passwordConcurrency(env = process.env) {
  if (env.PASSWORD_HASH_CONCURRENCY) {
    const value = Number(env.PASSWORD_HASH_CONCURRENCY);
    if (!Number.isInteger(value) || value < 1 || value > 64)
      throw new Error('PASSWORD_HASH_CONCURRENCY must be an integer from 1 to 64.');
    return value;
  }
  const threads = Number(env.UV_THREADPOOL_SIZE) || 4;
  return Math.max(2, Math.min(availableParallelism(), threads - 1));
}
/**
 * The password-work limits of this process (see derive): `concurrency` derivations at once;
 * beyond that a request waits up to `waitMs` in line, and at most `queue` per slot may wait.
 */
const passwordWork = { concurrency: null, waitMs: 5000, queue: 32, running: 0, waiting: [] };
/**
 * Sets this process's password-work limits (Auth does, from the environment; tests may shorten
 * the wait). The limits are per process rather than per Auth because the memory and CPU they
 * protect are.
 */
export function configurePasswordWork({ concurrency, waitMs } = {}) {
  if (concurrency !== undefined) passwordWork.concurrency = concurrency;
  if (waitMs !== undefined) passwordWork.waitMs = waitMs;
}
const busy = () => new HttpError(503, 'Sign-in is busy. Try again shortly.');
/**
 * Waits for a password-work slot. A slot free now is taken at once; otherwise the request
 * joins a first-come, first-served line, so a short burst is absorbed instead of refused, and
 * is refused with 503 after waitMs (or at once when the line is full), which bounds how long a
 * flood can hold connections open. Every caller waits in the same line, whatever the account,
 * so the wait reveals nothing about which usernames exist.
 */
function acquirePasswordWork() {
  passwordWork.concurrency ??= passwordConcurrency();
  if (passwordWork.running < passwordWork.concurrency) {
    passwordWork.running++;
    return Promise.resolve();
  }
  if (passwordWork.waiting.length >= passwordWork.concurrency * passwordWork.queue)
    return Promise.reject(busy());
  return new Promise((resolve, reject) => {
    const entry = { resolve };
    entry.timer = setTimeout(() => {
      passwordWork.waiting.splice(passwordWork.waiting.indexOf(entry), 1);
      reject(busy());
    }, passwordWork.waitMs);
    // A request still waiting does not keep the process alive on its own.
    entry.timer.unref();
    passwordWork.waiting.push(entry);
  });
}
/** Hands a finished derivation's slot to the next in line, or frees it. */
function releasePasswordWork() {
  const next =
    passwordWork.running <= passwordWork.concurrency ? passwordWork.waiting.shift() : undefined;
  if (!next) {
    passwordWork.running--;
    return;
  }
  clearTimeout(next.timer);
  next.resolve();
}
/**
 * Derives the 64-byte scrypt key for `password` with hex `salt`. Version 2 uses N=131072, r=8,
 * p=1 (OWASP's scrypt guidance, about 128 MiB of memory each); version 1, the older format, used
 * N=16384 and is still verified so existing hashes keep working until upgraded at sign-in.
 *
 * Each derivation is deliberately costly, so without a cap a burst of sign-in attempts could
 * exhaust memory and CPU: it holds one of the process's password-work slots while it runs
 * (acquirePasswordWork), and only while it runs. Throws 503 when no slot frees up in time.
 */
async function derive(password, salt, version) {
  await acquirePasswordWork();
  try {
    return await scrypt(password, salt, 64, {
      N: version === '2' ? 131072 : 16384,
      r: 8,
      p: 1,
      maxmem: 256 * 1024 * 1024,
    });
  } finally {
    releasePasswordWork();
  }
}
/**
 * The hex SHA-256 of a bearer secret (session token, OAuth state, device code, throttle key).
 * Only this digest is stored, so someone who reads the database cannot use what they find as a
 * credential; the secrets are 256 random bits, so a fast hash is enough to make them unguessable.
 */
export const tokenHash = (token) => createHash('sha256').update(token).digest('hex');
/**
 * A new password hash, `scrypt:2:<salt>:<key>`: a random 128-bit salt (so equal passwords hash
 * differently and precomputed tables are useless) and the version-2 scrypt key, both hex.
 */
export async function passwordHash(password) {
  const salt = randomBytes(16).toString('hex');
  return `scrypt:2:${salt}:${(await derive(password, salt, '2')).toString('hex')}`;
}
/**
 * Whether `password` matches the stored `hash` (version 1 or 2). A malformed or missing hash
 * never matches. The final comparison is constant-time, so response timing reveals nothing about
 * how much of the derived key matched.
 */
export async function passwordMatches(password, hash) {
  if (typeof hash !== 'string') return false;
  const [algorithm, version, salt, encoded] = hash.split(':');
  if (
    algorithm !== 'scrypt' ||
    !['1', '2'].includes(version) ||
    !/^[a-f0-9]{32}$/.test(salt ?? '') ||
    !/^[a-f0-9]{128}$/.test(encoded ?? '')
  )
    return false;
  const expected = Buffer.from(encoded, 'hex'),
    actual = await derive(password, salt, version);
  return expected.length === actual.length && timingSafeEqual(actual, expected);
}
/** The youngest age an account is for (#115). */
export const ACCOUNT_AGE = 13;
/**
 * Whether an account with year of birth `year` may be under 18: counted from the end of its
 * year of birth, so until the year it turns 18 is over. Accounts without one were made under
 * terms requiring 18.
 */
export function minor(year, now = new Date()) {
  return year != null && now.getUTCFullYear() - Number(year) < 18;
}
/**
 * Accounts and sessions on PostgreSQL. Sessions are rows of oc_sessions keyed by the SHA-256 of
 * a 256-bit random token: `web` sessions travel in an HTTP-only cookie, `desktop` sessions only
 * as a Bearer header, and neither is accepted as the other. API keys (`Bearer och_key_…`) are
 * read by ApiKeys. Two-factor authentication, email confirmation and security changes live in
 * AccountSecurity (`this.security`).
 */
export class Auth {
  /**
   * `pool` is the PostgreSQL pool; `origin` is APP_ORIGIN, whose scheme decides whether cookies
   * are Secure and `__Host-` prefixed. `mailer`, `key` (AUTH_ENCRYPTION_KEY) and `passwordCheck`
   * (the breach lookup) are injectable for tests, as are `passkeys` (`{ signIn }`, else
   * PASSKEY_SIGN_IN; passkeys.mjs).
   */
  constructor(
    pool,
    origin,
    {
      mailer = mailFromEnv(),
      key = encryptionKey(process.env.AUTH_ENCRYPTION_KEY),
      passwordCheck = checkPasswordBreach,
      passkeys = {},
    } = {},
  ) {
    this.pool = pool;
    this.keys = new ApiKeys(this);
    this.secure = new URL(origin).protocol === 'https:';
    this.cookieName = this.secure ? '__Host-oc_session' : 'oc_session';
    this.attempts = new Map();
    this.origin = origin;
    this.security = new AccountSecurity(this, mailer, key, passwordCheck, passkeys);
    // Reads PASSWORD_HASH_CONCURRENCY now, so a bad value stops start-up rather than sign-in.
    configurePasswordWork({ concurrency: passwordConcurrency() });
  }
  /**
   * The in-memory throttle in front of rateLimit: at most `maximum` attempts per `key` per
   * minute in this process. It tracks at most 10,000 keys, forgetting the oldest to make room,
   * which bounds the map's memory under a flood of distinct addresses without refusing everyone
   * else (#193); rateLimit, in the database, still counts every key. Throws 429.
   */
  throttle(key, maximum = 10, message = SIGN_IN_LIMIT) {
    const now = Date.now();
    for (const [k, v] of this.attempts) if (v.expires < now) this.attempts.delete(k);
    const old = this.attempts.get(key) ?? { count: 0, expires: now + 60000 };
    if (old.count++ >= maximum) throw new HttpError(429, message);
    // A Map iterates in insertion order: its first key is the oldest.
    if (!this.attempts.has(key) && this.attempts.size >= 10000)
      this.attempts.delete(this.attempts.keys().next().value);
    this.attempts.set(key, old);
  }
  /**
   * The session `req` carries, or null: an API key, a desktop Bearer token, or the web session
   * cookie. Result: the session's CSRF token, token hash, kind, creation time and two-factor
   * state joined with the account's id, username, flags, avatar, year of birth and content
   * preference. `client` lets a caller read it inside its transaction.
   *
   * Side effect: refreshes the session's last-seen time, at most once every five minutes.
   */
  async session(req, client = this.pool) {
    if ((req.headers.authorization ?? '').startsWith('Bearer och_key_'))
      return this.keys.session(req, client);
    const bearer = /^Bearer ([a-f0-9]{64})$/.exec(req.headers.authorization ?? ''),
      token = bearer?.[1] ?? this.readCookie(req, this.cookieName);
    if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
    // Looks the session up by the hash of its token (the primary key). The kind must match how
    // it arrived (a Bearer token is a desktop session, a cookie a web one), so a stolen cookie
    // cannot be replayed as a desktop credential or the reverse. The other conditions are
    // checked here on every request rather than by revoking: fourteen-day absolute expiry, one
    // day of inactivity, a disabled account, an unconfirmed email, and, when two-factor
    // authentication is on, a session that never completed it.
    const { rows } = await client.query(
      `SELECT s.csrf,s.token_hash,s.kind,s.created_at,s.mfa_verified,u.id,u.username,u.mfa_enabled,u.email_verified_at,u.is_admin,u.avatar_url,u.birth_year,u.show_sensitive,u.terms_version FROM oc_sessions s JOIN oc_users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.kind=$2 AND s.expires_at>now() AND s.last_seen_at>now()-interval '1 day' AND NOT u.is_disabled AND u.email_verified_at IS NOT NULL AND (NOT u.mfa_enabled OR s.mfa_verified)`,
      [tokenHash(token), bearer ? 'desktop' : 'web'],
    );
    // Keeps the session alive for the idle limit. The five-minute condition makes most requests
    // match no row, sparing a write (and its row lock) on every request.
    if (rows[0])
      await client.query(
        "UPDATE oc_sessions SET last_seen_at=now() WHERE token_hash=$1 AND last_seen_at<now()-interval '5 minutes'",
        [rows[0].token_hash],
      );
    return rows[0] ?? null;
  }
  /** The value of cookie `name` in `req`, or undefined. Callers validate its shape. */
  readCookie(req, name) {
    return req.headers.cookie
      ?.split(';')
      .map((s) => s.trim())
      .find((s) => s.startsWith(name + '='))
      ?.slice(name.length + 1);
  }
  /**
   * A Set-Cookie value for the browser-binding cookie `oc_<name>` (login, oauth, challenge,
   * verify), lasting `seconds` (ten minutes by default) or cleared with `clear`. These cookies
   * tie a multi-step flow to the browser that began it: the server stores only a hash of the
   * value and later requires the same browser to present it. HTTP-only keeps scripts from
   * reading them; SameSite=Lax still sends them on the top-level navigation back from an
   * identity provider or an email link. On HTTPS the `__Host-` prefix forbids a Domain attribute
   * and requires Secure and Path=/, so a sibling subdomain cannot plant or overwrite one.
   */
  nonceCookie(name, token, clear = false, seconds = 600) {
    return `${this.secure ? '__Host-' : ''}oc_${name}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${clear ? 0 : seconds}${this.secure ? '; Secure' : ''}`;
  }
  /**
   * The browser's existing `oc_<name>` value when well formed, else a new random 256-bit one
   * (which the caller sets with nonceCookie).
   */
  nonce(req, name) {
    const token = this.readCookie(req, `${this.secure ? '__Host-' : ''}oc_${name}`);
    return token && /^[a-f0-9]{64}$/.test(token) ? token : randomBytes(32).toString('hex');
  }
  /**
   * CSRF protection for anonymous requests (sign-in, registration, a social sign-in's start):
   * the `X-CSRF-Token` header must equal the `oc_login` cookie. Another site can make a browser
   * send the cookie but cannot read it to copy it into a header (double-submit cookie), which
   * prevents login CSRF, signing a victim in to an attacker's account. Throws 403.
   */
  requireLogin(req) {
    const token = this.readCookie(req, `${this.secure ? '__Host-' : ''}oc_login`);
    if (!token || req.headers['x-csrf-token'] !== token)
      throw new HttpError(403, 'Refresh the sign-in page before continuing.');
  }
  /**
   * The shared rate limit: at most `maximum` attempts a minute for the key `ip`, which is a
   * client address or a prefixed key such as `email:<address>`, `security-account:<id>` or
   * `mfa-ip:<address>`, with `message` for the refusal (the sign-in one by default). The
   * memory throttle answers first; then a counter in oc_auth_attempts
   * enforces the limit across every server instance. Throws 429.
   */
  async rateLimit(ip, maximum = 10, message = SIGN_IN_LIMIT) {
    this.throttle(ip, maximum, message);
    // Expired windows are removed first (oc_attempts_expiry serves this), so the upsert below
    // starts a new one-minute window rather than counting on from an old one.
    await this.pool.query('DELETE FROM oc_auth_attempts WHERE expires_at<=now()');
    // Counts this attempt atomically: the first in a window inserts count 1, later ones
    // increment it in place (ON CONFLICT), and RETURNING gives the new count without a second
    // query or a race between instances. The window is fixed from its first attempt. The key is
    // hashed so the table holds no addresses, usernames or emails.
    const { rows } = await this.pool.query(
      "INSERT INTO oc_auth_attempts(key,count,expires_at) VALUES($1,1,now()+interval '1 minute') ON CONFLICT(key) DO UPDATE SET count=oc_auth_attempts.count+1 RETURNING count",
      [tokenHash(ip)],
    );
    if (rows[0].count > maximum) throw new HttpError(429, message);
  }
  /**
   * The Set-Cookie value for the web session cookie: HTTP-only, SameSite=Lax, lasting fourteen
   * days (the session's absolute expiry), Secure and `__Host-` prefixed on HTTPS; `clear` ends it.
   */
  cookie(token, clear = false) {
    return `${this.cookieName}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${clear ? 0 : 1209600}${this.secure ? '; Secure' : ''}`;
  }
  /**
   * Refuses a request without a session (401) or, for web and desktop sessions, without the
   * session's CSRF token in `X-CSRF-Token` (403). The token is random per session and is given
   * only to the page, so a cross-site request carrying the cookie cannot supply it. API keys are
   * exempt: they are never sent automatically by a browser.
   */
  require(session, req) {
    if (!session) throw new HttpError(401, 'Sign in to continue.');
    if (session.kind === 'api') return;
    if (req.headers['x-csrf-token'] !== session.csrf)
      throw new HttpError(403, 'Session changed. Reload before saving.');
  }
  /**
   * Password sign-in, or registration when `register` (AccountSecurity.register). `body` has the
   * username and password; `ip` is the client address; `kind` is the session to issue (`web`,
   * or `desktop` for the desktop app's own sign-in form). Rate-limited per address. Result: a
   * session (finishPrimary), or a challenge when two-factor authentication or email
   * confirmation must come first. Throws 400 on malformed input, 401 on a wrong username or
   * password, 429 when limited, 503 when password checking is busy.
   *
   * There is deliberately no hard limit per account: usernames are public, so one would let
   * anyone lock an account's owner out. Repeated failures for an account are answered by the
   * caller instead, with human verification or a delay (Challenges.signInGate). The cheap checks
   * (the address limit, the input) come before the costly password work.
   */
  async signIn(body, register, ip, kind = 'web', req) {
    await this.rateLimit(ip);
    if (register) return this.security.register(body, req);
    const username = typeof body.username === 'string' ? body.username.toLowerCase() : '',
      password = body.password;
    if (
      typeof username !== 'string' ||
      !/^[a-z0-9][a-z0-9_-]{2,31}$/.test(username) ||
      typeof password !== 'string' ||
      password.length < 1 ||
      password.length > 1024
    )
      throw new HttpError(400, 'Enter a valid username and password.');
    let user;
    {
      const { rows } = await this.pool.query('SELECT * FROM oc_users WHERE username=$1', [
        username,
      ]);
      user = rows[0];
      // Missing/social-only accounts still do the same expensive password work, waiting for
      // and holding a password-work slot exactly as a real check does (and no longer).
      // (So response time does not reveal which usernames exist or have a password; the
      // failure message is the same too.)
      const dummy = 'scrypt:2:00000000000000000000000000000000:' + '00'.repeat(64);
      const matches = await passwordMatches(password, user?.password_hash ?? dummy);
      if (!user || user.is_disabled || !matches)
        throw new HttpError(401, 'Username or password is incorrect.');
      // A version-1 hash is replaced by a version-2 one now that the password is known. The
      // update is conditional on the hash still being the one just verified (compare-and-set),
      // so a password change racing this sign-in is not overwritten; if it lost, the sign-in
      // is refused.
      if (user.password_hash.startsWith('scrypt:1:')) {
        const upgraded = await passwordHash(password);
        const updated = await this.pool.query(
          'UPDATE oc_users SET password_hash=$2 WHERE id=$1 AND password_hash=$3 RETURNING password_hash',
          [user.id, upgraded, user.password_hash],
        );
        if (!updated.rows.length) throw new HttpError(401, 'Sign in again.');
        user.password_hash = updated.rows[0].password_hash;
      }
    }
    return this.finishPrimary(user, kind, req);
  }
  /**
   * After a first factor (password or identity provider) succeeded for `user`: a session, or a
   * two-factor or email-confirmation challenge that returns to `returnTo` once completed
   * (AccountSecurity.begin).
   */
  async finishPrimary(user, kind = 'web', req, returnTo = '/') {
    return this.security.begin(user, kind, req, returnTo);
  }
  /**
   * Creates a session for `user` of `kind` (`web` or `desktop`). `mfaVerified` records that the
   * sign-in completed two-factor authentication; it is required when the account has it on.
   * `client` lets the caller issue inside its transaction, so the session commits or rolls back
   * with the checks that led to it.
   *
   * Refuses a disabled account, an unconfirmed email (when the row includes that column), a
   * missing second factor, and an unknown kind, as a last line of defence behind its callers.
   * Result: the user's id and username and the CSRF token, plus the session cookie for the web
   * or the raw token for the desktop app (shown once; only its hash is stored).
   */
  async issue(user, kind = 'web', mfaVerified = false, client = this.pool) {
    if (user.is_disabled) throw new HttpError(403, 'Account unavailable.');
    if ('email_verified_at' in user && !user.email_verified_at)
      throw new HttpError(403, 'Email confirmation is required.');
    if (user.mfa_enabled && !mfaVerified)
      throw new HttpError(403, 'Two-factor authentication is required.');
    if (!['web', 'desktop'].includes(kind)) throw new HttpError(400, 'Invalid session kind.');
    const token = randomBytes(32).toString('hex'),
      csrf = randomBytes(32).toString('hex');
    // Sweeps every account's expired and idle sessions (oc_sessions_expiry and oc_sessions_idle
    // serve both conditions); issuing a session is when the table is tidied.
    await client.query(
      "DELETE FROM oc_sessions WHERE expires_at<=now() OR last_seen_at<=now()-interval '1 day'",
    );
    // Stores the token's hash, never the token, with a fourteen-day absolute expiry;
    // created_at and last_seen_at default to now.
    await client.query(
      "INSERT INTO oc_sessions(token_hash,user_id,csrf,kind,mfa_verified,expires_at) VALUES($1,$2,$3,$4,$5,now()+interval '14 days')",
      [tokenHash(token), user.id, csrf, kind, mfaVerified],
    );
    return {
      user: { id: user.id, username: user.username },
      csrf,
      ...(kind === 'web' ? { cookie: this.cookie(token) } : { token }),
    };
  }
}
