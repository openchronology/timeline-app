// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
import { NextResponse } from 'next/server';
import { analyticsPolicy } from '../server/site.mjs';
import { platformServices } from '../server/platform.mjs';
import { RESERVED_NAMES, USERNAME, timelineAddress } from '../src/addresses.ts';
/** The site's own pages, which get the content security policy. */
const PAGES =
  /^\/(?:login|account|admin|plugins|download|legal|editor|docs(?:\/.*)?|help(?:\/.*)?|timelines(?:\/.*)?|users(?:\/.*)?|connect(?:\/.*)?)?$/;
/** Marks what this proxy told a page, so a client cannot claim it. */
const PASS = crypto.randomUUID();
export async function proxy(request) {
  const { pathname } = request.nextUrl;
  // A rewritten request (below) comes through again, as already handled.
  try {
    if (JSON.parse(request.headers.get('x-timeline-address'))?.pass === PASS)
      return NextResponse.next();
  } catch {}
  const headers = new Headers(request.headers);
  // A timeline's pages (#148): `/<owner>/<slug or id>/…` are its `/timelines/<id>/…` pages.
  // Its page sends other addresses of it, once it knows the reader may open it, to this one.
  const address = timelineAddress(pathname);
  let id = address?.id ?? null;
  headers.delete('x-timeline-address');
  if (address?.owner) {
    try {
      id = await (await platformServices()).store?.addressed(address.owner, address.name);
    } catch (error) {
      console.error(error);
    }
    if (!id) return NextResponse.next();
  }
  if (address) {
    // What a redirect to its own address keeps of the query: not the router's own.
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
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64');
  const development = process.env.NODE_ENV !== 'production';
  // Cloudflare Turnstile, when it is the human-verification provider, loads a script and frame.
  const turnstile =
    process.env.CHALLENGE_PROVIDER === 'turnstile' ? ' https://challenges.cloudflare.com' : '';
  // Google Analytics, when enabled, loads its script and sends measurements (after consent).
  const analytics = analyticsPolicy();
  const policy = `default-src 'self'; script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${turnstile}${analytics.script}${development ? " 'unsafe-eval'" : ''}; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self'${analytics.connect}${development ? ' ws: wss:' : ''}; frame-src 'self'${turnstile}; frame-ancestors 'none'; object-src 'none'; base-uri 'none'; form-action 'self'`;
  headers.set('x-nonce', nonce);
  headers.set('Content-Security-Policy', policy);
  const response = address?.owner
    ? NextResponse.rewrite(
        new URL(`/timelines/${id}${address.rest}${request.nextUrl.search}`, request.url),
        { request: { headers } },
      )
    : NextResponse.next({ request: { headers } });
  response.headers.set('Content-Security-Policy', policy);
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('Referrer-Policy', 'no-referrer');
  if (process.env.APP_ORIGIN?.startsWith('https:'))
    response.headers.set('Strict-Transport-Security', 'max-age=31536000');
  return response;
}
export const config = {
  // Every page but the API's, Next's own files, embeds and the editor's frame; profiles and
  // timelines' addresses (#148) are among them.
  matcher: ['/((?!api/|_next/|embed/|editor/frame).*)'],
};
