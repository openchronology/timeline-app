// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
/**
 * Saved views (#550): named configurations of separations (tags, disjoins and unions, or an
 * entity's relationships), each of one timeline, kept apart from its document. Private (its
 * owner and the members it is shared with) or public (anyone who may read its timeline).
 * Forked or duplicated as timelines are, and reassigned to another timeline, so a view can be
 * a template. A timeline's default view may name one (PostgresStore.access shows it as it is
 * now); deleting it leaves the timeline's own copy.
 */
import { randomUUID } from 'node:crypto';
import { HttpError } from './store.mjs';
import { adminId } from './key-requests.mjs';
import { validateTimelineView, validateViewText } from '../dist/core.mjs';

/** The most views an account owns. */
export const VIEW_LIMIT = 500;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
/** A request's separation, validated as a default view's. */
function separationOf(value) {
  try {
    return validateTimelineView({ separation: value }).separation;
  } catch (error) {
    throw new HttpError(400, error.message);
  }
}
function textOf(title, description) {
  try {
    return validateViewText(title, description ?? '');
  } catch (error) {
    throw new HttpError(400, error.message);
  }
}
const visibilityOf = (value) => {
  if (value === undefined) return undefined;
  if (value !== 'private' && value !== 'public')
    throw new HttpError(400, 'A view is private or public.');
  return value;
};

