// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
import Account from '../../components/account.jsx';
import { safeReturnTo } from '../../lib/navigation.js';
export const dynamic = 'force-dynamic';
export default async function Login({ searchParams }) {
  const params = await searchParams;
  return (
    <main className="platform">
      <Account login returnTo={safeReturnTo(params.returnTo)} />
    </main>
  );
}
