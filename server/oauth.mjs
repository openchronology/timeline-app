// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// Signing in with Google, GitHub or Facebook (OAuth authorization code with PKCE): starting a
// flow, checking the provider's callback, and linking provider identities to accounts.
import {
  randomBytes,
  randomUUID,
  createHash,
  createHmac,
  createPublicKey,
  verify,
} from 'node:crypto';
import { HttpError } from './store.mjs';
import { tokenHash } from './auth.mjs';
/** A new 256-bit random secret in hex: OAuth state, PKCE verifier, OpenID nonce. */
const secret = () => randomBytes(32).toString('hex');
/**
 * The S256 PKCE code challenge (RFC 7636) for `verifier`: sent with the authorization request,
 * while the verifier is sent only with the server-side code exchange, so an authorization code
 * intercepted on its way back is useless without it.
 */
export const pkce = (verifier) => createHash('sha256').update(verifier).digest('base64url');
/**
 * The configured identity providers from `env`: each of Google, GitHub and Facebook whose
 * client ID and secret are both set (Facebook also needs OAUTH_FACEBOOK_GRAPH_VERSION). Throws
 * at start-up on half a configuration rather than quietly disabling the provider.
 */
export function providersFromEnv(env = process.env) {
  const providers = {};
  for (const name of ['google', 'github', 'facebook']) {
    const prefix = `OAUTH_${name.toUpperCase()}_`,
      clientId = env[prefix + 'CLIENT_ID'],
      clientSecret = env[prefix + 'CLIENT_SECRET'];
    if (clientId && clientSecret) {
      const version = env.OAUTH_FACEBOOK_GRAPH_VERSION;
      if (name === 'facebook' && !/^v\d+\.\d+$/.test(version ?? ''))
        throw new Error(
          'Set OAUTH_FACEBOOK_GRAPH_VERSION to the version configured for your Meta app.',
        );
      providers[name] = { clientId, clientSecret, ...(name === 'facebook' ? { version } : {}) };
    } else if (clientId || clientSecret)
      throw new Error(`Configure both ${prefix}CLIENT_ID and CLIENT_SECRET.`);
  }
  return providers;
}
/** Confidential authorization-code exchange; provider tokens never leave this module. */
export class OAuth {
  /**
   * `auth` is the Auth instance; `providers` comes from providersFromEnv; `fetcher` is
   * injectable for tests. `keys` caches Google's signing keys for an hour.
   */
  constructor(auth, providers = {}, fetcher = fetch) {
    this.auth = auth;
    this.pool = auth.pool;
    this.providers = providers;
    this.fetch = fetcher;
    this.keys = null;
  }
  /** The names of the configured providers, for the sign-in page's buttons. */
  names() {
    return Object.keys(this.providers);
  }
  /**
   * Fetches JSON from a provider: no redirects (a provider endpoint redirecting elsewhere is
   * refused), a ten-second timeout, a 128 KiB cap enforced while reading (not only by the
   * declared length), and a 502 for any failure, invalid JSON or `error` field.
   */
  async json(url, options = {}) {
    let res;
    try {
      res = await this.fetch(url, {
        ...options,
        redirect: 'error',
        signal: AbortSignal.timeout(10000),
      });
    } catch {
      throw new HttpError(502, 'The identity provider is unavailable. Try signing in again.');
    }
    if (!res.ok || !res.body || Number(res.headers.get('content-length') ?? 0) > 131072)
      throw new HttpError(502, 'The identity provider could not complete sign-in.');
    let size = 0,
      parts = [];
    for await (const part of res.body) {
      size += part.length;
      if (size > 131072) throw new HttpError(502, 'Identity response is too large.');
      parts.push(Buffer.from(part));
    }
    let value;
    try {
      value = JSON.parse(Buffer.concat(parts).toString());
    } catch {
      throw new HttpError(502, 'Invalid identity provider response.');
    }
    if (!value || typeof value !== 'object' || value.error)
      throw new HttpError(502, 'The identity provider could not complete sign-in.');
    return value;
  }
  /**
   * Starts a sign-in (or, with `input.link`, linking the provider to the signed-in account) with
   * `provider`. Checks CSRF (the session's token, or the sign-in page's nonce when signed out);
   * linking also needs a sign-in within five minutes. `input.returnTo` must be one of the app's
   * own pages, so the flow cannot be used as an open redirect. Stores a one-use flow record and
   * returns the provider's authorization URL and the `oc_oauth` browser cookie.
   */
  async start(req, provider, input, session) {
    const config = this.providers[provider];
    if (!config) throw new HttpError(404, 'That sign-in provider is not configured.');
    if (input.link) {
      this.auth.require(session, req);
      if (
        !Number.isFinite(new Date(session.created_at).getTime()) ||
        Date.now() - new Date(session.created_at).getTime() > 5 * 60000
      )
        throw new HttpError(403, 'Sign in again before linking a provider.');
    } else if (!session) this.auth.requireLogin(req);
    else this.auth.require(session, req);
    await this.auth.rateLimit(req.clientAddress ?? req.socket.remoteAddress ?? 'unknown');
    const returnTo = input.returnTo ?? '/';
    if (
      !['/', '/editor', '/account', '/plugins'].includes(returnTo) &&
      !/^\/(?:#desktop\/|connect\/desktop\/)[A-Z2-9]{10}$/.test(returnTo) &&
      !/^\/timelines\/[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(returnTo)
    )
      throw new HttpError(400, 'Invalid sign-in return location.');
    const state = secret(),
      browser = this.auth.nonce(req, 'oauth'),
      verifier = secret(),
      nonce = secret();
    // Sweeps expired flows (oc_oauth_expiry), then records this one for ten minutes, keyed by
    // the hash of its state. It is bound to the browser by the hash of the `oc_oauth` cookie, so
    // a callback URL carried to another browser fails (login CSRF). The PKCE verifier and nonce
    // are kept here, server-side only. A link flow remembers the account and the exact session
    // that started it.
    await this.pool.query('DELETE FROM oc_oauth_flows WHERE expires_at<=now()');
    await this.pool.query(
      "INSERT INTO oc_oauth_flows(state_hash,browser_hash,provider,verifier,nonce,return_to,link_user,link_session,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,now()+interval '10 minutes')",
      [
        tokenHash(state),
        tokenHash(browser),
        provider,
        verifier,
        nonce,
        returnTo,
        input.link ? session.id : null,
        input.link ? session.token_hash : null,
      ],
    );
    const callback = this.auth.origin + `/api/auth/${provider}/callback`;
    const url = new URL(
      provider === 'google'
        ? 'https://accounts.google.com/o/oauth2/v2/auth'
        : provider === 'github'
          ? 'https://github.com/login/oauth/authorize'
          : `https://www.facebook.com/${config.version}/dialog/oauth`,
    );
    for (const [key, value] of Object.entries({
      client_id: config.clientId,
      redirect_uri: callback,
      response_type: 'code',
      state,
      scope:
        provider === 'google'
          ? 'openid profile'
          : provider === 'github'
            ? 'read:user'
            : 'public_profile',
    }))
      url.searchParams.set(key, value);
    // Facebook's login dialog does not take PKCE; its exchange is protected by the client
    // secret, and its identity call by appsecret_proof (callback).
    if (provider !== 'facebook') {
      url.searchParams.set('code_challenge', pkce(verifier));
      url.searchParams.set('code_challenge_method', 'S256');
    }
    if (provider === 'google') url.searchParams.set('nonce', nonce);
    return { url: url.href, cookie: this.auth.nonceCookie('oauth', browser) };
  }
  /**
   * Verifies a Google ID token and returns its subject (the stable Google account id). Checks:
   * RS256 only (refusing `none` or HMAC algorithm confusion), a signature by one of Google's
   * published keys (refetched when the cache is an hour old or lacks the token's key id), the
   * issuer, the audience (this app's client id), the nonce stored with the flow (binding the token
   * to this sign-in), expiry, an issue time not in the future (a minute's tolerance) and a
   * well-formed subject. Throws 502 on any failure.
   */
  async googleClaims(token, config, nonce) {
    if (typeof token !== 'string' || token.length > 32768)
      throw new HttpError(502, 'Invalid Google identity token.');
    const segments = token.split('.');
    if (segments.length !== 3) throw new HttpError(502, 'Invalid Google identity token.');
    let header, claims;
    try {
      header = JSON.parse(Buffer.from(segments[0], 'base64url'));
      claims = JSON.parse(Buffer.from(segments[1], 'base64url'));
    } catch {
      throw new HttpError(502, 'Invalid Google identity token.');
    }
    if (!header || !claims || typeof header !== 'object' || typeof claims !== 'object')
      throw new HttpError(502, 'Invalid Google identity token.');
    if (header.alg !== 'RS256' || typeof header.kid !== 'string')
      throw new HttpError(502, 'Invalid Google token algorithm.');
    if (
      !this.keys ||
      this.keys.expires < Date.now() ||
      !this.keys.values.some((k) => k.kid === header.kid)
    ) {
      const result = await this.json('https://www.googleapis.com/oauth2/v3/certs');
      if (!Array.isArray(result.keys)) throw new HttpError(502, 'Invalid Google signing keys.');
      this.keys = { values: result.keys, expires: Date.now() + 3600000 };
    }
    const jwk = this.keys.values.find((k) => k.kid === header.kid && k.kty === 'RSA');
    if (
      !jwk ||
      !verify(
        'RSA-SHA256',
        Buffer.from(segments[0] + '.' + segments[1]),
        createPublicKey({ key: jwk, format: 'jwk' }),
        Buffer.from(segments[2], 'base64url'),
      ) ||
      !['https://accounts.google.com', 'accounts.google.com'].includes(claims.iss) ||
      claims.aud !== config.clientId ||
      claims.nonce !== nonce ||
      typeof claims.exp !== 'number' ||
      claims.exp <= Date.now() / 1000 ||
      typeof claims.iat !== 'number' ||
      claims.iat > Date.now() / 1000 + 60 ||
      typeof claims.sub !== 'string' ||
      !/^[A-Za-z0-9_-]{1,255}$/.test(claims.sub)
    )
      throw new HttpError(502, 'Google identity verification failed.');
    return claims.sub;
  }
  /**
   * The provider's redirect back. Spends the flow record matching `state` and this browser,
   * exchanges the authorization code (with the PKCE verifier and client secret) for tokens,
   * verifies the identity, and either signs in (finishPrimary, which may ask for two-factor
   * authentication or an email) or links the identity to the account that started the flow.
   * Provider tokens are used only here and then discarded. Result: the session or challenge and
   * where to go next; `cancelled` when the person declined at the provider.
   */
  async callback(req, provider, query) {
    const config = this.providers[provider],
      state = query.get('state'),
      browser = this.auth.readCookie(req, `${this.auth.secure ? '__Host-' : ''}oc_oauth`);
    if (!config || !/^[a-f0-9]{64}$/.test(state ?? '') || !/^[a-f0-9]{64}$/.test(browser ?? ''))
      throw new HttpError(400, 'Sign-in state is missing or invalid.');
    // Spends the flow in the same statement that finds it (DELETE … RETURNING), so a state can
    // be used once even by concurrent callbacks; it must match this browser's cookie, this
    // provider and be unexpired.
    const { rows } = await this.pool.query(
      'DELETE FROM oc_oauth_flows WHERE state_hash=$1 AND browser_hash=$2 AND provider=$3 AND expires_at>now() RETURNING *',
      [tokenHash(state), tokenHash(browser), provider],
    );
    const flow = rows[0];
    if (!flow) throw new HttpError(400, 'Sign-in expired or was already used.');
    if (query.has('error')) return { returnTo: flow.return_to, cancelled: true };
    const code = query.get('code');
    if (!code || code.length > 4096) throw new HttpError(400, 'Missing authorization code.');
    // Linking needs the very session that started it, still signed in, so a link cannot be
    // completed into an account by someone else's browser or after a sign-out.
    if (flow.link_user) {
      const session = await this.auth.session(req);
      if (session?.id !== flow.link_user || session.token_hash !== flow.link_session)
        throw new HttpError(403, 'The account-linking session changed.');
    }
    const tokenUrl =
      provider === 'google'
        ? 'https://oauth2.googleapis.com/token'
        : provider === 'github'
          ? 'https://github.com/login/oauth/access_token'
          : `https://graph.facebook.com/${config.version}/oauth/access_token`;
    const form = new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      code,
      redirect_uri: this.auth.origin + `/api/auth/${provider}/callback`,
      grant_type: 'authorization_code',
      ...(provider === 'facebook' ? {} : { code_verifier: flow.verifier }),
    });
    const tokens =
      provider === 'facebook'
        ? await this.json(tokenUrl + '?' + form, { headers: { Accept: 'application/json' } })
        : await this.json(tokenUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
              Accept: 'application/json',
            },
            body: form.toString(),
          });
    if (typeof tokens.access_token !== 'string' || tokens.access_token.length > 16384)
      throw new HttpError(502, 'Missing provider access token.');
    let subject;
    if (provider === 'google')
      subject = await this.googleClaims(tokens.id_token, config, flow.nonce);
    else {
      const identityUrl = new URL(
        provider === 'github'
          ? 'https://api.github.com/user'
          : `https://graph.facebook.com/${config.version}/me`,
      );
      // appsecret_proof (an HMAC of the access token with the app secret) proves the call
      // comes from this app's server, as Facebook's secure-requests guide recommends.
      if (provider === 'facebook') {
        identityUrl.searchParams.set('fields', 'id');
        identityUrl.searchParams.set(
          'appsecret_proof',
          createHmac('sha256', config.clientSecret).update(tokens.access_token).digest('hex'),
        );
      }
      const identity = await this.json(identityUrl.href, {
        headers: {
          Authorization: `Bearer ${tokens.access_token}`,
          Accept: 'application/json',
          'User-Agent': 'OpenChronology',
        },
      });
      if (
        provider === 'github'
          ? !Number.isSafeInteger(identity.id) || identity.id <= 0
          : typeof identity.id !== 'string' || !/^\d{1,255}$/.test(identity.id)
      )
        throw new HttpError(502, 'Invalid provider identity.');
      subject = String(identity.id);
    }
    const user = await this.identity(provider, subject, flow.link_user);
    const result = flow.link_user
      ? {}
      : await this.auth.finishPrimary(user, 'web', req, flow.return_to);
    return {
      ...result,
      returnTo: result.challenge
        ? '/login?step=' + result.challenge + '&returnTo=' + encodeURIComponent(flow.return_to)
        : flow.return_to,
    };
  }
  /**
   * The account for the provider identity (`provider`, `subject`), in one transaction. Accounts
   * are found only by this pair, never by email, so a matching address at a provider never
   * grants access to an account. With `linkUser`, the identity is attached to that account
   * (refused with 409 if it belongs to another, or if the account already has a different
   * identity at that provider, from the UNIQUE(user_id,provider) constraint). Without it, an
   * unknown identity gets a new account with no password, named `preferred` when that username
   * is free (a directory account's own name, ldap.mjs), else a generated one; it has no
   * confirmed email yet, so it must give one before it can have a session.
   */
  async identity(provider, subject, linkUser, preferred = null) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      // The account already holding this identity, if any (primary key provider, subject).
      const existing = await client.query(
        'SELECT u.id,u.username FROM oc_identities i JOIN oc_users u ON u.id=i.user_id WHERE i.provider=$1 AND i.subject=$2',
        [provider, subject],
      );
      let user = existing.rows[0];
      if (user && linkUser && user.id !== linkUser)
        throw new HttpError(
          409,
          'That provider account belongs to another OpenChronology account.',
        );
      if (!user) {
        const id = linkUser ?? randomUUID();
        if (linkUser)
          user = (await client.query('SELECT id,username FROM oc_users WHERE id=$1', [id])).rows[0];
        else {
          // The preferred name if no account (nor a pending registration) has it; ON CONFLICT
          // covers an account taking it meanwhile.
          if (
            preferred &&
            !(await client.query('SELECT 1 FROM oc_registrations WHERE username=$1', [preferred]))
              .rows.length
          )
            user = (
              await client.query(
                'INSERT INTO oc_users(id,username,password_hash) VALUES($1,$2,NULL) ON CONFLICT(username) DO NOTHING RETURNING id,username',
                [id, preferred],
              )
            ).rows[0];
          user ??= (
            await client.query(
              'INSERT INTO oc_users(id,username,password_hash) VALUES($1,$2,NULL) RETURNING id,username',
              [id, `${provider}_${randomBytes(8).toString('hex')}`],
            )
          ).rows[0];
        }
        // Claims the identity. If a concurrent callback for the same identity won the race,
        // DO NOTHING returns no row: the account just created is removed again and the winner's
        // account is used instead.
        const inserted = await client.query(
          'INSERT INTO oc_identities(provider,subject,user_id) VALUES($1,$2,$3) ON CONFLICT(provider,subject) DO NOTHING RETURNING user_id',
          [provider, subject, id],
        );
        if (!inserted.rows.length) {
          if (!linkUser) await client.query('DELETE FROM oc_users WHERE id=$1', [id]);
          user = (
            await client.query(
              'SELECT u.id,u.username FROM oc_identities i JOIN oc_users u ON u.id=i.user_id WHERE i.provider=$1 AND i.subject=$2',
              [provider, subject],
            )
          ).rows[0];
          if (linkUser && user.id !== linkUser)
            throw new HttpError(
              409,
              'That provider account belongs to another OpenChronology account.',
            );
        }
      }
      await client.query('COMMIT');
      return user;
    } catch (error) {
      await client.query('ROLLBACK');
      // unique_violation: UNIQUE(user_id,provider), the account already links another identity
      // at this provider.
      if (error.code === '23505')
        throw new HttpError(
          409,
          'This account already has a different identity linked for that provider.',
        );
      throw error;
    } finally {
      client.release();
    }
  }
}
