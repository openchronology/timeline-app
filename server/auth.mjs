import {
  randomBytes,
  randomUUID,
  scrypt as scryptCallback,
  timingSafeEqual,
  createHash,
} from 'node:crypto';
import { promisify } from 'node:util';
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
  constructor(pool, origin) {
    this.pool = pool;
    this.secure = new URL(origin).protocol === 'https:';
    this.cookieName = this.secure ? '__Host-oc_session' : 'oc_session';
    this.attempts = new Map();
    this.origin = origin;
  }
  throttle(key) {
    const now = Date.now();
    for (const [k, v] of this.attempts) if (v.expires < now) this.attempts.delete(k);
    const old = this.attempts.get(key) ?? { count: 0, expires: now + 60000 };
    if (old.count++ >= 10 || this.attempts.size > 10000)
      throw new HttpError(429, 'Too many sign-in attempts. Please wait a minute.');
    this.attempts.set(key, old);
  }
  async session(req) {
    const bearer = /^Bearer ([a-f0-9]{64})$/.exec(req.headers.authorization ?? ''),
      token = bearer?.[1] ?? this.readCookie(req, this.cookieName);
    if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
    const { rows } = await this.pool.query(
      `SELECT s.csrf,s.token_hash,s.kind,s.created_at,u.id,u.username FROM oc_sessions s JOIN oc_users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.kind=$2 AND s.expires_at>now() AND s.last_seen_at>now()-interval '1 day'`,
      [tokenHash(token), bearer ? 'desktop' : 'web'],
    );
    if (rows[0])
      await this.pool.query(
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
  nonceCookie(name, token, clear = false) {
    return `${this.secure ? '__Host-' : ''}oc_${name}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${clear ? 0 : 600}${this.secure ? '; Secure' : ''}`;
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
  async rateLimit(ip) {
    this.throttle(ip);
    await this.pool.query('DELETE FROM oc_auth_attempts WHERE expires_at<=now()');
    const { rows } = await this.pool.query(
      "INSERT INTO oc_auth_attempts(key,count,expires_at) VALUES($1,1,now()+interval '1 minute') ON CONFLICT(key) DO UPDATE SET count=oc_auth_attempts.count+1 RETURNING count",
      [tokenHash(ip)],
    );
    if (rows[0].count > 10)
      throw new HttpError(429, 'Too many sign-in attempts. Please wait a minute.');
  }
  cookie(token, clear = false) {
    return `${this.cookieName}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${clear ? 0 : 1209600}${this.secure ? '; Secure' : ''}`;
  }
  require(session, req) {
    if (!session) throw new HttpError(401, 'Sign in to continue.');
    if (req.headers['x-csrf-token'] !== session.csrf)
      throw new HttpError(403, 'Session changed. Reload before saving.');
  }
  async signIn(body, register, ip, kind = 'web') {
    await this.rateLimit(ip);
    const username = typeof body.username === 'string' ? body.username.toLowerCase() : '',
      password = body.password;
    if (
      typeof username !== 'string' ||
      !/^[a-z0-9][a-z0-9_-]{2,31}$/.test(username) ||
      typeof password !== 'string' ||
      password.length < 12 ||
      password.length > 1024
    )
      throw new HttpError(
        400,
        'Use a 3–32 character username and a password of at least 12 characters.',
      );
    let user;
    if (register) {
      try {
        const { rows } = await this.pool.query(
          'INSERT INTO oc_users(id,username,password_hash) VALUES($1,$2,$3) RETURNING id,username',
          [randomUUID(), username, await passwordHash(password)],
        );
        user = rows[0];
      } catch (e) {
        if (e.code === '23505') throw new HttpError(409, 'That username is already taken.');
        throw e;
      }
    } else {
      const { rows } = await this.pool.query(
        'SELECT id,username,password_hash FROM oc_users WHERE username=$1',
        [username],
      );
      user = rows[0];
      // Missing/social-only accounts still do the same expensive password work.
      const dummy = 'scrypt:2:00000000000000000000000000000000:' + '00'.repeat(64);
      const matches = await passwordMatches(password, user?.password_hash ?? dummy);
      if (!user || !matches) throw new HttpError(401, 'Username or password is incorrect.');
      if (user.password_hash.startsWith('scrypt:1:'))
        await this.pool.query(
          'UPDATE oc_users SET password_hash=$2 WHERE id=$1 AND password_hash=$3',
          [user.id, await passwordHash(password), user.password_hash],
        );
    }
    return this.issue(user, kind);
  }
  async issue(user, kind = 'web') {
    if (!['web', 'desktop'].includes(kind)) throw new HttpError(400, 'Invalid session kind.');
    const token = randomBytes(32).toString('hex'),
      csrf = randomBytes(32).toString('hex');
    await this.pool.query(
      "DELETE FROM oc_sessions WHERE expires_at<=now() OR last_seen_at<=now()-interval '1 day'",
    );
    await this.pool.query(
      "INSERT INTO oc_sessions(token_hash,user_id,csrf,kind,expires_at) VALUES($1,$2,$3,$4,now()+interval '14 days')",
      [tokenHash(token), user.id, csrf, kind],
    );
    return {
      user: { id: user.id, username: user.username },
      csrf,
      ...(kind === 'web' ? { cookie: this.cookie(token) } : { token }),
    };
  }
}
