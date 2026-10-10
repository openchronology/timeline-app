// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { HttpError } from './store.mjs';
import { tokenHash } from './auth.mjs';

/**
 * Human-verification challenges for actions that spam would use: sign-up and email sending,
 * repeated sign-in failures, contributions to other people's timelines, and plugin publishing.
 *
 * An action without a valid answer is refused with 428 and a challenge to solve; clients solve
 * it and retry with the answer in the `X-Challenge` header. Two providers exist:
 *
 * - `pow` (default): a self-hosted proof of work. The browser finds a number whose SHA-256
 *   with a signed salt matches; each answer costs about a second of CPU and is used once.
 * - `turnstile`: Cloudflare Turnstile, verified with Cloudflare's siteverify API. Desktop
 *   and API-key sessions, which cannot show Cloudflare's widget, are given proof of work.
 */
export const PURPOSES = ['register', 'email', 'sign-in', 'contribution', 'plugin'];
const PURPOSE_TEXT = {
  register: 'Confirm you are a person to create an account.',
  email: 'Confirm you are a person to send this email.',
  'sign-in': 'Several sign-in attempts failed. Confirm you are a person to continue.',
  contribution: 'Confirm you are a person to post to this timeline.',
  plugin: 'Confirm you are a person to publish this plugin.',
};
const TURNSTILE_VERIFY = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
/** Proof-of-work answers are accepted for this long after the challenge is issued. */
const LIFETIME_SECONDS = 600;
/** Sign-in failures counted per address and per account before a challenge is needed. */
const SIGN_IN_FAILURES = 3;
const sha256 = (text) => createHash('sha256').update(text).digest('hex');
const same = (a, b) =>
  typeof a === 'string' &&
  typeof b === 'string' &&
  a.length === b.length &&
  timingSafeEqual(Buffer.from(a), Buffer.from(b));

