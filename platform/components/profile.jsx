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
const pageNumber = (n) =>
  Math.max(1, Math.min(10000, Number.isSafeInteger(Number(n)) ? Number(n) : 1));
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
  const [owned, favorites] = await Promise.all([
    searchTimelines(current.services.pool, current.user?.id, {
      scope: 'public',
      owner: username,
      page: pageNumber(query.page),
    }),
    searchTimelines(current.services.pool, current.user?.id, {
      scope: 'public',
      starredBy: username,
      page: pageNumber(query.favoritePage),
      sort: 'age',
    }),
  ]);
  const basePath = profilePath(username),
    pages = { page: String(owned.page), favoritePage: String(favorites.page) };
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
      <section>
        <h2>Public timelines</h2>
        <TimelineList
          compareLimit={accountCompareLimit(current)}
          result={owned}
          query={pages}
          basePath={basePath}
          guest={!current.user}
        />
      </section>
      {/* A minor's favorites stay private (the UK Children's Code; #166). */}
      {!minor(rows[0].birth_year) && (
        <section>
          <h2>Public favorites</h2>
          <TimelineList
            compareLimit={accountCompareLimit(current)}
            result={favorites}
            query={pages}
            basePath={basePath}
            favorites
            guest={!current.user}
          />
        </section>
      )}
    </main>
  );
}
