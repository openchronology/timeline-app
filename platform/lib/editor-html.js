// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// The editor's built page (dist/index.html) as the platform serves it, and its content
// security policy, which lets its inline color-scheme script (#382) run by its hash.
import 'server-only';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { THEME_BOOT } from '../../src/theme-choice.ts';
import { browserPath } from '../../server/landing.mjs';
/** The editor page's one inline script, which sets the chosen color scheme first (#382). */
const BOOT = `'sha256-${createHash('sha256').update(THEME_BOOT).digest('base64')}'`;
/**
 * The editor's page, with its assets addressed from the site's root, and its "Timelines" link
 * at the timeline browser (/explore with the landing page on).
 */
export async function editorHtml() {
  return (
    await readFile(resolve(process.env.OCH_APP_ROOT ?? process.cwd(), 'dist/index.html'), 'utf8')
  )
    .replace('href="./app.css"', 'href="/app.css"')
    .replace('src="./app.js"', 'src="/app.js"')
    .replace('href="legal.html"', 'href="/legal"')
    .replace('id="timelines-link" href="/"', `id="timelines-link" href="${browserPath()}"`)
    .replace('href="openchronology-web-source.tar.gz"', 'href="/openchronology-web-source.tar.gz"');
}
/** The editor's content security policy; `ancestors` are the pages that may frame it. */
export function editorPolicy(ancestors) {
  // Cloudflare Turnstile, when it is the human-verification provider, loads a script and frame.
  const turnstile =
    process.env.CHALLENGE_PROVIDER === 'turnstile' ? ' https://challenges.cloudflare.com' : '';
  return `default-src 'self'; script-src 'self' ${BOOT}${turnstile}; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self'; frame-src 'self'${turnstile}; frame-ancestors ${ancestors}; base-uri 'none'; form-action 'self'`;
}
