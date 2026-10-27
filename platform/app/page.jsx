// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// The dashboard at /: the signed-in account's timelines, favorites and browser drafts, and
// the public timelines to search and browse.
import Link from 'next/link';
import TimelineSearch from '../components/timeline-search.jsx';
import { accountCompareLimit, currentSession, userCompareLimit } from '../lib/session.js';
import { searchTimelines } from '../../server/collaboration.mjs';
import { CompareTray } from '../components/compare-selection.jsx';
import TimelineList from '../components/timeline-list.jsx';
import LegacyLinks from '../components/legacy-links.jsx';
import BrowserDrafts from '../components/browser-drafts.jsx';
import { profilePath } from '../../src/addresses.ts';
import { LISTS, pageQuery, readList } from '../lib/timeline-lists.js';
// Rendered for every request: it depends on who is signed in and on the query.
export const dynamic = 'force-dynamic';
// One address for search engines, whatever the query: searches, tags, sorts and pages are views
// of the same dashboard.
export const metadata = { alternates: { canonical: '/' } };
/** The dashboard's lists, by their names in lib/timeline-lists.js LISTS. */
const DASHBOARD_LISTS = ['explore', 'mine', 'favorites', 'drafts'];
/**
 * The dashboard (/).
 *
 * Reads the visitor's session, then searches the database directly (server/collaboration.mjs's
 * `searchTimelines`, not the HTTP API) for three lists at once: the public timelines that
 * match the query, and, when signed in, the account's own timelines and the ones it starred.
 * Each list searches, sorts and pages on its own, in its own query parameters
 * (lib/timeline-lists.js): `search`, `tag`, `sort` and `page` for the public timelines;
 * `mineSearch`, `mineTag`, `mineSort`, `mineVisibility` and `minePage` for the account's own;
 * likewise `favorite…` for its favorites and `draft…` for its browser drafts, which are
 * searched in the browser. So the address carries them all, and each list's links keep the
 * others'. Without a database, or when a search fails, the page still renders, with a notice,
 * since local editing works without the server.
 *
 * @param {{searchParams: Promise<Record<string, string|string[]>>}} props the address's query:
 *   each list's parameters, and `owner` to show one account's public timelines
 */
export default async function Dashboard({ searchParams }) {
  const params = await searchParams;
  const owner = typeof params.owner === 'string' ? params.owner.slice(0, 64) : '';
  // Each list's state, made safe, and the whole query as every link and form keeps it.
  const states = Object.fromEntries(
    DASHBOARD_LISTS.map((name) => [name, readList(params, LISTS[name])]),
  );
  const query = pageQuery(states, owner ? { owner } : {});
  /** A list's search, as searchTimelines takes it. */
  const search = (name, scope) => {
    const { search, tag, sort, visibility, page } = states[name];
    return { scope, search, tag, sort, page, ...(LISTS[name].visibility ? { visibility } : {}) };
  };
  // A guest's defaults, until the session says otherwise (and if reading it fails).
  let user = null,
    compareLimit = 8,
    userLimit = 8,
    mine,
    publicResults,
    favorites,
    error;
  try {
    const current = await currentSession();
    user = current.user;
    compareLimit = accountCompareLimit(current);
    userLimit = userCompareLimit(current);
    if (!current.services.pool)
      error = 'Server storage is unavailable. You can create or import a local timeline.';
    else
      [publicResults, mine, favorites] = await Promise.all([
        searchTimelines(
          current.services.pool,
          user?.id,
          { ...search('explore', 'public'), owner },
          current.services.featured,
        ),
        user ? searchTimelines(current.services.pool, user.id, search('mine', 'mine')) : null,
        user
          ? searchTimelines(current.services.pool, user.id, search('favorites', 'starred'))
          : null,
      ]);
  } catch {
    error = 'The timeline browser is temporarily unavailable. Local editing remains available.';
  }
  /** A list's search form, then its page of timelines. */
  const list = (name, result, props = {}) => (
    <>
      {/* Keyed by the list's state, so its fields start over from the address after a search. */}
      <TimelineSearch
        key={JSON.stringify(states[name])}
        list={LISTS[name]}
        state={states[name]}
        query={query}
      />
      {result && (
        <TimelineList
          compareLimit={compareLimit}
          result={result}
          list={LISTS[name]}
          state={states[name]}
          query={query}
          {...props}
        />
      )}
    </>
  );
  return (
    <main className="platform">
      <LegacyLinks />
      <div className="page-heading">
        <h1>Timelines</h1>
      </div>
      {/* The timelines picked to compare, from any of the lists below. */}
      <CompareTray limit={compareLimit} userLimit={userLimit} signedIn={!!user} />
      {user && <BrowserDrafts userId={user.id} query={query} />}
      {user && (
        <section id="dashboard-mine">
          <h2>Your timelines</h2>
          {mine && list('mine', mine)}
        </section>
      )}
      {user && (
        <section id="dashboard-favorites">
          <h2>Your favorites</h2>
          <Link href={profilePath(user.username)}>Your public profile</Link>
          {favorites && list('favorites', favorites)}
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
        <h2>{owner ? `${owner}’s public timelines` : 'Explore timelines'}</h2>
        {owner && <Link href="/">Browse all timelines</Link>}
        <p className="muted">
          Search titles, notes and tags across public timelines. Popularity combines stars and
          public forks.
        </p>
        {!user && <Link href="/login">Sign in to see your timelines</Link>}
        {list('explore', error ? null : publicResults, { guest: !user })}
        {error && (
          <p className="notice" role="status">
            {error}
          </p>
        )}
      </section>
    </main>
  );
}
