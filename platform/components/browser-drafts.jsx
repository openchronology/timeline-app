// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
'use client';
// The timelines this account started in this browser and hasn't saved to the server (#188):
// each kept until it is saved or deleted, and opened in the editor at /editor?draft=….
// Searched, sorted and paged in the browser (#337), in the address's `draft…` parameters.
import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { deleteDraft, listDrafts } from '../../src/draft-store.ts';
import { momentsText } from '../../src/wording.ts';
import TimelineSearch from './timeline-search.jsx';
import { LISTS, listHref, readList, searchDrafts, statusText } from '../lib/timeline-lists.js';
const list = LISTS.drafts;
/**
 * @param {object} props
 * @param {string} props.userId the account whose drafts to list
 * @param {Record<string, string>} props.query the dashboard's whole query, which the drafts'
 *   form and links keep
 */
export default function BrowserDrafts({ userId, query }) {
  const [drafts, setDrafts] = useState([]);
  const state = readList(useSearchParams(), list),
    result = searchDrafts(drafts, state);
  const refresh = () =>
    listDrafts(userId)
      .then(setDrafts)
      .catch(() => setDrafts([]));
  useEffect(() => {
    void refresh();
  }, [userId]);
  if (!drafts.length) return null;
  const href = (changes) => listHref('/', query, list, state, changes);
  return (
    <section id="dashboard-drafts">
      <h2>Drafts in this browser</h2>
      <p className="muted">
        Timelines you started here and haven’t saved to the server. Each stays in this browser until
        you save it to the server or delete it.
      </p>
      <TimelineSearch key={JSON.stringify(state)} list={list} state={state} query={query} />
      <div className="timeline-grid">
        {result.timelines.map((draft) => (
          <article className="timeline-card" key={draft.id} data-draft={draft.id}>
            <h3>
              <a href={'/editor?draft=' + encodeURIComponent(draft.id)}>
                {draft.title || 'Untitled timeline'}
              </a>
            </h3>
            <p className="muted">
              {momentsText(draft.moments)}
              {draft.updated && ` · edited ${new Date(draft.updated).toLocaleString()}`}
            </p>
            {draft.description && <p>{draft.description.slice(0, 220)}</p>}
            {draft.tags?.length > 0 && (
              <div className="tags">
                {draft.tags.map((tag) => (
                  <Link
                    className="button"
                    key={tag}
                    href={href({ tag, page: 1 })}
                    aria-current={tag === state.tag ? 'true' : undefined}
                  >
                    {tag}
                  </Link>
                ))}
              </div>
            )}
            <button
              type="button"
              aria-label={`Delete the draft “${draft.title || 'Untitled timeline'}”`}
              onClick={() => {
                if (!confirm(`Delete the draft “${draft.title || 'Untitled timeline'}” for good?`))
                  return;
                void deleteDraft(draft.id).then(refresh);
              }}
            >
              Delete
            </button>
          </article>
        ))}
      </div>
      <p role="status">{statusText(list, state, result)}</p>
      {result.pages > 1 && (
        <nav className="pager" aria-label={`Pages of ${list.noun}`}>
          {result.page > 1 && <Link href={href({ page: result.page - 1 })}>Previous</Link>}
          {result.page < result.pages && <Link href={href({ page: result.page + 1 })}>Next</Link>}
        </nav>
      )}
    </section>
  );
}
