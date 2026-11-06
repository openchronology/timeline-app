// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// The dashboard: the signed-in account's browser drafts, and Explore, which searches and
// browses the library, the account's own timelines and those it starred; at / or, with the
// landing page on, /explore (#379).
import Link from 'next/link';
import { accountCompareLimit, currentSession, userCompareLimit } from '../lib/session.js';
import { searchTimelines } from '../../server/collaboration.mjs';
import { CompareTray } from './compare-selection.jsx';
import LibraryBrowser from './library-browser.jsx';
import { searchEntities } from '../../server/library-search.mjs';
import LegacyLinks from './legacy-links.jsx';
import BrowserDrafts from './browser-drafts.jsx';
import { profilePath } from '../../src/addresses.ts';
import { LISTS, librarySearches, readList } from '../lib/timeline-lists.js';
/**
 * The dashboard, at `basePath`: / or /explore.
 *
 * Reads the visitor's session, then searches the database directly (server/collaboration.mjs's
 * `searchTimelines` and server/library-search.mjs's `searchEntities`, not the HTTP API) for
 * Explore's timelines and, with search text, its moments and durations (#459;
 * components/library-browser.jsx). Signed in, Explore's filters also narrow it to the
 * account's own timelines (`within`), those it starred (`starred`) and public or private ones
 * (`visibility`), in place of the separate lists of its own timelines and favorites.
 * Each list searches, sorts and pages on its own, in its own query parameters
 * (lib/timeline-lists.js): `search`, `tag`, `sort`, `visibility` and `page` for Explore, with
 * `show`, `within`, `starred` and `entityPage`; `draft…` for its browser drafts, which are
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
  const state = readList(params, LISTS.explore);
  const fixed = { scope: 'public', ...(owner ? { owner } : {}) };
  // A guest's defaults, until the session says otherwise (and if reading it fails).
  let user = null,
    compareLimit = 8,
    userLimit = 8,
    publicResults,
    entityResults,
    error;
  try {
    const current = await currentSession();
    user = current.user;
    compareLimit = accountCompareLimit(current);
    userLimit = userCompareLimit(current);
    if (!current.services.pool)
      error = 'Server storage is unavailable. You can create or import a local timeline.';
    else {
      // Explore's two searches (#459): its timelines, and with words its moments and durations.
      const library = librarySearches(LISTS.explore, state, fixed, { signedIn: !!user });
      [publicResults, entityResults] = await Promise.all([
        library.timelines &&
          searchTimelines(
            current.services.pool,
            user?.id,
            library.timelines,
            current.services.featured,
          ),
        library.entities && searchEntities(current.services.pool, user?.id, library.entities),
      ]);
    }
  } catch {
    error = 'The timeline browser is temporarily unavailable. Local editing remains available.';
  }
  return (
    <main className="platform">
      <LegacyLinks />
      <div className="page-heading">
        <h1>Timelines</h1>
        {user && (
          <div className="page-actions">
            <a className="button primary" href="/editor?new=1">
              ＋ New timeline
            </a>
            <Link className="button" href={profilePath(user.username)}>
              Your public profile
            </Link>
          </div>
        )}
      </div>
      {/* The timelines picked to compare, from any of the lists below. */}
      <CompareTray limit={compareLimit} userLimit={userLimit} signedIn={!!user} />
      {user && <BrowserDrafts userId={user.id} />}
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
          Search the titles and notes of timelines and their events (moments and durations).
          Popularity combines stars and public forks.
          {user && ' Filters narrow it to your own timelines, or those you starred.'}
        </p>
        {!user && <Link href="/login">Sign in to see your timelines</Link>}
        <LibraryBrowser
          initialState={state}
          initialTimelines={error ? null : (publicResults ?? null)}
          initialEntities={error ? null : (entityResults ?? null)}
          fixed={fixed}
          signedIn={!!user}
          compareLimit={compareLimit}
          basePath={basePath}
        />
        {error && (
          <p className="notice" role="status">
            {error}
          </p>
        )}
      </section>
    </main>
  );
}
