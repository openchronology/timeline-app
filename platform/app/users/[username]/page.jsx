// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
import Link from 'next/link';
import { CompareTray } from '../../../components/compare-selection.jsx';
import { notFound } from 'next/navigation';
import { currentSession } from '../../../lib/session.js';
import { searchTimelines } from '../../../../server/collaboration.mjs';
import TimelineList from '../../../components/timeline-list.jsx';
export const dynamic = 'force-dynamic';
const pageNumber = (n) =>
  Math.max(1, Math.min(10000, Number.isSafeInteger(Number(n)) ? Number(n) : 1));
export default async function Profile({ params, searchParams }) {
  const { username } = await params,
    query = await searchParams,
    current = await currentSession();
  if (!current.services.pool || typeof username !== 'string' || username.length > 64) notFound();
  const { rows } = await current.services.pool.query(
    'SELECT username,avatar_url FROM oc_users WHERE username=$1 AND NOT is_disabled',
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
  const basePath = '/users/' + encodeURIComponent(username),
    pages = { page: String(owned.page), favoritePage: String(favorites.page) };
  return (
    <main className="platform">
      <Link href="/">All timelines</Link>
      {rows[0].avatar_url && (
        <img className="account-avatar" src={rows[0].avatar_url} alt="" width={64} height={64} />
      )}
      <h1>@{username}</h1>
      <CompareTray />
      <section>
        <h2>Public timelines</h2>
        <TimelineList result={owned} query={pages} basePath={basePath} guest={!current.user} />
      </section>
      <section>
        <h2>Public favorites</h2>
        <TimelineList
          result={favorites}
          query={pages}
          basePath={basePath}
          favorites
          guest={!current.user}
        />
      </section>
    </main>
  );
}
