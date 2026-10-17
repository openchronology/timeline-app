// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// A page of timelines as cards, with their owners, tags, labels and stars, compare
// checkboxes and links to more pages.
import Link from 'next/link';
import StarButton from './star-button.jsx';
import { describeLabels } from '../../src/content-labels.ts';
import { CompareCheckbox } from './compare-selection.jsx';
import { profilePath, timelinePath } from '../../src/addresses.ts';
/**
 * The address of the list with some of its query changed: the current query (search, tag,
 * owner, sort and each list's page) with `values` over it, so changing one list's page or
 * choosing a tag keeps everything else.
 */
function link(query, values, basePath = '/') {
  const p = new URLSearchParams({ ...query, ...values });
  return basePath + '?' + p;
}
/**
 * A page of timelines as cards, with the line saying how many there are and Previous and Next
 * links. A server component: it fetches nothing, and is given a search result
 * (server/collaboration.mjs's `searchTimelines`) by the dashboard or a profile.
 *
 * @param {object} props
 * @param {{timelines: object[], total: number, page: number, pages: number}} props.result
 *   one page of timelines and the counts for the pager
 * @param {Record<string, string>} props.query the page's whole query, kept in every link
 * @param {boolean} [props.mine] the account's own timelines (its empty message and page key)
 * @param {boolean} [props.guest] the visitor is not signed in: stars can't be given, and each
 *   timeline offers a fork into the browser instead
 * @param {boolean} [props.favorites] the account's starred timelines
 * @param {string} [props.basePath] the page the pager links to (a profile passes its own)
 * @param {string} [props.pageKey] the query parameter of this list's page, when the defaults
 *   (`minePage`, `favoritePage` or `page`) don't fit
 * @param {number} [props.compareLimit] how many timelines the visitor may compare
 */
export default function TimelineList({
  result,
  query,
  mine,
  guest,
  favorites = false,
  basePath = '/',
  pageKey: customPageKey,
  compareLimit = 8,
}) {
  const pageKey = customPageKey ?? (mine ? 'minePage' : favorites ? 'favoritePage' : 'page');
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
                // A tag searches the dashboard's public timelines (always /), from page one; a
                // profile's own pages (its favorites page) don't carry over.
                <Link
                  className="button"
                  key={tag}
                  href={link(basePath === '/' ? query : {}, { tag, page: '1' })}
                >
                  {tag}
                </Link>
              ))}
            </div>
          </article>
        ))}
      </div>
      <p role="status">
        {result.total
          ? `${result.total} timelines · Page ${result.page} of ${result.pages}`
          : mine
            ? 'You have no server timelines yet.'
            : favorites
              ? 'No favorites yet.'
              : 'No public timelines match this search.'}
      </p>
      {result.pages > 1 && (
        <nav
          className="pager"
          aria-label={
            mine
              ? 'Your timeline pages'
              : favorites
                ? 'Favorite timeline pages'
                : 'Public timeline pages'
          }
        >
          {result.page > 1 && (
            <Link href={link(query, { [pageKey]: String(result.page - 1) }, basePath)}>
              Previous
            </Link>
          )}
          {result.page < result.pages && (
            <Link href={link(query, { [pageKey]: String(result.page + 1) }, basePath)}>Next</Link>
          )}
        </nav>
      )}
    </>
  );
}
