// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// A page of the help (#172): docs/<page>.md, rendered as the site runs.
import { notFound } from 'next/navigation';
import HelpShell from '../../../components/help-shell.jsx';
import { faqData, helpPages } from '../../../../server/help.mjs';
import { breadcrumbData, jsonLd, pageTitle, siteOrigin } from '../../../lib/sharing.js';
import { StructuredData } from '../../../components/landing.jsx';
export const dynamic = 'force-dynamic';
async function load(params) {
  const { page: slug } = await params;
  const pages = await helpPages();
  const page = pages.get(String(slug).toLowerCase());
  if (!page) notFound();
  return { pages, page };
}
export async function generateMetadata({ params }) {
  const { page } = await load(params);
  return {
    title: pageTitle(page.title, 'Help'),
    // Its own description, or its first sentences (#470).
    description: page.summary,
    alternates: { canonical: '/help/' + page.slug },
  };
}
export default async function HelpPage({ params }) {
  const { pages, page } = await load(params);
  const contents = page.headings.filter((h) => h.depth === 2);
  const source = page.slug === 'readme' ? 'README.md' : `docs/${page.slug}.md`;
  const faq = faqData(page, siteOrigin() + '/help/' + page.slug);
  return (
    <HelpShell pages={pages} current={page.slug}>
      {/* Its trail: Help, then it (#474). */}
      <StructuredData
        data={breadcrumbData([
          { name: 'Help', path: '/help' },
          { name: page.title, path: '/help/' + page.slug },
        ])}
      />
      {contents.length > 2 && (
        <nav className="help-on-page" aria-label="On this page">
          <strong>On this page</strong>
          <ul>
            {contents.map((h) => (
              <li key={h.id}>
                <a href={'#' + h.id}>{h.text}</a>
              </li>
            ))}
          </ul>
        </nav>
      )}
      {/* The repository's own docs, rendered by server/help.mjs, which escapes their text. */}
      <article className="help-article" dangerouslySetInnerHTML={{ __html: page.html }} />
      {/* A page of questions, as one for search engines and AI answers (#483). */}
      {faq && (
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(faq) }} />
      )}
      <p className="muted help-source">
        This page is <code>{source}</code> in the{' '}
        <a href={'https://github.com/openchronology/timeline-app/blob/main/' + source}>
          source code
        </a>
        , as this server runs it.
      </p>
    </HelpShell>
  );
}
