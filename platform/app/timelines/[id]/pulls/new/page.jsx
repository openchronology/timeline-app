// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { accessibleTimeline, versionInfo } from '../../../../../lib/timeline.js';
import ForkOperation from '../../../../../components/fork-operation.jsx';
import {
  PULLS_UNAVAILABLE,
  FORK_PULLS_UNAVAILABLE,
} from '../../../../../../server/collaboration.mjs';
export const dynamic = 'force-dynamic';
export default async function NewPull({ params }) {
  const { id } = await params;
  const { timeline } = await accessibleTimeline(id);
  if (!timeline.canWrite || !timeline.upstream_id) notFound();
  const { timeline: upstream } = await accessibleTimeline(timeline.upstream_id);
  if (!upstream.canPropose) notFound();
  return (
    <main className="platform">
      <Link href={'/timelines/' + id}>← Your fork</Link>
      <ForkOperation
        fork={versionInfo(timeline)}
        upstream={versionInfo(upstream)}
        blocked={
          !upstream.keep_history
            ? PULLS_UNAVAILABLE
            : !timeline.keep_history
              ? FORK_PULLS_UNAVAILABLE
              : null
        }
      />
    </main>
  );
}
