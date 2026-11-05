// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// A page of the moments and durations Explore's search found (#459), each leading to its own
// page, with the line saying how many there are and Previous and Next links.
import { profilePath, timelinePath } from '../../src/addresses.ts';
import { Pager } from './timeline-list.jsx';
import { listHref } from '../lib/timeline-lists.js';
import { searchTerms } from '../../src/highlight.ts';
import Highlight from './highlight.jsx';

/** What the moments and durations are called in the pager and status line. */
const ENTITIES = { noun: 'events' };

/** The line under the results: how many there are and which page this is. */
export function entityStatus(result) {
  if (!result.total) return 'No events match this search.';
  const count = result.totalMore
    ? `${result.total.toLocaleString('en')}+`
    : result.total.toLocaleString('en');
  return `${count} ${result.total === 1 && !result.totalMore ? 'match' : 'matches'} · Page ${result.page} of ${result.pages}`;
}

/**
 * A page of moments and durations (server/library-search.mjs's `searchEntities`). Each shows
 * whether it is a moment or a duration, its title as a link to its page, its time as its
 * timeline shows times, its timeline (a link) and owner, and its notes where they match, the
 * search's words marked in them and the title. Its
 * pager changes only `entityPage`, in place with `onNavigate`.
 *
 * @param {object} props
 * @param {{entities: object[], total: number, totalMore?: boolean, page: number, pages: number}} props.result
 * @param {object} props.list the list (lib/timeline-lists.js LISTS.explore)
 * @param {object} props.state the list's state
 * @param {Record<string, string>} props.query the page's whole query, kept in every link
 * @param {string} [props.basePath]
 * @param {(changes: object) => void} [props.onNavigate]
 * @param {boolean} [props.loading] a search is on its way: the results dim
 * @param {import('react').Ref<HTMLOListElement>} [props.resultsRef]
 */
export default function EntityResults({
  result,
  list,
  state,
  query,
  basePath = '/',
  onNavigate,
  loading = false,
  resultsRef,
}) {
  const href = (changes) => listHref(basePath, query, list, state, changes);
  const terms = searchTerms(state.search);
  return (
    <>
      <ol
        ref={resultsRef}
        tabIndex={-1}
        className="entity-results"
        aria-label="Results: events"
        aria-busy={loading ? 'true' : undefined}
      >
        {result.entities.map((e) => {
          const timeline = timelinePath(e.timeline);
          return (
            <li key={`${e.timeline.id}/${e.kind}/${e.id}`} className="entity-result">
              <h4 className="entity-result-title">
                <span className="entity-kind">{e.kind === 'moment' ? 'Moment' : 'Duration'}</span>
                <a href={`${timeline}/${e.kind}s/${encodeURIComponent(e.id)}`}>
                  <Highlight text={e.title || 'Untitled'} terms={terms} />
                </a>
              </h4>
              <div className="entity-result-meta">
                {e.when} · on <a href={timeline}>{e.timeline.title || 'Untitled timeline'}</a> by{' '}
                <a href={profilePath(e.timeline.owner)}>{e.timeline.owner}</a>
              </div>
              {e.snippet && (
                <p>
                  <Highlight text={e.snippet} terms={terms} />
                </p>
              )}
            </li>
          );
        })}
      </ol>
      <p className="list-status" role="status">
        {loading ? 'Searching…' : entityStatus(result)}
      </p>
      <Pager
        list={ENTITIES}
        result={result}
        href={(changes) => href({ entityPage: changes.page })}
        onPage={
          onNavigate &&
          ((event, page) => {
            event.preventDefault();
            onNavigate({ entityPage: page });
          })
        }
      />
    </>
  );
}