export class SavedViews {
  /**
   * @param {import('./store.mjs').PostgresStore} store
   * @param {{ exportCache?: { forget(id: string): Promise<void> } | null }} [options]
   */
  constructor(store, { exportCache = null } = {}) {
    this.store = store;
    this.pool = store.pool;
    this.exportCache = exportCache;
  }
  /**
   * View `id` with the reader's role: 'owner', 'admin', a member's 'editor' or 'viewer', or
   * 'public' for a public view whose timeline they may read (or that has none). HttpError 404
   * when they may not read it.
   */
  async #read(client, id, userId) {
    if (typeof id !== 'string' || !UUID.test(id)) throw new HttpError(404, 'View unavailable.');
    const { rows } = await client.query(
      `SELECT v.*,u.username AS owner,t.title AS timeline_title,up.title AS upstream_title,
      CASE WHEN EXISTS(SELECT 1 FROM oc_users a WHERE a.id=$3::uuid AND a.is_admin AND NOT a.is_disabled)
        THEN 'admin' WHEN v.owner_id=$2::uuid THEN 'owner' ELSE m.role END AS role
      FROM oc_saved_views v JOIN oc_users u ON u.id=v.owner_id
      LEFT JOIN oc_timelines t ON t.id=v.timeline_id
      LEFT JOIN oc_saved_views up ON up.id=v.upstream_id
      LEFT JOIN oc_saved_view_members m ON m.view_id=v.id AND m.user_id=$2::uuid
      WHERE v.id=$1`,
      [id, userId ?? null, adminId(userId)],
    );
    const view = rows[0];
    if (!view) throw new HttpError(404, 'View unavailable.');
    if (!view.role && view.visibility === 'public') {
      // Public: for those who may read its timeline.
      if (view.timeline_id && !(await this.#readable(client, view.timeline_id, userId)))
        throw new HttpError(404, 'View unavailable.');
      view.role = 'public';
    }
    if (!view.role) throw new HttpError(404, 'View unavailable.');
    return view;
  }
  /** Whether `userId` may read timeline `id`. */
  async #readable(client, id, userId) {
    try {
      await this.store.access(id, userId, client, { preparing: true });
      return true;
    } catch (error) {
      if (error instanceof HttpError && error.status === 404) return false;
      throw error;
    }
  }
  /** A view as the API gives it, with what the reader may do. */
  #shape(view, userId) {
    const owns = view.role === 'owner' || view.role === 'admin';
    return {
      id: view.id,
      title: view.title,
      description: view.description,
      visibility: view.visibility,
      separation: view.separation,
      timeline: view.timeline_id ? { id: view.timeline_id, title: view.timeline_title } : null,
      owner: view.owner,
      upstream: view.upstream_id ? { id: view.upstream_id, title: view.upstream_title } : null,
      role: view.role,
      canEdit: owns || view.role === 'editor',
      canShare: owns,
      canFork: !!userId && view.owner_id !== userId,
      canDuplicate: !!userId,
      createdAt: view.created_at,
      updatedAt: view.updated_at,
    };
  }
  async get(id, userId) {
    return this.#shape(await this.#read(this.pool, id, userId), userId);
  }
  /**
   * The views of timeline `timelineId` that `userId` may read (they must be able to read the
   * timeline): their own, those shared with them, and public ones; the default first, then by
   * title.
   */
  async list(timelineId, userId) {
    const t = await this.store.access(timelineId, userId);
    const { rows } = await this.pool.query(
      `SELECT v.*,u.username AS owner,$4::text AS timeline_title,up.title AS upstream_title,
      CASE WHEN EXISTS(SELECT 1 FROM oc_users a WHERE a.id=$3::uuid AND a.is_admin AND NOT a.is_disabled)
        THEN 'admin' WHEN v.owner_id=$2::uuid THEN 'owner' ELSE coalesce(m.role,'public') END AS role
      FROM oc_saved_views v JOIN oc_users u ON u.id=v.owner_id
      LEFT JOIN oc_saved_views up ON up.id=v.upstream_id
      LEFT JOIN oc_saved_view_members m ON m.view_id=v.id AND m.user_id=$2::uuid
      WHERE v.timeline_id=$1 AND (v.owner_id=$2::uuid OR m.user_id IS NOT NULL OR v.visibility='public'
        OR EXISTS(SELECT 1 FROM oc_users a WHERE a.id=$3::uuid AND a.is_admin AND NOT a.is_disabled))
      ORDER BY lower(v.title),v.id LIMIT 500`,
      [timelineId, userId ?? null, adminId(userId), t.title],
    );
    const defaultId = t.view?.id;
    const views = rows.map((v) => ({ ...this.#shape(v, userId), isDefault: v.id === defaultId }));
    views.sort((a, b) => Number(b.isDefault) - Number(a.isDefault));
    return { views };
  }
  /**
   * `userId`'s own views and those shared with them, of any timeline (or none): templates to
   * copy to another. The 200 most recently changed.
   */
  async mine(userId) {
    if (!userId) throw new HttpError(401, 'Sign in to see your views.');
    const { rows } = await this.pool.query(
      `SELECT v.*,u.username AS owner,t.title AS timeline_title,up.title AS upstream_title,
      CASE WHEN v.owner_id=$1 THEN 'owner' ELSE m.role END AS role
      FROM oc_saved_views v JOIN oc_users u ON u.id=v.owner_id
      LEFT JOIN oc_timelines t ON t.id=v.timeline_id
      LEFT JOIN oc_saved_views up ON up.id=v.upstream_id
      LEFT JOIN oc_saved_view_members m ON m.view_id=v.id AND m.user_id=$1
      WHERE v.owner_id=$1 OR m.user_id IS NOT NULL ORDER BY v.updated_at DESC LIMIT 200`,
      [userId],
    );
    return { views: rows.map((v) => this.#shape(v, userId)) };
  }
  /** Refuses a view of timeline `timelineId` unless `userId` may read it. */
  async #timeline(client, timelineId, userId) {
    if (timelineId === null || timelineId === undefined) return null;
    if (typeof timelineId !== 'string' || !UUID.test(timelineId))
      throw new HttpError(400, 'Choose a timeline by its ID.');
    await this.store.access(timelineId, userId, client, { preparing: true });
    return timelineId;
  }
  /** Inserts a view owned by `userId`, within their limit; returns its ID. */
  async #insert(client, userId, view) {
    const { rows } = await client.query(
      'SELECT count(*)::int AS n FROM oc_saved_views WHERE owner_id=$1',
      [userId],
    );
    if (rows[0].n >= VIEW_LIMIT)
      throw new HttpError(409, `An account keeps at most ${VIEW_LIMIT} views.`);
    const id = randomUUID();
    await client.query(
      `INSERT INTO oc_saved_views(id,owner_id,timeline_id,title,description,visibility,separation,upstream_id)
      VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,$8)`,
      [
        id,
        userId,
        view.timelineId,
        view.title,
        view.description,
        view.visibility,
        JSON.stringify(view.separation),
        view.upstreamId ?? null,
      ],
    );
    return id;
  }
  /** Saves a new view: `{timeline, title, description?, visibility?, separation}`. */
  async create(userId, input) {
    if (!userId) throw new HttpError(401, 'Sign in to save views.');
    const { title, description } = textOf(input?.title, input?.description);
    const separation = separationOf(input?.separation);
    const visibility = visibilityOf(input?.visibility) ?? 'private';
    const id = await this.store.transaction(async (c) =>
      this.#insert(c, userId, {
        timelineId: await this.#timeline(c, input?.timeline, userId),
        title,
        description,
        visibility,
        separation,
      }),
    );
    return this.get(id, userId);
  }
  /**
   * Changes a view: its title, description and separation, and its timeline (reassigning it:
   * to one `userId` may read), for its owner and editors; its visibility for its owner.
   */
  async update(id, userId, input) {
    await this.store.transaction(async (c) => {
      const view = await this.#read(c, id, userId);
      const shaped = this.#shape(view, userId);
      if (!shaped.canEdit) throw new HttpError(403, 'Only the view’s owner and editors change it.');
      if (input?.visibility !== undefined && !shaped.canShare)
        throw new HttpError(403, 'Only the view’s owner makes it public or private.');
      const { title, description } = textOf(
        input?.title ?? view.title,
        input?.description ?? view.description,
      );
      const separation =
        input?.separation === undefined ? view.separation : separationOf(input.separation);
      const timelineId =
        input?.timeline === undefined
          ? view.timeline_id
          : await this.#timeline(c, input.timeline, userId);
      await c.query(
        `UPDATE oc_saved_views SET title=$2,description=$3,separation=$4::jsonb,timeline_id=$5,
        visibility=$6,updated_at=now() WHERE id=$1`,
        [
          id,
          title,
          description,
          JSON.stringify(separation),
          timelineId,
          visibilityOf(input?.visibility) ?? view.visibility,
        ],
      );
    });
    await this.#defaultsChanged(id);
    return this.get(id, userId);
  }
  /** Deletes a view: its owner. Timelines that opened in it keep their own copy. */
  async remove(id, userId) {
    await this.store.transaction(async (c) => {
      const view = await this.#read(c, id, userId);
      if (!this.#shape(view, userId).canShare)
        throw new HttpError(403, 'Only the view’s owner deletes it.');
      await c.query('DELETE FROM oc_saved_views WHERE id=$1', [id]);
    });
    await this.#defaultsChanged(id);
    return { ok: true };
  }
  /**
   * A private copy of a view for `userId`: forked (remembering the view it came from, for one
   * they do not own) or duplicated; of its timeline, or of `input.timeline` (reassigned), with
   * `input.title` or the view's own.
   */
  async copy(id, userId, input, { fork }) {
    if (!userId) throw new HttpError(401, 'Sign in to copy views.');
    const copied = await this.store.transaction(async (c) => {
      const view = await this.#read(c, id, userId);
      if (fork && view.owner_id === userId)
        throw new HttpError(400, 'Duplicate your own view instead of forking it.');
      const { title, description } = textOf(input?.title ?? view.title, view.description);
      return this.#insert(c, userId, {
        timelineId:
          input?.timeline === undefined
            ? await this.#timeline(c, view.timeline_id, userId).catch(() => null)
            : await this.#timeline(c, input.timeline, userId),
        title,
        description,
        visibility: 'private',
        separation: view.separation,
        upstreamId: fork ? view.id : null,
      });
    });
    return this.get(copied, userId);
  }
  /** Those a view is shared with, for those who may read it. */
  async members(id, userId) {
    const view = await this.#read(this.pool, id, userId);
    const { rows } = await this.pool.query(
      'SELECT u.username,m.role FROM oc_saved_view_members m JOIN oc_users u ON u.id=m.user_id WHERE m.view_id=$1 ORDER BY u.username',
      [view.id],
    );
    return { members: rows };
  }
  /** Shares a view with an account (or changes its role), or stops: its owner. */
  async setMember(id, userId, input, { remove = false } = {}) {
    await this.store.transaction(async (c) => {
      const view = await this.#read(c, id, userId);
      if (!this.#shape(view, userId).canShare)
        throw new HttpError(403, 'Only the view’s owner shares it.');
      const { rows } = await c.query('SELECT id FROM oc_users WHERE username=$1', [
        typeof input?.username === 'string' ? input.username.toLowerCase() : null,
      ]);
      const member = rows[0];
      if (!member) throw new HttpError(404, 'That account does not exist.');
      if (member.id === view.owner_id) throw new HttpError(400, 'The owner keeps owner access.');
      if (remove)
        await c.query('DELETE FROM oc_saved_view_members WHERE view_id=$1 AND user_id=$2', [
          id,
          member.id,
        ]);
      else {
        if (!['viewer', 'editor'].includes(input?.role))
          throw new HttpError(400, 'Choose viewer or editor.');
        await c.query(
          'INSERT INTO oc_saved_view_members(view_id,user_id,role) VALUES($1,$2,$3) ON CONFLICT(view_id,user_id) DO UPDATE SET role=excluded.role',
          [id, member.id, input.role],
        );
      }
    });
    return this.members(id, userId);
  }
  /** Downloads of timelines that open in view `id` are made again, with it as it is now. */
  async #defaultsChanged(id) {
    if (!this.exportCache) return;
    const { rows } = await this.pool.query("SELECT id FROM oc_timelines WHERE view->>'id'=$1", [
      id,
    ]);
    for (const { id: timeline } of rows) await this.exportCache.forget(timeline);
  }
}