export class Challenges {
  constructor({
    pool,
    provider = 'pow',
    difficulty = 150000,
    key,
    turnstile,
    fetcher = fetch,
    origin = 'http://localhost:5173',
    trustDays = 7,
  } = {}) {
    if (!['pow', 'turnstile', 'off'].includes(provider))
      throw new Error('CHALLENGE_PROVIDER must be pow, turnstile, or off.');
    if (!Number.isInteger(difficulty) || difficulty < 1000 || difficulty > 10000000)
      throw new Error('CHALLENGE_DIFFICULTY must be an integer from 1000 to 10000000.');
    if (provider === 'turnstile' && !(turnstile?.siteKey && turnstile?.secretKey))
      throw new Error('Turnstile needs TURNSTILE_SITE_KEY and TURNSTILE_SECRET_KEY.');
    if (!Number.isFinite(trustDays) || trustDays < 0)
      throw new Error('CHALLENGE_TRUST_DAYS must be zero or more days.');
    this.pool = pool;
    this.provider = provider;
    this.difficulty = difficulty;
    // Without AUTH_ENCRYPTION_KEY, challenges are signed per process (development only).
    this.key = createHmac('sha256', key ?? randomBytes(32))
      .update('openchronology challenge v1')
      .digest();
    this.turnstile = turnstile;
    this.fetcher = fetcher;
    this.hostname = new URL(origin).hostname;
    this.trustDays = trustDays;
  }
  /** Settings from the environment; the platform passes them to the request handler. */
  static settings(env) {
    return {
      provider: env.CHALLENGE_PROVIDER || 'pow',
      difficulty: env.CHALLENGE_DIFFICULTY ? Number(env.CHALLENGE_DIFFICULTY) : undefined,
      trustDays: env.CHALLENGE_TRUST_DAYS ? Number(env.CHALLENGE_TRUST_DAYS) : undefined,
      turnstile:
        env.TURNSTILE_SITE_KEY || env.TURNSTILE_SECRET_KEY
          ? { siteKey: env.TURNSTILE_SITE_KEY, secretKey: env.TURNSTILE_SECRET_KEY }
          : undefined,
    };
  }
  /** Which provider a request answers with: Turnstile needs a browser on this site. */
  kind(session) {
    if (this.provider !== 'turnstile') return this.provider;
    return session && session.kind !== 'web' ? 'pow' : 'turnstile';
  }
  issue(purpose, session) {
    if (this.kind(session) === 'turnstile')
      return { provider: 'turnstile', purpose, siteKey: this.turnstile.siteKey };
    const expires = Math.floor(Date.now() / 1000) + LIFETIME_SECONDS;
    const salt = `${randomBytes(12).toString('hex')}.${purpose}.${expires}`;
    const challenge = sha256(salt + randomInt(this.difficulty + 1));
    return {
      provider: 'pow',
      purpose,
      algorithm: 'SHA-256',
      salt,
      challenge,
      maxnumber: this.difficulty,
      signature: this.sign(challenge),
    };
  }
  sign(challenge) {
    return createHmac('sha256', this.key).update(challenge).digest('hex');
  }
  refuse(purpose, session, message = PURPOSE_TEXT[purpose]) {
    return Object.assign(new HttpError(428, message), {
      challenge: this.issue(purpose, session),
    });
  }
  /** Throws 428 with a fresh challenge unless the request carries a valid, unused answer. */
  async require(req, purpose, session) {
    if (!PURPOSES.includes(purpose)) throw new Error('Unknown challenge purpose.');
    if (this.provider === 'off') return;
    const header = req.headers['x-challenge'];
    if (typeof header !== 'string' || !header || header.length > 4096)
      throw this.refuse(purpose, session);
    let answer;
    try {
      answer = JSON.parse(Buffer.from(header, 'base64url').toString('utf8'));
    } catch {
      throw this.refuse(purpose, session);
    }
    const accepted =
      answer?.provider === 'turnstile' && this.kind(session) === 'turnstile'
        ? await this.verifyTurnstile(answer, purpose, req.clientAddress)
        : answer?.provider === 'pow'
          ? await this.verifyWork(answer, purpose)
          : false;
    if (!accepted)
      throw this.refuse(purpose, session, 'That check expired or failed. Please try again.');
  }
  async verifyWork(answer, purpose) {
    const { salt, number, challenge, signature } = answer;
    if (typeof salt !== 'string' || salt.length > 200 || !Number.isInteger(number)) return false;
    const [, saltPurpose, expires] = salt.split('.');
    if (saltPurpose !== purpose || !(Number(expires) * 1000 > Date.now())) return false;
    if (number < 0 || number > this.difficulty) return false;
    const expected = sha256(salt + number);
    if (!same(challenge, expected) || !same(signature, this.sign(expected))) return false;
    // Each answer is spent once; replays fail even within its lifetime.
    await this.pool.query('DELETE FROM oc_challenge_uses WHERE expires_at<=now()');
    const { rowCount } = await this.pool.query(
      'INSERT INTO oc_challenge_uses(id,expires_at) VALUES($1,to_timestamp($2)) ON CONFLICT DO NOTHING',
      [tokenHash(salt), Number(expires)],
    );
    return rowCount === 1;
  }
  async verifyTurnstile(answer, purpose, ip) {
    if (typeof answer.token !== 'string' || !answer.token || answer.token.length > 2048)
      return false;
    const form = new URLSearchParams({ secret: this.turnstile.secretKey, response: answer.token });
    if (ip && ip !== 'unknown') form.set('remoteip', ip);
    let result;
    try {
      const reply = await this.fetcher(TURNSTILE_VERIFY, {
        method: 'POST',
        body: form,
        redirect: 'error',
        signal: AbortSignal.timeout(10000),
      });
      if (!reply.ok) throw new Error(`Turnstile verification returned ${reply.status}.`);
      result = await reply.json();
    } catch (error) {
      console.error(error);
      throw new HttpError(503, 'Human verification is unavailable. Please try again shortly.');
    }
    // Tokens are single-use at Cloudflare; the action binds one to the purpose it was made for.
    return (
      result?.success === true && result.action === purpose && result.hostname === this.hostname
    );
  }
  /** Sign-in needs a challenge after several failures from the address or for the account. */
  async signInNeeded(ip, username) {
    if (this.provider === 'off') return false;
    const { rows } = await this.pool.query(
      'SELECT max(count) AS count FROM oc_auth_attempts WHERE key=ANY($1) AND expires_at>now()',
      [[tokenHash('sign-in-failure:' + ip), tokenHash('sign-in-failure-account:' + username)]],
    );
    return (rows[0]?.count ?? 0) >= SIGN_IN_FAILURES;
  }
  async signInFailed(ip, username) {
    for (const key of ['sign-in-failure:' + ip, 'sign-in-failure-account:' + username])
      await this.pool.query(
        "INSERT INTO oc_auth_attempts(key,count,expires_at) VALUES($1,1,now()+interval '15 minutes') ON CONFLICT(key) DO UPDATE SET count=oc_auth_attempts.count+1",
        [tokenHash(key)],
      );
  }
  /**
   * Posting to a timeline needs a challenge from accounts newer than the trust period that
   * are not its owner or members. Administrators never need one.
   */
  async contributionNeeded(userId, timelineId) {
    if (this.provider === 'off') return false;
    const { rows } = await this.pool.query(
      `SELECT u.is_admin OR t.owner_id=u.id
        OR EXISTS(SELECT 1 FROM oc_members m WHERE m.timeline_id=t.id AND m.user_id=u.id)
        OR u.created_at<=now()-make_interval(secs=>$3) AS trusted
      FROM oc_users u, oc_timelines t WHERE u.id=$1 AND t.id=$2`,
      [userId, timelineId, this.trustDays * 86400],
    );
    // A missing timeline is reported by the action itself.
    return rows[0] ? !rows[0].trusted : false;
  }
}
