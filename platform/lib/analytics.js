// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// What Google Analytics is told of a page, when the site enables it (components/analytics.jsx):
// its address and title, with nothing in them that names a timeline that isn't public, the
// timelines a comparison opens, a desktop sign-in code or what a visitor searched for.
import { RESERVED_NAMES, TIMELINE_UUID, USERNAME, timelineAddress } from '../../src/addresses.ts';

/** The attributes a public timeline's page marks its `<main>` with (publicPage). */
export const SHOWN_PATH = 'data-analytics-path';
export const SHOWN_TITLE = 'data-analytics-title';

/**
 * What a page about `timeline` lets analytics see of it: its `path` and `title` (as the page's
 * own `<title>` has it), as attributes for the page's `<main>`, when the timeline is public;
 * nothing otherwise, so the page is counted only as a timeline (analyticsPage).
 *
 * @param {{visibility?: string, comparison?: unknown}} timeline
 * @param {string} path
 * @param {string} title
 */
export function publicPage(timeline, path, title) {
  return timeline?.visibility === 'public' && !timeline.comparison
    ? { [SHOWN_PATH]: path, [SHOWN_TITLE]: title }
    : {};
}

/**
 * What the site's own pages are called in analytics, by their address's first part. The page's
 * own `<title>` is not used: a page that follows its timeline, such as the editor, takes that
 * timeline's title, and on moving to another page the old title can still be showing when the
 * page view is sent.
 */
const SECTIONS = {
  account: 'Account',
  admin: 'Administration',
  compare: 'Compare timelines',
  connect: 'Connect the desktop app',
  docs: 'HTTP API',
  download: 'Download',
  editor: 'Editor',
  explore: 'Explore timelines',
  help: 'Help',
  legal: 'Terms, privacy and licenses',
  login: 'Sign in',
  plugins: 'Plugin library',
  privacy: 'Privacy policy',
  terms: 'Terms of service',
  users: 'Profile',
};
/** Where pages under these keep only their first part: what follows is a code or an id. */
const TRUNCATED = new Set(['compare', 'connect', 'editor']);

/**
 * The page view analytics is sent for the page at `pathname`: `page_location` (on `origin`,
 * with no query or fragment) and `page_title` (named for `site`). `shown` is what the page
 * marked public (publicPage), if it did.
 *
 * - A public timeline's pages are sent as they are, at the address and title the page gave.
 * - Any other page of a timeline (private or unlisted, or one that doesn't say) is sent as
 *   `/timelines`, "Timeline": not its owner, address or title.
 * - The editor, comparisons and desktop sign-in keep only their first part (`/compare`, not
 *   which timelines; `/connect`, not the code).
 * - Queries are dropped everywhere: they hold searches, which can name private timelines, and
 *   where to return after signing in.
 * - Anything else that looks like an id is replaced by `(id)`.
 *
 * @param {{origin: string, pathname: string, site: string,
 *   shown?: {path?: string, title?: string}|null}} page
 * @returns {{page_location: string, page_title: string}}
 */
export function analyticsPage({ origin, pathname, site, shown = null }) {
  const named = (name) => (name ? `${name} · ${site}` : site);
  if (timelineAddress(pathname)) {
    if (shown?.path?.startsWith('/') && shown.title)
      return { page_location: origin + shown.path, page_title: shown.title };
    return { page_location: origin + '/timelines', page_title: named('Timeline') };
  }
  const parts = pathname.split('/').filter(Boolean);
  const first = (parts[0] ?? '').toLowerCase();
  if (TRUNCATED.has(first))
    return { page_location: `${origin}/${first}`, page_title: named(SECTIONS[first]) };
  const path = '/' + parts.map((part) => (TIMELINE_UUID.test(part) ? '(id)' : part)).join('/');
  // A profile, /<username>: public, as its address says.
  const profile = parts.length === 1 && USERNAME.test(first) && !RESERVED_NAMES.has(first);
  return {
    page_location: origin + path,
    page_title: named(profile ? 'Profile' : Object.hasOwn(SECTIONS, first) ? SECTIONS[first] : ''),
  };
}
