// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
import { redirect } from 'next/navigation';
import { currentSession } from '../../lib/session.js';
import Admin from '../../components/admin.jsx';
export const dynamic = 'force-dynamic';
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
