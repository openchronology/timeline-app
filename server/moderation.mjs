// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
/**
 * Reports and moderation decisions (#115). Anyone who can see something can report it: a
 * timeline or a moment or duration in one, a comment on a pull request, a plugin or suite in
 * the library, or an account. Reports of the same thing gather in one case, which an
 * administrator reviews in /admin and decides:
 *
 * - **dismiss:** no rule broken; the case closes.
 * - **restrict:** with a statement of reasons for the owner. A timeline becomes private and
 *   only its owner and administrators see it; a comment keeps its place without its text; a
 *   plugin or suite leaves the library and takes no new versions; an account is suspended.
 *
 * The owner is told of a restriction and why, and may ask once for a review; the
 * administrator then upholds it or lifts it (also possible at any time), restoring what it
 * changed. Reporters who were signed in with a confirmed email are told the outcome. The
 * owner never learns who reported.
 */
import { randomUUID } from 'node:crypto';
import { HttpError } from './store.mjs';
import { queueMail } from './mail.mjs';
import { refreshAccounts } from './standing.mjs';
import { REPORT_CATEGORIES, REPORT_TARGETS, REPORT_TEXT } from './report-categories.mjs';

const CATEGORIES = new Set(REPORT_CATEGORIES.map(([key]) => key));
const ENTITY = /^[A-Za-z0-9_.:-]{1,128}$/;
const UUID = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
const ACTIONS = ['restrict', 'dismiss', 'uphold', 'lift'];
/** The queue's views: what awaits a decision, what is restricted, and what was closed. */
const VIEWS = ['open', 'restricted', 'closed'];

/** Text of at most REPORT_TEXT characters, or `fallback` when absent. */
function text(value, name, fallback = '') {
  if (value === undefined || value === null) return fallback;
  if (typeof value !== 'string' || value.length > REPORT_TEXT)
    throw new HttpError(
      400,
      `${name} must be at most ${REPORT_TEXT.toLocaleString('en')} characters.`,
    );
  return value.trim();
}

/** SQL: what a case is about, for the queue, the owner and emails (`mc` is the case). */
const TARGET = `CASE mc.target_kind
  WHEN 'timeline' THEN (SELECT jsonb_build_object('title',t.title) FROM oc_timelines t WHERE t.id::text=mc.target_id)
  WHEN 'comment' THEN (SELECT jsonb_build_object('text',left(c.body,500),'timeline',p.timeline_id,'proposal',p.id,'title',p.title)
    FROM oc_proposal_comments c JOIN oc_proposals p ON p.id=c.proposal_id WHERE c.id::text=mc.target_id)
  WHEN 'plugin' THEN (SELECT jsonb_build_object('title',l.manifest->>'name') FROM oc_plugins l WHERE l.id=mc.target_id ORDER BY l.version DESC LIMIT 1)
  WHEN 'suite' THEN (SELECT jsonb_build_object('title',s.suite->>'name') FROM oc_plugin_suites s WHERE s.id=mc.target_id ORDER BY s.version DESC LIMIT 1)
  WHEN 'user' THEN (SELECT jsonb_build_object('title','@'||u.username,'username',u.username) FROM oc_users u WHERE u.id::text=mc.target_id)
END`;

/** Where a case's target is seen, as a path on the platform; null once it is gone. */
export function targetPath(kind, id, target) {
  if (!target) return null;
  if (kind === 'timeline') return `/timelines/${id}`;
  if (kind === 'comment') return `/timelines/${target.timeline}/pulls/${target.proposal}`;
  if (kind === 'plugin' || kind === 'suite') return `/plugins?search=${encodeURIComponent(id)}`;
  return `/users/${encodeURIComponent(target.username)}`;
}

/** How a case's target is named to its owner (`yours`) or to a reporter. */
function named(kind, target, yours) {
  const title = target?.title ? ` “${target.title}”` : '';
  if (kind === 'user') return yours ? 'your account' : `the account${title}`;
  if (kind === 'comment')
    return `${yours ? 'your' : 'a'} comment${title ? ` on the pull request${title}` : ''}`;
  return `${yours ? 'your' : 'the'} ${kind}${title}`;
}

export class Moderation {
  /** `administration` (administration.mjs) checks administrators and confirms their changes. */
  constructor(store, auth, administration) {
    this.store = store;
    this.pool = store.pool;
    this.auth = auth;
    this.administration = administration;
  }

