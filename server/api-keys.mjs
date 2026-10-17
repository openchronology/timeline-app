// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// API keys (docs/authentication.md): creating, listing and revoking an account's scoped keys,
// the sessions requests made with one get, and which routes each scope may use.
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { HttpError } from './store.mjs';
/** The stored SHA-256 of a key: the key itself is shown once and never kept (see create). */
const hash = (token) => createHash('sha256').update(token).digest('hex');
/**
 * Validates a new key's definition: a name (up to 80 characters), one or both timeline scopes,
 * and an expiry of 1–365 days (90 by default). `password` and `code` are allowed through for the
 * recent-sign-in check (AccountSecurity.fresh); any other field is refused, so a client cannot
 * slip in settings this version ignores. Result: the trimmed name, unique scopes and days.
 * Throws 400.
 */
export function keyInput(value) {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).some((k) => !['name', 'scopes', 'days', 'password', 'code'].includes(k))
  )
    throw new HttpError(400, 'Invalid API key definition.');
  const { name, scopes = ['timelines:read'], days = 90 } = value;
  if (
    typeof name !== 'string' ||
    !name.trim() ||
    name.length > 80 ||
    !Array.isArray(scopes) ||
    !scopes.length ||
    scopes.length > 2 ||
    scopes.some((s) => !['timelines:read', 'timelines:write'].includes(s)) ||
    !Number.isInteger(days) ||
    days < 1 ||
    days > 365
  )
    throw new HttpError(400, 'Name the key, choose timeline scopes, and an expiry of 1–365 days.');
  return { name: name.trim(), scopes: [...new Set(scopes)], days };
}
/**
 * Personal API keys (oc_api_keys): long-lived Bearer credentials for scripts, limited to the
 * timeline API and to the scopes chosen when they are made. A key is
 * `och_key_<id without dashes>_<64 random hex>`; only its SHA-256 and a short prefix (to tell
 * keys apart in a list) are stored.
 */
