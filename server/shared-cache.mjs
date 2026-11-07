// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
/**
 * Which pages a shared cache, such as an nginx proxy cache in front of the server, may keep
 * for a moment (#473): the public pages a signed-out visitor sees the same as every other.
 * Every other page stays `private, no-store`, as Next.js sends it. The proxy (platform/proxy.js)
 * asks for each page it serves, and marks those with SHARED_CACHE_CONTROL; the launcher
 * (shared-response.cjs) then keeps the router's payload and server errors private, and adds
 * `Vary: Cookie`, which the proxy cannot.
 *
 * A cached page keeps the content security policy nonce it was rendered with, in its header
 * and its scripts alike, so it still runs; every visitor of that copy shares the nonce. A
 * nonce stops script injected into the page, which an attacker would have to write before the
 * render that chose it: a stored injection is rendered into a later copy, with its own nonce,
 * so the shared one does not help.
 */
import { RESERVED_NAMES, USERNAME, timelineAddress } from '../dist/core.mjs';
/** How long a shared cache may keep a page, and serve it stale while it fetches it again. */
export const SHARED_CACHE_CONTROL = 'public, s-maxage=60, stale-while-revalidate=300';
/** The home page, Explore, the audience (`for`) and help pages, and a legacy profile address. */
const SHARED_PAGES = /^\/(?:explore|for(?:\/[^/]+)?|help(?:\/[^/]+)?|users\/[^/]+)?$/;
/** A timeline's own page, its moments' and its durations' (what follows its address). */
const SHARED_TIMELINE_PAGES = /^(?:\/(?:moments|durations)\/[^/]+)?$/;
/** The session cookie (server/auth.mjs), with the `__Host-` prefix it has over HTTPS. */
const SESSION_COOKIE = /(?:^|;)\s*(?:__Host-)?oc_session=/;
/**
 * Whether a page's response is the same for every signed-out visitor, and so may be kept by a
 * shared cache: a GET or HEAD of a shared page (above, a profile, or a timeline's page, its
 * moments' or its durations', at either of its addresses), with no session cookie and no
 * Authorization (a desktop client's or an API key's). A private timeline is a 404 to every
 * such visitor, which may be kept too.
 *
 * @param {{method: string, pathname: string, headers: Headers}} request
 * @returns {boolean}
 */
export function sharedPage({ method, pathname, headers }) {
  if (method !== 'GET' && method !== 'HEAD') return false;
  if (headers.get('authorization') || SESSION_COOKIE.test(headers.get('cookie') ?? ''))
    return false;
  const address = timelineAddress(pathname);
  if (address) return SHARED_TIMELINE_PAGES.test(address.rest);
  const name = /^\/([^/]+)$/.exec(pathname)?.[1]?.toLowerCase();
  if (name && USERNAME.test(name) && !RESERVED_NAMES.has(name)) return true;
  return SHARED_PAGES.test(pathname);
}
