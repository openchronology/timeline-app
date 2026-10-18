// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// Site administration at /admin, for administrators only (components/admin.jsx); anyone
// signed out is sent to sign in first.
import { redirect } from 'next/navigation';
import { currentSession } from '../../lib/session.js';
import Admin from '../../components/admin.jsx';
import { pageTitle } from '../../lib/sharing.js';
export const dynamic = 'force-dynamic';
export function generateMetadata() {
  return { title: pageTitle('Administration') };
}
export default async function AdminPage() {
  const { user } = await currentSession();
  if (!user) redirect('/login?returnTo=%2Fadmin');
  if (!user.isAdmin)
    return (
      <main className="platform">
        <h1>Administrator access required</h1>
      </main>
    );
  return (
    <main className="platform">
      <Admin />
    </main>
  );
}
