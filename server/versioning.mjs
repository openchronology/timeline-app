// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
/**
 * Forks and duplicates, syncing a fork with its upstream, and reading saved history: the
 * Versioning service the HTTP routes call. Revisions form a DAG in oc_revision_parents
 * (position 0 the revision one follows, 1 the one merged into it); a copy shares its
 * source's history and index instead of copying them (history.mjs, index-versions.mjs).
 * See "Saved revisions and fork ancestry" in docs/architecture.md.
 */
import { randomUUID } from 'node:crypto';
import { HttpError, HISTORY_OFF } from './store.mjs';
import { timelineSettings } from './incremental.mjs';
import { rebaseDocument, mergePatch } from './merge.mjs';
import { shareHistory, settingsAt, settingsOf } from './history.mjs';
/** Why a fork cannot be synced with an upstream that keeps no saved history. */
export const SYNC_UNAVAILABLE =
  'Upstream does not keep saved history, so the revision this fork last shared with it is gone and the two cannot be merged. Fork upstream again to start from its current state.';
const uuid = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
/**
 * `value` checked as a revision counter (oc_timelines.revision) sent as a decimal string:
 * positive and within a bigint. Returns it; throws 400 otherwise.
 */
export function expectedRevision(value) {
  if (
    typeof value !== 'string' ||
    !/^[1-9][0-9]{0,18}$/.test(value) ||
    BigInt(value) > 9223372036854775807n
  )
    throw new HttpError(400, 'Expected a revision string.');
  return value;
}
/** `value` checked as a saved revision's ID (a UUID). Returns it; throws 400 otherwise. */
export function revisionId(value) {
  if (typeof value !== 'string' || !uuid.test(value))
    throw new HttpError(400, 'Expected a saved revision ID.');
  return value;
}
/**
 * Locks the rows of timelines `ids` (FOR UPDATE) until the transaction ends, so no save,
 * sync or fork of them runs meanwhile. In ID order: two transactions locking overlapping
 * sets take the locks in the same order and so cannot deadlock.
 */
export async function lockTimelines(client, ids) {
  await client.query(
    'SELECT id FROM oc_timelines WHERE id=ANY($1::uuid[]) ORDER BY id FOR UPDATE',
    [[...new Set(ids)]],
  );
}
/**
 * The nearest common ancestor of saved revisions `left` and `right` (each its own ancestor).
 * Throws 409 when they have none, or several that are not ancestors of one another (criss-
 * cross merges), which an automatic merge would have to choose between.
 */
