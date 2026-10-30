// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// Signing in at /login, then returning to ?returnTo= when it is one of the site's own pages
// (lib/navigation.js).
import Account from '../../components/account.jsx';
import { safeReturnTo } from '../../lib/navigation.js';
import { pageTitle } from '../../lib/sharing.js';
import { browserPath } from '../../../server/landing.mjs';
export const dynamic = 'force-dynamic';
export function generateMetadata() {
  return { title: pageTitle('Sign in') };
}
export default async function Login({ searchParams }) {
  const params = await searchParams;
  return (
    <main className="platform">
      {/* Without a page to return to, the dashboard: /explore with the landing page on (#379). */}
      <Account login returnTo={safeReturnTo(params.returnTo, browserPath())} />
    </main>
  );
}
