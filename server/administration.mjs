// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
/**
 * Site administration (/admin; docs/administration.md): the installation administrator
 * created at migration, storage quotas, the account checks other modules use before writes,
 * and the Administration class behind /api/admin/users, /api/admin/timelines and
 * /api/admin/settings. Every change by an administrator is confirmed with the password (or a
 * recent sign-in, without one) and a second factor, serialized on one advisory lock, and written to
 * oc_admin_audit.
 */
import { randomUUID } from 'node:crypto';
import { passwordHash } from './auth.mjs';
import { HttpError } from './store.mjs';
import { defaultQuota, storageBytes } from './limits.mjs';
import { standingOf, refreshAccounts } from './standing.mjs';
/**
 * A quota in bytes, as a string: a byte count or a size such as 500MiB or 2GB, up to 10 TB.
 * A string so a bigint column's value passes to PostgreSQL without losing precision.
 * @param {string|number|null} value as an administrator typed it
 * @param {boolean} nullable whether null (no quota of its own: the site default) is allowed
 * @returns {string|null}
 * @throws {HttpError} 400 for anything else
 */
export function quotaValue(value, nullable = false) {
  if (nullable && value === null) return null;
  if (!['string', 'number'].includes(typeof value) || String(value).length > 32)
    throw new HttpError(400, 'Quota must be a size from 0 to 10 TB, such as 104857600 or 2GiB.');
  try {
    return String(storageBytes(value));
  } catch {
    throw new HttpError(400, 'Quota must be a size from 0 to 10 TB, such as 104857600 or 2GiB.');
  }
}
/**
 * The default quota DEFAULT_USER_STORAGE_BYTES sets, applied at every start: when it is set,
 * the environment file decides the default, and /admin shows it rather than changing it.
 * Called by bootstrapInstallation at migration and by platform.mjs at each start. Writes the
 * single oc_site_settings row (marking the installation initialized).
 * @returns {Promise<boolean>} whether the environment set the default
 */
export async function applyEnvironmentQuota(client, env = process.env) {
  const quota = defaultQuota(env);
  if (quota === null) return false;
  await client.query(
    'UPDATE oc_site_settings SET initialized=true,default_quota_bytes=$1 WHERE singleton',
    [String(quota)],
  );
  return true;
}
/**
 * First-run setup, run by migrate.mjs inside its transaction: sets the default quota the first
 * time (DEFAULT_USER_STORAGE_BYTES, else 100 MiB) and, when ADMIN_INITIAL_PASSWORD is set and
 * no installation administrator was made yet, creates one from ADMIN_USERNAME (default
 * "admin") and ADMIN_EMAIL: verified, an administrator, exempt from quotas. Its id is kept in
 * oc_site_settings.bootstrap_admin_id, so later runs never make or reset another, and the
 * creation is audited ('bootstrap').
 *
 * Throws (stopping migration) for an invalid username, email or a weak or example password,
 * and refuses to promote an existing account with that username or email, so nobody can
 * squat the name before the operator's first start.
 * @param {import('pg').PoolClient} client in a transaction
 * @param {NodeJS.ProcessEnv} env
 */
export async function bootstrapInstallation(client, env = process.env) {
  // Lock the single settings row so two migrations started at once cannot both see no
  // bootstrap administrator and create two.
  await client.query('SELECT singleton FROM oc_site_settings WHERE singleton FOR UPDATE');
  const settings = (await client.query('SELECT * FROM oc_site_settings WHERE singleton')).rows[0];
  if (!settings.initialized)
    await client.query(
      'UPDATE oc_site_settings SET initialized=true,default_quota_bytes=$1 WHERE singleton',
      [String(defaultQuota(env) ?? 104857600n)],
    );
  else await applyEnvironmentQuota(client, env);
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
  // Any account already holding the username, or the email in any case.
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
  // The administrator is the actor of its own creation; one parameter serves as both the
  // actor (uuid) and the target (text).
  await client.query(
    "INSERT INTO oc_admin_audit(actor_id,action,target_id,changes) VALUES($1::uuid,'bootstrap',$1::uuid::text,'{}')",
    [id],
  );
}
/**
 * An account's storage and flags: bytes used, its own quota (null for the site default), its
 * exemption, administrator and suspended flags, and the quota in effect. Joins the single
 * oc_site_settings row (CROSS JOIN) for the default. 401 when the account is gone. Read by
 * http.mjs for the account page and before writes.
 * @param {import('pg').Pool} pool
 * @param {string} id the account
 */
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
/**
 * Refuses data from an account that may not supply it: 401 when signed out, 403 when the
 * account is suspended or is read-only (a quota of zero in effect, unless it is an
 * administrator or exempt). Called by http.mjs before routes that add data.
 */
export async function requireDataProvider(pool, id) {
  if (!id) throw new HttpError(401, 'Sign in to supply data.');
  const u = await usage(pool, id);
  if (u.is_disabled || (!u.is_admin && !u.quota_bypass && BigInt(u.effective_quota_bytes) === 0n))
    throw new HttpError(
      403,
      'This account is read-only. Ask the administrator to enable data contributions.',
    );
}
/**
 * The administrators' views and changes in /admin. `store` (store.mjs) gives the pool and
 * transactions, `auth` (auth.mjs) the confirmation of changes, and `env` the environment
 * file's settings (DEFAULT_USER_STORAGE_BYTES).
 */