export async function commonAncestor(client, left, right) {
  // `a` and `b` walk every ancestor of each side through oc_revision_parents (by its
  // primary key, revision_id first); UNION removes duplicates, so shared ancestry is walked
  // once and the walk ends. `common` is what both reach; `older` every ancestor of those.
  // The common ancestors that are no other's ancestor are the nearest; LIMIT 2 is enough to
  // tell one from several.
  const { rows } = await client.query(
    `WITH RECURSIVE
    a(id) AS (SELECT $1::uuid UNION SELECT p.parent_id FROM oc_revision_parents p JOIN a ON p.revision_id=a.id),
    b(id) AS (SELECT $2::uuid UNION SELECT p.parent_id FROM oc_revision_parents p JOIN b ON p.revision_id=b.id),
    common(id) AS (SELECT id FROM a INTERSECT SELECT id FROM b),
    older(id) AS (SELECT p.parent_id FROM oc_revision_parents p JOIN common c ON c.id=p.revision_id
      UNION SELECT p.parent_id FROM oc_revision_parents p JOIN older o ON o.id=p.revision_id)
    SELECT id FROM common WHERE id NOT IN (SELECT id FROM older) LIMIT 2`,
    [left, right],
  );
  if (rows.length !== 1)
    throw new HttpError(
      409,
      rows.length
        ? 'Multiple common ancestors need explicit reconciliation.'
        : 'These timelines have no common ancestor.',
    );
  return rows[0].id;
}
export class Versioning {
  /** `store` the Store (its pool, transactions and timeline operations). */
  constructor(store) {
    this.store = store;
    this.pool = store.pool;
  }
  /**
   * Forks timeline `id` (or, with `duplicate`, copies it without ancestry) for `userId`, as
   * of revision counter `input.revision`, which must be current (409 otherwise). Returns the
   * new timeline as access gives it. The source stays locked while copied: its history is
   * shared (shareHistory) and its index read through to (shareIndex), or, when it cannot
   * be, rebuilt from the head's document; the copy's first revision then records it.
   * Throws 401 when signed out, 400 for a malformed request, 403 when forking is not allowed.
   */
  async copy(id, userId, input, duplicate = false) {
    if (!userId) throw new HttpError(401, 'Sign in to fork a timeline.');
    if (!input || Object.keys(input).some((k) => k !== 'revision'))
      throw new HttpError(400, 'Provide the current timeline revision.');
    expectedRevision(input.revision);
    const newId = randomUUID();
    await this.store.transaction(async (c) => {
      await lockTimelines(c, [id]);
      const upstream = await this.store.access(id, userId, c);
      if (!upstream.canFork)
        throw new HttpError(403, 'The owner must enable forking for this private timeline.');
      if (upstream.revision !== input.revision)
        throw new HttpError(409, 'Timeline changed. Reload before copying.');
      // A copy keeps saved history if its source does. A fork records its upstream and the
      // revision it was made from; a copy of a private or restricted timeline cannot be
      // published.
      await c.query(
        `INSERT INTO oc_timelines(id,owner_id,title,upstream_id,fork_base_revision_id,publication_restricted,keep_history)
        VALUES($1,$2,$3,$4,$5,$6,$7)`,
        [
          newId,
          userId,
          upstream.title,
          duplicate ? null : id,
          duplicate ? null : upstream.head_revision_id,
          upstream.visibility === 'private' || upstream.publication_restricted,
          upstream.keep_history,
        ],
      );
      // Its history reads through to the revision it copies, instead of copying it.
      if (upstream.keep_history) await shareHistory(c, newId, upstream.head_revision_id);
      // Its index is upstream's (its head), read through to (past INDEX_LEVELS, partly
      // copied: for many rows after answering, while the copy is marked as being prepared).
      // Its settings are the head's as saved (as they stand, when upstream keeps no saved
      // history). Otherwise it is rebuilt from the head's document.
      const settings = upstream.keep_history
        ? await settingsAt(c, upstream.head_revision_id)
        : settingsOf(timelineSettings(upstream));
      let document;
      if (settings && (await this.store.shareIndex(c, id, newId, upstream.head_revision_id)))
        c.afterCommit ??= () => this.store.refreshText(newId);
      else {
        document = await this.store.revisionDocument(c, upstream.head_revision_id);
        await this.store.replace(c, newId, document);
      }
      await this.store.checkpoint(
        c,
        newId,
        userId,
        document ?? settings,
        duplicate ? 'duplicate' : 'fork',
        duplicate ? [] : [upstream.head_revision_id],
      );
    });
    return this.store.access(newId, userId, this.pool, { preparing: true });
  }
  /**
   * Merges what fork `id`'s upstream saved since their common ancestor into the fork, as
   * of the fork's revision counter `input.revision` (409 when it changed). Both timelines are
   * locked (lockTimelines) and re-read once locked. Returns the fork as access gives it.
   * Throws 409 without an upstream, when upstream changed, or when the common ancestor's
   * content is gone (SYNC_UNAVAILABLE); 403 without write access or to sync private data
   * into a public fork.
   */
  async sync(id, userId, input) {
    expectedRevision(input?.revision);
    return this.store.transaction(async (c) => {
      const initial = await this.store.access(id, userId, c);
      if (!initial.upstream_id)
        throw new HttpError(409, 'This timeline has no available upstream.');
      await lockTimelines(c, [id, initial.upstream_id]);
      const fork = await this.store.access(id, userId, c);
      if (!fork.canWrite) throw new HttpError(403, 'Write access to the fork is required.');
      if (fork.revision !== input.revision)
        throw new HttpError(409, 'Your fork changed. Reload before syncing.');
      if (fork.upstream_id !== initial.upstream_id)
        throw new HttpError(409, 'Upstream changed. Reload before syncing.');
      const upstream = await this.store.access(fork.upstream_id, userId, c);
      if (upstream.visibility === 'private' && fork.visibility === 'public')
        throw new HttpError(403, 'Private upstream data cannot be synced into a public fork.');
      const base = await commonAncestor(c, fork.head_revision_id, upstream.head_revision_id);
      // Upstream saved nothing the fork lacks: nothing to merge.
      if (base === upstream.head_revision_id) return this.store.access(id, userId, c);
      if (!(await this.store.readable(c, base))) throw new HttpError(409, SYNC_UNAVAILABLE);
      const parents = [fork.head_revision_id, upstream.head_revision_id];
      // What upstream changed since the common ancestor, merged into the fork entity by
      // entity and applied as a save; or, from revisions saved before history was kept as
      // rows, as merged documents.
      const patch = await mergePatch(c, id, {
        baseId: base,
        otherId: upstream.head_revision_id,
        headId: fork.head_revision_id,
      });
      if (patch) await this.store.applyMerge(c, fork, userId, patch, 'sync', parents);
      else {
        const document = rebaseDocument(
          await this.store.revisionDocument(c, base),
          await this.store.revisionDocument(c, fork.head_revision_id),
          await this.store.revisionDocument(c, upstream.head_revision_id),
        );
        await this.store.replace(c, id, document);
        await c.query('UPDATE oc_timelines SET revision=revision+1 WHERE id=$1', [id]);
        await this.store.checkpoint(c, id, userId, document, 'sync', parents);
      }
      // Private or restricted upstream content now in the fork keeps it from being published.
      await c.query(
        'UPDATE oc_timelines SET publication_restricted=publication_restricted OR $2 WHERE id=$1',
        [id, upstream.visibility === 'private' || upstream.publication_restricted],
      );
      return this.store.access(id, userId, c);
    });
  }
  /**
   * Why fork `id` cannot be synced with its upstream now, or null when it can (or has nothing
   * to sync): the revision they last shared is not kept, because upstream keeps no saved
   * history.
   */
  async syncBlocked(id, userId) {
    const fork = await this.store.access(id, userId);
    if (!fork.upstream_id) return null;
    const upstream = await this.store.access(fork.upstream_id, userId);
    let base;
    try {
      base = await commonAncestor(this.pool, fork.head_revision_id, upstream.head_revision_id);
    } catch {
      return null;
    }
    if (base === upstream.head_revision_id || (await this.store.readable(this.pool, base)))
      return null;
    return SYNC_UNAVAILABLE;
  }
  /**
   * A page of timeline `id`'s saved revisions, newest first. `available` says whether one
   * can be read: not a past one whose content is not kept (see Store.stopHistory).
   */
  async history(id, userId, page = 1) {
    if (!Number.isSafeInteger(page) || page < 1 || page > 10000)
      throw new HttpError(400, 'Invalid history page.');
    const t = await this.store.access(id, userId);
    // The timeline's numbered revisions, newest first (by the unique key timeline_id,
    // number, read backwards), 21 to tell whether another page follows; each with its
    // author's name and its parents in order. A revision is available when its content is
    // kept (a snapshot, a patch or rows) or it is the head, read from the live index.
    const { rows } = await this.pool.query(
      `SELECT r.id,r.number,r.kind,r.created_at,u.username AS author,
      coalesce((SELECT jsonb_agg(p.parent_id ORDER BY p.position) FROM oc_revision_parents p WHERE p.revision_id=r.id),'[]'::jsonb) AS parents,
      num_nonnulls(r.snapshot_id,r.patch)+r.history_rows::int>0 OR r.id=$3 AS available
      FROM oc_revisions r LEFT JOIN oc_users u ON u.id=r.author_id
      WHERE r.timeline_id=$1 AND r.number IS NOT NULL ORDER BY r.number DESC LIMIT 21 OFFSET $2`,
      [id, (page - 1) * 20, t.head_revision_id],
    );
    return {
      revisions: rows.slice(0, 20),
      page,
      more: rows.length > 20,
      keepHistory: t.keep_history,
    };
  }
  /**
   * Whether timeline `id` has saved revision `savedId` that `userId` may read: false when it
   * has none; HttpError 409 when it is not kept (see Store.stopHistory).
   */
  async historyRevision(id, savedId, userId) {
    revisionId(savedId);
    await this.store.access(id, userId);
    // Only a numbered revision of this timeline: not a pull request's source, nor another
    // timeline's revision reached through its ID.
    const { rows } = await this.pool.query(
      'SELECT id FROM oc_revisions WHERE timeline_id=$1 AND id=$2 AND number IS NOT NULL',
      [id, savedId],
    );
    if (!rows.length) return false;
    if (!(await this.store.readable(this.pool, savedId))) throw new HttpError(409, HISTORY_OFF);
    return true;
  }
  /** Saved revision `savedId` of timeline `id`, as a whole document (see historyRevision). */
  async historical(id, savedId, userId) {
    if (!(await this.historyRevision(id, savedId, userId)))
      throw new HttpError(404, 'Saved revision unavailable.');
    return { document: await this.store.revisionDocument(this.pool, savedId) };
  }
}
