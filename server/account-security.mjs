// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
import { randomBytes, randomUUID } from 'node:crypto';
import { HttpError } from './store.mjs';
import { passwordHash, passwordMatches } from './auth.mjs';
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
const generic = {
  message:
    'If the account is eligible, an email will arrive shortly. Check your inbox and spam folder.',
};
const validToken = (value) => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
export class AccountSecurity {
  constructor(auth, mailer, key, passwordCheck) {
    this.auth = auth;
    this.pool = auth.pool;
    this.mailer = mailer;
    this.key = key;
    this.passwordCheck = passwordCheck;
  }
  get available() {
    return !!this.mailer && !!this.key;
  }
  configured() {
    if (!this.available)
      throw new HttpError(503, 'Email and account security are not configured on this server.');
  }
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
  deliver() {
    void flushMail(this.pool, this.mailer, this.key).catch(() => {});
  }
  browser(req, name = 'login') {
    return this.auth.readCookie(req, `${this.auth.secure ? '__Host-' : ''}oc_${name}`);
  }
  verificationProof(req) {
    const old = this.browser(req, 'verify');
    return validToken(old) ? old : randomBytes(32).toString('hex');
  }
  async notify(c, user, text) {
    if (user.email && user.email_verified_at && this.available)
      await queueMail(c, this.key, {
        to: user.email,
        subject: 'OpenChronology account security',
        text,
      });
  }
  async register(body, req) {
    this.configured();
    const username = typeof body.username === 'string' ? body.username.toLowerCase() : '';
    if (!/^[a-z0-9][a-z0-9_-]{2,31}$/.test(username))
      throw new HttpError(400, 'Use a 3–32 character username.');
    const email = emailAddress(body.email),
      password = newPassword(body.password, body.passwordConfirmation, username);
    await this.auth.rateLimit('email:' + email);
    await this.passwordCheck(password);
    const hash = await passwordHash(password),
      token = randomBytes(32).toString('hex'),
      proof = this.verificationProof(req);
    await this.transaction(async (c) => {
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
      await c.query(
        "INSERT INTO oc_registrations(token_hash,id,username,email,password_hash,browser_hash,expires_at) VALUES($1,$2,$3,$4,$5,$6,now()+interval '24 hours')",
        [digest(token), randomUUID(), username, email, hash, digest(proof)],
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
  async begin(user, kind, req, returnTo = '/') {
    return this.transaction(async (c) => {
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
  async factor(c, user, code) {
    if (!user.mfa_enabled) return false;
    const step = matchingStep(
      unseal(user.mfa_secret, this.key, 'mfa:' + user.id),
      code,
      Number(user.mfa_last_step),
    );
    if (step !== null) {
      await c.query('UPDATE oc_users SET mfa_last_step=$2 WHERE id=$1', [user.id, step]);
      return true;
    }
    const hash = recoveryHash(code);
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
  async complete(req, code, ip) {
    await this.auth.rateLimit('mfa-ip:' + ip);
    const result = await this.transaction(async (c) => {
      const pending = await this.pending(req, c);
      if (!pending || pending.purpose !== 'mfa') return { error: true };
      const user = (
        await c.query('SELECT * FROM oc_users WHERE id=$1 FOR UPDATE', [pending.user_id])
      ).rows[0];
      await c.query('SELECT token_hash FROM oc_auth_challenges WHERE token_hash=$1 FOR UPDATE', [
        pending.token_hash,
      ]);
      const live = await this.pending(req, c);
      if (!live) return { error: true };
      await c.query('UPDATE oc_auth_challenges SET attempts=attempts+1 WHERE token_hash=$1', [
        pending.token_hash,
      ]);
      if (!user?.email_verified_at || !(await this.factor(c, user, code))) return { error: true };
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
  async enrollEmail(req, body, session) {
    this.configured();
    const email = emailAddress(body.email),
      proof = this.verificationProof(req),
      pending = await this.pending(req);
    if (!session && pending?.purpose !== 'email')
      throw new HttpError(401, 'Sign in before confirming an email address.');
    const userId = session?.id ?? pending.user_id;
    await this.auth.rateLimit('email:' + email);
    await this.transaction(async (c) => {
      const user = (await c.query('SELECT * FROM oc_users WHERE id=$1 FOR UPDATE', [userId]))
        .rows[0];
      if (user.email_verified_at)
        throw new HttpError(400, 'This account already has a verified email address.');
      if (session) await this.fresh(c, user, session, body);
      if (
        (await c.query('SELECT id FROM oc_users WHERE lower(email)=$1 AND id!=$2', [email, userId]))
          .rows.length
      )
        return;
      const token = randomBytes(32).toString('hex');
      await c.query("DELETE FROM oc_email_tokens WHERE user_id=$1 AND purpose='verify'", [userId]);
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
    this.deliver();
    return { ...generic, proofCookie: this.auth.nonceCookie('verify', proof, false, 86400) };
  }
  async verify(req, token) {
    if (!validToken(token)) throw new HttpError(400, 'Invalid or expired confirmation link.');
    const proof = this.browser(req, 'verify');
    if (!validToken(proof))
      throw new HttpError(400, 'Open this confirmation in the browser where you requested it.');
    await this.transaction(async (c) => {
      const signup = (
        await c.query(
          'SELECT * FROM oc_registrations WHERE token_hash=$1 AND expires_at>now() FOR UPDATE',
          [digest(token)],
        )
      ).rows[0];
      if (signup) {
        if (signup.browser_hash !== digest(proof))
          throw new HttpError(400, 'Open this confirmation in the browser where you registered.');
        await c.query(
          'INSERT INTO oc_users(id,username,email,email_verified_at,password_hash) VALUES($1,$2,$3,now(),$4)',
          [signup.id, signup.username, signup.email, signup.password_hash],
        );
        await c.query('DELETE FROM oc_registrations WHERE username=$1 OR email=$2', [
          signup.username,
          signup.email,
        ]);
        return;
      }
      let row = (
        await c.query(
          "SELECT * FROM oc_email_tokens WHERE token_hash=$1 AND purpose IN ('verify','change') AND expires_at>now()",
          [digest(token)],
        )
      ).rows[0];
      if (!row || row.browser_hash !== digest(proof))
        throw new HttpError(400, 'Invalid, expired or different-browser confirmation link.');
      const user = (await c.query('SELECT * FROM oc_users WHERE id=$1 FOR UPDATE', [row.user_id]))
        .rows[0];
      row = (
        await c.query(
          "SELECT * FROM oc_email_tokens WHERE token_hash=$1 AND purpose IN ('verify','change') AND expires_at>now() FOR UPDATE",
          [digest(token)],
        )
      ).rows[0];
      if (!row) throw new HttpError(400, 'Invalid or expired confirmation link.');
      if (row.purpose === 'change' && user.email !== row.old_email)
        throw new HttpError(400, 'Email changed since this link was requested.');
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
  async forgot(email, ip) {
    this.configured();
    email = emailAddress(email);
    await this.auth.rateLimit('reset-ip:' + ip);
    await this.auth.rateLimit('reset-email:' + email);
    await this.transaction(async (c) => {
      const user = (
        await c.query(
          'SELECT * FROM oc_users WHERE lower(email)=$1 AND email_verified_at IS NOT NULL FOR UPDATE',
          [email],
        )
      ).rows[0];
      if (!user?.password_hash) return;
      const token = randomBytes(32).toString('hex');
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
  async reset(body) {
    this.configured();
    if (!validToken(body.token)) throw new HttpError(400, 'Invalid or expired reset link.');
    const password = newPassword(body.password, body.passwordConfirmation);
    await this.passwordCheck(password);
    const hash = await passwordHash(password);
    await this.transaction(async (c) => {
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
      if (user.email !== row.email || !user.email_verified_at)
        throw new HttpError(400, 'This reset link is no longer valid.');
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
  async fresh(c, user, session, body, requireFactor = true) {
    if (
      !session ||
      !Number.isFinite(new Date(session.created_at).getTime()) ||
      Date.now() - new Date(session.created_at).getTime() > 5 * 60000
    )
      throw new HttpError(403, 'Sign out and sign in again before changing security settings.');
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
  async enable(session, body) {
    this.configured();
    const codes = recoveryCodes();
    await this.transaction(async (c) => {
      const user = (await c.query('SELECT * FROM oc_users WHERE id=$1 FOR UPDATE', [session.id]))
        .rows[0];
      if (user.mfa_enabled)
        throw new HttpError(400, 'Two-factor authentication is already enabled.');
      await this.fresh(c, user, session, body);
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
        await c.query("DELETE FROM oc_email_tokens WHERE user_id=$1 AND purpose='change'", [
          user.id,
        ]);
        await c.query(
          "INSERT INTO oc_email_tokens(token_hash,user_id,purpose,email,old_email,browser_hash,expires_at) VALUES($1,$2,'change',$3,$4,$5,now()+interval '24 hours')",
          [digest(token), user.id, email, user.email, digest(proof)],
        );
        await queueMail(c, this.key, {
          to: email,
          subject: 'Confirm your new OpenChronology email',
          text: `Confirm your new email in the requesting browser:\n${this.auth.origin}/login#verify=${token}\nThis link expires in 24 hours.`,
        });
        await this.notify(
          c,
          user,
          'A change to your OpenChronology email was requested. Your current address remains active until confirmation.',
        );
      } else {
        if (!user.mfa_enabled)
          throw new HttpError(400, 'Two-factor authentication is not enabled.');
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