export class ApiKeys {
  /** `auth` is the Auth instance, for its pool and AccountSecurity. */
  constructor(auth) {
    this.auth = auth;
    this.pool = auth.pool;
  }
  /**
   * The session for a request with `Authorization: Bearer och_key_…`, or null when the header is
   * not shaped like a key or the key is unknown, revoked or expired. The session has kind `api`,
   * the key's id and scopes, and the account's id, username, admin flag and avatar. `client`
   * lets a caller read it inside its transaction.
   *
   * Side effect: records the key's last use, at most once every five minutes.
   */
  async session(req, client = this.pool) {
    const match = /^Bearer (och_key_[a-f0-9]{32}_[a-f0-9]{64})$/.exec(
      req.headers.authorization ?? '',
    );
    if (!match) return null;
    // Finds the key by its hash (token_hash is unique). A revoked or expired key stops working
    // at once, as does every key of an account that is disabled or has no confirmed email. The key
    // is a credential of its own: two-factor authentication is checked when it is created, not
    // on each request.
    const { rows } = await client.query(
      `SELECT u.id,u.username,u.is_admin,u.avatar_url,k.id AS api_key_id,k.scopes,'api' AS kind FROM oc_api_keys k JOIN oc_users u ON u.id=k.user_id WHERE k.token_hash=$1 AND k.revoked_at IS NULL AND k.expires_at>now() AND NOT u.is_disabled AND u.email_verified_at IS NOT NULL`,
      [hash(match[1])],
    );
    // Shown in the key list. The five-minute condition spares a write on most requests.
    if (rows[0])
      await client.query(
        "UPDATE oc_api_keys SET last_used_at=now() WHERE id=$1 AND (last_used_at IS NULL OR last_used_at<now()-interval '5 minutes')",
        [rows[0].api_key_id],
      );
    return rows[0] ?? null;
  }
  /**
   * The account's keys, newest first, for the account page: names, prefixes, scopes and dates,
   * never hashes. Revoked keys are listed (until deleted) so their history stays visible. Uses
   * the oc_api_keys_user index; create caps an account at 100 keys, which the LIMIT matches.
   */
  async list(userId) {
    return (
      await this.pool.query(
        'SELECT id,name,prefix,scopes,created_at,expires_at,last_used_at,revoked_at FROM oc_api_keys WHERE user_id=$1 ORDER BY created_at DESC LIMIT 100',
        [userId],
      )
    ).rows;
  }
  /**
   * Creates a key for the signed-in account from `value` (keyInput). Like any security change it
   * needs a recent sign-in, the current password and, with two-factor authentication on, a fresh
   * code (AccountSecurity.fresh). Result: the key, shown this once. Throws 409 at 100 keys.
   */
  async create(session, value) {
    const input = keyInput(value);
    return this.auth.security.transaction(async (c) => {
      // Locking the account row serializes this with other security changes and key creations
      // for the account, so two concurrent requests cannot both pass the 100-key count below.
      const user = (await c.query('SELECT * FROM oc_users WHERE id=$1 FOR UPDATE', [session.id]))
        .rows[0];
      await this.auth.security.fresh(c, user, session, value);
      // Revoked keys count too until they are deleted, so the table cannot grow without bound.
      const count = (
        await c.query('SELECT count(*) AS count FROM oc_api_keys WHERE user_id=$1', [user.id])
      ).rows[0];
      if (Number(count.count) >= 100)
        throw new HttpError(409, 'Remove old API keys before creating another (100-key limit).');
      const id = randomUUID(),
        token = `och_key_${id.replaceAll('-', '')}_${randomBytes(32).toString('hex')}`;
      // The id is embedded in the key; the stored prefix (`och_key_` and 12 hex digits of the
      // id) identifies it in lists without revealing any of its secret part.
      await c.query(
        "INSERT INTO oc_api_keys(id,user_id,name,prefix,token_hash,scopes,expires_at) VALUES($1,$2,$3,$4,$5,$6,now()+$7*interval '1 day')",
        [id, user.id, input.name, token.slice(0, 20), hash(token), input.scopes, input.days],
      );
      return { id, token, message: 'Copy this key now. It cannot be displayed again.' };
    });
  }
  /**
   * Revokes the account `userId`'s key `id`, or deletes it outright when `remove`. Revoking keeps
   * the row (with its first revocation time, which coalesce preserves on a repeat) so it stays in
   * the list; deleting removes it. Matching on user_id too means one account cannot touch
   * another's keys, and RETURNING tells a missing key (404) from a done one.
   */
  async revoke(userId, id, remove = false) {
    const result = await this.pool.query(
      remove
        ? 'DELETE FROM oc_api_keys WHERE id=$1 AND user_id=$2 RETURNING id'
        : 'UPDATE oc_api_keys SET revoked_at=coalesce(revoked_at,now()) WHERE id=$1 AND user_id=$2 RETURNING id',
      [id, userId],
    );
    if (!result.rows.length) throw new HttpError(404, 'API key unavailable.');
    return { ok: true };
  }
}
/**
 * Whether a request reads rather than writes, for scope checks: GET and HEAD, and the timeline
 * query and search endpoints, which use POST only to carry a request body.
 */
export function keyRequestRead(pathname, method) {
  return (
    ['GET', 'HEAD'].includes(method) ||
    (method === 'POST' && (pathname.endsWith('/query') || pathname.endsWith('/search')))
  );
}
/**
 * Limits an API-key session to `/api/timelines` and below, and to its scopes: `timelines:read`
 * for reads (keyRequestRead), `timelines:write` for anything else. Other sessions pass through.
 * The path check is written so `/api/timelinesX` does not pass as a prefix match. Throws 403.
 */
export function authorizeKey(session, pathname, method) {
  if (session?.kind !== 'api') return;
  if (
    !pathname.startsWith('/api/timelines') ||
    (pathname !== '/api/timelines' && !pathname.startsWith('/api/timelines/'))
  )
    throw new HttpError(403, 'API keys are limited to timeline endpoints.');
  const read = keyRequestRead(pathname, method);
  if (!session.scopes.includes(read ? 'timelines:read' : 'timelines:write'))
    throw new HttpError(403, 'This API key does not have the required timeline scope.');
}
