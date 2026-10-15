// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { accessibleTimeline } from '../../../../lib/timeline.js';
import TimelineSettings from '../../../../components/timeline-settings.jsx';
import { calendar, printRetention } from '../../../../../server/retention.mjs';
import { NEWCOMER_DAYS, FULL_DAYS } from '../../../../../server/standing.mjs';
export const dynamic = 'force-dynamic';
export default async function Settings({ params }) {
  const { id } = await params,
    { services, timeline } = await accessibleTimeline(id);
  if (!timeline.canShare) notFound();
  const { rows } = await services.pool.query(
    'SELECT u.username,m.role FROM oc_members m JOIN oc_users u ON u.id=m.user_id WHERE timeline_id=$1 ORDER BY u.username',
    [id],
  );
  // Whether browsing lists it (#103): its owner is established, or it is featured.
  const listed =
    timeline.featured ||
    (
      await services.pool.query(
        'SELECT 1 FROM oc_account_standing WHERE user_id=$1 AND standing>0',
        [timeline.owner_id],
      )
    ).rows.length > 0;
  return (
    <main className="platform">
      <Link href={'/timelines/' + id}>← {timeline.title || 'Untitled timeline'}</Link>
      <TimelineSettings
        initial={{
          ...timeline,
          retention: timeline.retention_seconds
            ? printRetention(timeline.retention_seconds, timeline.presentation)
            : null,
          history_bytes: timeline.keep_history
            ? await services.store.historyBytes(services.pool, id)
            : 0,
        }}
        initialMembers={rows}
        listing={{ listed, newcomerDays: NEWCOMER_DAYS, fullDays: FULL_DAYS }}
        calendar={!!calendar(timeline.presentation) && !timeline.comparison}
      />
    </main>
  );
}
