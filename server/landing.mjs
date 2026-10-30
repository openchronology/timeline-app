// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
/**
 * The landing page and the pages for each audience (#379), behind LANDING_PAGE: the switch,
 * where the timeline browser is, each page's copy (Markdown in platform/content/landing/, or
 * the operator's LANDING_CONTENT_DIR), its example timelines (LANDING_EXAMPLES_<AUDIENCE>)
 * and its video (LANDING_VIDEO_<AUDIENCE>), and reading those examples as guests see them.
 */
import { readFile, stat } from 'node:fs/promises';
import { statSync } from 'node:fs';
import { resolve } from 'node:path';
import { SiteError } from './site.mjs';
import { renderMarkdown } from './help.mjs';
import { withShapes } from './collaboration.mjs';
import { SLUG, USERNAME } from '../dist/core.mjs';

/**
 * The audiences, in the order the landing page lists them: each has a page at /for/<key>,
 * a Markdown file <key>.md, and settings ending in its key in capitals.
 */
export const AUDIENCES = [
  'educators',
  'researchers',
  'investigators',
  'operations',
  'writers',
  'developers',
];
/** The pages with copy, examples and a video: the landing page (`home`) and each audience. */
const PAGES = new Set(['home', ...AUDIENCES]);
/** How many example timelines a page shows at most. */
export const EXAMPLE_LIMIT = 6;
/** How many featured timelines stand in when a page names none. */
export const FEATURED_EXAMPLES = 3;

/** Whether the landing page is on: LANDING_PAGE is 1, true or yes. Off by default. */
export function landingEnabled(env = process.env) {
  return /^(1|true|yes)$/i.test((env.LANDING_PAGE ?? '').trim());
}
/** Where the timeline browser is: /explore with the landing page on, else the home page. */
export function browserPath(env = process.env) {
  return landingEnabled(env) ? '/explore' : '/';
}
/** A page's setting: `LANDING_<NAME>` for the landing page, `LANDING_<NAME>_<AUDIENCE>` else. */
const setting = (name, page) =>
  page === 'home' ? `LANDING_${name}` : `LANDING_${name}_${page.toUpperCase()}`;

/**
 * The timelines a page names as examples, `owner/slug` separated by commas: at most
 * EXAMPLE_LIMIT, each once, lower-cased; anything that is not an address is skipped.
 * @param {string} page `home` or an audience
 * @returns {{owner: string, slug: string}[]}
 */
export function exampleAddresses(page, env = process.env) {
  if (!PAGES.has(page)) return [];
  const seen = new Set(),
    out = [];
  for (const entry of (env[setting('EXAMPLES', page)] ?? '').split(',')) {
    const [owner, slug, ...rest] = entry.trim().replace(/^\/+/, '').toLowerCase().split('/');
    if (rest.length || !USERNAME.test(owner ?? '') || !SLUG.test(slug ?? '')) continue;
    const key = owner + '/' + slug;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ owner, slug });
    if (out.length === EXAMPLE_LIMIT) break;
  }
  return out;
}

/** A YouTube video's ID: eleven letters, digits, `-` and `_`. */
const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
/**
 * The ID of the video at a YouTube address (youtube.com/watch?v=, youtu.be/, /embed/, /shorts/
 * or /live/, on www., m. or youtube-nocookie.com), or null when it names none.
 */
export function youtubeId(value) {
  let url;
  try {
    url = new URL(String(value).trim());
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  const host = url.hostname.toLowerCase().replace(/^(www|m)\./, '');
  let id = null;
  if (host === 'youtu.be') id = url.pathname.slice(1);
  else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    const path = /^\/(?:embed|shorts|live|v)\/([^/]+)\/?$/.exec(url.pathname);
    id = path ? path[1] : url.pathname === '/watch' ? url.searchParams.get('v') : null;
  }
  return id && VIDEO_ID.test(id) ? id : null;
}
/**
 * A page's video (LANDING_VIDEO or LANDING_VIDEO_<AUDIENCE>, a YouTube address): its ID, the
 * page to watch it on, and the privacy-enhanced player it loads when asked to; null when none
 * is set.
 * @throws {SiteError} for an address that names no YouTube video
 */
export function landingVideo(page, env = process.env) {
  if (!PAGES.has(page)) return null;
  const name = setting('VIDEO', page),
    value = (env[name] ?? '').trim();
  if (!value) return null;
  const id = youtubeId(value);
  if (!id)
    throw new SiteError(
      `${name} must be a YouTube video's address, such as https://www.youtube.com/watch?v=dQw4w9WgXcQ.`,
    );
  return {
    id,
    watch: `https://www.youtube.com/watch?v=${id}`,
    embed: `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0`,
  };
}
/** Where the player loads from, which the content security policy allows in frames. */
export const VIDEO_ORIGIN = 'https://www.youtube-nocookie.com';
/**
 * What the content security policy of the page at `pathname` adds to `frame-src`: the
 * player's origin on the landing and audience pages, when the landing page is on and any
 * page has a video; else nothing.
 */
export function landingFramePolicy(pathname, env = process.env) {
  if (!landingEnabled(env) || !(pathname === '/' || /^\/for\/[^/]+$/.test(pathname))) return '';
  return Object.keys(env).some((key) => /^LANDING_VIDEO(_[A-Z]+)?$/.test(key) && env[key]?.trim())
    ? ' ' + VIDEO_ORIGIN
    : '';
}

