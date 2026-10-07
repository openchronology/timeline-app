// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
import { randomUUID } from 'node:crypto';
import { passwordHash } from './auth.mjs';
import { HttpError } from './store.mjs';
export function quotaValue(value, nullable = false) {
  if (nullable && value === null) return null;
  if (
    !['string', 'number'].includes(typeof value) ||
    !/^(0|[1-9][0-9]{0,13})$/.test(String(value)) ||
    BigInt(value) > 10_000_000_000_000n
  )
    throw new HttpError(400, 'Quota must be a whole number of bytes from 0 to 10 TB.');
  return String(value);
}
export async function bootstrapInstallation(client, env = process.env) {
  await client.query('SELECT singleton FROM oc_site_settings WHERE singleton FOR UPDATE');
  const settings = (await client.query('SELECT * FROM oc_site_settings WHERE singleton')).rows[0];
  if (!settings.initialized)
    await client.query(
      'UPDATE oc_site_settings SET initialized=true,default_quota_bytes=$1 WHERE singleton',
      [quotaValue(env.DEFAULT_USER_STORAGE_BYTES ?? '104857600')],
    );
  if (!env.ADMIN_INITIAL_PASSWORD || settings.bootstrap_admin_id) return;
  const username = (env.ADMIN_USERNAME ?? 'admin').toLowerCase(),
    email = env.ADMIN_EMAIL || null;
  if (
    !/^[a-z0-9][a-z0-9_-]{2,31}$/.test(username) ||
    (email !== null && (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254)) ||
    env.ADMIN_INITIAL_PASSWORD.length < 15 ||
    env.ADMIN_INITIAL_PASSWORD.length > 1024 ||
    /replace-this|changeme/i.test(env.ADMIN_INITIAL_PASSWORD)
  )
    throw new Error(
      'Admin bootstrap requires a valid optional ADMIN_EMAIL and a unique ADMIN_INITIAL_PASSWORD of at least 15 characters.',
    );
  if (
    (
      await client.query('SELECT id FROM oc_users WHERE username=$1 OR lower(email)=lower($2)', [
        username,
        email,
      ])
    ).rows.length
  )
    throw new Error(
      'Admin bootstrap will not promote an existing account. Choose an unused admin username/email.',
    );
  const id = randomUUID(),
    hash = await passwordHash(env.ADMIN_INITIAL_PASSWORD);
  await client.query(
    'INSERT INTO oc_users(id,username,email,email_verified_at,password_hash,is_admin,quota_bypass) VALUES($1,$2,$3,now(),$4,true,true)',
    [id, username, email, hash],
  );
  await client.query('UPDATE oc_site_settings SET bootstrap_admin_id=$1 WHERE singleton', [id]);
  await client.query(
    "INSERT INTO oc_admin_audit(actor_id,action,target_id,changes) VALUES($1::uuid,'bootstrap',$1::uuid::text,'{}')",
    [id],
  );
}
export async function usage(pool, id) {
  const row = (
    await pool.query(
      'SELECT used_bytes,quota_bytes,quota_bypass,is_admin,is_disabled,coalesce(quota_bytes,s.default_quota_bytes) AS effective_quota_bytes FROM oc_users CROSS JOIN oc_site_settings s WHERE id=$1',
      [id],
    )
  ).rows[0];
  if (!row) throw new HttpError(401, 'Account unavailable.');
  return row;
}
export async function requireDataProvider(pool, id) {
  if (!id) throw new HttpError(401, 'Sign in to supply data.');
  const u = await usage(pool, id);
  if (u.is_disabled || (!u.is_admin && !u.quota_bypass && BigInt(u.effective_quota_bytes) === 0n))
    throw new HttpError(
      403,
      'This account is read-only. Ask the administrator to enable data contributions.',
    );
}
export class Administration {
  constructor(store, auth) {
    this.store = store;
    this.pool = store.pool;
    this.auth = auth;
  }
  async require(session) {
    if (
      !session ||
      session.kind === 'api' ||
      !(
        await this.pool.query(
          'SELECT id FROM oc_users WHERE id=$1 AND is_admin AND NOT is_disabled',
          [session.id],
        )
      ).rows.length
    )
      throw new HttpError(403, 'Administrator access required.');
  }
  async list(session, kind, query = {}) {
    await this.require(session);
    const search = typeof query.search === 'string' ? query.search.slice(0, 200) : '',
      page = Math.max(
        1,
        Math.min(10000, Number.isSafeInteger(Number(query.page)) ? Number(query.page) : 1),
      );
    const result = await this.pool.query(
      kind === 'users'
        ? `WITH matching AS (SELECT id,username,email,is_admin,is_disabled,quota_bypass,quota_bytes,used_bytes,created_at FROM oc_users WHERE strpos(lower(username||' '||coalesce(email,'')),lower($1))>0) SELECT (SELECT count(*) FROM matching) AS total,coalesce((SELECT jsonb_agg(p) FROM (SELECT * FROM matching ORDER BY username,id LIMIT 25 OFFSET $2)p),'[]') AS items`
        : `WITH matching AS (SELECT t.id,t.title,t.visibility,t.featured,t.event_count,u.username AS owner FROM oc_timelines t JOIN oc_users u ON u.id=t.owner_id WHERE strpos(lower(t.title||' '||u.username),lower($1))>0) SELECT (SELECT count(*) FROM matching) AS total,coalesce((SELECT jsonb_agg(p) FROM (SELECT * FROM matching ORDER BY title,id LIMIT 25 OFFSET $2)p),'[]') AS items`,
      [search, (page - 1) * 25],
    );
    return {
      ...result.rows[0],
      page,
      settings: (
        await this.pool.query('SELECT default_quota_bytes FROM oc_site_settings WHERE singleton')
      ).rows[0],
    };
  }
  async change(session, kind, id, value) {
    await this.require(session);
    if (!value || typeof value !== 'object' || Array.isArray(value))
      throw new HttpError(400, 'Invalid administration request.');
    const allowed =
      kind === 'users'
        ? ['is_admin', 'is_disabled', 'quota_bypass', 'quota_bytes']
        : kind === 'settings'
          ? ['default_quota_bytes']
          : ['visibility', 'featured', 'delete'];
    if (Object.keys(value).some((k) => ![...allowed, 'password', 'code'].includes(k)))
      throw new HttpError(400, 'Unknown administration field.');
    return this.store.transaction(async (c) => {
      await c.query("SELECT pg_advisory_xact_lock(hashtextextended('oc-admin-policy',0))");
      const actor = (await c.query('SELECT * FROM oc_users WHERE id=$1 FOR UPDATE', [session.id]))
        .rows[0];
      if (!actor?.is_admin || actor.is_disabled)
        throw new HttpError(403, 'Administrator access required.');
      await this.auth.security.fresh(c, actor, session, value);
      const changes = {};
      if (kind === 'users') {
        const target = (await c.query('SELECT * FROM oc_users WHERE id=$1 FOR UPDATE', [id]))
          .rows[0];
        if (!target) throw new HttpError(404, 'User unavailable.');
        for (const field of ['is_admin', 'is_disabled', 'quota_bypass'])
          if (field in value) {
            if (typeof value[field] !== 'boolean')
              throw new HttpError(400, 'Expected a boolean flag.');
            changes[field] = value[field];
          }
        if ('quota_bytes' in value) changes.quota_bytes = quotaValue(value.quota_bytes, true);
        if (
          target.is_admin &&
          (changes.is_admin === false || changes.is_disabled === true) &&
          Number(
            (await c.query('SELECT count(*) FROM oc_users WHERE is_admin AND NOT is_disabled'))
              .rows[0].count,
          ) <= 1
        )
          throw new HttpError(409, 'The last active administrator cannot be disabled or demoted.');
        const fields = Object.keys(changes);
        if (fields.length)
          await c.query(
            'UPDATE oc_users SET ' +
              fields.map((f, i) => `${f}=$${i + 2}`).join(',') +
              ' WHERE id=$1',
            [id, ...fields.map((f) => changes[f])],
          );
        if (changes.is_disabled === true || (target.is_admin && changes.is_admin === false)) {
          await c.query('DELETE FROM oc_sessions WHERE user_id=$1', [id]);
          await c.query('UPDATE oc_api_keys SET revoked_at=now() WHERE user_id=$1', [id]);
          await c.query('DELETE FROM oc_device_logins WHERE user_id=$1', [id]);
        }
      } else if (kind === 'settings') {
        changes.default_quota_bytes = quotaValue(value.default_quota_bytes);
        await c.query('UPDATE oc_site_settings SET default_quota_bytes=$1 WHERE singleton', [
          changes.default_quota_bytes,
        ]);
      } else {
        await c.query('SELECT id FROM oc_timelines WHERE id=$1 FOR UPDATE', [id]);
        if (!(await c.query('SELECT id FROM oc_timelines WHERE id=$1', [id])).rows.length)
          throw new HttpError(404, 'Timeline unavailable.');
        if (value.visibility === 'public') {
          const current = (
            await c.query(
              'SELECT publication_restricted,comparison FROM oc_timelines WHERE id=$1',
              [id],
            )
          ).rows[0];
          if (current.publication_restricted)
            throw new HttpError(403, 'Private upstream data cannot be published.');
          if (
            current.comparison &&
            (
              await c.query(
                "SELECT id FROM oc_timelines WHERE id=ANY($1::uuid[]) AND visibility<>'public'",
                [current.comparison.sources],
              )
            ).rows.length
          )
            throw new HttpError(403, 'Public comparisons require public sources.');
        }
        if (value.delete === true) {
          changes.delete = true;
          await c.query('DELETE FROM oc_timelines WHERE id=$1', [id]);
          await this.store.removeHistory(c, id);
        } else {
          if ('visibility' in value) {
            if (!['public', 'private'].includes(value.visibility))
              throw new HttpError(400, 'Invalid visibility.');
            changes.visibility = value.visibility;
          }
          if ('featured' in value) {
            if (typeof value.featured !== 'boolean')
              throw new HttpError(400, 'Invalid featured flag.');
            changes.featured = value.featured;
          }
          const fields = Object.keys(changes);
          if (fields.length)
            await c.query(
              'UPDATE oc_timelines SET ' +
                fields.map((f, i) => `${f}=$${i + 2}`).join(',') +
                ' WHERE id=$1',
              [id, ...fields.map((f) => changes[f])],
            );
        }
      }
      await c.query(
        'INSERT INTO oc_admin_audit(actor_id,action,target_id,changes) VALUES($1,$2,$3,$4)',
        [actor.id, kind, id, changes],
      );
      return { ok: true };
    });
  }
}
export function avatarValue(value) {
  if (value === '') return value;
  if (typeof value !== 'string' || value.length > 350000)
    throw new HttpError(400, 'Avatar exceeds 256 KiB.');
  if (/^https:\/\//.test(value)) {
    try {
      const u = new URL(value);
      if (u.username || u.password || value.length > 2048) throw new Error();
      return u.href;
    } catch {
      throw new HttpError(400, 'Use a public HTTPS image URL.');
    }
  }
  const m = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
  if (!m) throw new HttpError(400, 'Upload a PNG, JPEG or WebP image, or use HTTPS.');
  const bytes = Buffer.from(m[2], 'base64');
  const valid =
    m[1] === 'png'
      ? bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
      : m[1] === 'jpeg'
        ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
        : bytes.subarray(0, 4).toString() === 'RIFF' && bytes.subarray(8, 12).toString() === 'WEBP';
  if (!valid || bytes.length > 262144 || bytes.toString('base64') !== m[2])
    throw new HttpError(400, 'Invalid avatar image.');
  return value;
}
