// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
import Link from 'next/link';
import StarButton from './star-button.jsx';
import { CompareCheckbox } from './compare-selection.jsx';
function link(query, values, basePath = '/') {
  const p = new URLSearchParams({ ...query, ...values });
  return basePath + '?' + p;
}
export default function TimelineList({
  result,
  query,
  mine,
  guest,
  favorites = false,
  basePath = '/',
  pageKey: customPageKey,
}) {
  const pageKey = customPageKey ?? (mine ? 'minePage' : favorites ? 'favoritePage' : 'page');
  return (
    <>
      <div className="timeline-grid">
        {result.timelines.map((t) => (
          <article className="timeline-card" key={t.id}>
            <CompareCheckbox id={t.id} title={t.title || 'Untitled timeline'} />
            <h3>
              <Link href={'/timelines/' + t.id}>{t.title || 'Untitled timeline'}</Link>
            </h3>
            <p className="muted">
              <Link href={'/users/' + encodeURIComponent(t.owner)}>@{t.owner}</Link> ·{' '}
              {t.visibility} ·{' '}
              {t.comparison
                ? `${t.comparison.sources.length} timelines · Read-only comparison`
                : `${Number(t.event_count).toLocaleString()} moments`}
              {t.featured ? ' · Featured' : ''}
            </p>
            <p>{t.description?.slice(0, 220)}</p>
            <StarButton id={t.id} count={t.star_count} starred={t.starred} signedIn={!guest} />
            {guest && !t.comparison && (
              <Link className="button" href={'/editor?fork=' + t.id}>
                Fork in browser
              </Link>
            )}
            <div className="tags">
              {(t.tags ?? []).map((tag) => (
                <Link className="button" key={tag} href={link(query, { tag, page: '1' })}>
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
