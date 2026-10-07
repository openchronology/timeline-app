// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { accessibleTimeline } from '../../../../lib/timeline.js';
import TimelineSettings from '../../../../components/timeline-settings.jsx';
export const dynamic = 'force-dynamic';
export default async function Settings({ params }) {
  const { id } = await params,
    { services, timeline } = await accessibleTimeline(id);
  if (!timeline.canShare) notFound();
  const { rows } = await services.pool.query(
    'SELECT u.username,m.role FROM oc_members m JOIN oc_users u ON u.id=m.user_id WHERE timeline_id=$1 ORDER BY u.username',
    [id],
  );
  return (
    <main className="platform">
      <Link href={'/timelines/' + id}>← {timeline.title || 'Untitled timeline'}</Link>
      <TimelineSettings initial={timeline} initialMembers={rows} />
    </main>
  );
}
