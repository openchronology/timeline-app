// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// The page for an address with nothing the visitor may see: missing, or a private timeline.
import Link from 'next/link';
import { headers } from 'next/headers';
import { currentSession } from '../lib/session.js';
/**
 * Answered with 404 whether nothing is there or the visitor may not open it, so a private
 * timeline's address doesn't tell anyone that it exists (as 401 or 403 would). A guest is
 * offered to sign in and come back; a timeline's own address (#148) is where they return.
 */
export default async function NotFound() {
  let user = null;
  try {
    user = (await currentSession()).user;
  } catch {}
  let path = null;
  try {
    path = JSON.parse((await headers()).get('x-timeline-address'))?.path ?? null;
  } catch {}
  return (
    <main className="platform">
      <div className="account-card">
        <h1>Not found</h1>
        <p>There’s nothing here, or it’s a private timeline you can’t open.</p>
        {user ? (
          <p>
            You’re signed in as @{user.username}. If someone shared it with you, ask them to check
            it’s shared with this account.
          </p>
        ) : (
          <p>
            If it’s yours or was shared with you,{' '}
            <Link href={path ? '/login?returnTo=' + encodeURIComponent(path) : '/login'}>
              sign in
            </Link>{' '}
            to open it.
          </p>
        )}
        <p>
          <Link href="/">Back to the dashboard</Link>
        </p>
      </div>
    </main>
  );
}
