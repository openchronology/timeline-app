// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// The help area's frame (#172): its sections and pages beside what is open, and search.
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
      <nav className="help-contents" aria-label="Help contents">
        <a className={current === '' ? 'help-current' : undefined} href="/help">
          Help
        </a>
        <HelpSearch query={query} />
        {helpSections(pages).map((section) => (
          <div key={section.title}>
            <h2>{section.title}</h2>
            <ul>
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
      <div className="help-body">{children}</div>
    </main>
  );
}
