// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
import { notFound, redirect } from 'next/navigation';
import { currentSession } from '../../../../lib/session.js';
import DeviceApproval from '../../../../components/device-approval.jsx';
export const dynamic = 'force-dynamic';
export default async function Desktop({ params }) {
  const { code } = await params;
  if (!/^[A-Z2-9]{10}$/.test(code)) notFound();
  const { user } = await currentSession();
  if (!user) redirect('/login?returnTo=' + encodeURIComponent('/connect/desktop/' + code));
  return (
    <main className="platform">
      <DeviceApproval code={code} />
    </main>
  );
}