/**
 * The views a file keeps (`document.views`, #550) as `userId`'s saved views of new timeline
 * `timelineId` (private), in `client`'s transaction; returns the document without them, its
 * default view naming the saved view made from the one it named.
 */
export async function adoptFileViews(client, timelineId, userId, document) {
  if (!document.views?.length) {
    if (!document.views) return document;
    const { views: _views, ...rest } = document;
    return rest;
  }
  const { rows } = await client.query(
    'SELECT count(*)::int AS n FROM oc_saved_views WHERE owner_id=$1',
    [userId],
  );
  const room = Math.max(0, VIEW_LIMIT - rows[0].n);
  const ids = new Map();
  for (const view of document.views.slice(0, room)) {
    const id = randomUUID();
    ids.set(view.id, id);
    await client.query(
      `INSERT INTO oc_saved_views(id,owner_id,timeline_id,title,description,separation)
      VALUES($1,$2,$3,$4,$5,$6::jsonb)`,
      [id, userId, timelineId, view.title, view.description ?? '', JSON.stringify(view.separation)],
    );
  }
  const { views: _views, view, ...rest } = document;
  if (!view) return rest;
  const { id: named, ...copy } = view;
  return { ...rest, view: named && ids.has(named) ? { id: ids.get(named), ...copy } : copy };
}

/**
 * A saved default view's ID, kept only when it names a view of timeline `timelineId` that
 * `userId` may read; otherwise the default is its separation alone.
 */
export async function checkedViewReference(client, timelineId, userId, view) {
  if (!view?.id) return view;
  const { id, ...copy } = view;
  if (!UUID.test(id)) return copy;
  const { rows } = await client.query(
    `SELECT 1 FROM oc_saved_views v WHERE v.id=$1 AND v.timeline_id=$2 AND (v.owner_id=$3::uuid
      OR v.visibility='public' OR EXISTS(SELECT 1 FROM oc_saved_view_members m WHERE m.view_id=v.id AND m.user_id=$3::uuid))`,
    [id, timelineId, userId ?? null],
  );
  return rows.length ? view : copy;
}
