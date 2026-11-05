// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// The editor's built page (dist/index.html) as the platform serves it, and its content
// security policy, which lets its inline color-scheme script (#382) run by its hash.
import 'server-only';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { THEME_BOOT } from '../../src/theme-choice.ts';
import { browserPath } from '../../server/landing.mjs';
import { markdownHtml } from '../../src/rich-text.ts';
/** The editor page's one inline script, which sets the chosen color scheme first (#382). */
const BOOT = `'sha256-${createHash('sha256').update(THEME_BOOT).digest('base64')}'`;
/** Text escaped for HTML: element content and quoted attribute values alike. */
const escape = (text) =>
  String(text).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
/**
 * The editor's page, with its assets addressed from the site's root, and its "Timelines" link
 * at the timeline browser (/explore with the landing page on). Given a timeline's `heading`
 * (#428), the page arrives with it already shown: its owner in the breadcrumb, and its image,
 * title, description and count, as the editor would draw them, marked with the timeline's id so the editor keeps them while it
 * loads that timeline (src/app.ts, heading()).
 * @param {{id: string, title: string, description: string, image: {url: string, alt?: string}|null,
 *   count: string, owner: string, ownerPath: string}} [heading]
 */
export async function editorHtml(heading) {
  let html = (
    await readFile(resolve(process.env.OCH_APP_ROOT ?? process.cwd(), 'dist/index.html'), 'utf8')
  )
    .replace('href="./app.css"', 'href="/app.css"')
    .replace('src="./app.js"', 'src="/app.js"')
    .replace('href="legal.html"', 'href="/legal"')
    .replace('id="timelines-link" href="/"', `id="timelines-link" href="${browserPath()}"`)
    .replace('href="openchronology-web-source.tar.gz"', 'href="/openchronology-web-source.tar.gz"');
  if (!heading) return html;
  const description = heading.description.trim() ? markdownHtml(heading.description) : '';
  html = html
    .replace(
      '<section class="document-heading">',
      `<section class="document-heading" data-prefill="${escape(heading.id)}">`,
    )
    .replace(
      /(<textarea\s+id="timeline-title"[^>]*>)[\s\S]*?(<\/textarea)/,
      (_, open, close) => open + escape(heading.title) + close,
    )
    .replace(
      /(<textarea\s+id="timeline-description"[^>]*>)[\s\S]*?(<\/textarea)/,
      (_, open, close) => open + escape(heading.description) + close,
    )
    .replace(/(<span id="event-count">)[^<]*/, (_, open) => open + escape(heading.count))
    .replace(
      /<a id="owner-label"><\/a>/,
      `<a id="owner-label" href="${escape(heading.ownerPath)}" target="_top">${escape(heading.owner)}</a>`,
    );
  if (description)
    html = html
      // The description's source waits hidden, as the editor shows a description it renders.
      .replace(/(<textarea\s+id="timeline-description")/, '$1 hidden')
      .replace(
        /<div id="timeline-description-view"([^>]*?)\s+hidden><\/div>/,
        (_, attributes) => `<div id="timeline-description-view"${attributes}>${description}</div>`,
      );
  if (heading.image?.url)
    html = html.replace(
      /<img\s+id="timeline-image"[^>]*>/,
      `<img id="timeline-image" class="timeline-image" src="${escape(heading.image.url)}" alt="${escape(heading.image.alt ?? '')}" referrerpolicy="no-referrer" />`,
    );
  return html;
}
/** The editor's content security policy; `ancestors` are the pages that may frame it. */
export function editorPolicy(ancestors) {
  // Cloudflare Turnstile, when it is the human-verification provider, loads a script and frame.
  const turnstile =
    process.env.CHALLENGE_PROVIDER === 'turnstile' ? ' https://challenges.cloudflare.com' : '';
  return `default-src 'self'; script-src 'self' ${BOOT}${turnstile}; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self'; frame-src 'self'${turnstile}; frame-ancestors ${ancestors}; base-uri 'none'; form-action 'self'`;
}
