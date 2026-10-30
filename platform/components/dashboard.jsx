// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// The dashboard: the signed-in account's timelines, favorites and browser drafts, and the
// public timelines to search and browse; at / or, with the landing page on, /explore (#379).
import Link from 'next/link';
import { accountCompareLimit, currentSession, userCompareLimit } from '../lib/session.js';
import { searchTimelines } from '../../server/collaboration.mjs';
import { CompareTray } from './compare-selection.jsx';
import TimelineBrowser from './timeline-browser.jsx';
import LegacyLinks from './legacy-links.jsx';
import BrowserDrafts from './browser-drafts.jsx';
import { profilePath } from '../../src/addresses.ts';
import { LISTS, readList, searchBody } from '../lib/timeline-lists.js';
/**
 * The dashboard, at `basePath`: / or /explore.
 *
 * Reads the visitor's session, then searches the database directly (server/collaboration.mjs's
 * `searchTimelines`, not the HTTP API) for three lists at once: the public timelines that
 * match the query, and, when signed in, the account's own timelines and the ones it starred.
 * Each list searches, sorts and pages on its own, in its own query parameters
 * (lib/timeline-lists.js): `search`, `tag`, `sort` and `page` for the public timelines;
 * `mineSearch`, `mineTag`, `mineSort`, `mineVisibility` and `minePage` for the account's own;
 * likewise `favorite…` for its favorites and `draft…` for its browser drafts, which are
 * searched in the browser. So the address carries them all, and each list's links keep the
 * others'. What renders here is what shows without JavaScript; with it, each list
 * (components/timeline-browser.jsx) then searches in place, without loading the page again.
 * Without a database, or when a search fails, the page still renders, with a notice, since
 * local editing works without the server.
 *
 * @param {object} props
 * @param {Promise<Record<string, string|string[]>>} props.searchParams the address's query:
 *   each list's parameters, and `owner` to show one account's public timelines
 * @param {string} [props.basePath] the page's address, which the lists' links and forms load
 */
export default async function Dashboard({ searchParams, basePath = '/' }) {
  const params = await searchParams;
  const owner = typeof params.owner === 'string' ? params.owner.slice(0, 64) : '';
  // Each list's state, made safe, and what the page fixes in its search.
  const states = {
    explore: readList(params, LISTS.explore),
    mine: readList(params, LISTS.mine),
    favorites: readList(params, LISTS.favorites),
  };
  const fixed = {
    explore: { scope: 'public', ...(owner ? { owner } : {}) },
    mine: { scope: 'mine' },
    favorites: { scope: 'starred' },
  };
  const search = (name) => searchBody(LISTS[name], states[name], fixed[name]);
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
          search('explore'),
          current.services.featured,
        ),
        user ? searchTimelines(current.services.pool, user.id, search('mine')) : null,
        user ? searchTimelines(current.services.pool, user.id, search('favorites')) : null,
      ]);
  } catch {
    error = 'The timeline browser is temporarily unavailable. Local editing remains available.';
  }
  /** A list, searched in place: its controls, then its page of timelines. */
  const list = (name, result, props = {}) => (
    <TimelineBrowser
      name={name}
      initialState={states[name]}
      initialResult={error ? null : (result ?? null)}
      fixed={fixed[name]}
      compareLimit={compareLimit}
      basePath={basePath}
      {...props}
    />
  );
  return (
    <main className="platform">
      <LegacyLinks />
      <div className="page-heading">
        <h1>Timelines</h1>
      </div>
      {/* The timelines picked to compare, from any of the lists below. */}
      <CompareTray limit={compareLimit} userLimit={userLimit} signedIn={!!user} />
      {user && <BrowserDrafts userId={user.id} />}
      {user && (
        <section id="mine" aria-labelledby="mine-heading">
          <h2 id="mine-heading">Your timelines</h2>
          {list('mine', mine, {
            emptyAction: (
              <a className="button primary" href="/editor?new=1">
                ＋ New timeline
              </a>
            ),
          })}
        </section>
      )}
      {user && (
        <section id="favorites" aria-labelledby="favorites-heading">
          <h2 id="favorites-heading">Your favorites</h2>
          <Link href={profilePath(user.username)}>Your public profile</Link>
          {list('favorites', favorites, {
            emptyAction: <p className="muted">Star a timeline (☆ Star) to keep it here.</p>,
          })}
        </section>
      )}
      <section className="dashboard-introduction">
        <h2>Explore an exact timeline</h2>
        <p>Pan and zoom through a sample timeline to see nearby moments gather and separate.</p>
        <Link className="button" href="/editor?demo=dense">
          Explore 20,000 sample moments ↗
        </Link>
      </section>
      <section id="explore" aria-labelledby="explore-heading">
        <h2 id="explore-heading">{owner ? `${owner}’s public timelines` : 'Explore timelines'}</h2>
        {owner && <Link href={basePath + '#explore'}>Browse all timelines</Link>}
        <p className="muted">
          Search titles, notes and tags across public timelines. Popularity combines stars and
          public forks.
        </p>
        {!user && <Link href="/login">Sign in to see your timelines</Link>}
        {list('explore', publicResults, { guest: !user })}
        {error && (
          <p className="notice" role="status">
            {error}
          </p>
        )}
      </section>
    </main>
  );
}
