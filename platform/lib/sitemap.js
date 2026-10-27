// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// The sitemap (#148, #287, #335): an index at /sitemap.xml naming its pages under /sitemap/ —
// the site's own pages, then every public timeline, every profile that owns one, and the
// moments and durations of the public timelines small enough to list, however many, a page at
// a time.
import { platformServices } from '../../server/platform.mjs';
import { helpPages } from '../../server/help.mjs';
import { sharedPath, siteOrigin } from './sharing.js';
import { profilePath, timelinePath } from '../../src/addresses.ts';

/**
 * Addresses per page. A sitemap may hold 50,000 addresses and 50 MB; 45,000 of these stay well
 * under both. SITEMAP_PAGE_SIZE lowers it (the tests page through a few timelines).
 */
export function pageSize() {
  const size = Math.floor(Number(process.env.SITEMAP_PAGE_SIZE));
  return size >= 1 && size <= 45000 ? size : 45000;
}
/**
 * The most moments and durations a timeline's entity pages may list (#335):
 * SITEMAP_TIMELINE_ENTITIES, 5,000 unless set (1 to 45,000). A timeline with more moments
 * than this is left out of the entity sitemap altogether (a log import can have millions,
 * which are not pages anyone searches for one by one); one with fewer moments lists its
 * first this many entities, durations first.
 */
export function timelineEntityLimit() {
  const limit = Math.floor(Number(process.env.SITEMAP_TIMELINE_ENTITIES));
  return limit >= 1 && limit <= 45000 ? limit : 5000;
}
/**
 * How many timelines' entities share one page: as many as fit in a page (pageSize) at the
 * limit each, and at least one. A page then holds at most the larger of the two, 45,000
 * addresses at most, which keeps it within the protocol's 50,000 and 50 MB.
 */
function entityTimelinesPerPage() {
  return Math.max(1, Math.floor(pageSize() / timelineEntityLimit()));
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const escape = (text) =>
  String(text).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c],
  );
const date = (value) => (value ? new Date(value).toISOString() : null);

/** An XML response, never cached by a shared cache: it changes as timelines do. */
export function xml(body, status = 200) {
  return new Response(`<?xml version="1.0" encoding="UTF-8"?>\n${body}\n`, {
    status,
    headers: {
      'content-type': 'application/xml; charset=utf-8',
      'cache-control': 'public, max-age=0, must-revalidate',
    },
  });
}

async function database() {
  try {
    return (await platformServices()).pool ?? null;
  } catch {
    return null;
  }
}

// Public timelines and the profiles that own one, numbered in ID order. Each page starts at
// the ID of its first entry, so a page is read by an index range (`id >= start`) rather than
// by skipping rows, and the index reads every ID once.
const TIMELINES = `SELECT t.id, t.updated_at FROM oc_timelines t WHERE t.visibility='public'`;
// Timelines whose moments and durations are listed (#335): public (a restricted timeline is
// made private), without sensitive-content labels (their previews show nothing of them), not
// a comparison (its entities are its sources') or a copy still being prepared, and with at
// most $2 moments (event_count is kept on the row, so this reads no entities).
const ENTITY_TIMELINES = `SELECT t.id, t.updated_at FROM oc_timelines t WHERE t.visibility='public'
  AND t.content_labels='{}' AND t.moderator_labels='{}' AND t.comparison IS NULL
  AND t.preparing_revision_id IS NULL AND t.event_count <= $2`;
const PROFILES = `SELECT u.id, max(t.updated_at) AS updated_at FROM oc_users u
  JOIN oc_timelines t ON t.owner_id=u.id AND t.visibility='public'
  WHERE NOT u.is_disabled GROUP BY u.id`;
const starts = (rows) => `WITH r AS (${rows}), n AS (
    SELECT id, updated_at, row_number() OVER (ORDER BY id) - 1 AS n FROM r)
  SELECT (array_agg(id) FILTER (WHERE n % $1 = 0))[1] AS start, max(updated_at) AS updated_at
  FROM n GROUP BY n / $1 ORDER BY n / $1`;

