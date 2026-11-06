// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// The help area's frame (#172): its sections and pages beside what is open, and search. The
// page comes first in the HTML, and the help's navigation after it (placed beside it, or above
// it when narrow, by CSS), so readers that read in order (screen readers, search engines and
// agents) reach the page's own heading first (#484); the navigation's group names are not
// headings, so the page's outline is its own.
import { helpSections } from '../../server/help.mjs';

export function HelpSearch({ query = '' }) {
  return (
    <form className="help-search" action="/help" role="search">
      <label>
        Search the help
        <input type="search" name="q" defaultValue={query} placeholder="for example tags" />
      </label>
      <button>Search</button>
    </form>
  );
}
export default function HelpShell({ pages, current = null, query = '', children }) {
  return (
    <main className="platform help">
      <div className="help-body">{children}</div>
      <nav className="help-contents" aria-label="Help contents">
        <a className={current === '' ? 'help-current' : undefined} href="/help">
          Help
        </a>
        <HelpSearch query={query} />
        {helpSections(pages).map((section, i) => (
          <div key={section.title}>
            <p className="help-group" id={'help-group-' + i}>
              {section.title}
            </p>
            <ul aria-labelledby={'help-group-' + i}>
              {section.pages.map((page) => (
                <li key={page.slug}>
                  <a
                    href={'/help/' + page.slug}
                    className={page.slug === current ? 'help-current' : undefined}
                    aria-current={page.slug === current ? 'page' : undefined}
                  >
                    {page.title}
                  </a>
                </li>
              ))}
              {section.title === 'Accounts and the API' && (
                <li>
                  <a href="/docs/api">HTTP API reference</a>
                </li>
              )}
            </ul>
          </div>
        ))}
      </nav>
    </main>
  );
}
