// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// The account page at /account: sign-in, security, sessions, API keys and moderation
// decisions (components/account.jsx).
import Account from '../../components/account.jsx';
import { pageTitle } from '../../lib/sharing.js';
export const dynamic = 'force-dynamic';
export function generateMetadata() {
  return { title: pageTitle('Account') };
}
export default function AccountPage() {
  return (
    <main className="platform">
      <Account />
    </main>
  );
}
