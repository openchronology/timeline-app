// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
'use client';
// The timelines this account started in this browser and hasn't saved to the server (#188):
// each kept until it is saved or deleted, and opened in the editor at /editor?draft=….
// Searched, sorted and paged in the browser (#337), in the address's `draft…` parameters,
// in place (#338).
import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { deleteDraft, listDrafts } from '../../src/draft-store.ts';
import { momentsText } from '../../src/wording.ts';
import TimelineSearch, { useLayout } from './timeline-search.jsx';
import { EmptyList, Pager, moveBetweenCards, plainClick } from './timeline-list.jsx';
import { cardDate, excerpt } from './timeline-card.jsx';
import {
  LISTS,
  listHref,
  navigateList,
  readList,
  searchDrafts,
  statusText,
} from '../lib/timeline-lists.js';
const list = LISTS.drafts;
/** @param {{userId: string}} props the account whose drafts to list */
export default function BrowserDrafts({ userId }) {
  const [drafts, setDrafts] = useState([]),
    [layout, setLayout] = useLayout();
  const params = useSearchParams(),
    state = readList(params, list),
    result = searchDrafts(drafts, state);
  const refresh = () =>
    listDrafts(userId)
      .then(setDrafts)
      .catch(() => setDrafts([]));
  useEffect(() => {
    void refresh();
  }, [userId]);
  if (!drafts.length) return null;
  const href = (changes) =>
    listHref(window.location.pathname, Object.fromEntries(params), list, state, changes);
  const navigate = (changes, options) => navigateList(list, changes, options);
  return (
    <section id="drafts" aria-labelledby="drafts-heading">
      <h2 id="drafts-heading">Drafts in this browser</h2>
      <p className="muted">
        Timelines you started here and haven’t saved to the server. Each stays in this browser until
        you save it to the server or delete it.
      </p>
      <TimelineSearch
        list={list}
        state={state}
        onNavigate={navigate}
        layout={layout}
        onLayout={setLayout}
      />
      <div
        className={`timeline-grid${layout === 'list' ? ' list-layout' : ''}`}
        role="region"
        aria-label="Results: drafts"
        onKeyDown={moveBetweenCards}
      >
        {result.timelines.map((draft) => {
          const title = draft.title || 'Untitled timeline';
          return (
            <article className="timeline-card" key={draft.id} data-draft={draft.id}>
              <h3 className="timeline-card-title">
                <a href={'/editor?draft=' + encodeURIComponent(draft.id)}>{title}</a>
              </h3>
              <p className="timeline-card-byline">
                {momentsText(draft.moments)}
                {draft.updated && (
                  <>
                    {' · Edited '}
                    <time dateTime={draft.updated}>{cardDate(draft.updated)}</time>
                  </>
                )}
              </p>
              {draft.description?.trim() && (
                <p className="timeline-card-description">{excerpt(draft.description)}</p>
              )}
              {draft.tags?.length > 0 && (
                <ul className="tags" aria-label="Tags">
                  {draft.tags.map((tag) => (
                    <li key={tag}>
                      <a
                        className="tag-chip"
                        href={href({ tag })}
                        aria-current={tag === state.tag ? 'true' : undefined}
                        onClick={(event) => {
                          if (!plainClick(event)) return;
                          event.preventDefault();
                          navigate({ tag });
                        }}
                      >
                        {tag}
                      </a>
                    </li>
                  ))}
                </ul>
              )}
              <div className="timeline-card-footer">
                <button
                  type="button"
                  aria-label={`Delete the draft “${title}”`}
                  onClick={() => {
                    if (!confirm(`Delete the draft “${title}” for good?`)) return;
                    void deleteDraft(draft.id).then(refresh);
                  }}
                >
                  Delete
                </button>
              </div>
            </article>
          );
        })}
      </div>
      <p className="list-status" role="status">
        {statusText(list, state, result)}
      </p>
      {!result.total && (
        <EmptyList
          state={state}
          href={href}
          onClear={(event) => {
            event.preventDefault();
            navigate({ search: '', tag: '' });
          }}
        />
      )}
      <Pager
        list={list}
        result={result}
        href={href}
        onPage={(event, page) => {
          event.preventDefault();
          navigate({ page });
        }}
      />
    </section>
  );
}
