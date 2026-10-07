// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
import Link from 'next/link';
import Form from 'next/form';
import { currentSession } from '../lib/session.js';
import { searchTimelines } from '../../server/collaboration.mjs';
import { CompareCheckbox, CompareTray } from '../components/compare-selection.jsx';
import LegacyLinks from '../components/legacy-links.jsx';
export const dynamic = 'force-dynamic';
const pageNumber = (value) =>
  Math.max(1, Math.min(10000, Number.isSafeInteger(Number(value)) ? Number(value) : 1));
function link(query, values) {
  const p = new URLSearchParams({ ...query, ...values });
  return '/?' + p;
}
function TimelineList({ result, query, mine, guest }) {
  const pageKey = mine ? 'minePage' : 'page';
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
              @{t.owner} · {t.visibility} ·{' '}
              {t.comparison
                ? `${t.comparison.sources.length} timelines · Read-only comparison`
                : `${Number(t.event_count).toLocaleString()} moments`}
              {t.featured ? ' · Featured' : ''}
            </p>
            <p>{t.description?.slice(0, 220)}</p>
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
            : 'No public timelines match this search.'}
      </p>
      {result.pages > 1 && (
        <nav className="pager" aria-label={mine ? 'Your timeline pages' : 'Public timeline pages'}>
          {result.page > 1 && (
            <Link href={link(query, { [pageKey]: String(result.page - 1) })}>Previous</Link>
          )}
          {result.page < result.pages && (
            <Link href={link(query, { [pageKey]: String(result.page + 1) })}>Next</Link>
          )}
        </nav>
      )}
    </>
  );
}
export default async function Dashboard({ searchParams }) {
  const params = await searchParams;
  const query = {
    search: typeof params.search === 'string' ? params.search.slice(0, 300) : '',
    tag: typeof params.tag === 'string' ? params.tag.slice(0, 64) : '',
    owner: typeof params.owner === 'string' ? params.owner.slice(0, 64) : '',
    page: String(pageNumber(params.page)),
    minePage: String(pageNumber(params.minePage)),
  };
  let user = null,
    mine,
    publicResults,
    error;
  try {
    const current = await currentSession();
    user = current.user;
    if (!current.services.pool)
      error = 'Server storage is unavailable. You can create or import a local timeline.';
    else
      [publicResults, mine] = await Promise.all([
        searchTimelines(
          current.services.pool,
          user?.id,
          {
            scope: 'public',
            page: Number(query.page),
            search: query.search,
            tag: query.tag,
            owner: query.owner,
          },
          current.services.featured,
        ),
        user
          ? searchTimelines(current.services.pool, user.id, {
              scope: 'mine',
              page: Number(query.minePage),
            })
          : null,
      ]);
  } catch {
    error = 'The timeline browser is temporarily unavailable. Local editing remains available.';
  }
  return (
    <main className="platform">
      <LegacyLinks />
      <div className="page-heading">
        <h1>Timelines</h1>
      </div>
      <CompareTray />
      {user && (
        <section id="dashboard-mine">
          <h2>Your timelines</h2>
          {mine && <TimelineList result={mine} query={query} mine />}
        </section>
      )}
      <section className="dashboard-introduction">
        <h2>Explore an exact timeline</h2>
        <p>Pan and zoom through a sample timeline to see nearby moments gather and separate.</p>
        <Link className="button" href="/editor?demo=dense">
          Explore 20,000 sample moments ↗
        </Link>
      </section>
      <section id="dashboard-browser">
        <h2>{query.owner ? `${query.owner}’s public timelines` : 'Explore timelines'}</h2>
        {query.owner && <Link href="/">Browse all timelines</Link>}
        <p className="muted">
          Featured timelines appear first. Search titles, notes and tags across public timelines.
        </p>
        {!user && <Link href="/login">Sign in to see your timelines</Link>}
        <Form action="/" className="search-controls">
          {query.owner && <input type="hidden" name="owner" value={query.owner} />}
          <label>
            Search timelines
            <input
              name="search"
              maxLength={300}
              defaultValue={query.search}
              placeholder='Keywords or "exact phrase"'
            />
          </label>
          <label>
            Filter by tag
            <input name="tag" maxLength={64} defaultValue={query.tag} />
          </label>
          <button type="submit">Search</button>
        </Form>
        {error ? (
          <p className="notice" role="status">
            {error}
          </p>
        ) : (
          publicResults && <TimelineList result={publicResults} query={query} guest={!user} />
        )}
      </section>
    </main>
  );
}
