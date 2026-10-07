// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET() {
  const html = (
    await readFile(resolve(process.env.OCH_APP_ROOT ?? process.cwd(), 'dist/index.html'), 'utf8')
  )
    .replace('href="./app.css"', 'href="/app.css"')
    .replace('src="./app.js"', 'src="/app.js"')
    .replace('href="legal.html"', 'href="/legal"')
    .replace('href="openchronology-web-source.tar.gz"', 'href="/openchronology-web-source.tar.gz"');
  return new Response(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'Content-Security-Policy':
        "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self'; frame-ancestors 'self'; base-uri 'none'; form-action 'self'",
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
    },
  });
}
