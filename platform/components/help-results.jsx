// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// Searching the help (#172): the sections that mention what was asked, best first.
import { searchHelp, searchTerms } from '../../server/help.mjs';

/** `text` with each search word marked. */
function Marked({ text, terms }) {
  const pattern = new RegExp(
    `(${terms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`,
    'gi',
  );
  return text.split(pattern).map((part, i) => (i % 2 ? <mark key={i}>{part}</mark> : part));
}
export default function HelpResults({ pages, query }) {
  const results = searchHelp(pages, query),
    terms = searchTerms(query);
  return (
    <>
      <h1>Search the help</h1>
      {!terms.length ? (
        <p>Type what you are looking for.</p>
      ) : !results.length ? (
        <p>
          Nothing in the help mentions “{query}”. Try other words, or look through the{' '}
          <a href="/help">topics</a>.
        </p>
      ) : (
        <>
          <p className="muted">
            {results.length === 30 ? 'The best 30 sections' : `${results.length} sections`} for “
            {query}”
          </p>
          <ol className="help-results">
            {results.map((r) => (
              <li key={r.slug + '#' + r.id}>
                <a href={`/help/${r.slug}${r.id ? '#' + r.id : ''}`}>
                  <Marked text={r.title} terms={terms} />
                </a>
                {r.id && <span className="muted"> · {r.pageTitle}</span>}
                <p>
                  <Marked text={r.snippet} terms={terms} />
                </p>
              </li>
            ))}
          </ol>
        </>
      )}
    </>
  );
}
