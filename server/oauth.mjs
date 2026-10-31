// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// Signing in with Google, GitHub, Facebook or Microsoft (OAuth authorization code with PKCE):
// starting a flow, checking the provider's callback, and linking provider identities to accounts.
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
import { DIRECTORY_ONLY } from './account-security.mjs';
/** A new 256-bit random secret in hex: OAuth state, PKCE verifier, OpenID nonce. */
const secret = () => randomBytes(32).toString('hex');
/**
 * The S256 PKCE code challenge (RFC 7636) for `verifier`: sent with the authorization request,
 * while the verifier is sent only with the server-side code exchange, so an authorization code
 * intercepted on its way back is useless without it.
 */
export const pkce = (verifier) => createHash('sha256').update(verifier).digest('base64url');
/** The tenant Microsoft gives personal (consumer) Microsoft accounts' tokens. */
export const MICROSOFT_CONSUMERS = '9188040d-6c67-4c5b-b112-36a304b66dad';
const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
/**
 * Whether `OAUTH_<NAME>_ENABLED` leaves a provider on: unset or empty, 1, true, yes or on keep it;
 * 0, false, no or off turn it off though its client ID and secret stay set (for example while a
 * provider's app review is pending). Any other value stops the server at start-up.
 */
function enabled(env, prefix) {
  const value = (env[prefix + 'ENABLED'] ?? '').trim().toLowerCase();
  if (['', '1', 'true', 'yes', 'on'].includes(value)) return true;
  if (['0', 'false', 'no', 'off'].includes(value)) return false;
  throw new Error(`Set ${prefix}ENABLED to true or false.`);
}
/**
 * The configured identity providers from `env`: each of Google, GitHub, Facebook and Microsoft
 * whose client ID and secret are both set (Facebook also needs OAUTH_FACEBOOK_GRAPH_VERSION).
 * Microsoft's OAUTH_MICROSOFT_TENANT says whose accounts may sign in: `organizations` (the
 * default: any work or school account), `common` (those and personal Microsoft accounts),
 * `consumers` (personal accounts only), or one tenant by its ID or a domain name of it (one
 * school's accounts only). OAUTH_MICROSOFT_LABEL names its button. A provider turned off with
 * OAUTH_<NAME>_ENABLED is left out, its settings unchecked. Throws at start-up on half a
 * configuration or an invalid tenant rather than quietly disabling the provider.
 */