export class Administration {
  constructor(store, auth, env = process.env) {
    this.store = store;
    this.pool = store.pool;
    this.auth = auth;
    this.env = env;
  }
  /**
   * 403 unless `session` is a browser session (not an API key) of an active administrator,
   * read fresh from oc_users so a demotion or suspension takes effect at once. Read-only;
   * changes re-check under a lock (see change).
   */
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
  /**
   * A page of accounts (`kind` 'users') or timelines (any other kind) for /admin: `search`
   * (up to 200 characters) and `page` (25 a page). Accounts come with their standing (#103);
   * the result also carries the site's default quota and whether the environment sets it.
   * @returns {Promise<{total: number, items: object[], page: number, settings: object}>}
   */
  async list(session, kind, query = {}) {
    await this.require(session);
    const search = typeof query.search === 'string' ? query.search.slice(0, 200) : '',
      page = Math.max(
        1,
        Math.min(10000, Number.isSafeInteger(Number(query.page)) ? Number(query.page) : 1),
      );
    // One round trip for a page and its total: the CTE `matching` holds every row whose
    // username and email (accounts), or title and owner's username (timelines), contain the
    // search case-insensitively (strpos, so the search is plain text, not a LIKE pattern; an
    // empty search matches all). The page is ordered by name then id, so pages are stable.
    // These are full scans, acceptable for an administrator's occasional search.
    const result = await this.pool.query(
      kind === 'users'
        ? `WITH matching AS (SELECT id,username,email,is_admin,is_disabled,quota_bypass,quota_bytes,used_bytes,created_at,trust FROM oc_users WHERE strpos(lower(username||' '||coalesce(email,'')),lower($1))>0) SELECT (SELECT count(*) FROM matching) AS total,coalesce((SELECT jsonb_agg(p) FROM (SELECT * FROM matching ORDER BY username,id LIMIT 25 OFFSET $2)p),'[]') AS items`
        : `WITH matching AS (SELECT t.id,t.title,t.visibility,t.featured,t.event_count,u.username AS owner FROM oc_timelines t JOIN oc_users u ON u.id=t.owner_id WHERE strpos(lower(t.title||' '||u.username),lower($1))>0) SELECT (SELECT count(*) FROM matching) AS total,coalesce((SELECT jsonb_agg(p) FROM (SELECT * FROM matching ORDER BY title,id LIMIT 25 OFFSET $2)p),'[]') AS items`,
      [search, (page - 1) * 25],
    );
    const listed = result.rows[0];
    // Each account's standing (#103) and what it rests on, as it stands now.
    if (kind === 'users' && listed.items.length) {
      const standing = new Map(
        (
          await standingOf(
            this.pool,
            listed.items.map((item) => item.id),
          )
        ).map((row) => [row.id, row]),
      );
      for (const item of listed.items) {
        const { standing: value, endorsers, confirmed, restricted } = standing.get(item.id);
        Object.assign(item, { standing: value, endorsers, confirmed, restricted });
      }
    }
    return {
      ...listed,
      page,
      settings: {
        ...(
          await this.pool.query('SELECT default_quota_bytes FROM oc_site_settings WHERE singleton')
        ).rows[0],
        // Set by the environment file, which /admin does not change.
        default_quota_from_env: defaultQuota(this.env) !== null,
      },
    };
  }
  /**
   * An administrator's change, confirmed with `password` and `code` in `value` (the
   * password, or a recent sign-in without one, and a second factor when on; security.fresh):
   * - `users` (`id` an account): is_admin, is_disabled, quota_bypass, quota_bytes, trust.
   *   Suspending or demoting ends the account's sessions, API keys and pending desktop
   *   sign-ins; the last active administrator cannot be suspended or demoted (409).
   * - `settings`: default_quota_bytes, unless the environment file sets it (409).
   * - timelines (`id` a timeline): visibility, featured, or delete. Making one public is
   *   refused for a private fork's copy, a timeline moderators restricted, and a comparison
   *   with a private source.
   * Runs in one transaction and records `changes` in oc_admin_audit under `kind`.
   * @returns {Promise<{ok: true}>}
   */
  async change(session, kind, id, value) {
    await this.require(session);
    if (!value || typeof value !== 'object' || Array.isArray(value))
      throw new HttpError(400, 'Invalid administration request.');
    const allowed =
      kind === 'users'
        ? ['is_admin', 'is_disabled', 'quota_bypass', 'quota_bytes', 'trust']
        : kind === 'settings'
          ? ['default_quota_bytes']
          : ['visibility', 'featured', 'delete'];
    if (Object.keys(value).some((k) => ![...allowed, 'password', 'code', 'passkey'].includes(k)))
      throw new HttpError(400, 'Unknown administration field.');
    return this.store.transaction(async (c) => {
      // All administration changes (and moderation decisions) take this transaction-scoped
      // advisory lock, so they run one at a time. Without it two administrators could each
      // demote the other, each seeing two active administrators, and leave none.
      await c.query("SELECT pg_advisory_xact_lock(hashtextextended('oc-admin-policy',0))");
      // The actor, re-read under the lock: require's check may be stale by now.
      const actor = (await c.query('SELECT * FROM oc_users WHERE id=$1 FOR UPDATE', [session.id]))
        .rows[0];
      if (!actor?.is_admin || actor.is_disabled)
        throw new HttpError(403, 'Administrator access required.');
      await this.auth.security.fresh(c, actor, session, value);
      // What changed, as written to the audit.
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
        if ('trust' in value) {
          if (![null, 'trusted', 'untrusted'].includes(value.trust))
            throw new HttpError(400, 'Trust is trusted, untrusted or null.');
          changes.trust = value.trust;
        }
        if (
          target.is_admin &&
          (changes.is_admin === false || changes.is_disabled === true) &&
          Number(
            (await c.query('SELECT count(*) FROM oc_users WHERE is_admin AND NOT is_disabled'))
              .rows[0].count,
          ) <= 1
        )
          throw new HttpError(409, 'The last active administrator cannot be disabled or demoted.');
        // Column names come from the allow-list above, never from input; values are bound.
        const fields = Object.keys(changes);
        if (fields.length)
          await c.query(
            'UPDATE oc_users SET ' +
              fields.map((f, i) => `${f}=$${i + 2}`).join(',') +
              ' WHERE id=$1',
            [id, ...fields.map((f) => changes[f])],
          );
        // Re-enabling an account lifts a moderation restriction on it too (#193), as lifting
        // the case would: otherwise it stays without standing and in the restricted queue,
        // and a later lift could undo a suspension made since. A review awaiting decision is
        // decided as lifted, as in moderation.mjs.
        if (changes.is_disabled === false && target.is_disabled)
          await c.query(
            `UPDATE oc_moderation_cases SET status='lifted',
            appeal_outcome=CASE WHEN appealed_at IS NOT NULL AND appeal_decided_at IS NULL THEN 'lifted' ELSE appeal_outcome END,
            appeal_decided_at=CASE WHEN appealed_at IS NOT NULL AND appeal_decided_at IS NULL THEN now() ELSE appeal_decided_at END
            WHERE target_kind='user' AND target_id=$1::text AND status='restricted'`,
            [id],
          );
        // What ranks its timelines and weighs its stars follows (#103; standing.mjs).
        if (['is_admin', 'is_disabled', 'trust'].some((field) => field in changes))
          await refreshAccounts(c, [id]);
        // A suspended or demoted account's access ends now: browser sessions, API keys
        // (revoked, kept for the record) and pending desktop sign-ins.
        if (changes.is_disabled === true || (target.is_admin && changes.is_admin === false)) {
          await c.query('DELETE FROM oc_sessions WHERE user_id=$1', [id]);
          await c.query('UPDATE oc_api_keys SET revoked_at=now() WHERE user_id=$1', [id]);
          await c.query('DELETE FROM oc_device_logins WHERE user_id=$1', [id]);
        }
      } else if (kind === 'settings') {
        if (defaultQuota(this.env) !== null)
          throw new HttpError(
            409,
            'DEFAULT_USER_STORAGE_BYTES in the environment file sets the default quota; change it there.',
          );
        changes.default_quota_bytes = quotaValue(value.default_quota_bytes);
        await c.query('UPDATE oc_site_settings SET default_quota_bytes=$1 WHERE singleton', [
          changes.default_quota_bytes,
        ]);
      } else {
        // Lock the timeline against concurrent saves and changes to its sharing while the
        // checks below decide on it.
        await c.query('SELECT id FROM oc_timelines WHERE id=$1 FOR UPDATE', [id]);
        if (!(await c.query('SELECT id FROM oc_timelines WHERE id=$1', [id])).rows.length)
          throw new HttpError(404, 'Timeline unavailable.');
        // Publishing is refused, for administrators as for owners, when the timeline copies
        // a private timeline (publication_restricted), when moderators restricted it (#115),
        // or when it is a comparison with a source that is not public.
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
            (
              await c.query(
                "SELECT 1 FROM oc_moderation_cases WHERE target_kind='timeline' AND target_id=$1 AND status='restricted'",
                [id],
              )
            ).rows.length
          )
            throw new HttpError(
              409,
              'Moderators restricted this timeline. Lift the restriction under Reports to publish it again.',
            );
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
          // What references the timeline goes with it by foreign-key cascades; the revisions
          // its pull requests kept outside any timeline's history are removed explicitly
          // (store.removeHistory).
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
/**
 * An avatar as an account may set it: '' (none), a public HTTPS URL without credentials (up
 * to 2048 characters, normalized), or a PNG, JPEG or WebP data URL of at most 256 KiB whose
 * bytes start with that format's signature and whose base64 is canonical (re-encoding gives
 * the same text), so the stored value is exactly an image of the declared type.
 * @returns {string} the value to store
 * @throws {HttpError} 400 otherwise
 */
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
