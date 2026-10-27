// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// A profile (#148): at /<username>, or /users/<username> for names the site's pages use.
import Link from 'next/link';
import { CompareTray } from './compare-selection.jsx';
import { notFound } from 'next/navigation';
import { accountCompareLimit, currentSession, userCompareLimit } from '../lib/session.js';
import { searchTimelines } from '../../server/collaboration.mjs';
import TimelineList from './timeline-list.jsx';
import { siteName } from '../lib/sharing.js';
import { minor } from '../../server/auth.mjs';
import ReportLink from './report-link.jsx';
import { profilePath } from '../../src/addresses.ts';
import TimelineSearch from './timeline-search.jsx';
import { LISTS, pageQuery, readList } from '../lib/timeline-lists.js';
export function profileMetadata(username) {
  const title = '@' + username,
    description = `Public timelines and favorites of @${username} on ${siteName()}.`,
    url = profilePath(username);
  return {
    title: `${title} · ${siteName()}`,
    description,
    alternates: { canonical: url },
    openGraph: { type: 'profile', siteName: siteName(), title, description, url, username },
    twitter: { card: 'summary', title, description },
  };
}
export default async function Profile({ username, searchParams }) {
  const query = await searchParams,
    current = await currentSession();
  if (!current.services.pool || typeof username !== 'string' || username.length > 64) notFound();
  const { rows } = await current.services.pool.query(
    'SELECT username,avatar_url,birth_year FROM oc_users WHERE username=$1 AND NOT is_disabled',
    [username],
  );
  if (!rows[0]) notFound();
  // Its two lists search, sort and page apart (#337), each in its own query parameters
  // (lib/timeline-lists.js): `search`, `tag`, `sort` and `page` for its public timelines, and
  // `favoriteSearch` and so on for its public favorites.
  const states = {
      profile: readList(query, LISTS.profile),
      profileFavorites: readList(query, LISTS.profileFavorites),
    },
    pageState = pageQuery(states);
  const search = (name) => {
    const { search, tag, sort, page } = states[name];
    return { scope: 'public', search, tag, sort, page };
  };
  const [owned, favorites] = await Promise.all([
    searchTimelines(
      current.services.pool,
      current.user?.id,
      { ...search('profile'), owner: username },
      current.services.featured,
    ),
    searchTimelines(
      current.services.pool,
      current.user?.id,
      { ...search('profileFavorites'), starredBy: username },
      current.services.featured,
    ),
  ]);
  const basePath = profilePath(username);
  /** A list's search form, then its page of timelines. */
  const list = (name, result) => (
    <>
      {/* Keyed by the list's state, so its fields start over from the address after a search. */}
      <TimelineSearch
        key={JSON.stringify(states[name])}
        list={LISTS[name]}
        state={states[name]}
        query={pageState}
        basePath={basePath}
      />
      <TimelineList
        compareLimit={accountCompareLimit(current)}
        result={result}
        list={LISTS[name]}
        state={states[name]}
        query={pageState}
        basePath={basePath}
        guest={!current.user}
      />
    </>
  );
  return (
    <main className="platform">
      <Link href="/">All timelines</Link>
      {rows[0].avatar_url && (
        <img className="account-avatar" src={rows[0].avatar_url} alt="" width={64} height={64} />
      )}
      <h1>@{username}</h1>
      {current.user?.username !== username && (
        <ReportLink target={{ kind: 'user', id: username }} title={'@' + username} />
      )}
      <CompareTray
        limit={accountCompareLimit(current)}
        userLimit={userCompareLimit(current)}
        signedIn={!!current.user}
      />
      <section id="profile-timelines">
        <h2>Public timelines</h2>
        {list('profile', owned)}
      </section>
      {/* A minor's favorites stay private (the UK Children's Code; #166). */}
      {!minor(rows[0].birth_year) && (
        <section id="profile-favorites">
          <h2>Public favorites</h2>
          {list('profileFavorites', favorites)}
        </section>
      )}
    </main>
  );
}
