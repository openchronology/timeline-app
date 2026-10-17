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
import { contentLabels, describeLabels } from '../dist/core.mjs';
import { REPORT_CATEGORIES, REPORT_TARGETS, REPORT_TEXT } from './report-categories.mjs';

/** The report categories a reader may choose (report-categories.mjs; oc_reports.category's CHECK). */
const CATEGORIES = new Set(REPORT_CATEGORIES.map(([key]) => key));
/** A moment's or duration's id, as oc_reports.entity_id's CHECK accepts it. */
const ENTITY = /^[A-Za-z0-9_.:-]{1,128}$/;
const UUID = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
/**
 * An administrator's decisions: restrict, label and dismiss settle an open case; uphold answers
 * an owner's request for review; lift reverses a restriction or labels at any time.
 */
const ACTIONS = ['restrict', 'label', 'dismiss', 'uphold', 'lift'];
/** Decisions in force: a restriction, or labels moderators added to a timeline. */
const IN_FORCE = ['restricted', 'labelled'];
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

/**
 * SQL: what a case is about, for the queue, the owner and emails (`mc` is the case). A scalar
 * subquery per kind builds a small jsonb summary (a title, or a comment's first 500 characters
 * with its pull request); it is null once the target is deleted, which callers read as "no
 * longer exists". Targets are stored as text, so ids are compared as text (`id::text`). Plugins
 * and suites keep a row per version: the newest version's name is shown.
 */
const TARGET = `CASE mc.target_kind
  WHEN 'timeline' THEN (SELECT jsonb_build_object('title',t.title) FROM oc_timelines t WHERE t.id::text=mc.target_id)
  WHEN 'comment' THEN (SELECT jsonb_build_object('text',left(c.body,500),'timeline',p.timeline_id,'proposal',p.id,'title',p.title)
    FROM oc_proposal_comments c JOIN oc_proposals p ON p.id=c.proposal_id WHERE c.id::text=mc.target_id)
  WHEN 'plugin' THEN (SELECT jsonb_build_object('title',l.manifest->>'name') FROM oc_plugins l WHERE l.id=mc.target_id ORDER BY l.version DESC LIMIT 1)
  WHEN 'suite' THEN (SELECT jsonb_build_object('title',s.suite->>'name') FROM oc_plugin_suites s WHERE s.id=mc.target_id ORDER BY s.version DESC LIMIT 1)
  WHEN 'user' THEN (SELECT jsonb_build_object('title','@'||u.username,'username',u.username) FROM oc_users u WHERE u.id::text=mc.target_id)
END`;

/**
 * Where a case's target is seen, as a path on the platform; null once it is gone.
 * @param {string} kind the case's target_kind
 * @param {string} id the case's target_id
 * @param {object|null} target its TARGET summary
 * @returns {string|null}
 */
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

/**
 * Reports, the review queue, decisions and appeals. Cases live in oc_moderation_cases, one per
 * target while open or restricted (the partial unique index oc_moderation_cases_current), and
 * the reports gathered in each in oc_reports. http.mjs routes /api/reports, /api/admin/reports
 * and /api/moderation (an owner's decisions and appeals) here.
 */
export class Moderation {
  /**
   * `store` (store.mjs) gives the pool, transactions and timeline access checks; `auth`
   * (auth.mjs) its security helpers (recent-sign-in confirmation, mail) and the site's origin;
   * `administration` (administration.mjs) checks administrators and confirms their changes.
   */
  constructor(store, auth, administration) {
    this.store = store;
    this.pool = store.pool;
    this.auth = auth;
    this.administration = administration;
  }