  /**
   * What `value` names, as `{kind, id, owner, entity}`: a case's target and its owner, and for
   * a moment or duration which one. 404 unless `userId` (null when signed out) can see it.
   */
  async target(c, value, userId) {
    if (!value || typeof value !== 'object' || !REPORT_TARGETS.includes(value.kind))
      throw new HttpError(400, 'Say what you are reporting.');
    const { kind } = value;
    if (kind === 'timeline' || kind === 'moment' || kind === 'duration') {
      if (typeof value.timeline !== 'string' || !UUID.test(value.timeline))
        throw new HttpError(400, 'Name the timeline you are reporting.');
      if (kind !== 'timeline' && (typeof value.id !== 'string' || !ENTITY.test(value.id)))
        throw new HttpError(400, `Name the ${kind} you are reporting.`);
      const t = await this.store.access(value.timeline, userId, c, { preparing: true });
      return {
        kind: 'timeline',
        id: t.id,
        owner: t.owner_id,
        entity: kind === 'timeline' ? null : { kind, id: value.id },
      };
    }
    if (typeof value.id !== 'string' || !value.id || value.id.length > 128)
      throw new HttpError(400, `Name the ${kind} you are reporting.`);
    let row;
    if (kind === 'comment') {
      if (!/^[0-9]{1,18}$/.test(value.id)) throw new HttpError(400, 'Invalid comment.');
      row = (
        await c.query(
          'SELECT c.author_id AS owner,p.timeline_id FROM oc_proposal_comments c JOIN oc_proposals p ON p.id=c.proposal_id WHERE c.id=$1',
          [value.id],
        )
      ).rows[0];
      // Its pull request's timeline must be one the reader sees.
      if (row) await this.store.access(row.timeline_id, userId, c, { preparing: true });
    } else if (kind === 'plugin' || kind === 'suite') {
      row = (
        await c.query(
          `SELECT owner_id AS owner FROM ${kind === 'plugin' ? 'oc_plugins' : 'oc_plugin_suites'} WHERE id=$1 LIMIT 1`,
          [value.id],
        )
      ).rows[0];
    } else {
      row = (
        await c.query(
          'SELECT id::text AS id,id AS owner FROM oc_users WHERE username=$1 AND NOT is_disabled',
          [value.id.toLowerCase()],
        )
      ).rows[0];
    }
    if (!row) throw new HttpError(404, `That ${kind} is unavailable.`);
    return { kind, id: row.id ?? value.id, owner: row.owner, entity: null };
  }

