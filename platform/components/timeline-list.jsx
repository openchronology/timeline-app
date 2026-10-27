// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// A page of timelines as cards (timeline-card.jsx), in a grid or a list, with the line
// saying how many there are, an empty state, and Previous and Next links (#337, #338).
import TimelineCard, { SkeletonCard } from './timeline-card.jsx';
import { isFiltered, listHref, statusText } from '../lib/timeline-lists.js';
/** Whether a click is a plain one, which a list may handle in place; others open as links. */
export const plainClick = (event) =>
  event.button === 0 &&
  !event.metaKey &&
  !event.ctrlKey &&
  !event.shiftKey &&
  !event.altKey &&
  !event.defaultPrevented;
/**
 * Arrow keys between the cards' titles: Left and Right to the previous and next card, Up and
 * Down a row (as many cards as the grid has columns), Home and End to the first and last.
 */
export function moveBetweenCards(event) {
  const links = [...event.currentTarget.querySelectorAll('.timeline-card-title a')],
    index = links.indexOf(event.target);
  if (index < 0) return;
  const columns =
    getComputedStyle(event.currentTarget).gridTemplateColumns.split(' ').filter(Boolean).length ||
    1;
  const to = {
    ArrowRight: index + 1,
    ArrowLeft: index - 1,
    ArrowDown: index + columns,
    ArrowUp: index - columns,
    Home: 0,
    End: links.length - 1,
  }[event.key];
  if (to === undefined || event.altKey || event.ctrlKey || event.metaKey) return;
  event.preventDefault();
  links[Math.max(0, Math.min(links.length - 1, to))].focus();
}
/** Previous and Next, as links to the list's other pages. */
export function Pager({ list, result, href, onPage }) {
  if (result.pages <= 1) return null;
  const link = (page, text, rel) => (
    <a
      href={href({ page })}
      rel={rel}
      onClick={onPage && ((event) => plainClick(event) && onPage(event, page))}
    >
      {text}
    </a>
  );
  return (
    <nav className="pager" aria-label={`Pages of ${list.noun}`}>
      {result.page > 1 && link(result.page - 1, '← Previous', 'prev')}
      {result.page < result.pages && link(result.page + 1, 'Next →', 'next')}
    </nav>
  );
}
/**
 * What a list shows when it has nothing, beside the status line that says why: a search
 * that found nothing offers to clear it, and an empty list what to do (`action`).
 */
export function EmptyList({ state, href, onClear, action }) {
  const filtered = isFiltered(state);
  if (!filtered && !action) return null;
  return (
    <div className="empty-state">
      {filtered && <p>Try other words or another tag.</p>}
      {filtered ? (
        <a
          className="button"
          href={href({ search: '', tag: '', visibility: '' })}
          onClick={onClear && ((event) => plainClick(event) && onClear(event))}
        >
          Clear the search
        </a>
      ) : (
        action
      )}
    </div>
  );
}
/**
 * A page of timelines as cards, the line saying how many there are, and the pager. It
 * fetches nothing: it is given a search result (server/collaboration.mjs's
 * `searchTimelines`), by the page or by TimelineBrowser after a search in place. Its links
 * change only its own list's query parameters (lib/timeline-lists.js) and keep the rest of
 * `query`; with `onNavigate`, a plain click on a tag or page changes the list in place.
 *
 * @param {object} props
 * @param {{timelines: object[], total: number, page: number, pages: number}} props.result
 * @param {object} props.list the list (lib/timeline-lists.js LISTS)
 * @param {object} props.state the list's state, as readList gives it
 * @param {Record<string, string>} props.query the page's whole query, kept in every link
 * @param {(changes: object, options?: object) => void} [props.onNavigate]
 * @param {boolean} [props.loading] a search is on its way: the cards dim and shimmer
 * @param {'grid'|'list'} [props.layout]
 * @param {import('react').ReactNode} [props.emptyAction] what an empty list offers to do
 * @param {import('react').Ref<HTMLDivElement>} [props.resultsRef] the cards' container
 * @param {boolean} [props.guest] the visitor is not signed in
 * @param {string} [props.basePath] the page the links lead to (a profile passes its own)
 * @param {number} [props.compareLimit] how many timelines the visitor may compare
 */
export default function TimelineList({
  result,
  list,
  state,
  query,
  onNavigate,
  loading = false,
  layout = 'grid',
  emptyAction,
  resultsRef,
  guest,
  basePath = '/',
  compareLimit = 8,
}) {
  const href = (changes) => listHref(basePath, query, list, state, changes);
  const empty = !result.timelines.length;
  return (
    <>
      <div
        ref={resultsRef}
        tabIndex={-1}
        className={`timeline-grid${layout === 'list' ? ' list-layout' : ''}`}
        aria-busy={loading ? 'true' : undefined}
        aria-label={`Results: ${list.noun}`}
        role="region"
        onKeyDown={moveBetweenCards}
      >
        <span className="list-progress" aria-hidden="true" />
        {result.timelines.map((t) => (
          <TimelineCard
            key={t.id}
            timeline={t}
            guest={guest}
            compareLimit={compareLimit}
            activeTag={state.tag}
            tagHref={(tag) => href({ tag })}
            onTag={
              onNavigate &&
              ((event, tag) => {
                if (!plainClick(event)) return;
                event.preventDefault();
                onNavigate({ tag });
              })
            }
          />
        ))}
        {empty && loading && [0, 1, 2].map((i) => <SkeletonCard key={i} />)}
      </div>
      <p className="list-status" role="status">
        {loading ? 'Searching…' : statusText(list, state, result)}
      </p>
      {empty && !loading && (
        <EmptyList
          state={state}
          href={href}
          action={emptyAction}
          onClear={
            onNavigate &&
            ((event) => {
              event.preventDefault();
              onNavigate({ search: '', tag: '', visibility: '' });
            })
          }
        />
      )}
      <Pager
        list={list}
        result={result}
        href={href}
        onPage={
          onNavigate &&
          ((event, page) => {
            event.preventDefault();
            onNavigate({ page });
          })
        }
      />
    </>
  );
}
