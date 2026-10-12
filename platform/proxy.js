// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
import { NextResponse } from 'next/server';
import { analyticsPolicy } from '../server/site.mjs';
export function proxy(request) {
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64');
  const development = process.env.NODE_ENV !== 'production';
  // Cloudflare Turnstile, when it is the human-verification provider, loads a script and frame.
  const turnstile =
    process.env.CHALLENGE_PROVIDER === 'turnstile' ? ' https://challenges.cloudflare.com' : '';
  // Google Analytics, when enabled, loads its script and sends measurements (after consent).
  const analytics = analyticsPolicy();
  const policy = `default-src 'self'; script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${turnstile}${analytics.script}${development ? " 'unsafe-eval'" : ''}; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self'${analytics.connect}${development ? ' ws: wss:' : ''}; frame-src 'self'${turnstile}; frame-ancestors 'none'; object-src 'none'; base-uri 'none'; form-action 'self'`;
  const headers = new Headers(request.headers);
  headers.set('x-nonce', nonce);
  headers.set('Content-Security-Policy', policy);
  const response = NextResponse.next({ request: { headers } });
  response.headers.set('Content-Security-Policy', policy);
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('Referrer-Policy', 'no-referrer');
  if (process.env.APP_ORIGIN?.startsWith('https:'))
    response.headers.set('Strict-Transport-Security', 'max-age=31536000');
  return response;
}
export const config = {
  matcher: [
    '/',
    '/login',
    '/account',
    '/admin',
    '/plugins',
    '/legal',
    '/editor',
    '/timelines/:path*',
    '/users/:path*',
    '/connect/:path*',
  ],
};
