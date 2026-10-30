// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// Runs before the site's pages (Next.js's proxy): gives them their content security policy,
// and serves a timeline's pages at its own address, /<owner>/<slug or id>/…, by rewriting them
// to /timelines/<id>/… (#148).
import { NextResponse } from 'next/server';
import { analyticsPolicy } from '../server/site.mjs';
import { landingFramePolicy } from '../server/landing.mjs';
import { platformServices } from '../server/platform.mjs';
import { RESERVED_NAMES, USERNAME, timelineAddress } from '../src/addresses.ts';
/**
 * The site's own pages, which get the content security policy: the home page (the empty
 * alternative), the account, administration, plugin, download, legal, editor and explore
 * pages, and the docs, help, timeline, user, connect and audience (`for`, #379) sections. Profiles and timelines' addresses are
 * matched separately in `proxy`.
 */
const PAGES =
  /^\/(?:login|account|admin|plugins|download|legal|editor|explore|for(?:\/.*)?|docs(?:\/.*)?|help(?:\/.*)?|timelines(?:\/.*)?|users(?:\/.*)?|connect(?:\/.*)?)?$/;
/**
 * Marks what this proxy told a page, so a client cannot claim it. A fresh random value for
 * each server process: a client never sees it (the header is set on the request, not the
 * response), so it cannot forge an `x-timeline-address` that passes as the proxy's own.
 */
const PASS = crypto.randomUUID();
/**
 * Next.js's proxy (formerly middleware), run before every page the `config.matcher` below
 * covers.
 *
 * 1. A timeline's own address (`/<owner>/<slug or id>/…`, #148) is looked up in the store and
 *    rewritten to its `/timelines/<id>/…` page; an address that names no timeline goes on
 *    unchanged (and is a 404 there). The page is told, in the `x-timeline-address` request
 *    header, which address was asked for, so that it can redirect other addresses of the
 *    timeline to its current one once it knows the reader may open it (lib/timeline.js).
 * 2. The site's pages, profiles and timelines get a per-request nonce (`x-nonce`; the root
 *    layout reads it for the analytics scripts it writes) and the security headers below.
 *    Everything else (files, embeds, the editor's frame) sets its own headers.
 *
 * @param {import('next/server').NextRequest} request
 * @returns {Promise<NextResponse>} a pass-through, or a rewrite to the timeline's page
 */
export async function proxy(request) {
  const { pathname } = request.nextUrl;
  // A rewritten request (below) comes through again, as already handled.
  try {
    if (JSON.parse(request.headers.get('x-timeline-address'))?.pass === PASS)
      return NextResponse.next();
  } catch {}
  // The headers the page will see. A client's own `x-timeline-address` is dropped below, so
  // only the proxy's can reach a page.
  const headers = new Headers(request.headers);
  // A timeline's pages (#148): `/<owner>/<slug or id>/…` are its `/timelines/<id>/…` pages.
  // Its page sends other addresses of it, once it knows the reader may open it, to this one.
  const address = timelineAddress(pathname);
  let id = address?.id ?? null;
  headers.delete('x-timeline-address');
  if (address?.owner) {
    // A named address: the store maps the owner and slug (or id) to the timeline's id. A lookup
    // that fails is logged and treated as no timeline, so a database error is a 404, not a 500.
    try {
      id = await (await platformServices()).store?.addressed(address.owner, address.name);
    } catch (error) {
      console.error(error);
    }
    if (!id) return NextResponse.next();
  }
  if (address) {
    // What the reader asked for (`path`, and `rest` after the timeline's part), for the redirect
    // to its own address. What that redirect keeps of the query: not the router's own.
    const query = new URLSearchParams(request.nextUrl.search);
    query.delete('_rsc');
    const search = query.size ? '?' + query : '';
    headers.set(
      'x-timeline-address',
      JSON.stringify({ id, path: pathname, rest: address.rest, search, pass: PASS }),
    );
  }
  // Everything else but the site's pages and profiles, such as files, embeds and the editor's
  // frame, sets its own headers.
  const profile = /^\/([^/]+)$/.exec(pathname)?.[1]?.toLowerCase();
  if (
    !address &&
    !PAGES.test(pathname) &&
    !(profile && USERNAME.test(profile) && !RESERVED_NAMES.has(profile))
  )
    return NextResponse.next();
  // A fresh nonce for each response: only scripts carrying it may run (Next's own, and the
  // layout's), and 'strict-dynamic' lets those load the rest of the app's chunks.
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64');
  const development = process.env.NODE_ENV !== 'production';
  // Cloudflare Turnstile, when it is the human-verification provider, loads a script and frame.
  const turnstile =
    process.env.CHALLENGE_PROVIDER === 'turnstile' ? ' https://challenges.cloudflare.com' : '';
  // Google Analytics, when enabled, loads its script and sends measurements (after consent).
  const analytics = analyticsPolicy();
  // The landing and audience pages' video player (#379), when one is set: loaded only once a
  // visitor asks to play it.
  const video = landingFramePolicy(pathname);
  // The content security policy: scripts only by nonce (plus Next's dev server's eval and its
  // hot-reload socket in development); inline styles allowed; images from the site, data:
  // addresses and any https host; frames from the site, Turnstile and the landing pages' video
  // player only; no plugins (object-src); no framing of these pages at all
  // (frame-ancestors, against clickjacking; embeds have their own route); no <base> that would
  // redirect relative addresses; forms post only to the site itself.
  const policy = `default-src 'self'; script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${turnstile}${analytics.script}${development ? " 'unsafe-eval'" : ''}; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self'${analytics.connect}${development ? ' ws: wss:' : ''}; frame-src 'self'${turnstile}${video}; frame-ancestors 'none'; object-src 'none'; base-uri 'none'; form-action 'self'`;
  // The page renders with the nonce and policy on its request; Next reads the request's
  // Content-Security-Policy to put the nonce on the scripts it writes.
  headers.set('x-nonce', nonce);
  headers.set('Content-Security-Policy', policy);
  // The rewrite is to this server's own page, on the plain http it listens on. Behind an HTTPS
  // proxy that says so (X-Forwarded-Proto), request.url has the https scheme, which Next.js
  // takes for another server: it proxied the request to https on itself, which failed (#255).
  const target = request.nextUrl.clone();
  target.protocol = 'http:';
  target.pathname = `/timelines/${id}${address?.rest ?? ''}`;
  const response = address?.owner
    ? NextResponse.rewrite(target, { request: { headers } })
    : NextResponse.next({ request: { headers } });
  // The headers the browser gets: the policy itself; no guessing a response's type from its
  // content (nosniff); no Referer sent to other sites, so private timelines' addresses do not
  // leak through links; and, when the site is served over https, HSTS for a year.
  response.headers.set('Content-Security-Policy', policy);
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('Referrer-Policy', 'no-referrer');
  if (process.env.APP_ORIGIN?.startsWith('https:'))
    response.headers.set('Strict-Transport-Security', 'max-age=31536000');
  return response;
}
/** Which requests the proxy runs for (Next.js's matcher, a path pattern). */
export const config = {
  // Every page but the API's, Next's own files, embeds and the editor's frame; profiles and
  // timelines' addresses (#148) are among them.
  matcher: ['/((?!api/|_next/|embed/|editor/frame).*)'],
};
