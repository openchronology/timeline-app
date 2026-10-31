// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
'use client';
// One timeline list on the dashboard or a profile, searched in place (#338): its controls
// change the address without loading the page, and its results come from the search API.
import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import TimelineSearch, { useLayout } from './timeline-search.jsx';
import TimelineList from './timeline-list.jsx';
import { api } from '../lib/api.js';
import { LISTS, navigateList, readList, rememberList, searchBody } from '../lib/timeline-lists.js';
/**
 * The list's state is the address's (readList over useSearchParams), so a link, Back and
 * Forward all say what it shows. The page renders it on the server for the address it was
 * loaded at (`initialResult`, also what shows without JavaScript); when the address says
 * otherwise, it is searched with POST /api/timelines/search, and the cards shown so far stay,
 * dimmed, until the answer comes, so nothing moves. Changing the list keeps the scroll and
 * focus where they are; a new page moves focus to its cards, scrolling only if they are
 * above the window.
 *
 * @param {object} props
 * @param {string} props.name the list's name in lib/timeline-lists.js LISTS
 * @param {object} props.initialState the list's state the server rendered
 * @param {object|null} props.initialResult what the server found for it (null on error)
 * @param {object} props.fixed what the page fixes in its searches: the scope, and an
 *   `owner` or `starredBy`
 * @param {string} [props.basePath] the page's address, which links and the form load
 * @param {import('react').ReactNode} [props.emptyAction] what an empty list offers to do
 * @param {boolean} [props.guest] the visitor is not signed in
 * @param {number} [props.compareLimit]
 */
export default function TimelineBrowser({
  name,
  initialState,
  initialResult,
  fixed,
  basePath = '/',
  emptyAction,
  guest,
  compareLimit,
}) {
  const list = LISTS[name],
    params = useSearchParams(),
    state = readList(params, list),
    key = JSON.stringify(state),
    serverKey = JSON.stringify(initialState);
  const [layout, setLayout] = useLayout();
  // The latest answer, and a search that failed, each with the state it was for.
  const [found, setFound] = useState(null),
    [failed, setFailed] = useState(null),
    [attempt, setAttempt] = useState(0);
  const shown = useRef(initialResult),
    results = useRef(null),
    paged = useRef(false);
  let result = shown.current,
    loading = false;
  if (key === serverKey) result = initialResult;
  else if (found?.key === key) result = found.result;
  else loading = failed?.key !== key;
  // A failed search keeps the cards shown before it; with none, a search shows skeletons.
  shown.current = result;
  if (!result && loading) result = { timelines: [], total: 0, page: 1, pages: 0 };
  // A timeline opened from here leads back to this list, as it is searched (its "Timelines").
  useEffect(() => {
    rememberList(location.pathname + location.search);
  }, [params]);
  useEffect(() => {
    if (key === serverKey || found?.key === key) return;
    const abort = new AbortController();
    api('timelines/search', {
      method: 'POST',
      data: searchBody(list, state, fixed),
      signal: abort.signal,
    }).then(
      (answer) => setFound({ key, result: answer }),
      (error) => abort.signal.aborted || setFailed({ key, message: error.message }),
    );
    return () => abort.abort();
  }, [key, serverKey, attempt]);
  // After a new page, its cards: focus moves to them, and the window scrolls back to their
  // top only if it is below it (the pager is under the cards).
  useEffect(() => {
    if (loading || !paged.current || !results.current) return;
    paged.current = false;
    results.current.focus({ preventScroll: true });
    if (results.current.getBoundingClientRect().top < 0)
      results.current.scrollIntoView({ block: 'start' });
  }, [loading, result]);
  function navigate(changes, options) {
    paged.current = 'page' in changes;
    navigateList(list, changes, options);
  }
  return (
    <>
      <TimelineSearch
        list={list}
        state={state}
        basePath={basePath}
        onNavigate={navigate}
        layout={layout}
        onLayout={setLayout}
      />
      {failed?.key === key && (
        <p className="notice" role="alert">
          {failed.message}{' '}
          <button type="button" onClick={() => (setFailed(null), setAttempt((n) => n + 1))}>
            Try again
          </button>
        </p>
      )}
      {result && (
        <TimelineList
          result={result}
          list={list}
          state={state}
          query={Object.fromEntries(params)}
          basePath={basePath}
          onNavigate={navigate}
          loading={loading}
          layout={layout}
          emptyAction={emptyAction}
          resultsRef={results}
          guest={guest}
          compareLimit={compareLimit}
        />
      )}
    </>
  );
}
