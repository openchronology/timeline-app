// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// A duration's own page: the timeline open at the duration, and what link previews show of it.
import { notFound } from 'next/navigation';
import Editor from '../../../../../components/editor.jsx';
import TimelineSummary from '../../../../../components/timeline-summary.jsx';
import { accessibleTimeline, versionInfo } from '../../../../../lib/timeline.js';
import { timelinePath } from '../../../../../../src/addresses.ts';
import {
  durationOf,
  durationTitle,
  entityParam,
  excerpt,
  pageMetadata,
  presentTime,
  sharedPath,
  timelineTitle,
  siteName,
} from '../../../../../lib/sharing.js';
export const dynamic = 'force-dynamic';
async function load(params) {
  const { id, duration } = await params;
  const entity = entityParam(duration);
  if (!entity) notFound();
  const found = await accessibleTimeline(id, { bounds: true });
  if (found.timeline.comparison) notFound();
  const result = await durationOf(found.services, found.timeline, entity, found.user?.id);
  if (!result) notFound();
  return { ...found, ...result };
}
export async function generateMetadata({ params }) {
  const { timeline, duration, band } = await load(params);
  const extent = `${presentTime(timeline, band.first)} – ${presentTime(timeline, band.last)}`;
  return pageMetadata(
    timeline,
    sharedPath(timeline, { kind: 'duration', id: band.id }),
    `${durationTitle(duration)} · ${timelineTitle(timeline)}`,
    excerpt(`${extent}. ${duration.metadata?.description ?? ''}`),
  );
}
export default async function DurationPage({ params }) {
  const { timeline, user, duration, band } = await load(params);
  return (
    <main className="editor-page">
      <TimelineSummary timeline={timeline}>
        <h2>{durationTitle(duration)}</h2>
        <p>
          <time>{presentTime(timeline, band.first)}</time> –{' '}
          <time>{presentTime(timeline, band.last)}</time>
        </p>
        {duration.metadata?.description && <p>{excerpt(duration.metadata.description, 4000)}</p>}
      </TimelineSummary>
      <Editor
        siteName={siteName()}
        id={timeline.id}
        path={timelinePath(timeline)}
        focus={'duration/' + encodeURIComponent(band.id)}
        canShare={timeline.canShare}
        timeline={versionInfo(timeline)}
        signedIn={!!user}
      />
    </main>
  );
}
