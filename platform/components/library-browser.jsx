// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
'use client';
// Explore's search (#459): one field finding timelines, moments and durations, searched in
// place as the timeline lists are (#338).
import { useEffect, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import TimelineSearch, { useLayout } from './timeline-search.jsx';
import TimelineList from './timeline-list.jsx';
import EntityResults from './entity-results.jsx';
import { useSearchResult } from '../lib/use-search-result.js';
import {
  LISTS,
  librarySearches,
  navigateList,
  readList,
  rememberList,
} from '../lib/timeline-lists.js';

/**
 * Its state is the address's (lib/timeline-lists.js LISTS.explore, with `show`, `within`
 * and `entityPage`), and from it two searches (librarySearches): the timelines, as cards, and
 * with search text the moments and durations, as a list under them, each with its own pager.
 * The page renders both for the address it was loaded at (also what shows without
 * JavaScript); when the address changes, each is searched again only if its search changed,
 * the results shown so far staying, dimmed, until the answer comes. A new page of either
 * moves focus to its results.
 *
 * @param {object} props
 * @param {object} props.initialState the list's state the server rendered
 * @param {object|null} props.initialTimelines the timelines the server found (null: none
 *   shown, or an error)
 * @param {object|null} props.initialEntities the moments and durations it found
 * @param {object} props.fixed what the page fixes: the scope, and an `owner`
 * @param {boolean} [props.signedIn]
 * @param {string} [props.basePath]
 * @param {number} [props.compareLimit]
 */
export default function LibraryBrowser({
  initialState,
  initialTimelines,
  initialEntities,
  fixed,
  signedIn = false,
  basePath = '/',
  compareLimit,
}) {
  const list = LISTS.explore,
    params = useSearchParams(),
    state = readList(params, list);
  const [layout, setLayout] = useLayout();
  const searches = librarySearches(list, state, fixed, { signedIn }),
    served = librarySearches(list, initialState, fixed, { signedIn });
  const timelines = useSearchResult(
    'timelines/search',
    searches.timelines,
    { body: served.timelines, result: initialTimelines },
    { timelines: [], total: 0, page: 1, pages: 0 },
  );
  const entities = useSearchResult(
    'timelines/entities/search',
    searches.entities,
    { body: served.entities, result: initialEntities },
    { entities: [], total: 0, page: 1, pages: 0 },
  );
  // Which pager was used last, and each list's results, to move focus to after a new page.
  const paged = useRef(null),
    timelineResults = useRef(null),
    entityResults = useRef(null);
  // A timeline opened from here leads back to this search, as it is (its "Timelines").
  useEffect(() => {
    rememberList(location.pathname + location.search);
  }, [params]);
  useEffect(() => {
    const target = { page: timelineResults, entityPage: entityResults }[paged.current];
    const loading = paged.current === 'page' ? timelines.loading : entities.loading;
    if (!target?.current || loading) return;
    paged.current = null;
    target.current.focus({ preventScroll: true });
    if (target.current.getBoundingClientRect().top < 0)
      target.current.scrollIntoView({ block: 'start' });
  }, [timelines.loading, entities.loading, timelines.result, entities.result]);
  function navigate(changes, options) {
    paged.current = 'page' in changes ? 'page' : 'entityPage' in changes ? 'entityPage' : null;
    navigateList(list, changes, options);
  }
  const query = Object.fromEntries(params);
  const failure = (search) =>
    search.error && (
      <p className="notice" role="alert">
        {search.error}{' '}
        <button type="button" onClick={search.retry}>
          Try again
        </button>
      </p>
    );
  return (
    <>
      <TimelineSearch
        list={list}
        state={state}
        basePath={basePath}
        onNavigate={navigate}
        layout={layout}
        onLayout={setLayout}
        signedIn={signedIn}
      />
      {searches.timelines && (
        <>
          {searches.entities && <h3 id="timeline-results-heading">Timelines</h3>}
          {failure(timelines)}
          {timelines.result && (
            <TimelineList
              result={timelines.result}
              list={list}
              state={state}
              query={query}
              basePath={basePath}
              onNavigate={navigate}
              loading={timelines.loading}
              layout={layout}
              resultsRef={timelineResults}
              guest={!signedIn}
              compareLimit={compareLimit}
            />
          )}
        </>
      )}
      {searches.entities && (
        <>
          <h3 id="entity-results-heading">Events</h3>
          {failure(entities)}
          {entities.result && (
            <EntityResults
              result={entities.result}
              list={list}
              state={state}
              query={query}
              basePath={basePath}
              onNavigate={navigate}
              loading={entities.loading}
              resultsRef={entityResults}
            />
          )}
        </>
      )}
      {!searches.timelines && !searches.entities && (
        <p className="muted">Type some words to search events.</p>
      )}
    </>
  );
}
