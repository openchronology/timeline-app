// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// A moment's own page: the timeline open at the moment, the moment as text and as structured
// data for search engines (#335), and what link previews show of it.
import { notFound } from 'next/navigation';
import Editor from '../../../../../components/editor.jsx';
import EntitySummary from '../../../../../components/entity-summary.jsx';
import TimelineSummary from '../../../../../components/timeline-summary.jsx';
import { accessibleTimeline, versionInfo } from '../../../../../lib/timeline.js';
import { timelinePath } from '../../../../../../src/addresses.ts';
import {
  entityFacts,
  entityMetadata,
  entityParam,
  entityStructuredData,
  jsonLd,
  momentOf,
  momentTitle,
  presentTime,
  relatedOf,
  siteName,
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
  return entityMetadata(
    timeline,
    { kind: 'moment', id: event.id },
    momentTitle(event),
    presentTime(timeline, event.time),
    event.metadata?.description,
  );
}
export default async function MomentPage({ params }) {
  const { timeline, user, services, event } = await load(params);
  const entity = { kind: 'moment', id: event.id };
  const related = await relatedOf(services, timeline, entity, user?.id).catch(() => []);
  const data = entityStructuredData(timeline, {
    ...entity,
    title: momentTitle(event),
    notes: event.metadata?.description,
    first: event.time,
    last: event.time,
    tags: entityFacts(timeline, event.metadata).tags,
  });
  return (
    <main className="editor-page">
      {data && (
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(data) }} />
      )}
      <TimelineSummary timeline={timeline}>
        <EntitySummary
          timeline={timeline}
          {...entity}
          title={momentTitle(event)}
          first={event.time}
          metadata={event.metadata}
          related={related}
        />
      </TimelineSummary>
      <Editor
        siteName={siteName()}
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
