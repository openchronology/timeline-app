// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// Public timelines, most recently changed first, and the profiles that own them, at their
// addresses (#148). Moments are reached from their timelines' pages, which link to them.
import { platformServices } from '../../server/platform.mjs';
import { helpPages } from '../../server/help.mjs';
import { siteOrigin } from '../lib/sharing.js';
import { profilePath, timelinePath } from '../../src/addresses.ts';
export const dynamic = 'force-dynamic';
/** A sitemap holds at most 50,000 addresses. */
const TIMELINES = 45000,
  PROFILES = 4000;
export default async function sitemap() {
  const origin = siteOrigin();
  const pages = [
    { url: origin + '/', changeFrequency: 'daily' },
    { url: origin + '/plugins', changeFrequency: 'weekly' },
    { url: origin + '/download', changeFrequency: 'weekly' },
    { url: origin + '/docs/api', changeFrequency: 'weekly' },
    { url: origin + '/help', changeFrequency: 'weekly' },
    { url: origin + '/terms', changeFrequency: 'monthly' },
    { url: origin + '/privacy', changeFrequency: 'monthly' },
    { url: origin + '/legal', changeFrequency: 'monthly' },
    // The help's pages (#172).
    ...[...(await helpPages().catch(() => new Map())).keys()].map((slug) => ({
      url: `${origin}/help/${slug}`,
      changeFrequency: 'weekly',
    })),
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
      `SELECT t.id,t.slug,u.username AS owner,t.updated_at FROM oc_timelines t JOIN oc_users u ON u.id=t.owner_id
      WHERE t.visibility='public' ORDER BY t.updated_at DESC LIMIT $1`,
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
      url: origin + timelinePath(t),
      lastModified: t.updated_at,
    })),
    ...owners.rows.map((u) => ({
      url: origin + profilePath(u.username),
      lastModified: u.updated_at,
    })),
  ];
}
