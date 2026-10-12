// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// Public timelines, most recently changed first, and the profiles that own them. Moments are
// reached from their timelines' pages, which link to them.
import { platformServices } from '../../server/platform.mjs';
import { siteOrigin } from '../lib/sharing.js';
export const dynamic = 'force-dynamic';
/** A sitemap holds at most 50,000 addresses. */
const TIMELINES = 45000,
  PROFILES = 4000;
export default async function sitemap() {
  const origin = siteOrigin();
  const pages = [
    { url: origin + '/', changeFrequency: 'daily' },
    { url: origin + '/plugins', changeFrequency: 'weekly' },
  ];
  let pool;
  try {
    ({ pool } = await platformServices());
  } catch {
    return pages;
  }
  if (!pool) return pages;
  const [timelines, owners] = await Promise.all([
    pool.query(
      `SELECT id,updated_at FROM oc_timelines WHERE visibility='public' ORDER BY updated_at DESC LIMIT $1`,
      [TIMELINES],
    ),
    pool.query(
      `SELECT u.username,max(t.updated_at) AS updated_at FROM oc_users u
      JOIN oc_timelines t ON t.owner_id=u.id AND t.visibility='public'
      WHERE NOT u.is_disabled GROUP BY u.username ORDER BY max(t.updated_at) DESC LIMIT $1`,
      [PROFILES],
    ),
  ]);
  return [
    ...pages,
    ...timelines.rows.map((t) => ({
      url: `${origin}/timelines/${t.id}`,
      lastModified: t.updated_at,
    })),
    ...owners.rows.map((u) => ({
      url: `${origin}/users/${encodeURIComponent(u.username)}`,
      lastModified: u.updated_at,
    })),
  ];
}
