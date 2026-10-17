// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
/**
 * Starring timelines (POST /api/timelines/:id/star). A star is a reader's favorite, counted on
 * the timeline (oc_timelines.star_count, kept by the trigger oc_star_count in schema.sql) and
 * weighed by the reader's standing in its popularity (standing.mjs; docs/browsing.md).
 */
import { HttpError } from './store.mjs';
import { refreshAccounts, refreshPopularity } from './standing.mjs';
/**
 * Stars or unstars timeline `id` for `userId`: `value` is `{starred}`. Idempotent: starring
 * twice or unstarring what was not starred changes nothing. 401 when signed out or suspended;
 * 404 unless the reader may see the timeline.
 *
 * In one transaction: writes the star, recomputes the timeline's popularity and its owner's
 * standing (a star may endorse them), and reads the new count.
 * @param {import('pg').Pool} pool
 * @param {import('./store.mjs').PostgresStore} store for the access check
 * @returns {Promise<{starred: boolean, star_count: string}>} the count as a bigint string
 */
export async function setTimelineStar(pool, store, id, userId, value) {
  if (!userId) throw new HttpError(401, 'Sign in to star timelines.');
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).some((key) => key !== 'starred') ||
    typeof value.starred !== 'boolean'
  )
    throw new HttpError(400, 'Expected a starred boolean.');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // The reader's row with a KEY SHARE lock: enough to keep it from being deleted while the
    // star (which references it) is written, without blocking updates to other columns.
    const actor = await client.query(
      'SELECT id FROM oc_users WHERE id=$1 AND NOT is_disabled FOR KEY SHARE',
      [userId],
    );
    if (!actor.rowCount) throw new HttpError(401, 'Sign in to star timelines.');
    // Serialize visibility changes and star mutations before checking access: with the
    // timeline row locked, it cannot turn private between the access check and the star.
    await client.query('SELECT id FROM oc_timelines WHERE id=$1 FOR UPDATE', [id]);
    const timeline = await store.access(id, userId, client);
    // ON CONFLICT DO NOTHING on the (user, timeline) key makes a repeated star a no-op.
    if (value.starred)
      await client.query(
        'INSERT INTO oc_timeline_stars(user_id,timeline_id) VALUES($1,$2) ON CONFLICT DO NOTHING',
        [userId, id],
      );
    else
      await client.query('DELETE FROM oc_timeline_stars WHERE user_id=$1 AND timeline_id=$2', [
        userId,
        id,
      ]);
    // Its popularity at once; its owner may now be endorsed (#103; standing.mjs).
    await refreshPopularity(client, [id]);
    await refreshAccounts(client, [timeline.owner_id]);
    // The count after the trigger ran, within this transaction.
    const { rows } = await client.query('SELECT star_count FROM oc_timelines WHERE id=$1', [id]);
    await client.query('COMMIT');
    return { starred: value.starred, star_count: rows[0].star_count };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
