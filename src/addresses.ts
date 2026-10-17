// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
/**
 * The addresses of profiles and server timelines (#148), as on GitHub: `/<username>` and
 * `/<username>/<slug>`. A timeline without a slug is at `/<username>/<id>`; its ID is a detail
 * of it, and `/timelines/<id>` keeps working. Names the site's own pages use are reserved, so
 * accounts that have one (such as a first administrator named "admin") keep the older
 * `/users/<username>` and `/timelines/<id>` addresses.
 */

/** What usernames may be: 3–32 lowercase letters, digits, hyphens or underscores. */
export const USERNAME = /^[a-z0-9][a-z0-9_-]{2,31}$/;
/** What slugs may be: 1–64 lowercase letters, digits, hyphens or underscores. */
export const SLUG = /^[a-z0-9][a-z0-9_-]{0,63}$/;
export const TIMELINE_UUID = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
export const SLUG_RULE =
  'Use 1–64 lowercase letters, digits, hyphens or underscores, starting with a letter or digit.';

/**
 * First segments that are, or may become, the site's own pages rather than profiles. New
 * accounts cannot take them.
 */
export const RESERVED_NAMES: ReadonlySet<string> = new Set([
  'about',
  'account',
  'accounts',
  'admin',
  'administrator',
  'api',
  'app',
  'assets',
  'blog',
  'compare',
  'connect',
  'contact',
  'copyright',
  'dashboard',
  'desktop',
  'docs',
  'download',
  'downloads',
  'editor',
  'embed',
  'explore',
  'favicon',
  'favorites',
  'featured',
  'healthz',
  'help',
  'home',
  'legal',
  'login',
  'logout',
  'moderation',
  'new',
  'notifications',
  'oembed',
  'openchronology',
  'organizations',
  'plugins',
  'privacy',
  'register',
  'reports',
  'robots',
  'search',
  'security',
  'settings',
  'signin',
  'signup',
  'sitemap',
  'stars',
  'static',
  'status',
  'support',
  'system',
  'terms',
  'timelines',
  'users',
  'www',
]);

/**
 * Names that would pass for the site, its staff or its system addresses (#184). New accounts
 * cannot take them, nor a spelling of one with hyphens, underscores or a number added. Unlike
 * RESERVED_NAMES they are not page addresses, so an account that has one keeps its address.
 */
export const OFFICIAL_NAMES: ReadonlySet<string> = new Set([
  'abuse',
  'admins',
  'administrators',
  'anonymous',
  'auth',
  'billing',
  'bot',
  'everyone',
  'guest',
  'hostmaster',
  'info',
  'mailerdaemon',
  'mod',
  'moderator',
  'moderators',
  'mods',
  'noreply',
  'null',
  'oauth',
  'official',
  'operator',
  'owner',
  'postmaster',
  'root',
  'staff',
  'superuser',
  'sysadmin',
  'team',
  'undefined',
  'webmaster',
]);

/**
 * Whether `name` is a username new accounts may take: it follows USERNAME, and is not one of
 * the site's own pages (RESERVED_NAMES) or OFFICIAL_NAMES, written plainly or with hyphens and
 * underscores (`sign-in`, `ad_min`). Nor is it an official name or a site page with a number
 * after it (`admin1`, `root-2`), or a name starting with "openchronology".
 */
export function availableUsername(name: string): boolean {
  if (!USERNAME.test(name)) return false;
  const bare = name.replace(/[-_]/g, ''),
    stem = bare.replace(/\d+$/, '');
  return (
    !bare.startsWith('openchronology') &&
    ![name, bare, stem].some((n) => RESERVED_NAMES.has(n) || OFFICIAL_NAMES.has(n))
  );
}
/** Whether `slug` may name a timeline: the rule, and not shaped like a timeline's ID. */
export function validSlug(slug: string): boolean {
  return SLUG.test(slug) && !TIMELINE_UUID.test(slug);
}
/** A slug suggested by a title: "The Fall of Rome (476)" is `the-fall-of-rome-476`. */
export function slugFromTitle(title: string): string {
  return title
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .slice(0, 64)
    .replace(/^-+|-+$/g, '');
}
/** A profile's page. */
export function profilePath(username: string): string {
  return RESERVED_NAMES.has(username)
    ? '/users/' + encodeURIComponent(username)
    : '/' + encodeURIComponent(username);
}
/** A server timeline's page: by its owner and slug, or its ID until it has one. */
export function timelinePath(timeline: {
  id: string;
  owner?: string | null;
  slug?: string | null;
}): string {
  if (!timeline.owner || RESERVED_NAMES.has(timeline.owner)) return '/timelines/' + timeline.id;
  return `/${encodeURIComponent(timeline.owner)}/${timeline.slug || timeline.id}`;
}
/**
 * A page address's timeline part: `{ owner, name }` for `/<owner>/<slug or id>/…`, `{ id }`
 * for `/timelines/<id>/…`, with the rest of the path; null for any other page.
 */
export function timelineAddress(
  pathname: string,
): { owner?: string; name?: string; id?: string; rest: string } | null {
  const legacy = /^\/timelines\/([^/]+)(\/.*)?$/.exec(pathname);
  if (legacy)
    return TIMELINE_UUID.test(legacy[1]) ? { id: legacy[1], rest: legacy[2] ?? '' } : null;
  const named = /^\/([^/]+)\/([^/]+)(\/.*)?$/.exec(pathname);
  if (!named) return null;
  const owner = named[1].toLowerCase(),
    name = named[2].toLowerCase();
  // Any account's name that is not a site page: OFFICIAL_NAMES only limit new accounts.
  if (!USERNAME.test(owner) || RESERVED_NAMES.has(owner)) return null;
  if (!(SLUG.test(name) || TIMELINE_UUID.test(name))) return null;
  return { owner, name, rest: named[3] ?? '' };
}