export function providersFromEnv(env = process.env) {
  const providers = {};
  for (const name of ['google', 'github', 'facebook', 'microsoft']) {
    const prefix = `OAUTH_${name.toUpperCase()}_`,
      clientId = env[prefix + 'CLIENT_ID'],
      clientSecret = env[prefix + 'CLIENT_SECRET'];
    if (!enabled(env, prefix)) continue;
    if (clientId && clientSecret) {
      const version = env.OAUTH_FACEBOOK_GRAPH_VERSION;
      if (name === 'facebook' && !/^v\d+\.\d+$/.test(version ?? ''))
        throw new Error(
          'Set OAUTH_FACEBOOK_GRAPH_VERSION to the version configured for your Meta app.',
        );
      providers[name] = { clientId, clientSecret, ...(name === 'facebook' ? { version } : {}) };
      if (name === 'microsoft') {
        const tenant = (env.OAUTH_MICROSOFT_TENANT || 'organizations').trim().toLowerCase();
        if (
          !['organizations', 'common', 'consumers'].includes(tenant) &&
          !GUID.test(tenant) &&
          !/^(?=.{4,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(tenant)
        )
          throw new Error(
            'Set OAUTH_MICROSOFT_TENANT to organizations, common, consumers, a tenant ID or a domain.',
          );
        providers.microsoft.tenant = tenant;
        providers.microsoft.label =
          (env.OAUTH_MICROSOFT_LABEL ?? '').trim().slice(0, 60) || 'Microsoft';
      }
    } else if (clientId || clientSecret)
      throw new Error(`Configure both ${prefix}CLIENT_ID and CLIENT_SECRET.`);
  }
  return providers;
}
/** Confidential authorization-code exchange; provider tokens never leave this module. */
export class OAuth {
  /**
   * `auth` is the Auth instance; `providers` comes from providersFromEnv; `fetcher` is
   * injectable for tests. `keys` caches each provider's signing keys (by their URL) for an hour;
   * `tenants` caches the tenant ID a Microsoft tenant domain stands for.
   */
  constructor(auth, providers = {}, fetcher = fetch) {
    this.auth = auth;
    this.pool = auth.pool;
    this.providers = providers;
    this.fetch = fetcher;
    this.keys = new Map();
    this.tenants = new Map();
  }
  /** The names of the configured providers, for the sign-in page's buttons. */
  names() {
    return Object.keys(this.providers);
  }
  /** Button names other than the provider's own: Microsoft's OAUTH_MICROSOFT_LABEL. */
  labels() {
    return this.providers.microsoft ? { microsoft: this.providers.microsoft.label } : {};
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
      // Refused here, before the person goes to the provider; identity checks again on return.
      if (await this.auth.security.directoryOnly(this.pool, session.id))
        throw new HttpError(403, DIRECTORY_ONLY);
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
          : provider === 'microsoft'
            ? `https://login.microsoftonline.com/${encodeURIComponent(config.tenant)}/oauth2/v2.0/authorize`
            : `https://www.facebook.com/${config.version}/dialog/oauth`,
    );
    for (const [key, value] of Object.entries({
      client_id: config.clientId,
      redirect_uri: callback,
      response_type: 'code',
      state,
      scope:
        provider === 'google' || provider === 'microsoft'
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
    if (provider === 'google' || provider === 'microsoft') url.searchParams.set('nonce', nonce);
    return { url: url.href, cookie: this.auth.nonceCookie('oauth', browser) };
  }
  /**
   * The claims of the ID token `token` once its signature checks out against the provider's
   * keys at `keysUrl`: RS256 only (refusing `none` or HMAC algorithm confusion), signed by one of
   * the published keys (refetched when the cache is an hour old or lacks the token's key id).
   * `name` words the errors. Throws 502 on any failure; the claims themselves are the caller's to
   * check.
   */
  async signedClaims(token, keysUrl, name) {
    if (typeof token !== 'string' || token.length > 32768)
      throw new HttpError(502, `Invalid ${name} identity token.`);
    const segments = token.split('.');
    if (segments.length !== 3) throw new HttpError(502, `Invalid ${name} identity token.`);
    let header, claims;
    try {
      header = JSON.parse(Buffer.from(segments[0], 'base64url'));
      claims = JSON.parse(Buffer.from(segments[1], 'base64url'));
    } catch {
      throw new HttpError(502, `Invalid ${name} identity token.`);
    }
    if (!header || !claims || typeof header !== 'object' || typeof claims !== 'object')
      throw new HttpError(502, `Invalid ${name} identity token.`);
    if (header.alg !== 'RS256' || typeof header.kid !== 'string')
      throw new HttpError(502, `Invalid ${name} token algorithm.`);
    let keys = this.keys.get(keysUrl);
    if (!keys || keys.expires < Date.now() || !keys.values.some((k) => k.kid === header.kid)) {
      const result = await this.json(keysUrl);
      if (!Array.isArray(result.keys)) throw new HttpError(502, `Invalid ${name} signing keys.`);
      keys = { values: result.keys, expires: Date.now() + 3600000 };
      this.keys.set(keysUrl, keys);
    }
    const jwk = keys.values.find((k) => k.kid === header.kid && k.kty === 'RSA');
    let valid = false;
    try {
      // Only the key's modulus and exponent: a published key's other fields (x5c, use…) play
      // no part in checking a signature.
      valid =
        !!jwk &&
        verify(
          'RSA-SHA256',
          Buffer.from(segments[0] + '.' + segments[1]),
          createPublicKey({ key: { kty: 'RSA', n: jwk.n, e: jwk.e }, format: 'jwk' }),
          Buffer.from(segments[2], 'base64url'),
        );
    } catch {
      valid = false;
    }
    if (!valid) throw new HttpError(502, `${name} identity verification failed.`);
    return claims;
  }
  /**
   * Whether an ID token's times hold: unexpired, issued no later than a minute from now, and not
   * before its `nbf` (when it has one, with the same minute's tolerance).
   */
  static current(claims) {
    const now = Date.now() / 1000;
    return (
      typeof claims.exp === 'number' &&
      claims.exp > now &&
      typeof claims.iat === 'number' &&
      claims.iat <= now + 60 &&
      (claims.nbf === undefined || (typeof claims.nbf === 'number' && claims.nbf <= now + 60))
    );
  }
  /**
   * Verifies a Google ID token and returns its subject (the stable Google account id): the
   * signature (signedClaims), the issuer, the audience (this app's client id), the nonce stored
   * with the flow (binding the token to this sign-in), its times and a well-formed subject.
   * Throws 502 on any failure.
   */
  async googleClaims(token, config, nonce) {
    const claims = await this.signedClaims(
      token,
      'https://www.googleapis.com/oauth2/v3/certs',
      'Google',
    );
    if (
      !['https://accounts.google.com', 'accounts.google.com'].includes(claims.iss) ||
      claims.aud !== config.clientId ||
      claims.nonce !== nonce ||
      !OAuth.current(claims) ||
      typeof claims.sub !== 'string' ||
      !/^[A-Za-z0-9_-]{1,255}$/.test(claims.sub)
    )
      throw new HttpError(502, 'Google identity verification failed.');
    return claims.sub;
  }
  /**
   * The tenant ID the configured Microsoft tenant must match, or null when any tenant may sign in
   * (`common`, `organizations`). A tenant given by a domain name is looked up once, from its
   * OpenID configuration's issuer.
   */
  async microsoftTenant(config) {
    if (config.tenant === 'consumers') return MICROSOFT_CONSUMERS;
    if (['common', 'organizations'].includes(config.tenant)) return null;
    if (GUID.test(config.tenant)) return config.tenant;
    if (!this.tenants.has(config.tenant)) {
      const found = await this.json(
        `https://login.microsoftonline.com/${encodeURIComponent(config.tenant)}/v2.0/.well-known/openid-configuration`,
      );
      const tid = /^https:\/\/login\.microsoftonline\.com\/([0-9a-f-]{36})\/v2\.0$/.exec(
        String(found.issuer ?? ''),
      )?.[1];
      if (!tid || !GUID.test(tid)) throw new HttpError(502, 'Invalid Microsoft tenant.');
      this.tenants.set(config.tenant, tid);
    }
    return this.tenants.get(config.tenant);
  }
  /**
   * Verifies a Microsoft (Entra ID) ID token and returns its subject, `<tid>:<oid>`: the
   * account's object ID in its tenant, the same for that person whichever app asks (unlike
   * `sub`) and never reassigned (unlike an email address or username). Checks the signature
   * against the configured tenant's keys (signedClaims); the issuer, which names the token's own
   * tenant (`https://login.microsoftonline.com/<tid>/v2.0`, so for a multi-tenant app it is
   * checked with the token's `tid` substituted); the tenant (the configured one, or with
   * `organizations` anything but personal accounts); the audience, the nonce, its times and
   * well-formed IDs. Throws 502 on any failure.
   */
  async microsoftClaims(token, config, nonce) {
    const claims = await this.signedClaims(
      token,
      `https://login.microsoftonline.com/${encodeURIComponent(config.tenant)}/discovery/v2.0/keys`,
      'Microsoft',
    );
    const tid = typeof claims.tid === 'string' ? claims.tid.toLowerCase() : '',
      oid = typeof claims.oid === 'string' ? claims.oid.toLowerCase() : '',
      required = await this.microsoftTenant(config);
    if (
      !GUID.test(tid) ||
      !GUID.test(oid) ||
      claims.iss !== `https://login.microsoftonline.com/${tid}/v2.0` ||
      (required
        ? tid !== required
        : config.tenant === 'organizations' && tid === MICROSOFT_CONSUMERS) ||
      claims.aud !== config.clientId ||
      claims.nonce !== nonce ||
      !OAuth.current(claims)
    )
      throw new HttpError(502, 'Microsoft identity verification failed.');
    return `${tid}:${oid}`;
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
          : provider === 'microsoft'
            ? `https://login.microsoftonline.com/${encodeURIComponent(config.tenant)}/oauth2/v2.0/token`
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
    // Microsoft's identity is all in its ID token, so its access token (for Microsoft Graph,
    // which this app never calls) is not needed.
    if (
      provider !== 'microsoft' &&
      (typeof tokens.access_token !== 'string' || tokens.access_token.length > 16384)
    )
      throw new HttpError(502, 'Missing provider access token.');
    let subject;
    if (provider === 'google')
      subject = await this.googleClaims(tokens.id_token, config, flow.nonce);
    else if (provider === 'microsoft')
      subject = await this.microsoftClaims(tokens.id_token, config, flow.nonce);
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
   * identity at that provider, from the UNIQUE(user_id,provider) constraint; refused with 403
   * for an account that signs in only through its directory, AccountSecurity.directoryOnly).
   * Without it, an
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
        if (linkUser) {
          // Locks the account, as unlinking does, so this check and an unlink cannot interleave.
          user = (
            await client.query('SELECT id,username FROM oc_users WHERE id=$1 FOR UPDATE', [id])
          ).rows[0];
          // An account that signs in only through its directory gains no other way in.
          if (await this.auth.security.directoryOnly(client, id))
            throw new HttpError(403, DIRECTORY_ONLY);
        } else {
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
