// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { HttpError } from './store.mjs';
const hash = (token) => createHash('sha256').update(token).digest('hex');
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
export class ApiKeys {
  constructor(auth) {
    this.auth = auth;
    this.pool = auth.pool;
  }
  async session(req, client = this.pool) {
    const match = /^Bearer (och_key_[a-f0-9]{32}_[a-f0-9]{64})$/.exec(
      req.headers.authorization ?? '',
    );
    if (!match) return null;
    const { rows } = await client.query(
      `SELECT u.id,u.username,u.is_admin,u.avatar_url,k.id AS api_key_id,k.scopes,'api' AS kind FROM oc_api_keys k JOIN oc_users u ON u.id=k.user_id WHERE k.token_hash=$1 AND k.revoked_at IS NULL AND k.expires_at>now() AND NOT u.is_disabled AND u.email_verified_at IS NOT NULL`,
      [hash(match[1])],
    );
    if (rows[0])
      await client.query(
        "UPDATE oc_api_keys SET last_used_at=now() WHERE id=$1 AND (last_used_at IS NULL OR last_used_at<now()-interval '5 minutes')",
        [rows[0].api_key_id],
      );
    return rows[0] ?? null;
  }
  async list(userId) {
    return (
      await this.pool.query(
        'SELECT id,name,prefix,scopes,created_at,expires_at,last_used_at,revoked_at FROM oc_api_keys WHERE user_id=$1 ORDER BY created_at DESC LIMIT 100',
        [userId],
      )
    ).rows;
  }
  async create(session, value) {
    const input = keyInput(value);
    return this.auth.security.transaction(async (c) => {
      const user = (await c.query('SELECT * FROM oc_users WHERE id=$1 FOR UPDATE', [session.id]))
        .rows[0];
      await this.auth.security.fresh(c, user, session, value);
      const count = (
        await c.query('SELECT count(*) AS count FROM oc_api_keys WHERE user_id=$1', [user.id])
      ).rows[0];
      if (Number(count.count) >= 100)
        throw new HttpError(409, 'Remove old API keys before creating another (100-key limit).');
      const id = randomUUID(),
        token = `och_key_${id.replaceAll('-', '')}_${randomBytes(32).toString('hex')}`;
      await c.query(
        "INSERT INTO oc_api_keys(id,user_id,name,prefix,token_hash,scopes,expires_at) VALUES($1,$2,$3,$4,$5,$6,now()+$7*interval '1 day')",
        [id, user.id, input.name, token.slice(0, 20), hash(token), input.scopes, input.days],
      );
      return { id, token, message: 'Copy this key now. It cannot be displayed again.' };
    });
  }
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
export function keyRequestRead(pathname, method) {
  return (
    ['GET', 'HEAD'].includes(method) ||
    (method === 'POST' && (pathname.endsWith('/query') || pathname.endsWith('/search')))
  );
}
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
