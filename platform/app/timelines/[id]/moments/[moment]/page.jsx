// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// A moment's own page: the timeline open at the moment, and what link previews show of it.
import { notFound } from 'next/navigation';
import Editor from '../../../../../components/editor.jsx';
import TimelineSummary from '../../../../../components/timeline-summary.jsx';
import { accessibleTimeline, versionInfo } from '../../../../../lib/timeline.js';
import { timelinePath } from '../../../../../../src/addresses.ts';
import {
  entityParam,
  excerpt,
  momentOf,
  momentTitle,
  pageMetadata,
  presentTime,
  sharedPath,
  timelineTitle,
} from '../../../../../lib/sharing.js';
export const dynamic = 'force-dynamic';
async function load(params) {
  const { id, moment } = await params;
  const entity = entityParam(moment);
  if (!entity) notFound();
  const found = await accessibleTimeline(id, { bounds: true });
  if (found.timeline.comparison) notFound();
  const event = await momentOf(found.services, found.timeline, entity, found.user?.id);
  if (!event) notFound();
  return { ...found, event };
}
export async function generateMetadata({ params }) {
  const { timeline, event } = await load(params);
  const time = presentTime(timeline, event.time);
  return pageMetadata(
    timeline,
    sharedPath(timeline, { kind: 'moment', id: event.id }),
    `${momentTitle(event)} · ${timelineTitle(timeline)}`,
    excerpt(`${time}. ${event.metadata?.description ?? ''}`) || time,
  );
}
export default async function MomentPage({ params }) {
  const { timeline, user, event } = await load(params);
  return (
    <main className="editor-page">
      <TimelineSummary timeline={timeline}>
        <h2>{momentTitle(event)}</h2>
        <p>
          <time>{presentTime(timeline, event.time)}</time>
        </p>
        {event.metadata?.description && <p>{excerpt(event.metadata.description, 4000)}</p>}
      </TimelineSummary>
      <Editor
        id={timeline.id}
        path={timelinePath(timeline)}
        focus={'moment/' + encodeURIComponent(event.id)}
        canShare={timeline.canShare}
        timeline={versionInfo(timeline)}
        signedIn={!!user}
      />
    </main>
  );
}
