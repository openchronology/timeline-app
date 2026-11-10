// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// /llms.txt and /llms-full.txt (#482; llmstxt.org): the site for AI engines and agents, in
// Markdown. llms.txt says what the site is and links its main pages, the help, the API and a
// few public timelines, each with a line; llms-full.txt is the help's text in one file. Both
// are generated from the help (server/help.mjs) and the site's settings, so they follow the
// docs and each server's own name.
import 'server-only';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { helpPages } from '../../server/help.mjs';
import { AUDIENCES, browserPath, landingContent, landingEnabled } from '../../server/landing.mjs';
import { searchTimelines } from '../../server/collaboration.mjs';
import { platformServices } from '../../server/platform.mjs';
import { timelinePath } from '../../src/addresses.ts';
import { descriptionExcerpt, siteName, siteOrigin, timelineTitle } from './sharing.js';

/** The software's own name, which a server named otherwise runs. */
const SOFTWARE_NAME = 'OpenChronology';

/** What the software is, in the sentence the home page and FAQ open with (#481). */
export const DEFINITION =
  'OpenChronology is a free, open-source timeline editor for exact dates at any scale, from deep time to fractions of a second, with sources on every event.';
/** How many public timelines llms.txt names. */
const TIMELINES = 10;

/** A Markdown link line: `- [name](url): what it is`. */
const line = (name, url, about) =>
  `- [${name.replace(/[[\]]/g, '')}](${url})${about ? ': ' + about.replace(/\s+/g, ' ') : ''}`;

/** The most featured public timelines, as guests browse them; none without a database. */
async function publicTimelines() {
  try {
    const services = await platformServices();
    if (!services.pool) return [];
    const { timelines } = await searchTimelines(
      services.pool,
      null,
      { scope: 'public', sort: 'featured', limit: TIMELINES },
      services.featured ?? [],
    );
    return timelines.filter((t) => !t.labels?.length);
  } catch {
    return [];
  }
}

/** /llms.txt: the site, its main pages, the help, the API and some public timelines. */
export async function llmsText() {
  const origin = siteOrigin(),
    name = siteName(),
    at = (path) => origin + path;
  const [pages, timelines] = await Promise.all([
    helpPages().catch(() => new Map()),
    publicTimelines(),
  ]);
  const help = (slug, title) => {
    const page = pages.get(slug);
    return page ? [line(title ?? page.title, at('/help/' + slug), page.summary)] : [];
  };
  const out = [
    `# ${name}`,
    '',
    `> ${name === SOFTWARE_NAME ? '' : `${name} runs ${SOFTWARE_NAME}. `}${DEFINITION}`,
    '',
    'It runs on the website, as a desktop app for Windows, macOS and Linux, as a single offline HTML file, and on your own server. It is free software under the GNU GPL version 3, with no payments or paid features. Times are stored exactly, as whole numbers or fractions, so dates before year 1 and fractions of a second are kept as they are.',
    '',
    '## Start here',
    '',
    line(
      'Explore timelines',
      at(browserPath()),
      'search public timelines and their events by title and notes',
    ),
    ...help('faq'),
    ...help('guide'),
    line('Download', at('/download'), 'the desktop app, the offline file and server packages'),
    '',
  ];
  if (landingEnabled()) {
    out.push('## Who it is for', '');
    for (const key of AUDIENCES) {
      const { meta } = await landingContent(key).catch(() => ({ meta: {} }));
      out.push(line(meta.label ?? key, at('/for/' + key), meta.description ?? meta.promise));
    }
    out.push('');
  }
  out.push('## Help', '');
  for (const [slug, page] of pages)
    if (!['faq', 'guide'].includes(slug))
      out.push(line(page.title, at('/help/' + slug), page.summary));
  out.push(
    '',
    '## API',
    '',
    line(
      'HTTP API reference',
      at('/docs/api'),
      'every operation, who may call it, and example bodies',
    ),
    line('OpenAPI 3.1 description', at('/api/openapi.json'), 'the same, as JSON'),
    line(
      'Making views',
      at('/help/views#the-api-making-views-from-scripts-and-ai-assistants'),
      'saved views of a timeline (separations, disjoins and unions) made with an API key: the JSON to send, with examples',
    ),
    line(
      'Showing a timeline in a chat reply or a page',
      at('/help/sharing#in-other-pages-and-ai-chats'),
      'the <och-timeline> element (npm @openchronology/timeline): a timeline written as JSON inside it opens in the editor, with no server',
    ),
    '',
  );
  if (timelines.length) {
    out.push('## Public timelines', '');
    for (const t of timelines)
      out.push(line(timelineTitle(t), at(timelinePath(t)), descriptionExcerpt(t, 160)));
    out.push('');
  }
  out.push(
    '## Optional',
    '',
    line(
      'The help in full',
      at('/llms-full.txt'),
      'every help page above, as Markdown, in one file',
    ),
    line(
      'Source code',
      'https://github.com/openchronology/timeline-app',
      'the repository, its releases and issues',
    ),
    '',
  );
  return out.join('\n');
}

/**
 * /llms-full.txt: every help page's Markdown in one file, each under its title with its
 * address, without the copyright line and description comment its source carries.
 */
export async function llmsFullText(root = process.env.OCH_APP_ROOT ?? process.cwd()) {
  const origin = siteOrigin(),
    pages = await helpPages().catch(() => new Map());
  const out = [`# ${siteName()}: help`, '', `> ${DEFINITION}`, ''];
  for (const [slug, page] of pages) {
    const file = slug === 'readme' ? join(root, 'README.md') : join(root, 'docs', slug + '.md');
    const source = await readFile(file, 'utf8').catch(() => null);
    if (source === null) continue;
    const body = source
      .replace(/^Copyright \(c\)[^\n]*\n/m, '')
      .replace(/^<!-- description: .+? -->\n/m, '')
      .replace(/^# .*\n/m, '')
      .trim();
    out.push('---', '', `# ${page.title}`, '', `Source: ${origin}/help/${slug}`, '', body, '');
  }
  return out.join('\n');
}

/** A text answer for an llms file: Markdown, as plain text, cached for an hour. */
export function textResponse(text) {
  return new Response(text, {
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': 'public, max-age=3600',
    },
  });
}
