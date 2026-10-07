// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
import Link from 'next/link';
import TimelineSearch from '../components/timeline-search.jsx';
import { currentSession } from '../lib/session.js';
import { searchTimelines } from '../../server/collaboration.mjs';
import { CompareTray } from '../components/compare-selection.jsx';
import TimelineList from '../components/timeline-list.jsx';
import LegacyLinks from '../components/legacy-links.jsx';
export const dynamic = 'force-dynamic';
const pageNumber = (value) =>
  Math.max(1, Math.min(10000, Number.isSafeInteger(Number(value)) ? Number(value) : 1));
export default async function Dashboard({ searchParams }) {
  const params = await searchParams;
  const query = {
    search: typeof params.search === 'string' ? params.search.slice(0, 300) : '',
    tag: typeof params.tag === 'string' ? params.tag.slice(0, 64) : '',
    owner: typeof params.owner === 'string' ? params.owner.slice(0, 64) : '',
    page: String(pageNumber(params.page)),
    minePage: String(pageNumber(params.minePage)),
    favoritePage: String(pageNumber(params.favoritePage)),
    sort: ['featured', 'stars', 'popularity', 'alphabetical', 'age', 'relevance'].includes(
      params.sort,
    )
      ? params.sort
      : params.search
        ? 'relevance'
        : 'featured',
  };
  let user = null,
    mine,
    publicResults,
    favorites,
    error;
  try {
    const current = await currentSession();
    user = current.user;
    if (!current.services.pool)
      error = 'Server storage is unavailable. You can create or import a local timeline.';
    else
      [publicResults, mine, favorites] = await Promise.all([
        searchTimelines(
          current.services.pool,
          user?.id,
          {
            scope: 'public',
            page: Number(query.page),
            search: query.search,
            tag: query.tag,
            owner: query.owner,
            sort: query.sort,
          },
          current.services.featured,
        ),
        user
          ? searchTimelines(current.services.pool, user.id, {
              scope: 'mine',
              page: Number(query.minePage),
            })
          : null,
        user
          ? searchTimelines(current.services.pool, user.id, {
              scope: 'starred',
              page: Number(query.favoritePage),
              sort: 'age',
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
      {user && (
        <section id="dashboard-favorites">
          <h2>Your favorites</h2>
          <Link href={'/users/' + encodeURIComponent(user.username)}>Your public profile</Link>
          {favorites && <TimelineList result={favorites} query={query} favorites />}
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
          Search titles, notes and tags across public timelines. Popularity combines stars and
          public forks.
        </p>
        {!user && <Link href="/login">Sign in to see your timelines</Link>}
        <TimelineSearch key={JSON.stringify(query)} query={query} />
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
