// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// A page of timelines as cards, with their owners, tags, labels and stars, compare
// checkboxes and links to more pages.
import Link from 'next/link';
import StarButton from './star-button.jsx';
import { describeLabels } from '../../src/content-labels.ts';
import { CompareCheckbox } from './compare-selection.jsx';
import { profilePath, timelinePath } from '../../src/addresses.ts';
import { listHref, statusText } from '../lib/timeline-lists.js';
/**
 * A page of timelines as cards, with the line saying how many there are and Previous and Next
 * links. A server component: it fetches nothing, and is given a search result
 * (server/collaboration.mjs's `searchTimelines`) by the dashboard or a profile. Its links
 * change only its own list's query parameters (lib/timeline-lists.js): a tag filters this
 * list by it, from page one, and the pager turns its pages, keeping the other lists' state.
 *
 * @param {object} props
 * @param {{timelines: object[], total: number, page: number, pages: number}} props.result
 *   one page of timelines and the counts for the pager
 * @param {object} props.list the list (lib/timeline-lists.js LISTS)
 * @param {{search: string, tag: string, sort: string, visibility: string, page: number}}
 *   props.state the list's state, as readList gives it
 * @param {Record<string, string>} props.query the page's whole query, kept in every link
 * @param {boolean} [props.guest] the visitor is not signed in: stars can't be given, and each
 *   timeline offers a fork into the browser instead
 * @param {string} [props.basePath] the page the links lead to (a profile passes its own)
 * @param {number} [props.compareLimit] how many timelines the visitor may compare
 */
export default function TimelineList({
  result,
  list,
  state,
  query,
  guest,
  basePath = '/',
  compareLimit = 8,
}) {
  const href = (changes) => listHref(basePath, query, list, state, changes);
  return (
    <>
      <div className="timeline-grid">
        {result.timelines.map((t) => (
          <article className="timeline-card" key={t.id}>
            <CompareCheckbox
              id={t.id}
              title={t.title || 'Untitled timeline'}
              limit={compareLimit}
            />
            <h3>
              <Link href={timelinePath(t)}>{t.title || 'Untitled timeline'}</Link>
            </h3>
            <p className="muted">
              <Link href={profilePath(t.owner)}>@{t.owner}</Link> · {t.visibility} ·{' '}
              {t.comparison
                ? `${t.comparison.sources.length} timelines · Read-only comparison`
                : `${Number(t.event_count).toLocaleString()} moments`}
              {t.featured ? ' · Featured' : ''}
            </p>
            {t.labels?.length > 0 && (
              <p className="sensitive-badge">Sensitive: {describeLabels(t.labels).toLowerCase()}</p>
            )}
            <p>{t.description?.slice(0, 220)}</p>
            <StarButton id={t.id} count={t.star_count} starred={t.starred} signedIn={!guest} />
            {/* A comparison is a read-only view of its sources: it can't be forked. */}
            {guest && !t.comparison && (
              <Link className="button" href={'/editor?fork=' + t.id}>
                Fork in browser
              </Link>
            )}
            <div className="tags">
              {(t.tags ?? []).map((tag) => (
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
    </>
  );
}
