// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// The dashboard at /: the signed-in account's timelines, favorites and browser drafts, and
// the public timelines to search and browse.
import Link from 'next/link';
import TimelineSearch from '../components/timeline-search.jsx';
import { accountCompareLimit, currentSession } from '../lib/session.js';
import { searchTimelines } from '../../server/collaboration.mjs';
import { CompareTray } from '../components/compare-selection.jsx';
import TimelineList from '../components/timeline-list.jsx';
import LegacyLinks from '../components/legacy-links.jsx';
import BrowserDrafts from '../components/browser-drafts.jsx';
import { profilePath } from '../../src/addresses.ts';
// Rendered for every request: it depends on who is signed in and on the query.
export const dynamic = 'force-dynamic';
/** A page number from the address: a whole number from 1 to 10,000, or 1 when it is not one. */
const pageNumber = (value) =>
  Math.max(1, Math.min(10000, Number.isSafeInteger(Number(value)) ? Number(value) : 1));
/**
 * The dashboard (/).
 *
 * Reads the visitor's session, then searches the database directly (server/collaboration.mjs's
 * `searchTimelines`, not the HTTP API) for three lists at once: the public timelines that
 * match the query, and, when signed in, the account's own timelines and the ones it starred.
 * Each list pages on its own (`page`, `minePage`, `favoritePage`), so the query carries all
 * three. Without a database, or when a search fails, the page still renders, with a notice,
 * since local editing works without the server.
 *
 * @param {{searchParams: Promise<Record<string, string|string[]>>}} props the address's query:
 *   `search`, `tag`, `owner`, `sort` and the three page numbers
 */
export default async function Dashboard({ searchParams }) {
  const params = await searchParams;
  // The query, made safe: strings only (a repeated parameter is an array, and ignored), cut to
  // a length the search accepts, and a sort it knows. A search sorts by relevance unless asked
  // otherwise; browsing without one shows the featured timelines first.
  const query = {
    search: typeof params.search === 'string' ? params.search.slice(0, 300) : '',
    tag: typeof params.tag === 'string' ? params.tag.slice(0, 64) : '',
    owner: typeof params.owner === 'string' ? params.owner.slice(0, 64) : '',
    page: String(pageNumber(params.page)),
    minePage: String(pageNumber(params.minePage)),
    favoritePage: String(pageNumber(params.favoritePage)),
    sort: [
      'featured',
      'stars',
      'popularity',
      'trending',
      'alphabetical',
      'age',
      'relevance',
    ].includes(params.sort)
      ? params.sort
      : params.search
        ? 'relevance'
        : 'featured',
  };
  // A guest's defaults, until the session says otherwise (and if reading it fails).
  let user = null,
    compareLimit = 8,
    mine,
    publicResults,
    favorites,
    error;
  try {
    const current = await currentSession();
    user = current.user;
    compareLimit = accountCompareLimit(current);
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
      {/* The timelines picked to compare, from any of the lists below. */}
      <CompareTray limit={compareLimit} signedIn={!!user} />
      {user && <BrowserDrafts userId={user.id} />}
      {user && (
        <section id="dashboard-mine">
          <h2>Your timelines</h2>
          {mine && <TimelineList compareLimit={compareLimit} result={mine} query={query} mine />}
        </section>
      )}
      {user && (
        <section id="dashboard-favorites">
          <h2>Your favorites</h2>
          <Link href={profilePath(user.username)}>Your public profile</Link>
          {favorites && (
            <TimelineList compareLimit={compareLimit} result={favorites} query={query} favorites />
          )}
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
        {/* Keyed by the query, so its fields start over from the address after a search. */}
        <TimelineSearch key={JSON.stringify(query)} query={query} />
        {error ? (
          <p className="notice" role="status">
            {error}
          </p>
        ) : (
          publicResults && (
            <TimelineList
              compareLimit={compareLimit}
              result={publicResults}
              query={query}
              guest={!user}
            />
          )
        )}
      </section>
    </main>
  );
}