/** /sitemap.xml: the sitemap index. */
export async function sitemapIndex() {
  const origin = siteOrigin(),
    pool = await database(),
    size = pageSize();
  const entries = [{ path: '/sitemap/pages.xml' }];
  if (pool) {
    const [timelines, profiles, entities] = await Promise.all([
      pool.query(starts(TIMELINES), [size]),
      pool.query(starts(PROFILES), [size]),
      pool.query(starts(ENTITY_TIMELINES), [entityTimelinesPerPage(), timelineEntityLimit()]),
    ]);
    for (const [kind, result] of [
      ['timelines', timelines],
      ['profiles', profiles],
      ['entities', entities],
    ])
      for (const row of result.rows)
        entries.push({ path: `/sitemap/${kind}-${row.start}.xml`, updated: row.updated_at });
  }
  return xml(
    `<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries
      .map(
        (e) =>
          `<sitemap><loc>${escape(origin + e.path)}</loc>${
            e.updated ? `<lastmod>${date(e.updated)}</lastmod>` : ''
          }</sitemap>`,
      )
      .join('\n')}\n</sitemapindex>`,
  );
}

function urlset(origin, entries) {
  return xml(
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries
      .map(
        (e) =>
          `<url><loc>${escape(origin + e.path)}</loc>${
            e.updated ? `<lastmod>${date(e.updated)}</lastmod>` : ''
          }${e.frequency ? `<changefreq>${e.frequency}</changefreq>` : ''}</url>`,
      )
      .join('\n')}\n</urlset>`,
  );
}

/**
 * /sitemap/<file>: `pages.xml` (the site's own pages and the help), `timelines-<id>.xml`,
 * `profiles-<id>.xml` (a page of them, from that ID on) or `entities-<id>.xml` (the moments
 * and durations of a page of timelines, from that timeline's ID on). Anything else is not
 * found.
 */
export async function sitemapPage(file) {
  const origin = siteOrigin();
  if (file === 'pages.xml') {
    const pages = [
      ['/', 'daily'],
      ['/plugins', 'weekly'],
      ['/download', 'weekly'],
      ['/docs/api', 'weekly'],
      ['/help', 'weekly'],
      ['/terms', 'monthly'],
      ['/privacy', 'monthly'],
      ['/legal', 'monthly'],
    ].map(([path, frequency]) => ({ path, frequency }));
    // The help's pages (#172).
    for (const slug of (await helpPages().catch(() => new Map())).keys())
      pages.push({ path: '/help/' + slug, frequency: 'weekly' });
    return urlset(origin, pages);
  }
  const match = /^(timelines|profiles|entities)-(.+)\.xml$/.exec(file);
  const pool = match && UUID.test(match[2]) ? await database() : null;
  if (!pool) return xml('<error>Not found</error>', 404);
  const [, kind, start] = match,
    size = pageSize();
  if (kind === 'entities') return entityPage(origin, pool, start);
  if (kind === 'timelines') {
    const { rows } = await pool.query(
      `SELECT t.id, t.slug, u.username AS owner, t.updated_at FROM oc_timelines t
      JOIN oc_users u ON u.id=t.owner_id
      WHERE t.visibility='public' AND t.id >= $1 ORDER BY t.id LIMIT $2`,
      [start, size],
    );
    return urlset(
      origin,
      rows.map((t) => ({ path: timelinePath(t), updated: t.updated_at })),
    );
  }
  const { rows } = await pool.query(
    `SELECT u.id, u.username, max(t.updated_at) AS updated_at FROM oc_users u
    JOIN oc_timelines t ON t.owner_id=u.id AND t.visibility='public'
    WHERE NOT u.is_disabled AND u.id >= $1 GROUP BY u.id ORDER BY u.id LIMIT $2`,
    [start, size],
  );
  return urlset(
    origin,
    rows.map((u) => ({ path: profilePath(u.username), updated: u.updated_at })),
  );
}

/**
 * A page of moment and duration pages (#335): the next few listed timelines from `start` on
 * (see ENTITY_TIMELINES), and for each its first entities, read by their key through the
 * store as a guest sees them, so a timeline made private since the index was read lists none.
 * Each has its timeline's last change, as entities keep no time of their own.
 */
async function entityPage(origin, pool, start) {
  const limit = timelineEntityLimit();
  const { rows } = await pool.query(
    `SELECT t.id, t.slug, u.username AS owner, t.updated_at FROM (${ENTITY_TIMELINES}) l
    JOIN oc_timelines t ON t.id=l.id JOIN oc_users u ON u.id=t.owner_id
    WHERE t.id >= $1 ORDER BY t.id LIMIT $3`,
    [start, limit, entityTimelinesPerPage()],
  );
  const { store } = await platformServices();
  const entries = [];
  for (const timeline of rows) {
    const keys = await store.entityKeys(timeline.id, limit).catch((error) => {
      // Gone, private or still being prepared since: nothing of it is listed.
      if (error.status === 404 || error.status === 409) return [];
      throw error;
    });
    for (const entity of keys)
      entries.push({ path: sharedPath(timeline, entity), updated: timeline.updated_at });
  }
  return urlset(origin, entries);
}