  /**
   * What `value` names, as `{kind, id, owner, entity}`: a case's target and its owner, and for
   * a moment or duration which one. 404 unless `userId` (null when signed out) can see it.
   *
   * A moment or duration is reported as part of its timeline's case: the case's target is the
   * timeline and `entity` names which one. Its id is only checked for shape, not looked up in
   * the timeline. Read-only; runs on `c` so report's advisory lock and inserts share its
   * transaction.
   * @param {import('pg').PoolClient} c
   * @param {{kind: string, timeline?: string, id?: string}} value
   * @param {string|null} userId
   * @returns {Promise<{kind: string, id: string, owner: string|null, entity: object|null}>}
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
      // The comment's author owns it; its pull request names the timeline to check access on.
      row = (
        await c.query(
          'SELECT c.author_id AS owner,p.timeline_id FROM oc_proposal_comments c JOIN oc_proposals p ON p.id=c.proposal_id WHERE c.id=$1',
          [value.id],
        )
      ).rows[0];
      // Its pull request's timeline must be one the reader sees.
      if (row) await this.store.access(row.timeline_id, userId, c, { preparing: true });
    } else if (kind === 'plugin' || kind === 'suite') {
      // Any version names the owner (every version of an id has the same one), so LIMIT 1.
      // The table name is chosen from two literals, never from input.
      row = (
        await c.query(
          `SELECT owner_id AS owner FROM ${kind === 'plugin' ? 'oc_plugins' : 'oc_plugin_suites'} WHERE id=$1 LIMIT 1`,
          [value.id],
        )
      ).rows[0];
    } else {
      // An account is reported by username but its case names it by id, so a rename keeps the
      // case; an account owns itself. Suspended accounts cannot be reported again.
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

  /**
   * Records a report by `userId` (null when signed out): `{target, category, details}`.
   *
   * In one transaction: finds what is reported (target), joins the target's current case or
   * opens one, and adds the report. Refuses (400) a report of the reader's own thing. Rate
   * limits and the human-verification challenge are applied by http.mjs before this runs.
   * @returns {Promise<{ok: true}>}
   */
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
      // One current case per target, however many report it at once. The transaction-scoped
      // advisory lock on the target's key serializes concurrent reports of it, so the lookup
      // and insert below cannot both miss and open two cases (which the partial unique index
      // oc_moderation_cases_current would otherwise reject with an error). It is released at
      // commit or rollback.
      await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [
        `oc-case:${target.kind}:${target.id}`,
      ]);
      // The case in progress: open, or restricted (new reports of a restricted thing join its
      // case). A dismissed, lifted or labelled case is closed to new reports, which open a
      // new case.
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
      // A signed-in reader has one report per case and entity (the partial unique index
      // oc_reports_reporter, matched here by its expressions and WHERE): reporting the same
      // thing again replaces their category and details and dates it now. Signed-out reports
      // (reporter_id null) fall outside that index and always add a row.
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

  /**
   * The review queue for an administrator: `view` (open, restricted or closed) and `page`
   * (25 cases a page, clamped to 1..10000). 403 unless `session` is an active administrator.
   * @returns {Promise<{view: string, page: number, total: number, items: object[]}>} each item
   *   a case row with its owner's username, target summary, report count, `urgent` flag, its
   *   latest twenty reports and the target's path
   */
  async queue(session, query = {}) {
    await this.administration.require(session);
    const view = VIEWS.includes(query.view) ? query.view : 'open',
      page = Math.max(
        1,
        Math.min(10000, Number.isSafeInteger(Number(query.page)) ? Number(query.page) : 1),
      );
    // One round trip for a page and its total. The CTE `matching` is the view's cases, each
    // with its target summary, report count, whether any report names child abuse or other
    // illegal content (`urgent`), and its latest twenty reports with reporters' usernames
    // (null when signed out). The views:
    //   open: open cases, and decisions in force whose owner asked for a review not yet
    //     decided;
    //   restricted: decisions in force (restrictions and labels);
    //   closed: dismissed and lifted cases.
    // The open view puts urgent cases first, then the longest waiting (by the review request
    // when there is one, else the case's creation); the others list the latest decided
    // first. `id` breaks ties so pages are stable.
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
            OR (mc.status IN ('restricted','labelled') AND mc.appealed_at IS NOT NULL AND mc.appeal_decided_at IS NULL)
          WHEN 'restricted' THEN mc.status IN ('restricted','labelled')
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
   *
   * Which actions apply: restrict, label and dismiss to an open case only (409 otherwise);
   * label to a timeline only; uphold only while a review request awaits a decision; lift to a
   * restriction or labels in force. Restrict and label require a reason. In one transaction it
   * applies the decision (restrict, lift), updates the case, refreshes the owner's standing
   * after a restriction or lift, queues the emails (notify) and writes oc_admin_audit; queued
   * mail is sent after commit (security.deliver).
   * @returns {Promise<{ok: true}>}
   */
  async decide(session, id, value) {
    await this.administration.require(session);
    if (
      !value ||
      typeof value !== 'object' ||
      Object.keys(value).some(
        (key) => !['action', 'reason', 'labels', 'password', 'code'].includes(key),
      )
    )
      throw new HttpError(400, 'Invalid moderation decision.');
    if (!ACTIONS.includes(value.action)) throw new HttpError(400, 'Choose a decision.');
    const reason = text(value.reason, 'The reason');
    if ((value.action === 'restrict' || value.action === 'label') && !reason)
      throw new HttpError(400, 'Give the owner the reason for the decision.');
    const labels = contentLabels(value.labels);
    if (value.action === 'label' && (!labels.length || labels.length !== value.labels.length))
      throw new HttpError(400, 'Choose what the timeline contains.');
    const result = await this.store.transaction(async (c) => {
      // The lock every administration change takes (administration.mjs), so decisions and
      // changes to administrators run one at a time: the check that the actor is still an
      // active administrator, and the last-administrator check in restrict, cannot race a
      // concurrent demotion or suspension.
      await c.query("SELECT pg_advisory_xact_lock(hashtextextended('oc-admin-policy',0))");
      // Re-read and lock the actor's row: the session may be older than a change to it.
      const actor = (await c.query('SELECT * FROM oc_users WHERE id=$1 FOR UPDATE', [session.id]))
        .rows[0];
      if (!actor?.is_admin || actor.is_disabled)
        throw new HttpError(403, 'Administrator access required.');
      // A recent sign-in, the password, and a second factor when on; 403 otherwise.
      await this.auth.security.fresh(c, actor, session, value);
      // The case, locked so two administrators deciding it at once are serialized: the
      // second sees the first's status and is refused.
      const row = (
        await c.query(
          `SELECT mc.*,${TARGET} AS target FROM oc_moderation_cases mc WHERE mc.id=$1 FOR UPDATE`,
          [id],
        )
      ).rows[0];
      if (!row) throw new HttpError(404, 'Report unavailable.');
      // A review the owner asked for that awaits a decision.
      const appealing = IN_FORCE.includes(row.status) && row.appealed_at && !row.appeal_decided_at;
      const { action } = value;
      if (['restrict', 'label', 'dismiss'].includes(action) && row.status !== 'open')
        throw new HttpError(409, 'This report was already decided.');
      if (action === 'label' && row.target_kind !== 'timeline')
        throw new HttpError(400, 'Only timelines are labelled.');
      if (action === 'uphold' && !appealing) throw new HttpError(409, 'No review was asked for.');
      if (action === 'lift' && !IN_FORCE.includes(row.status))
        throw new HttpError(409, 'Nothing is in force.');
      if (action === 'restrict') {
        const previous = await this.restrict(c, row);
        await c.query(
          "UPDATE oc_moderation_cases SET status='restricted',reason=$2,decided_by=$3,decided_at=now(),previous_visibility=$4 WHERE id=$1",
          [id, reason, actor.id, previous],
        );
      } else if (action === 'label') {
        if (!row.target)
          throw new HttpError(409, 'What was reported no longer exists. Dismiss the report.');
        // Its owner cannot remove these (#115); lifting the decision does. Adds the labels to
        // those already there, without duplicates (DISTINCT over the concatenated arrays).
        // The case keeps the labels it added, so lift can take away just those.
        await c.query(
          `UPDATE oc_timelines SET moderator_labels=ARRAY(SELECT DISTINCT unnest(moderator_labels||$2::text[]))
          WHERE id=$1`,
          [row.target_id, labels],
        );
        await c.query(
          "UPDATE oc_moderation_cases SET status='labelled',labels=$2,reason=$3,decided_by=$4,decided_at=now() WHERE id=$1",
          [id, labels, reason, actor.id],
        );
      } else if (action === 'dismiss')
        await c.query(
          "UPDATE oc_moderation_cases SET status='dismissed',reason=$2,decided_by=$3,decided_at=now() WHERE id=$1",
          [id, reason || null, actor.id],
        );
      // Upholding leaves the decision in force and closes the owner's one review request.
      else if (action === 'uphold')
        await c.query(
          "UPDATE oc_moderation_cases SET appeal_outcome='upheld',appeal_decided_at=now() WHERE id=$1",
          [id],
        );
      else {
        await this.lift(c, row);
        // Lifting while a review awaits decides that review too (outcome 'lifted'); lifting
        // otherwise leaves the appeal columns as they were.
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
      await this.notify(c, row, action, reason, labels);
      // The administration audit trail, beside administration.mjs's changes (action 'reports').
      await c.query(
        'INSERT INTO oc_admin_audit(actor_id,action,target_id,changes) VALUES($1,$2,$3,$4)',
        [
          actor.id,
          'reports',
          id,
          {
            action,
            target_kind: row.target_kind,
            target_id: row.target_id,
            ...(action === 'label' ? { labels } : {}),
          },
        ],
      );
      return { ok: true };
    });
    this.auth.security.deliver();
    return result;
  }

  /**
   * Puts a restriction on case `row`'s target in place; a timeline's visibility before it.
   *
   * A timeline is made private (its earlier visibility is returned, for the case to keep and
   * lift to restore); an account is suspended as /admin suspends one. Comments, plugins and
   * suites are not changed here: the queries that show them check for a restricted case. 409
   * when the target is gone, or when it is the last active administrator. Runs inside
   * decide's transaction.
   * @returns {Promise<string|null>} the timeline's previous visibility, else null
   */
  async restrict(c, row) {
    if (!row.target)
      throw new HttpError(409, 'What was reported no longer exists. Dismiss the report.');
    if (row.target_kind === 'timeline') {
      // Locked so its visibility cannot change between reading and replacing it.
      const t = (
        await c.query('SELECT visibility FROM oc_timelines WHERE id=$1 FOR UPDATE', [row.target_id])
      ).rows[0];
      await c.query("UPDATE oc_timelines SET visibility='private' WHERE id=$1", [row.target_id]);
      return t.visibility;
    }
    if (row.target_kind === 'user') {
      // The account, locked; then the count of active administrators, which decide's
      // 'oc-admin-policy' lock keeps from changing underneath.
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

  /**
   * Undoes what restrict, or label, did for case `row`: removes the labels it added, restores
   * a timeline's earlier visibility, or unsuspends an account (its ended sessions and revoked
   * API keys stay ended). Nothing to undo for comments, plugins and suites: they show again
   * once the case is no longer restricted. Runs inside decide's transaction.
   */
  async lift(c, row) {
    if (row.status === 'labelled') {
      // The labels this decision added; others' (an owner's, other decisions') stay. The new
      // array is the timeline's moderator labels less this case's, united with the labels of
      // every other labelled case on the same timeline, so a label two decisions added
      // survives lifting one of them. (An owner's own labels are in content_labels, which
      // this does not touch.) The timeline is matched as text because cases name targets
      // as text.
      await c.query(
        `UPDATE oc_timelines SET moderator_labels=ARRAY(
          SELECT l FROM unnest(moderator_labels) l WHERE NOT l=ANY($2::text[])
          UNION SELECT unnest(mc.labels) FROM oc_moderation_cases mc
            WHERE mc.target_kind='timeline' AND mc.target_id=$1 AND mc.status='labelled' AND mc.id<>$3)
        WHERE id::text=$1`,
        [row.target_id, row.labels ?? [], row.id],
      );
      return;
    }
    if (row.target_kind === 'timeline' && row.previous_visibility)
      await c.query('UPDATE oc_timelines SET visibility=$2 WHERE id::text=$1', [
        row.target_id,
        row.previous_visibility,
      ]);
    if (row.target_kind === 'user')
      await c.query('UPDATE oc_users SET is_disabled=false WHERE id::text=$1', [row.target_id]);
  }

  /**
   * Emails the owner and reporters (those with a confirmed address) about a decision.
   *
   * The owner hears of a restriction or labels (with the reason and how to ask for review), an
   * upheld review and a lift; reporters hear of restrict, label and dismiss, without the
   * reason. Mail is queued on `c` (mail.mjs's outbox), so it is sent only if decide's
   * transaction commits. Does nothing when the site has no mail configured.
   */
  async notify(c, row, action, reason, labels = []) {
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
    if (action === 'label')
      await send(
        row.owner_id,
        'A moderation decision about your content',
        `Moderators labelled ${yours}${path ? ` (${origin}${path})` : ''} as containing ${describeLabels(labels).toLowerCase()}.\n\nReason: ${reason}\n\nReaders are warned before it opens, its images stay blurred until they choose to see them, and it is left out of featured timelines and of browsing by readers who are not signed in. You cannot remove these labels yourself.\n\n${review}`,
      );
    // What a review or a lift is about: a restriction, or labels.
    const decision =
      row.status === 'labelled' ? 'the labels moderators added to' : 'the restriction on';
    if (action === 'uphold')
      await send(
        row.owner_id,
        'The review of a moderation decision',
        `Moderators reviewed ${decision} ${yours} and kept ${row.status === 'labelled' ? 'them' : 'it'} in place.`,
      );
    if (action === 'lift')
      await send(
        row.owner_id,
        'A moderation decision was reversed',
        `Moderators lifted ${decision} ${yours}${path ? ` (${origin}${path})` : ''}. It is as it was before.`,
      );
    if (action === 'restrict' || action === 'label' || action === 'dismiss') {
      // Every signed-in reporter once, however many reports they made in the case.
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
              : action === 'label'
                ? 'labelled it, so readers are warned before it opens.'
                : 'found that it does not break the rules, so it stays as it is.'
          }`,
        );
    }
  }

  /**
   * The decisions in force or reversed on things `userId` owns, for their account page.
   * Open and dismissed cases are left out: an owner is not told of reports nobody acted on,
   * and reporters are never named. The latest fifty, by decision time (served by the index
   * oc_moderation_cases_owner on owner_id, decided_at).
   * @returns {Promise<{decisions: object[]}>}
   */
  async mine(userId) {
    const { rows } = await this.pool.query(
      `SELECT mc.id,mc.target_kind,mc.target_id,mc.status,mc.labels,mc.reason,mc.decided_at,mc.appeal,
        mc.appealed_at,mc.appeal_outcome,mc.appeal_decided_at,${TARGET} AS target
      FROM oc_moderation_cases mc WHERE mc.owner_id=$1 AND mc.status IN ('restricted','labelled','lifted')
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

  /**
   * The owner's one request for a review of the restriction (or labels) in case `id`:
   * `{appeal}`, its text. 404 unless `userId` owns the case and a decision is in force; 409 if
   * they already asked. The case row is locked (FOR UPDATE) so two requests at once cannot
   * both pass the "already asked" check. The request then shows in the queue's open view.
   * @returns {Promise<{ok: true}>}
   */
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
      if (!row || !IN_FORCE.includes(row.status)) throw new HttpError(404, 'Decision unavailable.');
      if (row.appealed_at) throw new HttpError(409, 'You have already asked for a review.');
      await c.query('UPDATE oc_moderation_cases SET appeal=$2,appealed_at=now() WHERE id=$1', [
        id,
        appeal,
      ]);
      return { ok: true };
    });
  }
}
