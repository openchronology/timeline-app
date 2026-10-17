// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// Account security (docs/authentication.md): verified registration, email confirmation and
// change, forgotten passwords, the two-factor step of signing in, authenticator enrollment,
// recovery codes and the recent-sign-in check every security change needs.
import { randomBytes, randomUUID } from 'node:crypto';
import { HttpError } from './store.mjs';
import { passwordHash, passwordMatches, ACCOUNT_AGE } from './auth.mjs';
import {
  digest,
  seal,
  unseal,
  emailAddress,
  newPassword,
  newSecret,
  matchingStep,
  recoveryCodes,
  recoveryHash,
} from './security-crypto.mjs';
import { queueMail, flushMail } from './mail.mjs';
import { availableUsername } from '../dist/core.mjs';
/**
 * The answer to every request that may send email (registration, a forgotten password, an
 * email address to confirm), whether or not a message is sent, so the answer does not reveal
 * which usernames or addresses have accounts.
 */
const generic = {
  message:
    'If the account is eligible, an email will arrive shortly. Check your inbox and spam folder.',
};
/** Whether `value` is shaped like the 256-bit hex secrets used in links and cookies here. */
const validToken = (value) => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
/**
 * A year of birth given at sign-up (#115), as a number; refused for anyone who may be under
 * ACCOUNT_AGE (counted from the end of the year, so until the year they turn it is over).
 */
export function birthYear(value, now = new Date()) {
  const year = Number(value),
    current = now.getUTCFullYear();
  if (!Number.isInteger(year) || year < 1900 || year > current)
    throw new HttpError(400, 'Give your year of birth.');
  if (current - year < ACCOUNT_AGE) throw new HttpError(403, AGE_REFUSED);
  return year;
}
/** The answer to a sign-up refused for its age: neutral, as the FTC's guidance asks. */
export const AGE_REFUSED = "Sorry, we can't create an account for you.";
/**
 * The security half of accounts, built by Auth (`auth.security`). One-use secrets (email
 * links, sign-in challenges, browser proofs, recovery codes) are 256- or 128-bit random values
 * stored only as SHA-256 digests; authenticator secrets are encrypted with AUTH_ENCRYPTION_KEY.
 * Changes that matter run in one transaction that first locks the account row
 * (`SELECT … FOR UPDATE`), so two security changes, or a change and a sign-in, for the same
 * account cannot interleave.
 */
