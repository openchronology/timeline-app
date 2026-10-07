// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
import {
  randomBytes,
  randomUUID,
  scrypt as scryptCallback,
  timingSafeEqual,
  createHash,
} from 'node:crypto';
import { promisify } from 'node:util';
import { checkPasswordBreach } from './security-crypto.mjs';
import { ApiKeys } from './api-keys.mjs';
import { AccountSecurity } from './account-security.mjs';
import { mailFromEnv, encryptionKey } from './mail.mjs';
import { HttpError } from './store.mjs';
const scrypt = promisify(scryptCallback);
let passwordWork = 0;
async function derive(password, salt, version) {
  if (passwordWork >= 2) throw new HttpError(503, 'Sign-in is busy. Try again shortly.');
  passwordWork++;
  try {
    return await scrypt(password, salt, 64, {
      N: version === '2' ? 131072 : 16384,
      r: 8,
      p: 1,
      maxmem: 256 * 1024 * 1024,
    });
  } finally {
    passwordWork--;
  }
}
export const tokenHash = (token) => createHash('sha256').update(token).digest('hex');
export async function passwordHash(password) {
  const salt = randomBytes(16).toString('hex');
  return `scrypt:2:${salt}:${(await derive(password, salt, '2')).toString('hex')}`;
}
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
export class Auth {
  constructor(
    pool,
    origin,
    {
      mailer = mailFromEnv(),
      key = encryptionKey(process.env.AUTH_ENCRYPTION_KEY),
      passwordCheck = checkPasswordBreach,
    } = {},
  ) {
    this.pool = pool;
    this.keys = new ApiKeys(this);
    this.secure = new URL(origin).protocol === 'https:';
    this.cookieName = this.secure ? '__Host-oc_session' : 'oc_session';
    this.attempts = new Map();
    this.origin = origin;
    this.security = new AccountSecurity(this, mailer, key, passwordCheck);
  }
  throttle(key, maximum = 10) {
    const now = Date.now();
    for (const [k, v] of this.attempts) if (v.expires < now) this.attempts.delete(k);
    const old = this.attempts.get(key) ?? { count: 0, expires: now + 60000 };
    if (old.count++ >= maximum || this.attempts.size > 10000)
      throw new HttpError(429, 'Too many sign-in attempts. Please wait a minute.');
    this.attempts.set(key, old);
  }
  async session(req, client = this.pool) {
    if ((req.headers.authorization ?? '').startsWith('Bearer och_key_'))
      return this.keys.session(req, client);
    const bearer = /^Bearer ([a-f0-9]{64})$/.exec(req.headers.authorization ?? ''),
      token = bearer?.[1] ?? this.readCookie(req, this.cookieName);
    if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
    const { rows } = await client.query(
      `SELECT s.csrf,s.token_hash,s.kind,s.created_at,s.mfa_verified,u.id,u.username,u.mfa_enabled,u.email_verified_at,u.is_admin,u.avatar_url FROM oc_sessions s JOIN oc_users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.kind=$2 AND s.expires_at>now() AND s.last_seen_at>now()-interval '1 day' AND NOT u.is_disabled AND u.email_verified_at IS NOT NULL AND (NOT u.mfa_enabled OR s.mfa_verified)`,
      [tokenHash(token), bearer ? 'desktop' : 'web'],
    );
    if (rows[0])
      await client.query(
        "UPDATE oc_sessions SET last_seen_at=now() WHERE token_hash=$1 AND last_seen_at<now()-interval '5 minutes'",
        [rows[0].token_hash],
      );
    return rows[0] ?? null;
  }
  readCookie(req, name) {
    return req.headers.cookie
      ?.split(';')
      .map((s) => s.trim())
      .find((s) => s.startsWith(name + '='))
      ?.slice(name.length + 1);
  }
  nonceCookie(name, token, clear = false, seconds = 600) {
    return `${this.secure ? '__Host-' : ''}oc_${name}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${clear ? 0 : seconds}${this.secure ? '; Secure' : ''}`;
  }
  nonce(req, name) {
    const token = this.readCookie(req, `${this.secure ? '__Host-' : ''}oc_${name}`);
    return token && /^[a-f0-9]{64}$/.test(token) ? token : randomBytes(32).toString('hex');
  }
  requireLogin(req) {
    const token = this.readCookie(req, `${this.secure ? '__Host-' : ''}oc_login`);
    if (!token || req.headers['x-csrf-token'] !== token)
      throw new HttpError(403, 'Refresh the sign-in page before continuing.');
  }
  async rateLimit(ip, maximum = 10) {
    this.throttle(ip, maximum);
    await this.pool.query('DELETE FROM oc_auth_attempts WHERE expires_at<=now()');
    const { rows } = await this.pool.query(
      "INSERT INTO oc_auth_attempts(key,count,expires_at) VALUES($1,1,now()+interval '1 minute') ON CONFLICT(key) DO UPDATE SET count=oc_auth_attempts.count+1 RETURNING count",
      [tokenHash(ip)],
    );
    if (rows[0].count > maximum)
      throw new HttpError(429, 'Too many sign-in attempts. Please wait a minute.');
  }
  cookie(token, clear = false) {
    return `${this.cookieName}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${clear ? 0 : 1209600}${this.secure ? '; Secure' : ''}`;
  }
  require(session, req) {
    if (!session) throw new HttpError(401, 'Sign in to continue.');
    if (session.kind === 'api') return;
    if (req.headers['x-csrf-token'] !== session.csrf)
      throw new HttpError(403, 'Session changed. Reload before saving.');
  }
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
    await this.rateLimit('account:' + username);
    {
      const { rows } = await this.pool.query('SELECT * FROM oc_users WHERE username=$1', [
        username,
      ]);
      user = rows[0];
      // Missing/social-only accounts still do the same expensive password work.
      const dummy = 'scrypt:2:00000000000000000000000000000000:' + '00'.repeat(64);
      const matches = await passwordMatches(password, user?.password_hash ?? dummy);
      if (!user || user.is_disabled || !matches)
        throw new HttpError(401, 'Username or password is incorrect.');
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
  async finishPrimary(user, kind = 'web', req, returnTo = '/') {
    return this.security.begin(user, kind, req, returnTo);
  }
  async issue(user, kind = 'web', mfaVerified = false, client = this.pool) {
    if (user.is_disabled) throw new HttpError(403, 'Account unavailable.');
    if ('email_verified_at' in user && !user.email_verified_at)
      throw new HttpError(403, 'Email confirmation is required.');
    if (user.mfa_enabled && !mfaVerified)
      throw new HttpError(403, 'Two-factor authentication is required.');
    if (!['web', 'desktop'].includes(kind)) throw new HttpError(400, 'Invalid session kind.');
    const token = randomBytes(32).toString('hex'),
      csrf = randomBytes(32).toString('hex');
    await client.query(
      "DELETE FROM oc_sessions WHERE expires_at<=now() OR last_seen_at<=now()-interval '1 day'",
    );
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
