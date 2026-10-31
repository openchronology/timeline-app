// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// Passkeys (#372; docs/authentication.md, "Passkeys"): enrolling, naming and removing them
// under Account → Security, answering a sign-in's two-factor step or confirming a security
// change with one, and, where the site allows it, signing in with one alone. webauthn.mjs
// verifies what the browser answers; this keeps the challenges and the stored credentials.
import { randomBytes, randomUUID } from 'node:crypto';
import pg from 'pg';
import { HttpError } from './store.mjs';
import { digest, recoveryCodes } from './security-crypto.mjs';
import {
  ALGORITHMS,
  PasskeyError,
  clientData,
  verifyAssertion,
  verifyRegistration,
  userHandle,
} from './webauthn.mjs';
import { siteName } from './site.mjs';

/** A stored passkey (an oc_passkeys row) as webauthn.mjs's verifyAssertion reads it. */
const keyOf = (row) => ({ publicKey: row.public_key, signCount: Number(row.sign_count) });
/** The most passkeys one account may have. */
export const PASSKEY_LIMIT = 20;
/** How long the browser is given to answer a challenge, in milliseconds (five minutes). */
const TIMEOUT = 300000;

/**
 * Whether PASSKEY_SIGN_IN (`value`) allows signing in with a passkey alone: unset or empty,
 * 1, true, yes or on allow it; 0, false, no or off leave passkeys as a second factor only.
 * Anything else stops the server at start-up.
 */
export function passkeySignIn(value = process.env.PASSKEY_SIGN_IN) {
  const text = (value ?? '').trim().toLowerCase();
  if (['', '1', 'true', 'yes', 'on'].includes(text)) return true;
  if (['0', 'false', 'no', 'off'].includes(text)) return false;
  throw new Error('Set PASSKEY_SIGN_IN to true or false.');
}

/** A passkey's name as given (trimmed, control characters removed), or a 400. */
function passkeyName(value) {
  const name = typeof value === 'string' ? value.replace(/[\p{Cc}\p{Cf}]/gu, '').trim() : '';
  if (!name || name.length > 64) throw new HttpError(400, 'Name the passkey in 1–64 characters.');
  return name;
}

/**
 * A credential sent as the `passkey` field, which forms send as JSON text and API callers as
 * an object; null when absent or not one.
 */
export function passkeyAnswer(value) {
  if (typeof value === 'string' && value && value.length < 16384)
    try {
      value = JSON.parse(value);
    } catch {
      return null;
    }
  return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
}

/**
 * The passkeys of the site at `security.auth.origin`, built by AccountSecurity
 * (`security.passkeys`). The relying party is the site's configured address: its host is the
 * RP ID and the address itself the only origin accepted, so a passkey made for it answers
 * nowhere else, and one made elsewhere does not answer here.
 */