export class AccountSecurity {
  /**
   * `auth` is the Auth instance; `mailer` the email sender (mail.mjs) or null; `key` the
   * AUTH_ENCRYPTION_KEY bytes or null; `passwordCheck` the breach lookup for new passwords.
   */
  constructor(auth, mailer, key, passwordCheck) {
    this.auth = auth;
    this.pool = auth.pool;
    this.mailer = mailer;
    this.key = key;
    this.passwordCheck = passwordCheck;
  }
  /** Whether email delivery and the encryption key are both configured. */
  get available() {
    return !!this.mailer && !!this.key;
  }
  /** Refuses (503) features that need email and encryption when either is missing. */
  configured() {
    if (!this.available)
      throw new HttpError(503, 'Email and account security are not configured on this server.');
  }
  /**
   * Runs `action(client)` in one transaction on a dedicated connection: committed when it
   * returns, rolled back when it throws (and the error rethrown). Default isolation (READ
   * COMMITTED); callers take row locks where they need them. Also used by api-keys.mjs and
   * device-auth.mjs.
   */
  async transaction(action) {
    const c = await this.pool.connect();
    try {
      await c.query('BEGIN');
      const result = await action(c);
      await c.query('COMMIT');
      return result;
    } catch (e) {
      await c.query('ROLLBACK');
      throw e;
    } finally {
      c.release();
    }
  }
  /**
   * Tries to send queued email now, without waiting or failing the request. Messages are queued
   * inside the transaction that caused them (queueMail), so they exist only if it committed; the
   * mail worker sends anything left over and retries failures.
   */
  deliver() {
    void flushMail(this.pool, this.mailer, this.key).catch(() => {});
  }
  /**
   * The browser-binding cookie `oc_<name>` (by default the sign-in page's `oc_login` nonce), or
   * undefined. Flows store its hash to require that the same browser finishes them.
   */
  browser(req, name = 'login') {
    return this.auth.readCookie(req, `${this.auth.secure ? '__Host-' : ''}oc_${name}`);
  }
  /**
   * The browser's `oc_verify` proof if it has a valid one, else a new one. An emailed
   * confirmation link works only alongside this cookie, so a link forwarded, intercepted or
   * fetched by a mail scanner cannot confirm anything from another browser.
   */
  verificationProof(req) {
    const old = this.browser(req, 'verify');
    return validToken(old) ? old : randomBytes(32).toString('hex');
  }
  /**
   * Queues a security notice to the account's confirmed address, inside the caller's
   * transaction `c`, so it is sent only if the change commits. Silently skipped without a
   * confirmed address or without email configured.
   */
  async notify(c, user, text) {
    if (user.email && user.email_verified_at && this.available)
      await queueMail(c, this.key, {
        to: user.email,
        subject: 'OpenChronology account security',
        text,
      });
  }
  /**
   * Registration: `body` has the username, email, password and its confirmation and the year of
   * birth. It creates a pending registration and emails a confirmation link, not an account or
   * a session: the account is created by verify, in the browser that registered. The answer is
   * the same whether or not the username or email was free (generic), so registration cannot be
   * used to find out who has an account. Result: that answer plus the `oc_verify` proof cookie
   * (a day long). Throws 400 on invalid input, 403 for an age refused, 429 when limited, 503
   * without email configured.
   */
  async register(body, req) {
    this.configured();
    const username = typeof body.username === 'string' ? body.username.toLowerCase() : '';
    if (!/^[a-z0-9][a-z0-9_-]{2,31}$/.test(username))
      throw new HttpError(400, 'Use a 3–32 character username.');
    // Profiles are at /<username> (#148): not the site's own pages, nor a name that would pass
    // for the site or its staff (#184).
    if (!availableUsername(username))
      throw new HttpError(400, 'That username is taken. Choose another.');
    await this.refuseAgain(req);
    const email = emailAddress(body.email),
      password = newPassword(body.password, body.passwordConfirmation, username),
      born = await this.ageChecked(req, body.birthYear);
    await this.auth.rateLimit('email:' + email);
    await this.passwordCheck(password);
    const hash = await passwordHash(password),
      token = randomBytes(32).toString('hex'),
      proof = this.verificationProof(req);
    await this.transaction(async (c) => {
      // Sweeps expired pending registrations (oc_registrations_expiry), then quietly stops if
      // the username or email (compared case-insensitively, as the oc_users_email index is)
      // belongs to an account; the caller still gets the generic answer.
      await c.query('DELETE FROM oc_registrations WHERE expires_at<=now()');
      if (
        (
          await c.query('SELECT id FROM oc_users WHERE username=$1 OR lower(email)=$2', [
            username,
            email,
          ])
        ).rows.length
      )
        return;
      // Pending signups confer no account/session and cannot claim an existing identity.
      // Stored: the hashes of the emailed token and of the browser's proof, the account's
      // future id, its password hash and year of birth, expiring in 24 hours. Several pending
      // registrations for one name may exist; the first confirmed wins (see verify).
      await c.query(
        "INSERT INTO oc_registrations(token_hash,id,username,email,password_hash,browser_hash,birth_year,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7,now()+interval '24 hours')",
        [digest(token), randomUUID(), username, email, hash, digest(proof), born],
      );
      await queueMail(c, this.key, {
        to: email,
        subject: 'Confirm your OpenChronology email',
        text: `Confirm registration for @${username} using the browser where you registered:\n${this.auth.origin}/login#verify=${token}\nThis link expires in 24 hours. Ignore it if you did not request this account.`,
      });
    });
    this.deliver();
    return {
      ...generic,
      verificationRequired: true,
      proofCookie: this.auth.nonceCookie('verify', proof, false, 86400),
    };
  }
  /**
   * `value` as a year of birth (birthYear); one refused for its age is remembered for this
   * browser for a day, so a second answer is refused too (refuseAgain).
   */
  async ageChecked(req, value) {
    try {
      return birthYear(value);
    } catch (error) {
      const browser = this.browser(req);
      // Remembers the refusal by a hash of the browser's sign-in nonce for a day; a repeat
      // refusal extends it (ON CONFLICT) instead of failing on the existing row.
      if (error.status === 403 && validToken(browser))
        await this.pool.query(
          `INSERT INTO oc_age_refusals(browser_hash,expires_at) VALUES($1,now()+interval '1 day')
          ON CONFLICT(browser_hash) DO UPDATE SET expires_at=excluded.expires_at`,
          [digest(browser)],
        );
      throw error;
    }
  }
  /** Refuses a browser refused for its age within the last day. */
  async refuseAgain(req) {
    // Sweeps expired refusals first; the lookup below also checks expiry, so this only tidies.
    await this.pool.query('DELETE FROM oc_age_refusals WHERE expires_at<=now()');
    const browser = this.browser(req);
    if (!validToken(browser)) return;
    const { rows } = await this.pool.query(
      'SELECT 1 FROM oc_age_refusals WHERE browser_hash=$1 AND expires_at>now()',
      [digest(browser)],
    );
    if (rows.length) throw new HttpError(403, AGE_REFUSED);
  }
  /**
   * The step after a first factor succeeded for `user` (Auth.finishPrimary). An account with a
   * confirmed email and no two-factor authentication gets a session of `kind` at once.
   * Otherwise it gets a challenge: `mfa` (enter an authenticator or recovery code, completed by
   * complete) or `email` (confirm an address first, enrollEmail), bound to this browser's
   * `oc_login` nonce, lasting five minutes and closed after five wrong codes. A challenge gives
   * no access to timelines. Result: a session, or `{ challenge, message, challengeCookie }`.
   * Throws 401 when the password changed meanwhile, 403 without the sign-in page's nonce.
   */
  async begin(user, kind, req, returnTo = '/') {
    return this.transaction(async (c) => {
      // Re-reads the account under a row lock. If its password hash is no longer the one the
      // password was checked against, a password change or reset happened in between, and this
      // sign-in, proven with the old password, is refused.
      const current = (await c.query('SELECT * FROM oc_users WHERE id=$1 FOR UPDATE', [user.id]))
        .rows[0];
      if (!current || (user.password_hash && current.password_hash !== user.password_hash))
        throw new HttpError(401, 'Sign in again.');
      if (current.email_verified_at && !current.mfa_enabled)
        return this.auth.issue(current, kind, false, c);
      this.configured();
      const token = randomBytes(32).toString('hex'),
        browser = this.browser(req);
      if (!validToken(browser)) throw new HttpError(403, 'Refresh the sign-in page.');
      const purpose = current.email_verified_at ? 'mfa' : 'email';
      // Sweeps expired challenges (oc_auth_challenges_expiry), then stores the new one by the
      // hash of its token, with the hash of the browser nonce it is bound to, the session kind
      // to issue and where to return.
      await c.query('DELETE FROM oc_auth_challenges WHERE expires_at<=now()');
      await c.query(
        "INSERT INTO oc_auth_challenges(token_hash,user_id,browser_hash,purpose,kind,return_to,expires_at) VALUES($1,$2,$3,$4,$5,$6,now()+interval '5 minutes')",
        [digest(token), current.id, digest(browser), purpose, kind, returnTo],
      );
      return {
        challenge: purpose,
        message:
          purpose === 'mfa'
            ? 'Enter your authenticator code or a recovery code.'
            : 'Confirm an email address before signing in.',
        challengeCookie: this.auth.nonceCookie('challenge', token),
      };
    });
  }
  /**
   * This browser's live sign-in challenge, or null: the `oc_challenge` token and the `oc_login`
   * nonce must both match by hash (so a challenge cookie copied to another browser is useless),
   * it must not have expired, and fewer than five codes may have been tried. `c` lets a caller
   * read it inside its transaction.
   */
  async pending(req, c = this.pool) {
    const token = this.browser(req, 'challenge'),
      browser = this.browser(req);
    if (!validToken(token) || !validToken(browser)) return null;
    return (
      (
        await c.query(
          'SELECT * FROM oc_auth_challenges WHERE token_hash=$1 AND browser_hash=$2 AND expires_at>now() AND attempts<5',
          [digest(token), digest(browser)],
        )
      ).rows[0] ?? null
    );
  }
  /**
   * Whether `code` is a valid second factor for `user`, consuming it if so, inside transaction
   * `c` (the caller holds the account row lock). An authenticator code must be for a step later
   * than the last accepted one, which is then recorded, so a code cannot be replayed; a recovery
   * code is deleted as it is accepted, so each works once. False when two-factor authentication
   * is off.
   */
  async factor(c, user, code) {
    if (!user.mfa_enabled) return false;
    const step = matchingStep(
      unseal(user.mfa_secret, this.key, 'mfa:' + user.id),
      code,
      Number(user.mfa_last_step),
    );
    if (step !== null) {
      // Records the step so this code, and any earlier one, is refused from now on.
      await c.query('UPDATE oc_users SET mfa_last_step=$2 WHERE id=$1', [user.id, step]);
      return true;
    }
    const hash = recoveryHash(code);
    // Checks and spends a recovery code in one statement: the DELETE matches only an unused
    // code of this account, and RETURNING says whether it did, so two concurrent uses of the
    // same code cannot both succeed.
    if (hash)
      return (
        (
          await c.query(
            'DELETE FROM oc_recovery_codes WHERE user_id=$1 AND code_hash=$2 RETURNING code_hash',
            [user.id, hash],
          )
        ).rows.length > 0
      );
    return false;
  }
  /**
   * The second step of signing in: checks `code` (authenticator or recovery) against this
   * browser's `mfa` challenge and, if right, issues the session the challenge was for. Rate-
   * limited per client address `ip`, and each challenge allows five tries. Failures of every
   * kind (no challenge, expired, wrong code) give the same 401, so nothing is learned from
   * which one it was. Result: the session plus `returnTo`, and a cookie clearing the challenge.
   */
  async complete(req, code, ip) {
    await this.auth.rateLimit('mfa-ip:' + ip);
    const result = await this.transaction(async (c) => {
      const pending = await this.pending(req, c);
      if (!pending || pending.purpose !== 'mfa') return { error: true };
      // Locks the account (the same lock security changes take, and factor updates it), then
      // the challenge row, and reads the challenge again: a concurrent attempt that counted a
      // try, completed or deleted it meanwhile is seen now, so five tries really is the limit
      // and a challenge issues at most one session.
      const user = (
        await c.query('SELECT * FROM oc_users WHERE id=$1 FOR UPDATE', [pending.user_id])
      ).rows[0];
      await c.query('SELECT token_hash FROM oc_auth_challenges WHERE token_hash=$1 FOR UPDATE', [
        pending.token_hash,
      ]);
      const live = await this.pending(req, c);
      if (!live) return { error: true };
      // Counts the try before checking the code. A wrong code returns normally (not by
      // throwing) so the transaction commits and the count sticks.
      await c.query('UPDATE oc_auth_challenges SET attempts=attempts+1 WHERE token_hash=$1', [
        pending.token_hash,
      ]);
      if (!user?.email_verified_at || !(await this.factor(c, user, code))) return { error: true };
      // One use: the challenge is deleted in the same transaction that issues the session.
      await c.query('DELETE FROM oc_auth_challenges WHERE token_hash=$1', [pending.token_hash]);
      return {
        ...(await this.auth.issue(user, pending.kind, true, c)),
        returnTo: pending.return_to,
      };
    });
    if (result.error)
      throw new HttpError(
        401,
        'Invalid or expired authentication code. Sign in again after five attempts.',
      );
    return {
      ...result,
      challengeCookie: this.auth.nonceCookie('challenge', '', true),
    };
  }
  /**
   * Adds an email address to an account without a confirmed one: a signed-in account
   * (`session`, which then needs a recent sign-in) or a new social account in the middle of its
   * `email` sign-in challenge. `body` has the email, and for an account without a year of birth,
   * the year (#115). Emails a confirmation link bound to this browser's `oc_verify` proof,
   * replacing any earlier one. An address already used by another account gets the generic
   * answer and no email. Result: the generic answer and the proof cookie. Throws 400, 401, 403
   * (age), 429.
   */
  async enrollEmail(req, body, session) {
    this.configured();
    const email = emailAddress(body.email),
      proof = this.verificationProof(req),
      pending = await this.pending(req);
    if (!session && pending?.purpose !== 'email')
      throw new HttpError(401, 'Sign in before confirming an email address.');
    const userId = session?.id ?? pending.user_id;
    await this.auth.rateLimit('email:' + email);
    // The year of birth, if given; one under 13 closes a new account (below).
    let born = null,
      tooYoung = null,
      closed = false;
    if (!session) await this.refuseAgain(req);
    if (body.birthYear !== undefined && body.birthYear !== '')
      try {
        born = await this.ageChecked(req, body.birthYear);
      } catch (error) {
        if (error.status !== 403) throw error;
        tooYoung = error;
      }
    await this.transaction(async (c) => {
      // Locks the account so this cannot interleave with another enrollment or its confirmation.
      const user = (await c.query('SELECT * FROM oc_users WHERE id=$1 FOR UPDATE', [userId]))
        .rows[0];
      if (user.email_verified_at)
        throw new HttpError(400, 'This account already has a verified email address.');
      if (session) await this.fresh(c, user, session, body);
      // A new account (from a social sign-in) gives its year of birth here, before it can
      // sign in (#115). One for someone under 13 is closed: it cannot have been used yet.
      if (user.birth_year == null) {
        if (tooYoung && !session) {
          await this.close(c, user);
          closed = true;
          return;
        }
        if (tooYoung) throw tooYoung;
        if (born === null) throw new HttpError(400, 'Give your year of birth.');
        await c.query('UPDATE oc_users SET birth_year=$2 WHERE id=$1', [userId, born]);
      }
      // Another account has this address (oc_users_email, case-insensitive): stop quietly, so
      // the generic answer does not reveal it. The year of birth saved above still commits.
      if (
        (await c.query('SELECT id FROM oc_users WHERE lower(email)=$1 AND id!=$2', [email, userId]))
          .rows.length
      )
        return;
      const token = randomBytes(32).toString('hex');
      // Only the newest confirmation link works: earlier `verify` tokens for the account go.
      await c.query("DELETE FROM oc_email_tokens WHERE user_id=$1 AND purpose='verify'", [userId]);
      // Stores the link's token hash and the browser proof's hash, valid for 24 hours.
      await c.query(
        "INSERT INTO oc_email_tokens(token_hash,user_id,purpose,email,browser_hash,expires_at) VALUES($1,$2,'verify',$3,$4,now()+interval '24 hours')",
        [digest(token), userId, email, digest(proof)],
      );
      await queueMail(c, this.key, {
        to: email,
        subject: 'Confirm your OpenChronology email',
        text: `Confirm email for @${user.username} in the browser where you requested it:\n${this.auth.origin}/login#verify=${token}\nThis link expires in 24 hours. Ignore it if you did not request this.`,
      });
    });
    if (closed) throw tooYoung;
    this.deliver();
    return { ...generic, proofCookie: this.auth.nonceCookie('verify', proof, false, 86400) };
  }
  /**
   * Closes the account `user`, which gave an age under 13 before it could sign in: deleted if
   * it holds nothing (it cannot, before its email is confirmed), else suspended for the
   * operator to review.
   */
  async close(c, user) {
    // oc_timelines.owner_id has no ON DELETE CASCADE, so an account owning a timeline cannot be
    // deleted here; LIMIT 1 stops at the first one found.
    const holds = (await c.query('SELECT 1 FROM oc_timelines WHERE owner_id=$1 LIMIT 1', [user.id]))
      .rows.length;
    if (holds) await c.query('UPDATE oc_users SET is_disabled=true WHERE id=$1', [user.id]);
    else await c.query('DELETE FROM oc_users WHERE id=$1', [user.id]);
  }
  /**
   * Confirms an emailed link's `token` in the browser that asked for it (its `oc_verify` proof
   * must match). Three kinds of link share the address: a pending registration (which creates
   * the account), a first email address (`verify`) and an email change (`change`). Confirming
   * an address signs the account out everywhere: its sessions, sign-in challenges, other
   * email links and pending desktop sign-ins all end. A change also notifies the old address.
   * Result: a message and a cookie clearing any sign-in challenge. Throws 400 for a link that is
   * invalid, expired, used, from another browser, or whose name or address was taken meanwhile.
   */
  async verify(req, token) {
    if (!validToken(token)) throw new HttpError(400, 'Invalid or expired confirmation link.');
    const proof = this.browser(req, 'verify');
    if (!validToken(proof))
      throw new HttpError(400, 'Open this confirmation in the browser where you requested it.');
    await this.transaction(async (c) => {
      // A pending registration with this token, locked so a double submission confirms once.
      const signup = (
        await c.query(
          'SELECT * FROM oc_registrations WHERE token_hash=$1 AND expires_at>now() FOR UPDATE',
          [digest(token)],
        )
      ).rows[0];
      if (signup) {
        if (signup.browser_hash !== digest(proof))
          throw new HttpError(400, 'Open this confirmation in the browser where you registered.');
        // Creates the account with its email already confirmed. If the username or address was
        // taken since registration, the unique indexes refuse it (23505, handled below).
        await c.query(
          'INSERT INTO oc_users(id,username,email,email_verified_at,password_hash,birth_year) VALUES($1,$2,$3,now(),$4,$5)',
          [signup.id, signup.username, signup.email, signup.password_hash, signup.birth_year],
        );
        // Uses up this registration and any other pending one for the same name or address,
        // which could no longer be confirmed anyway.
        await c.query('DELETE FROM oc_registrations WHERE username=$1 OR email=$2', [
          signup.username,
          signup.email,
        ]);
        return;
      }
      // Otherwise an address link. Reset links share the table but are refused here (they go to
      // reset). The browser proof is compared by hash.
      let row = (
        await c.query(
          "SELECT * FROM oc_email_tokens WHERE token_hash=$1 AND purpose IN ('verify','change') AND expires_at>now()",
          [digest(token)],
        )
      ).rows[0];
      if (!row || row.browser_hash !== digest(proof))
        throw new HttpError(400, 'Invalid, expired or different-browser confirmation link.');
      // Locks the account first, as every security change does (same lock order, so no
      // deadlock), then reads the link again under a lock: if a concurrent confirmation or
      // change already used or replaced it, it is gone now.
      const user = (await c.query('SELECT * FROM oc_users WHERE id=$1 FOR UPDATE', [row.user_id]))
        .rows[0];
      row = (
        await c.query(
          "SELECT * FROM oc_email_tokens WHERE token_hash=$1 AND purpose IN ('verify','change') AND expires_at>now() FOR UPDATE",
          [digest(token)],
        )
      ).rows[0];
      if (!row) throw new HttpError(400, 'Invalid or expired confirmation link.');
      // A change link is valid only while the address it replaces is still the account's.
      if (row.purpose === 'change' && user.email !== row.old_email)
        throw new HttpError(400, 'Email changed since this link was requested.');
      // Sets the confirmed address (the unique index refuses one another account took
      // meanwhile, 23505), then ends everything issued before: all email links (this one
      // included, so it works once), sign-in challenges, sessions and unclaimed desktop
      // sign-ins.
      await c.query('UPDATE oc_users SET email=$2,email_verified_at=now() WHERE id=$1', [
        row.user_id,
        row.email,
      ]);
      await c.query('DELETE FROM oc_email_tokens WHERE user_id=$1', [row.user_id]);
      await c.query('DELETE FROM oc_auth_challenges WHERE user_id=$1', [row.user_id]);
      await c.query('DELETE FROM oc_sessions WHERE user_id=$1', [row.user_id]);
      await c.query('DELETE FROM oc_device_logins WHERE user_id=$1', [row.user_id]);
      if (row.purpose === 'change')
        await this.notify(
          c,
          user,
          'Your OpenChronology email address was changed. Contact the operator if you did not authorize this.',
        );
    }).catch((e) => {
      // 23505 is PostgreSQL's unique_violation: the username or address is now another
      // account's.
      if (e.code === '23505')
        throw new HttpError(400, 'This registration or email is no longer available.');
      throw e;
    });
    this.deliver();
    return {
      message: 'Email confirmed. Sign in to continue.',
      challengeCookie: this.auth.nonceCookie('challenge', '', true),
    };
  }
  /**
   * A forgotten password: emails a reset link, valid 30 minutes, to `email` if it is a
   * confirmed address of an account with a password. Rate-limited per client address `ip` and
   * per address. The answer is the same in every case (generic), so it does not reveal whether
   * the address has an account. Only the newest link works.
   */
  async forgot(email, ip) {
    this.configured();
    email = emailAddress(email);
    await this.auth.rateLimit('reset-ip:' + ip);
    await this.auth.rateLimit('reset-email:' + email);
    await this.transaction(async (c) => {
      // The account with this confirmed address (the oc_users_email index serves lower(email)),
      // locked against a concurrent change. Social-only accounts have no password to reset.
      const user = (
        await c.query(
          'SELECT * FROM oc_users WHERE lower(email)=$1 AND email_verified_at IS NOT NULL FOR UPDATE',
          [email],
        )
      ).rows[0];
      if (!user?.password_hash) return;
      const token = randomBytes(32).toString('hex');
      // Replaces any earlier reset link with this one; it records the address it was sent to,
      // which reset checks is still the account's. It is not bound to a browser: the person may
      // open it anywhere.
      await c.query("DELETE FROM oc_email_tokens WHERE user_id=$1 AND purpose='reset'", [user.id]);
      await c.query(
        "INSERT INTO oc_email_tokens(token_hash,user_id,purpose,email,expires_at) VALUES($1,$2,'reset',$3,now()+interval '30 minutes')",
        [digest(token), user.id, email],
      );
      await queueMail(c, this.key, {
        to: email,
        subject: 'Reset your OpenChronology password',
        text: `Reset your password:\n${this.auth.origin}/login#reset=${token}\nThis link expires in 30 minutes. Resetting your password does not disable two-factor authentication. Ignore this message if you did not request it.`,
      });
    });
    this.deliver();
    return generic;
  }
  /**
   * Sets a new password from a reset link: `body` has the link's token, the password and its
   * confirmation. The link works once and only while the address it went to is still the
   * account's confirmed address. Everything that could still act for the account ends: all
   * sessions, pending desktop sign-ins, sign-in challenges and other reset links, and its API
   * keys are revoked. Two-factor authentication stays on (resetting by email must not be a way
   * around it). The account is notified.
   */
  async reset(body) {
    this.configured();
    if (!validToken(body.token)) throw new HttpError(400, 'Invalid or expired reset link.');
    const password = newPassword(body.password, body.passwordConfirmation);
    await this.passwordCheck(password);
    const hash = await passwordHash(password);
    await this.transaction(async (c) => {
      // Finds the link to learn whose account it is, locks that account, then spends the link
      // with DELETE … RETURNING: only one of two concurrent resets with the same link gets the
      // row back, so it works once.
      let row = (
        await c.query(
          "SELECT * FROM oc_email_tokens WHERE token_hash=$1 AND purpose='reset' AND expires_at>now()",
          [digest(body.token)],
        )
      ).rows[0];
      if (!row) throw new HttpError(400, 'Invalid or expired reset link.');
      const user = (await c.query('SELECT * FROM oc_users WHERE id=$1 FOR UPDATE', [row.user_id]))
        .rows[0];
      row = (
        await c.query(
          "DELETE FROM oc_email_tokens WHERE token_hash=$1 AND purpose='reset' AND expires_at>now() RETURNING *",
          [digest(body.token)],
        )
      ).rows[0];
      if (!row) throw new HttpError(400, 'Invalid or expired reset link.');
      // Addresses are compared lowercased: the link holds the address as typed to ask for it,
      // lowercased, and an account (such as the bootstrap administrator's) may keep capitals.
      if (user.email?.toLowerCase() !== row.email || !user.email_verified_at)
        throw new HttpError(400, 'This reset link is no longer valid.');
      // The new password, then the sign-out of everything: other reset links, every session,
      // every active API key (revoked, kept for the list), unclaimed desktop sign-ins (so an
      // earlier approval cannot restore access) and sign-in challenges.
      await c.query('UPDATE oc_users SET password_hash=$2 WHERE id=$1', [user.id, hash]);
      await c.query("DELETE FROM oc_email_tokens WHERE user_id=$1 AND purpose='reset'", [user.id]);
      await c.query('DELETE FROM oc_sessions WHERE user_id=$1', [user.id]);
      await c.query(
        'UPDATE oc_api_keys SET revoked_at=now() WHERE user_id=$1 AND revoked_at IS NULL',
        [user.id],
      );
      await c.query('DELETE FROM oc_device_logins WHERE user_id=$1', [user.id]);
      await c.query('DELETE FROM oc_auth_challenges WHERE user_id=$1', [user.id]);
      await this.notify(
        c,
        user,
        'Your OpenChronology password was reset. All sessions were signed out. Two-factor authentication remains unchanged.',
      );
    });
    this.deliver();
    return { message: 'Password reset. Sign in again; two-factor authentication still applies.' };
  }
  /**
   * The check every security change makes, inside its transaction `c` with `user` locked: the
   * session began within five minutes, it is still live (not revoked, expired or idle) and, if
   * two-factor authentication is on, completed it; the current password (`body.password`) when
   * the account has one; and, when `requireFactor` and two-factor authentication is on, a fresh
   * authenticator or recovery code (`body.code`), which it consumes. Someone who finds a signed-
   * in browser, or steals a session, cannot change security settings with it alone. Throws 403
   * for the session, 401 for the password or code.
   */
  async fresh(c, user, session, body, requireFactor = true) {
    if (
      !session ||
      !Number.isFinite(new Date(session.created_at).getTime()) ||
      Date.now() - new Date(session.created_at).getTime() > 5 * 60000
    )
      throw new HttpError(403, 'Sign out and sign in again before changing security settings.');
    // Re-checks the session in this transaction: one revoked (by another security change, say)
    // since the request began no longer counts. The boolean parameter makes mfa_verified
    // required only for an account with two-factor authentication on.
    const live = (
      await c.query(
        "SELECT token_hash FROM oc_sessions WHERE token_hash=$1 AND user_id=$2 AND expires_at>now() AND last_seen_at>now()-interval '1 day' AND (NOT $3::boolean OR mfa_verified)",
        [session.token_hash, user.id, !!user.mfa_enabled],
      )
    ).rows[0];
    if (!live) throw new HttpError(403, 'Sign in again before changing security settings.');
    if (user.password_hash && !(await passwordMatches(body.password ?? '', user.password_hash)))
      throw new HttpError(401, 'Current password is incorrect.');
    if (user.mfa_enabled && requireFactor && !(await this.factor(c, user, body.code)))
      throw new HttpError(401, 'Enter a fresh authenticator code or recovery code.');
  }
  /**
   * Starts authenticator enrollment: a new secret, kept encrypted in oc_mfa_setups for ten
   * minutes and tied to this session, until enable confirms a code from it. Needs a confirmed
   * email and a recent sign-in with the password. Result: the base32 secret and its `otpauth://`
   * link for the authenticator app (shown to the person, not stored in clear).
   */
  async setup(session, body) {
    this.configured();
    return this.transaction(async (c) => {
      const user = (await c.query('SELECT * FROM oc_users WHERE id=$1 FOR UPDATE', [session.id]))
        .rows[0];
      if (!user.email_verified_at) throw new HttpError(403, 'Verify an email address first.');
      if (user.mfa_enabled)
        throw new HttpError(400, 'Two-factor authentication is already enabled.');
      await this.fresh(c, user, session, body);
      const secret = newSecret();
      // One setup per account (user_id is the key): starting again replaces the earlier
      // secret, session and expiry (ON CONFLICT). The secret is sealed with the account in its
      // authenticated data (`setup:<id>`), so it cannot be moved to another account's row.
      await c.query(
        "INSERT INTO oc_mfa_setups(user_id,session_hash,secret,expires_at) VALUES($1,$2,$3,now()+interval '10 minutes') ON CONFLICT(user_id) DO UPDATE SET session_hash=excluded.session_hash,secret=excluded.secret,expires_at=excluded.expires_at",
        [user.id, session.token_hash, seal(secret, this.key, 'setup:' + user.id)],
      );
      return {
        secret,
        uri: `otpauth://totp/${encodeURIComponent('OpenChronology:' + user.username)}?secret=${secret}&issuer=OpenChronology&algorithm=SHA1&digits=6&period=30`,
      };
    });
  }
  /**
   * Turns two-factor authentication on: `body.code` must be a code from the secret setup made in
   * this same session (and the password, through fresh). The secret moves to the account,
   * re-sealed for `mfa:<id>`; ten new recovery codes replace any old ones; other sessions and
   * pending desktop sign-ins end, and this session is marked as having completed two-factor
   * authentication. The account is notified. Result: the recovery codes, shown this once.
   */
  async enable(session, body) {
    this.configured();
    const codes = recoveryCodes();
    await this.transaction(async (c) => {
      const user = (await c.query('SELECT * FROM oc_users WHERE id=$1 FOR UPDATE', [session.id]))
        .rows[0];
      if (user.mfa_enabled)
        throw new HttpError(400, 'Two-factor authentication is already enabled.');
      await this.fresh(c, user, session, body);
      // The setup must belong to this session and be unexpired: a setup started elsewhere (by
      // someone else holding another session) cannot be confirmed from here.
      const setup = (
        await c.query(
          'SELECT * FROM oc_mfa_setups WHERE user_id=$1 AND session_hash=$2 AND expires_at>now() FOR UPDATE',
          [session.id, session.token_hash],
        )
      ).rows[0];
      if (!setup) throw new HttpError(400, 'Authenticator setup expired. Start again.');
      const secret = unseal(setup.secret, this.key, 'setup:' + user.id),
        step = matchingStep(secret, body.code);
      if (step === null) throw new HttpError(401, 'Invalid authenticator code.');
      // The confirming code's step becomes the last used, so it cannot also sign in.
      await c.query(
        'UPDATE oc_users SET mfa_secret=$2,mfa_enabled=true,mfa_last_step=$3 WHERE id=$1',
        [user.id, seal(secret, this.key, 'mfa:' + user.id), step],
      );
      await c.query('DELETE FROM oc_recovery_codes WHERE user_id=$1', [user.id]);
      for (const code of codes)
        await c.query('INSERT INTO oc_recovery_codes(user_id,code_hash) VALUES($1,$2)', [
          user.id,
          recoveryHash(code),
        ]);
      // The setup is used up; every other session, which never completed two-factor
      // authentication, ends, as do unclaimed desktop sign-ins; this one is marked as verified
      // so it keeps working under the new rule (Auth.session requires it).
      await c.query('DELETE FROM oc_mfa_setups WHERE user_id=$1', [user.id]);
      await c.query('DELETE FROM oc_sessions WHERE user_id=$1 AND token_hash!=$2', [
        user.id,
        session.token_hash,
      ]);
      await c.query('DELETE FROM oc_device_logins WHERE user_id=$1', [user.id]);
      await c.query('UPDATE oc_sessions SET mfa_verified=true WHERE token_hash=$1', [
        session.token_hash,
      ]);
      await this.notify(
        c,
        user,
        'Two-factor authentication was enabled. Other sessions were revoked. Keep your recovery codes offline.',
      );
    });
    this.deliver();
    return {
      recoveryCodes: codes,
      message:
        'Two-factor authentication enabled. Store these recovery codes safely; they are shown only once.',
    };
  }
  /**
   * A security change of the signed-in account, after fresh: `action` is `password` (set
   * `body.newPassword`; every session, API key, desktop sign-in, challenge and reset link
   * ends), `email` (email a confirmation link for `body.email` to the new address, bound to
   * this browser, and tell the old one; the address changes only when confirmed, in verify),
   * `disable` (turn two-factor authentication off) or `recovery` (replace the recovery codes).
   * The last two end other sessions, challenges and desktop sign-ins. Each is notified. The
   * slow work (breach check, password hashing) happens before the transaction so the account
   * row is not locked during it. Result: a message, plus new recovery codes or the proof cookie.
   */
  async change(session, action, body, req) {
    this.configured();
    if (action === 'password')
      await this.passwordCheck(newPassword(body.newPassword, body.passwordConfirmation));
    const newHash = action === 'password' ? await passwordHash(body.newPassword) : null;
    const email = action === 'email' ? emailAddress(body.email) : null,
      proof = action === 'email' ? this.verificationProof(req) : null;
    const codes = action === 'recovery' ? recoveryCodes() : null;
    await this.transaction(async (c) => {
      const user = (await c.query('SELECT * FROM oc_users WHERE id=$1 FOR UPDATE', [session.id]))
        .rows[0];
      await this.fresh(c, user, session, body);
      if (action === 'password') {
        // As for a reset: the new hash, then every session (this one too), API key, desktop
        // sign-in, challenge and outstanding reset link ends.
        await c.query('UPDATE oc_users SET password_hash=$2 WHERE id=$1', [user.id, newHash]);
        await c.query('DELETE FROM oc_sessions WHERE user_id=$1', [user.id]);
        await c.query(
          'UPDATE oc_api_keys SET revoked_at=now() WHERE user_id=$1 AND revoked_at IS NULL',
          [user.id],
        );
        await c.query('DELETE FROM oc_device_logins WHERE user_id=$1', [user.id]);
        await c.query('DELETE FROM oc_auth_challenges WHERE user_id=$1', [user.id]);
        await c.query("DELETE FROM oc_email_tokens WHERE user_id=$1 AND purpose='reset'", [
          user.id,
        ]);
        await this.notify(
          c,
          user,
          'Your OpenChronology password changed. All sessions were signed out.',
        );
      } else if (action === 'email') {
        const token = randomBytes(32).toString('hex');
        // Only the newest change link works. It records the current address (old_email), so
        // verify refuses it if the address changed meanwhile.
        await c.query("DELETE FROM oc_email_tokens WHERE user_id=$1 AND purpose='change'", [
          user.id,
        ]);
        // Another account has the new address (oc_users_email, case-insensitive): no link,
        // which could never be confirmed (#193). The answer is the generic one either way, so
        // it does not reveal the address; confirmation still refuses one taken meanwhile.
        const taken = (
          await c.query('SELECT id FROM oc_users WHERE lower(email)=$1 AND id!=$2', [
            email,
            user.id,
          ])
        ).rows.length;
        if (!taken) {
          await c.query(
            "INSERT INTO oc_email_tokens(token_hash,user_id,purpose,email,old_email,browser_hash,expires_at) VALUES($1,$2,'change',$3,$4,$5,now()+interval '24 hours')",
            [digest(token), user.id, email, user.email, digest(proof)],
          );
          await queueMail(c, this.key, {
            to: email,
            subject: 'Confirm your new OpenChronology email',
            text: `Confirm your new email in the requesting browser:\n${this.auth.origin}/login#verify=${token}\nThis link expires in 24 hours.`,
          });
        }
        await this.notify(
          c,
          user,
          'A change to your OpenChronology email was requested. Your current address remains active until confirmation.',
        );
      } else {
        if (!user.mfa_enabled)
          throw new HttpError(400, 'Two-factor authentication is not enabled.');
        // Old recovery codes end either way; disabling also clears the secret, and the last
        // step goes back to its default so a later enrollment starts fresh.
        await c.query('DELETE FROM oc_recovery_codes WHERE user_id=$1', [user.id]);
        if (action === 'disable')
          await c.query(
            'UPDATE oc_users SET mfa_enabled=false,mfa_secret=NULL,mfa_last_step=-1 WHERE id=$1',
            [user.id],
          );
        else
          for (const code of codes)
            await c.query('INSERT INTO oc_recovery_codes(user_id,code_hash) VALUES($1,$2)', [
              user.id,
              recoveryHash(code),
            ]);
        await c.query('DELETE FROM oc_sessions WHERE user_id=$1 AND token_hash!=$2', [
          user.id,
          session.token_hash,
        ]);
        await c.query('DELETE FROM oc_auth_challenges WHERE user_id=$1', [user.id]);
        await c.query('DELETE FROM oc_device_logins WHERE user_id=$1', [user.id]);
        await this.notify(
          c,
          user,
          action === 'disable'
            ? 'Two-factor authentication was disabled. Other sessions were revoked.'
            : 'Recovery codes were replaced. Previous codes no longer work. Other sessions were revoked.',
        );
      }
    });
    this.deliver();
    return {
      message: action === 'email' ? generic.message : 'Security settings updated.',
      ...(codes ? { recoveryCodes: codes } : {}),
      ...(email ? { proofCookie: this.auth.nonceCookie('verify', proof, false, 86400) } : {}),
    };
  }
}