/** The operator's directory of page copy (LANDING_CONTENT_DIR), or null for the built-in. */
export function landingContentDir(env = process.env) {
  const dir = (env.LANDING_CONTENT_DIR ?? '').trim();
  return dir ? resolve(dir) : null;
}
/**
 * Checks the settings at startup: every page's video, and the content directory, which must
 * exist when it is set.
 * @throws {SiteError}
 */
export function landingSettings(env = process.env) {
  for (const page of PAGES) landingVideo(page, env);
  const dir = landingContentDir(env);
  if (dir) {
    let directory = false;
    try {
      directory = statSync(dir).isDirectory();
    } catch {}
    if (!directory) throw new SiteError(`LANDING_CONTENT_DIR (${dir}) is not a directory.`);
  }
}

/** The built-in copy's directory, in the application's files. */
export function builtInContentDir(env = process.env) {
  return resolve(env.OCH_APP_ROOT ?? process.cwd(), 'platform/content/landing');
}
/**
 * A Markdown file's front matter, `key: value` lines between `---` lines at its start, and the
 * rest. Keys are letters; a value may be quoted.
 * @returns {{meta: Record<string, string>, body: string}}
 */
export function frontMatter(source) {
  const text = String(source).replace(/\r\n?/g, '\n');
  const match = /^---\n([\s\S]*?)\n---\n?/.exec(text);
  if (!match) return { meta: {}, body: text };
  const meta = {};
  for (const line of match[1].split('\n')) {
    const field = /^([A-Za-z]+):\s*(.*?)\s*$/.exec(line);
    if (field) meta[field[1].toLowerCase()] = field[2].replace(/^(["'])(.*)\1$/, '$2');
  }
  return { meta, body: text.slice(match[0].length) };
}
/**
 * Where a link in the copy may lead: the site's own pages, or http, https and mailto
 * addresses; anything else (such as `javascript:`) leads nowhere.
 */
export function safeLink(href) {
  return /^(https?:|mailto:|\/(?!\/)|#)/i.test(href) ? href : '#';
}
/** The names of the copy's files: the landing page, the audiences' index and each audience. */
export const CONTENT_FILES = ['home', 'audiences', ...AUDIENCES];
/**
 * A page's copy: `<name>.md` from LANDING_CONTENT_DIR when it has one, else the built-in.
 * Read for each request, so the operator's changes show without a restart.
 * @param {string} name one of CONTENT_FILES
 * @returns {Promise<{meta: Record<string, string>, html: string, source: string}>} the front
 *   matter, the body as HTML (headings start at h2 on the page) and which directory it came from
 */
export async function landingContent(name, env = process.env) {
  if (!CONTENT_FILES.includes(name)) throw new Error(`No landing content named ${name}.`);
  const dirs = [landingContentDir(env), builtInContentDir(env)].filter(Boolean);
  for (const dir of dirs) {
    const file = resolve(dir, name + '.md');
    let text;
    try {
      if (!(await stat(file)).isFile()) continue;
      text = await readFile(file, 'utf8');
    } catch {
      continue;
    }
    const { meta, body } = frontMatter(text);
    const { html } = renderMarkdown(body, { link: safeLink });
    return { meta, html, source: dir };
  }
  throw new Error(`The landing page's ${name}.md is missing.`);
}

/**
 * The example timelines named by `addresses`, as the timeline browser's cards show them, in
 * the order named: public, without sensitive-content labels, not a copy still being prepared,
 * and owned by an account that is not suspended. The rest are left out, without a word.
 *
 * @param {import('pg').Pool} pool
 * @param {{owner: string, slug: string}[]} addresses
 * @param {string[]} [featured] ids featured by FEATURED_TIMELINES, for their badge
 * @param {string|null} [userId] the reader, for their stars
 */
export async function exampleTimelines(pool, addresses, featured = [], userId = null) {
  if (!pool || !addresses.length) return [];
  const { rows } = await pool.query(
    `SELECT t.id,t.slug,t.title,t.description,t.tags,t.image,t.visibility,t.revision,t.event_count,
      t.comparison,t.updated_at,t.created_at,t.star_count::text AS star_count,u.username AS owner,
      EXISTS(SELECT 1 FROM oc_timeline_stars s WHERE s.timeline_id=t.id AND s.user_id=$4::uuid) AS starred,(t.featured OR t.id=ANY($3::uuid[])) AS featured,'{}'::text[] AS labels
    FROM unnest($1::text[],$2::text[]) AS a(owner,slug)
    JOIN oc_users u ON u.username=a.owner AND NOT u.is_disabled
    JOIN oc_timelines t ON t.owner_id=u.id AND t.slug=a.slug
    WHERE t.visibility='public' AND cardinality(t.content_labels||t.moderator_labels)=0
      AND t.preparing_revision_id IS NULL`,
    [addresses.map((a) => a.owner), addresses.map((a) => a.slug), featured, userId],
  );
  const order = (t) => addresses.findIndex((a) => a.owner === t.owner && a.slug === t.slug);
  rows.sort((a, b) => order(a) - order(b));
  return rows.length ? withShapes(pool, rows) : rows;
}
