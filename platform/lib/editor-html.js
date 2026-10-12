// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
import 'server-only';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
/** The editor's page, with its assets addressed from the site's root. */
export async function editorHtml() {
  return (
    await readFile(resolve(process.env.OCH_APP_ROOT ?? process.cwd(), 'dist/index.html'), 'utf8')
  )
    .replace('href="./app.css"', 'href="/app.css"')
    .replace('src="./app.js"', 'src="/app.js"')
    .replace('href="legal.html"', 'href="/legal"')
    .replace('href="openchronology-web-source.tar.gz"', 'href="/openchronology-web-source.tar.gz"');
}
/** The editor's content security policy; `ancestors` are the pages that may frame it. */
export function editorPolicy(ancestors) {
  // Cloudflare Turnstile, when it is the human-verification provider, loads a script and frame.
  const turnstile =
    process.env.CHALLENGE_PROVIDER === 'turnstile' ? ' https://challenges.cloudflare.com' : '';
  return `default-src 'self'; script-src 'self'${turnstile}; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self'; frame-src 'self'${turnstile}; frame-ancestors ${ancestors}; base-uri 'none'; form-action 'self'`;
}
