// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
import { HttpError } from './store.mjs';
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
    const actor = await client.query(
      'SELECT id FROM oc_users WHERE id=$1 AND NOT is_disabled FOR KEY SHARE',
      [userId],
    );
    if (!actor.rowCount) throw new HttpError(401, 'Sign in to star timelines.');
    // Serialize visibility changes and star mutations before checking access.
    await client.query('SELECT id FROM oc_timelines WHERE id=$1 FOR UPDATE', [id]);
    await store.access(id, userId, client);
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
