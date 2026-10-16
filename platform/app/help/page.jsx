// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// The help area (#172): the user guide, the FAQ and every page of docs/, by section.
import HelpShell from '../../components/help-shell.jsx';
import HelpResults from '../../components/help-results.jsx';
import { helpPages, helpSections } from '../../../server/help.mjs';
import { siteName } from '../../lib/sharing.js';
export const dynamic = 'force-dynamic';
export function generateMetadata() {
  return {
    title: `Help · ${siteName()}`,
    description: `How to use ${siteName()}: the guide, answers to common questions, and every topic in detail.`,
    alternates: { canonical: '/help' },
  };
}
export default async function Help({ searchParams }) {
  const pages = await helpPages();
  // A search (?q=…) shows what the help says about it instead.
  const query = (await searchParams).q;
  if (typeof query === 'string')
    return (
      <HelpShell pages={pages} query={query.slice(0, 200)}>
        <HelpResults pages={pages} query={query.slice(0, 200)} />
      </HelpShell>
    );
  return (
    <HelpShell pages={pages} current="">
      <h1>Help</h1>
      <p className="help-lead">
        New here? Start with <a href="/help/guide">using {siteName()}</a>, or look for your question
        among the <a href="/help/faq">frequently asked questions</a>. Every topic below is also
        searchable.
      </p>
      <p>
        <a className="button" href="/editor?tour=1">
          Take the tour of the editor
        </a>
      </p>
      {helpSections(pages).map((section) => (
        <section key={section.title} className="help-section">
          <h2>{section.title}</h2>
          <div className="help-cards">
            {section.pages.map((page) => (
              <a key={page.slug} className="help-card" href={'/help/' + page.slug}>
                <strong>{page.title}</strong>
                {page.summary && (
                  <span>
                    {page.summary.length > 180
                      ? page.summary.slice(0, 179).trimEnd() + '…'
                      : page.summary}
                  </span>
                )}
              </a>
            ))}
            {section.title === 'Accounts and the API' && (
              <a className="help-card" href="/docs/api">
                <strong>HTTP API reference</strong>
                <span>Every operation of the API, who may call it, and Try it.</span>
              </a>
            )}
          </div>
        </section>
      ))}
    </HelpShell>
  );
}