export class Passkeys {
  constructor(security, { signIn = passkeySignIn() } = {}) {
    this.security = security;
    this.auth = security.auth;
    this.pool = security.pool;
    this.signInEnabled = signIn;
  }
  /** The only origin accepted: the site's configured address (APP_ORIGIN). */
  get origin() {
    return this.auth.origin;
  }
  /** The relying party ID: the address's host name. */
  get rpId() {
    return new URL(this.origin).hostname;
  }
  /**
   * Where challenges are used up: a pool of its own (two connections, giving up after ten
   * seconds) beside the main one. Using one up must commit on its own, so that it stays used
   * even if the change it confirms rolls back, and its callers hold a transaction on the main
   * pool meanwhile; were it taken from the main pool too, as many concurrent confirmations as
   * the pool has connections would each wait for another one, forever. Tests' stand-ins for a
   * pool are used as they are.
   */
  get claims() {
    if (!this.claimPool) {
      if (this.pool instanceof pg.Pool) {
        this.claimPool = new pg.Pool({
          ...this.pool.options,
          max: 2,
          connectionTimeoutMillis: 10000,
          idleTimeoutMillis: 10000,
          allowExitOnIdle: true,
        });
        // A connection lost while idle is replaced on next use, not a crash.
        this.claimPool.on('error', () => {});
      } else this.claimPool = this.pool;
    }
    return this.claimPool;
  }
  /**
   * Deletes expired challenges, on its own statement outside any transaction, without
   * waiting: those never answered (an abandoned sign-in, say) would otherwise stay.
   */
  sweep() {
    void Promise.resolve(
      this.claims.query('DELETE FROM oc_passkey_challenges WHERE expires_at<=now()'),
    ).catch(() => {});
  }
  /** Whether account `userId` has a passkey. */
  async has(userId) {
    return (
      (await this.pool.query('SELECT 1 FROM oc_passkeys WHERE user_id=$1 LIMIT 1', [userId])).rows
        .length > 0
    );
  }
  /** What every verification is checked against, with the challenge expected. */
  expected(challenge) {
    return { challenge, origin: this.origin, rpId: this.rpId };
  }
  /**
   * A new challenge for `purpose` bound to `binding`, stored by its hash for five minutes
   * through `client` (the caller's transaction, or the pool). Result: the challenge, base64url.
   */
  async challenge(client, purpose, userId, binding) {
    const challenge = randomBytes(32).toString('base64url');
    await client.query(
      "INSERT INTO oc_passkey_challenges(challenge_hash,purpose,user_id,binding,expires_at) VALUES($1,$2,$3,$4,now()+interval '5 minutes')",
      [digest(challenge), purpose, userId, binding],
    );
    return challenge;
  }
  /**
   * Uses up the challenge the answer `credential` carries, if it is a live one for `purpose`,
   * `binding` and (for an account's own passkeys) `userId`: deleted whether or not the answer
   * then verifies, on its own connection (claims) so that it stays used even if the change it
   * confirms rolls back. Expired ones are swept after. Result: the challenge, or null.
   */
  async consume(credential, type, purpose, binding, userId = null) {
    let challenge;
    try {
      challenge = clientData(credential?.response?.clientDataJSON, type).challenge;
    } catch {
      return null;
    }
    const { rows } = await this.claims.query(
      `DELETE FROM oc_passkey_challenges WHERE challenge_hash=$1 AND purpose=$2 AND binding=$3
        AND user_id IS NOT DISTINCT FROM $4 AND expires_at>now() RETURNING challenge_hash`,
      [digest(challenge), purpose, binding, userId],
    );
    this.sweep();
    return rows.length ? challenge : null;
  }
  /** The account's passkeys as the account page lists them, newest first. */
  async list(userId, client = this.pool) {
    const { rows } = await client.query(
      'SELECT id,name,created_at,last_used_at,transports FROM oc_passkeys WHERE user_id=$1 ORDER BY created_at DESC',
      [userId],
    );
    return rows;
  }
  /** The account's credentials as WebAuthn descriptors (allowCredentials, excludeCredentials). */
  async descriptors(client, userId) {
    const { rows } = await client.query(
      'SELECT credential_id,transports FROM oc_passkeys WHERE user_id=$1 ORDER BY created_at',
      [userId],
    );
    return rows.map((row) => ({
      type: 'public-key',
      id: row.credential_id,
      ...(row.transports.length ? { transports: row.transports } : {}),
    }));
  }
  /** Request options for `navigator.credentials.get()`, in JSON (base64url) form. */
  requestOptions(challenge, allowCredentials = []) {
    return {
      challenge,
      rpId: this.rpId,
      timeout: TIMEOUT,
      userVerification: 'required',
      allowCredentials,
    };
  }
  /** A signed-in browser session (passkeys are made and used in a browser), with its token. */
  webSession(session, req) {
    this.auth.require(session, req);
    if (session.kind !== 'web')
      throw new HttpError(403, 'Manage passkeys in a browser, on this site’s account page.');
  }
  /**
   * Starts adding a passkey: after the same confirmation as any security change (password,
   * and a second factor when on; security.fresh), creation options for
   * `navigator.credentials.create()` with a challenge bound to this session for five minutes.
   * Needs a confirmed email address and account security configured. A passkey should be
   * discoverable ('preferred'), so it can sign in alone where the site allows it, and must
   * verify the person (user verification 'required'); attestation is not asked for.
   */
  async registrationOptions(session, body) {
    this.security.configured();
    return this.security.transaction(async (c) => {
      const user = (await c.query('SELECT * FROM oc_users WHERE id=$1 FOR UPDATE', [session.id]))
        .rows[0];
      if (!user.email_verified_at) throw new HttpError(403, 'Verify an email address first.');
      await this.security.fresh(c, user, session, body);
      const existing = await this.descriptors(c, user.id);
      if (existing.length >= PASSKEY_LIMIT)
        throw new HttpError(409, `An account can have at most ${PASSKEY_LIMIT} passkeys.`);
      const challenge = await this.challenge(
        c,
        'register',
        user.id,
        'session:' + session.token_hash,
      );
      return {
        publicKey: {
          challenge,
          rp: { id: this.rpId, name: siteName() },
          user: { id: userHandle(user.id), name: user.username, displayName: user.username },
          pubKeyCredParams: ALGORITHMS.map((alg) => ({ type: 'public-key', alg })),
          timeout: TIMEOUT,
          attestation: 'none',
          authenticatorSelection: {
            residentKey: 'preferred',
            requireResidentKey: false,
            userVerification: 'required',
          },
          excludeCredentials: existing,
        },
      };
    });
  }
  /**
   * Finishes adding a passkey: `body.credential` must answer this session's registration
   * challenge, and `body.name` names it. The first second factor of an account turns
   * two-factor authentication on and gives ten recovery codes (shown once); every new passkey
   * signs out the account's other sessions and pending desktop sign-ins, and the account is
   * notified, as for an authenticator app. Result: a message, and the recovery codes if new.
   */
  async register(session, body) {
    this.security.configured();
    const name = passkeyName(body.name),
      credential = passkeyAnswer(body.credential);
    const challenge = await this.consume(
      credential,
      'webauthn.create',
      'register',
      'session:' + session.token_hash,
      session.id,
    );
    if (!challenge) throw new HttpError(400, 'Passkey setup expired. Start again.');
    const verified = verifyRegistration(credential, this.expected(challenge));
    const codes = recoveryCodes();
    let first = false;
    await this.security.transaction(async (c) => {
      const user = (await c.query('SELECT * FROM oc_users WHERE id=$1 FOR UPDATE', [session.id]))
        .rows[0];
      // The session must still be live. Its confirmation was checked when the challenge was
      // issued to it (registrationOptions), at most five minutes ago, so an account without a
      // password is not refused here for a sign-in that aged during the browser's ceremony.
      await this.security.live(c, user, session, false);
      const count = Number(
        (await c.query('SELECT count(*) FROM oc_passkeys WHERE user_id=$1', [user.id])).rows[0]
          .count,
      );
      if (count >= PASSKEY_LIMIT)
        throw new HttpError(409, `An account can have at most ${PASSKEY_LIMIT} passkeys.`);
      await c
        .query(
          'INSERT INTO oc_passkeys(id,user_id,credential_id,public_key,algorithm,sign_count,transports,aaguid,name) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',
          [
            randomUUID(),
            user.id,
            verified.credentialId,
            verified.publicKey,
            verified.algorithm,
            verified.signCount,
            verified.transports,
            verified.aaguid,
            name,
          ],
        )
        .catch((e) => {
          // 23505: unique_violation, a credential ID already registered (to any account).
          if (e.code === '23505') throw new HttpError(409, 'This passkey is already registered.');
          throw e;
        });
      first = !user.mfa_enabled;
      if (first) {
        await c.query('UPDATE oc_users SET mfa_enabled=true WHERE id=$1', [user.id]);
        await this.security.setRecoveryCodes(c, user.id, codes);
      }
      // As enabling an authenticator app: every other session, unclaimed desktop sign-in and
      // challenge ends, and this session is marked as having passed two-factor authentication.
      await this.security.endAccess(c, user.id, session.token_hash);
      await c.query('UPDATE oc_sessions SET mfa_verified=true WHERE token_hash=$1', [
        session.token_hash,
      ]);
      await this.security.notify(
        c,
        user,
        `A passkey ("${name}") was added to your OpenChronology account. Other sessions were revoked.` +
          (first ? ' Two-factor authentication is now on; keep your recovery codes offline.' : '') +
          ' Contact the operator if you did not do this.',
      );
    });
    this.security.deliver();
    return {
      message: first
        ? 'Passkey added. Two-factor authentication is on. Store these recovery codes safely; they are shown only once.'
        : 'Passkey added.',
      ...(first ? { recoveryCodes: codes } : {}),
    };
  }
  /** Renames one of the account's passkeys. Not a security change: the session suffices. */
  async rename(session, id, body) {
    const name = passkeyName(body.name);
    const { rowCount } = await this.pool.query(
      'UPDATE oc_passkeys SET name=$3 WHERE id=$1 AND user_id=$2',
      [id, session.id, name],
    );
    if (!rowCount) throw new HttpError(404, 'Passkey not found.');
    return { message: 'Passkey renamed.' };
  }
  /**
   * Removes one of the account's passkeys, confirmed as any security change (another passkey,
   * or this one, may be the second factor). Without passkeys or an authenticator app left,
   * two-factor authentication goes off and the recovery codes go. Other sessions, sign-in
   * challenges and desktop sign-ins end, and the account is notified.
   */
  async remove(session, id, body) {
    this.security.configured();
    let off = false;
    await this.security.transaction(async (c) => {
      const user = (await c.query('SELECT * FROM oc_users WHERE id=$1 FOR UPDATE', [session.id]))
        .rows[0];
      await this.security.fresh(c, user, session, body);
      const removed = (
        await c.query('DELETE FROM oc_passkeys WHERE id=$1 AND user_id=$2 RETURNING name', [
          id,
          user.id,
        ])
      ).rows[0];
      if (!removed) throw new HttpError(404, 'Passkey not found.');
      const left = Number(
        (await c.query('SELECT count(*) FROM oc_passkeys WHERE user_id=$1', [user.id])).rows[0]
          .count,
      );
      off = left === 0 && !user.mfa_secret;
      if (off) {
        await c.query('UPDATE oc_users SET mfa_enabled=false,mfa_last_step=-1 WHERE id=$1', [
          user.id,
        ]);
        await this.security.setRecoveryCodes(c, user.id, null);
      }
      await this.security.endAccess(c, user.id, session.token_hash);
      await this.security.notify(
        c,
        user,
        `A passkey ("${removed.name}") was removed from your OpenChronology account. Other sessions were revoked.` +
          (off ? ' Two-factor authentication is now off.' : ''),
      );
    });
    this.security.deliver();
    return {
      message: off ? 'Passkey removed. Two-factor authentication is off.' : 'Passkey removed.',
    };
  }
  /**
   * Request options for confirming a security change with one of the signed-in account's
   * passkeys; the answer goes in the change's `passkey` field (security.fresh). Without
   * passkeys, `publicKey` is null and nothing is stored.
   */
  async confirmOptions(session) {
    const allow = await this.descriptors(this.pool, session.id);
    if (!allow.length) return { publicKey: null };
    const challenge = await this.challenge(
      this.pool,
      'assert',
      session.id,
      'session:' + session.token_hash,
    );
    return { publicKey: this.requestOptions(challenge, allow) };
  }
  /**
   * Request options for a sign-in's two-factor step in this browser (its `mfa` challenge,
   * AccountSecurity.pending); the answer goes to `POST /api/auth/mfa/complete` as `passkey`.
   * The same 401 as a wrong code when there is no such step or the account has no passkey.
   */
  async factorOptions(req) {
    const pending = await this.security.pending(req);
    const allow =
      pending?.purpose === 'mfa' ? await this.descriptors(this.pool, pending.user_id) : [];
    if (!allow.length)
      throw new HttpError(401, 'No passkey can answer this sign-in. Enter a code instead.');
    const challenge = await this.challenge(
      this.pool,
      'assert',
      pending.user_id,
      'browser:' + pending.browser_hash,
    );
    return { publicKey: this.requestOptions(challenge, allow) };
  }
  /**
   * Whether `value` (a `passkey` field) answers an `assert` challenge bound to `binding` with
   * one of `user`'s passkeys, inside the caller's transaction `c` with the account locked
   * (AccountSecurity.factor). The challenge is used up either way; on success the passkey's
   * counter and last use are recorded. False for anything that does not verify.
   */
  async answers(c, user, value, binding) {
    const credential = passkeyAnswer(value);
    if (!credential) return false;
    const challenge = await this.consume(credential, 'webauthn.get', 'assert', binding, user.id);
    if (!challenge) return false;
    const stored = (
      await c.query('SELECT * FROM oc_passkeys WHERE user_id=$1 AND credential_id=$2 FOR UPDATE', [
        user.id,
        typeof credential.id === 'string' ? credential.id : '',
      ])
    ).rows[0];
    if (!stored) return false;
    try {
      const { signCount } = verifyAssertion(credential, keyOf(stored), this.expected(challenge));
      await c.query('UPDATE oc_passkeys SET sign_count=$2,last_used_at=now() WHERE id=$1', [
        stored.id,
        signCount,
      ]);
      return true;
    } catch (error) {
      if (error instanceof PasskeyError) return false;
      throw error;
    }
  }
  /**
   * What a sign-in's challenge is bound to: the browser's sign-in nonce (`oc_login`) when
   * signed out, or, as a password sign-in allows, the session already open (which the sign-in
   * then replaces). 403 without either.
   */
  signInBinding(req, session) {
    if (session) return 'session:' + session.token_hash;
    const browser = this.security.browser(req);
    if (!/^[a-f0-9]{64}$/.test(browser ?? ''))
      throw new HttpError(403, 'Refresh the sign-in page.');
    return 'browser:' + digest(browser);
  }
  /**
   * Request options for signing in with a passkey alone, bound to this browser (signInBinding):
   * no credentials are listed, so the browser offers the passkeys it holds for this site
   * (discoverable credentials). 404 when the site does not allow it.
   */
  async signInOptions(req, session = null) {
    if (!this.signInEnabled) throw new HttpError(404, 'Signing in with a passkey is off.');
    this.security.configured();
    const binding = this.signInBinding(req, session);
    // Anyone may ask, and most never answer: expired ones are cleared as new ones are made.
    this.sweep();
    const challenge = await this.challenge(this.pool, 'sign-in', null, binding);
    return { publicKey: this.requestOptions(challenge) };
  }
  /**
   * Signs in with a passkey alone: `body.credential` answers this browser's sign-in challenge
   * with a passkey of an account whose user handle it carries. A passkey that verified the
   * person is two factors in itself (something held, and a PIN or biometric), so the session
   * counts as having passed two-factor authentication. Disabled accounts and unconfirmed
   * email addresses are refused as for any sign-in (Auth.issue). Every failure answers the
   * same 401, but a counter that went backwards says so. Result: a web session.
   */
  async signIn(req, body, session = null) {
    if (!this.signInEnabled) throw new HttpError(404, 'Signing in with a passkey is off.');
    this.security.configured();
    const refused = new HttpError(
      401,
      'That passkey was not recognized. Sign in with your password, or try another passkey.',
    );
    const binding = this.signInBinding(req, session);
    const credential = passkeyAnswer(body.credential);
    const challenge =
      credential && (await this.consume(credential, 'webauthn.get', 'sign-in', binding));
    if (!challenge) throw refused;
    const credentialId = typeof credential.id === 'string' ? credential.id : '';
    return this.security.transaction(async (c) => {
      // Whose passkey it is, unlocked, to know which account to lock: the account first, then
      // its passkey, in the order every security change locks them.
      const owner = (
        await c.query('SELECT user_id FROM oc_passkeys WHERE credential_id=$1', [credentialId])
      ).rows[0];
      if (!owner) throw refused;
      const user = (await c.query('SELECT * FROM oc_users WHERE id=$1 FOR UPDATE', [owner.user_id]))
        .rows[0];
      // Read again under the locks: a passkey removed, or an account deleted, meanwhile is
      // gone now, and the counter is the latest, so two copies racing cannot both pass it.
      const stored = (
        await c.query(
          'SELECT * FROM oc_passkeys WHERE credential_id=$1 AND user_id=$2 FOR UPDATE',
          [credentialId, owner.user_id],
        )
      ).rows[0];
      if (!user || !stored) throw refused;
      // A discoverable credential names its account; it must be the passkey's.
      if (credential.response?.userHandle !== userHandle(user.id)) throw refused;
      let signCount;
      try {
        ({ signCount } = verifyAssertion(credential, keyOf(stored), this.expected(challenge)));
      } catch (error) {
        if (error instanceof PasskeyError && error.reason === 'clone') throw error;
        if (error instanceof PasskeyError) throw refused;
        throw error;
      }
      if (user.is_disabled || !user.email_verified_at) throw refused;
      await c.query('UPDATE oc_passkeys SET sign_count=$2,last_used_at=now() WHERE id=$1', [
        stored.id,
        signCount,
      ]);
      return this.auth.issue(user, 'web', true, c);
    });
  }
  /**
   * The routes under /api/auth/passkeys (http.mjs), for `req` with `session` (or null) and
   * `read()`, which reads the JSON body. Result: what to answer, or undefined for a path this
   * does not handle. Each has the CSRF token (the session's, or the sign-in nonce's) and a rate
   * limit: signing in shares the password sign-in's per address; starting an enrollment and
   * removing a passkey count as security changes, per address and per account; the rest have
   * thirty a minute per account.
   */
  async route(req, pathname, method, session, read) {
    const path = pathname.slice('/api/auth/passkeys'.length);
    const ip = req.clientAddress;
    if (method === 'POST' && (path === '/sign-in/options' || path === '/sign-in')) {
      if (session) this.auth.require(session, req);
      else this.auth.requireLogin(req);
      await this.auth.rateLimit(ip);
      const input = await read();
      return path === '/sign-in'
        ? this.signIn(req, input, session)
        : this.signInOptions(req, session);
    }
    if (method === 'POST' && path === '/factor/options') {
      if (session) this.auth.require(session, req);
      else this.auth.requireLogin(req);
      await this.auth.rateLimit('security:' + ip);
      await read();
      return this.factorOptions(req);
    }
    const one = /^\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/.exec(path);
    if (
      !(
        method === 'POST' && ['/register/options', '/register', '/confirm/options'].includes(path)
      ) &&
      !(one && ['PATCH', 'DELETE'].includes(method))
    )
      return undefined;
    this.webSession(session, req);
    // The steps that check the password count as security changes; the others (finishing an
    // enrollment that began with one, asking to confirm, renaming) only as passkey steps.
    if (path === '/register/options' || method === 'DELETE') {
      await this.auth.rateLimit('security:' + ip);
      await this.auth.rateLimit('security-account:' + session.id);
    } else await this.auth.rateLimit('passkey:' + session.id, 30);
    const input = await read();
    if (path === '/register/options') return this.registrationOptions(session, input);
    if (path === '/register') return this.register(session, input);
    if (path === '/confirm/options') return this.confirmOptions(session);
    if (method === 'PATCH') return this.rename(session, one[1], input);
    return this.remove(session, one[1], input);
  }
}