  /** Records a report by `userId` (null when signed out): `{target, category, details}`. */
  async report(userId, value) {
    if (
      !value ||
      typeof value !== 'object' ||
      Object.keys(value).some((key) => !['target', 'category', 'details'].includes(key))
    )
      throw new HttpError(400, 'Invalid report.');
    if (!CATEGORIES.has(value.category)) throw new HttpError(400, 'Choose what is wrong.');
    const details = text(value.details, 'Details');
    return this.store.transaction(async (c) => {
      const target = await this.target(c, value.target, userId ?? null);
      if (userId && target.owner === userId)
        throw new HttpError(400, 'This is yours: change or delete it instead of reporting it.');
      // One current case per target, however many report it at once.
      await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [
        `oc-case:${target.kind}:${target.id}`,
      ]);
      let id = (
        await c.query(
          "SELECT id FROM oc_moderation_cases WHERE target_kind=$1 AND target_id=$2 AND status IN ('open','restricted')",
          [target.kind, target.id],
        )
      ).rows[0]?.id;
      if (!id) {
        id = randomUUID();
        await c.query(
          'INSERT INTO oc_moderation_cases(id,target_kind,target_id,owner_id) VALUES($1,$2,$3,$4)',
          [id, target.kind, target.id, target.owner ?? null],
        );
      }
      await c.query(
        `INSERT INTO oc_reports(id,case_id,category,details,entity_kind,entity_id,reporter_id)
        VALUES($1,$2,$3,$4,$5,$6,$7)
        ON CONFLICT(case_id,reporter_id,coalesce(entity_kind,''),coalesce(entity_id,'')) WHERE reporter_id IS NOT NULL
        DO UPDATE SET category=excluded.category,details=excluded.details,created_at=now()`,
        [
          randomUUID(),
          id,
          value.category,
          details,
          target.entity?.kind ?? null,
          target.entity?.id ?? null,
          userId ?? null,
        ],
      );
      return { ok: true };
    });
  }

  /** The review queue for an administrator: `view` (open, restricted or closed) and `page`. */
  async queue(session, query = {}) {
    await this.administration.require(session);
    const view = VIEWS.includes(query.view) ? query.view : 'open',
      page = Math.max(
        1,
        Math.min(10000, Number.isSafeInteger(Number(query.page)) ? Number(query.page) : 1),
      );
    const { rows } = await this.pool.query(
      `WITH matching AS (
        SELECT mc.*,o.username AS owner,${TARGET} AS target,
          (SELECT count(*) FROM oc_reports r WHERE r.case_id=mc.id) AS report_count,
          EXISTS(SELECT 1 FROM oc_reports r WHERE r.case_id=mc.id AND r.category IN ('child_abuse','illegal')) AS urgent,
          coalesce((SELECT jsonb_agg(x ORDER BY x.created_at DESC) FROM (
            SELECT r.category,r.details,r.entity_kind,r.entity_id,r.created_at,ru.username AS reporter
            FROM oc_reports r LEFT JOIN oc_users ru ON ru.id=r.reporter_id
            WHERE r.case_id=mc.id ORDER BY r.created_at DESC LIMIT 20) x),'[]') AS reports
        FROM oc_moderation_cases mc LEFT JOIN oc_users o ON o.id=mc.owner_id
        WHERE CASE $1 WHEN 'open' THEN mc.status='open'
            OR (mc.status='restricted' AND mc.appealed_at IS NOT NULL AND mc.appeal_decided_at IS NULL)
          WHEN 'restricted' THEN mc.status='restricted'
          ELSE mc.status IN ('dismissed','lifted') END)
      SELECT (SELECT count(*) FROM matching) AS total,coalesce((SELECT jsonb_agg(p) FROM (
        SELECT * FROM matching ORDER BY
          CASE WHEN $1='open' THEN urgent ELSE false END DESC,
          CASE WHEN $1='open' THEN coalesce(appealed_at,created_at) END,
          decided_at DESC,id LIMIT 25 OFFSET $2) p),'[]') AS items`,
      [view, (page - 1) * 25],
    );
    return {
      view,
      page,
      total: rows[0].total,
      items: rows[0].items.map((item) => ({
        ...item,
        path: targetPath(item.target_kind, item.target_id, item.target),
      })),
    };
  }

  /**
   * An administrator's decision on case `id`: `{action, reason, password, code}`, confirmed as
   * other administration changes are (administration.mjs) and recorded in its audit.
   */
  async decide(session, id, value) {
    await this.administration.require(session);
    if (
      !value ||
      typeof value !== 'object' ||
      Object.keys(value).some((key) => !['action', 'reason', 'password', 'code'].includes(key))
    )
      throw new HttpError(400, 'Invalid moderation decision.');
    if (!ACTIONS.includes(value.action)) throw new HttpError(400, 'Choose a decision.');
    const reason = text(value.reason, 'The reason');
    if (value.action === 'restrict' && !reason)
      throw new HttpError(400, 'Give the owner the reason for the restriction.');
    const result = await this.store.transaction(async (c) => {
      await c.query("SELECT pg_advisory_xact_lock(hashtextextended('oc-admin-policy',0))");
      const actor = (await c.query('SELECT * FROM oc_users WHERE id=$1 FOR UPDATE', [session.id]))
        .rows[0];
      if (!actor?.is_admin || actor.is_disabled)
        throw new HttpError(403, 'Administrator access required.');
      await this.auth.security.fresh(c, actor, session, value);
      const row = (
        await c.query(
          `SELECT mc.*,${TARGET} AS target FROM oc_moderation_cases mc WHERE mc.id=$1 FOR UPDATE`,
          [id],
        )
      ).rows[0];
      if (!row) throw new HttpError(404, 'Report unavailable.');
      const appealing = row.status === 'restricted' && row.appealed_at && !row.appeal_decided_at;
      const { action } = value;
      if ((action === 'restrict' || action === 'dismiss') && row.status !== 'open')
        throw new HttpError(409, 'This report was already decided.');
      if (action === 'uphold' && !appealing) throw new HttpError(409, 'No review was asked for.');
      if (action === 'lift' && row.status !== 'restricted')
        throw new HttpError(409, 'Nothing is restricted.');
      if (action === 'restrict') {
        const previous = await this.restrict(c, row);
        await c.query(
          "UPDATE oc_moderation_cases SET status='restricted',reason=$2,decided_by=$3,decided_at=now(),previous_visibility=$4 WHERE id=$1",
          [id, reason, actor.id, previous],
        );
      } else if (action === 'dismiss')
        await c.query(
          "UPDATE oc_moderation_cases SET status='dismissed',reason=$2,decided_by=$3,decided_at=now() WHERE id=$1",
          [id, reason || null, actor.id],
        );
      else if (action === 'uphold')
        await c.query(
          "UPDATE oc_moderation_cases SET appeal_outcome='upheld',appeal_decided_at=now() WHERE id=$1",
          [id],
        );
      else {
        await this.lift(c, row);
        await c.query(
          `UPDATE oc_moderation_cases SET status='lifted',
          appeal_outcome=CASE WHEN $2 THEN 'lifted' ELSE appeal_outcome END,
          appeal_decided_at=CASE WHEN $2 THEN now() ELSE appeal_decided_at END WHERE id=$1`,
          [id, !!appealing],
        );
      }
      // A restriction in force leaves its owner without standing (#103; standing.mjs).
      if (row.owner_id && (action === 'restrict' || action === 'lift'))
        await refreshAccounts(c, [row.owner_id]);
      await this.notify(c, row, action, reason);
      await c.query(
        'INSERT INTO oc_admin_audit(actor_id,action,target_id,changes) VALUES($1,$2,$3,$4)',
        [
          actor.id,
          'reports',
          id,
          { action, target_kind: row.target_kind, target_id: row.target_id },
        ],
      );
      return { ok: true };
    });
    this.auth.security.deliver();
    return result;
  }

  /** Puts a restriction on case `row`'s target in place; a timeline's visibility before it. */
  async restrict(c, row) {
    if (!row.target)
      throw new HttpError(409, 'What was reported no longer exists. Dismiss the report.');
    if (row.target_kind === 'timeline') {
      const t = (
        await c.query('SELECT visibility FROM oc_timelines WHERE id=$1 FOR UPDATE', [row.target_id])
      ).rows[0];
      await c.query("UPDATE oc_timelines SET visibility='private' WHERE id=$1", [row.target_id]);
      return t.visibility;
    }
    if (row.target_kind === 'user') {
      const user = (
        await c.query('SELECT is_admin,is_disabled FROM oc_users WHERE id=$1 FOR UPDATE', [
          row.target_id,
        ])
      ).rows[0];
      if (
        user.is_admin &&
        !user.is_disabled &&
        Number(
          (await c.query('SELECT count(*) FROM oc_users WHERE is_admin AND NOT is_disabled'))
            .rows[0].count,
        ) <= 1
      )
        throw new HttpError(409, 'The last active administrator cannot be suspended.');
      // As suspending in /admin does: its sessions, keys and sign-ins end.
      await c.query('UPDATE oc_users SET is_disabled=true WHERE id=$1', [row.target_id]);
      await c.query('DELETE FROM oc_sessions WHERE user_id=$1', [row.target_id]);
      await c.query('UPDATE oc_api_keys SET revoked_at=now() WHERE user_id=$1', [row.target_id]);
      await c.query('DELETE FROM oc_device_logins WHERE user_id=$1', [row.target_id]);
    }
    // Comments, plugins and suites are hidden while the case is in force.
    return null;
  }

  /** Undoes what restrict did for case `row`. */
  async lift(c, row) {
    if (row.target_kind === 'timeline' && row.previous_visibility)
      await c.query('UPDATE oc_timelines SET visibility=$2 WHERE id::text=$1', [
        row.target_id,
        row.previous_visibility,
      ]);
    if (row.target_kind === 'user')
      await c.query('UPDATE oc_users SET is_disabled=false WHERE id::text=$1', [row.target_id]);
  }

  /** Emails the owner and reporters (those with a confirmed address) about a decision. */
  async notify(c, row, action, reason) {
    const security = this.auth.security;
    if (!security?.available) return;
    const origin = this.auth.origin;
    // Only to confirmed addresses; a suspended account's still hears why.
    const send = async (userId, subject, body) => {
      if (!userId) return;
      const user = (
        await c.query('SELECT email,email_verified_at FROM oc_users WHERE id=$1', [userId])
      ).rows[0];
      if (user?.email && user.email_verified_at)
        await queueMail(c, security.key, { to: user.email, subject, text: body });
    };
    const yours = named(row.target_kind, row.target, true),
      path = targetPath(row.target_kind, row.target_id, row.target);
    const review =
      row.target_kind === 'user'
        ? 'To ask for a review, contact the operator of this site.'
        : `You can ask for a review once, from your account: ${origin}/account#moderation`;
    if (action === 'restrict')
      await send(
        row.owner_id,
        'A moderation decision about your content',
        `Moderators restricted ${yours}${path ? ` (${origin}${path})` : ''}.\n\nReason: ${reason}\n\n${
          row.target_kind === 'timeline'
            ? 'It is now private: only you and the site administrators can open it, and it cannot be made public again while restricted.'
            : row.target_kind === 'user'
              ? 'The account is suspended: it cannot sign in, and its sessions and API keys have ended.'
              : `It is hidden from everyone else${row.target_kind === 'comment' ? '' : ' and cannot be published again while restricted'}.`
        }\n\n${review}`,
      );
    if (action === 'uphold')
      await send(
        row.owner_id,
        'The review of a moderation decision',
        `Moderators reviewed the restriction on ${yours} and kept it in place.`,
      );
    if (action === 'lift')
      await send(
        row.owner_id,
        'A moderation decision was reversed',
        `Moderators lifted the restriction on ${yours}${path ? ` (${origin}${path})` : ''}. It is as it was before.`,
      );
    if (action === 'restrict' || action === 'dismiss') {
      const reporters = await c.query(
        'SELECT DISTINCT reporter_id FROM oc_reports WHERE case_id=$1 AND reporter_id IS NOT NULL',
        [row.id],
      );
      for (const { reporter_id } of reporters.rows)
        await send(
          reporter_id,
          'Your report was reviewed',
          `Thank you for reporting ${named(row.target_kind, row.target, false)}. Moderators reviewed it and ${
            action === 'restrict'
              ? 'restricted it.'
              : 'found that it does not break the rules, so it stays as it is.'
          }`,
        );
    }
  }

  /** The decisions in force or reversed on things `userId` owns, for their account page. */
  async mine(userId) {
    const { rows } = await this.pool.query(
      `SELECT mc.id,mc.target_kind,mc.target_id,mc.status,mc.reason,mc.decided_at,mc.appeal,
        mc.appealed_at,mc.appeal_outcome,mc.appeal_decided_at,${TARGET} AS target
      FROM oc_moderation_cases mc WHERE mc.owner_id=$1 AND mc.status IN ('restricted','lifted')
      ORDER BY mc.decided_at DESC LIMIT 50`,
      [userId],
    );
    return {
      decisions: rows.map((row) => ({
        ...row,
        path: targetPath(row.target_kind, row.target_id, row.target),
      })),
    };
  }

  /** The owner's one request for a review of the restriction in case `id`. */
  async appeal(userId, id, value) {
    if (!value || typeof value !== 'object' || Object.keys(value).some((k) => k !== 'appeal'))
      throw new HttpError(400, 'Invalid review request.');
    const appeal = text(value.appeal, 'The request');
    if (!appeal) throw new HttpError(400, 'Say why the decision should be reviewed.');
    return this.store.transaction(async (c) => {
      const row = (
        await c.query('SELECT * FROM oc_moderation_cases WHERE id=$1 AND owner_id=$2 FOR UPDATE', [
          id,
          userId,
        ])
      ).rows[0];
      if (!row || row.status !== 'restricted') throw new HttpError(404, 'Decision unavailable.');
      if (row.appealed_at) throw new HttpError(409, 'You have already asked for a review.');
      await c.query('UPDATE oc_moderation_cases SET appeal=$2,appealed_at=now() WHERE id=$1', [
        id,
        appeal,
      ]);
      return { ok: true };
    });
  }
}
