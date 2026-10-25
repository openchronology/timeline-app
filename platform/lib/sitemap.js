// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// The sitemap (#148, #287): an index at /sitemap.xml naming its pages under /sitemap/ — the
// site's own pages, then every public timeline and every profile that owns one, however many,
// a page at a time.
import { platformServices } from '../../server/platform.mjs';
import { helpPages } from '../../server/help.mjs';
import { siteOrigin } from './sharing.js';
import { profilePath, timelinePath } from '../../src/addresses.ts';

/**
 * Addresses per page. A sitemap may hold 50,000 addresses and 50 MB; 45,000 of these stay well
 * under both. SITEMAP_PAGE_SIZE lowers it (the tests page through a few timelines).
 */
export function pageSize() {
  const size = Math.floor(Number(process.env.SITEMAP_PAGE_SIZE));
  return size >= 1 && size <= 45000 ? size : 45000;
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
    const [timelines, profiles] = await Promise.all([
      pool.query(starts(TIMELINES), [size]),
      pool.query(starts(PROFILES), [size]),
    ]);
    for (const [kind, result] of [
      ['timelines', timelines],
      ['profiles', profiles],
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
 * /sitemap/<file>: `pages.xml` (the site's own pages and the help), `timelines-<id>.xml` or
 * `profiles-<id>.xml` (a page of them, from that ID on). Anything else is not found.
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
  const match = /^(timelines|profiles)-(.+)\.xml$/.exec(file);
  const pool = match && UUID.test(match[2]) ? await database() : null;
  if (!pool) return xml('<error>Not found</error>', 404);
  const [, kind, start] = match,
    size = pageSize();
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
