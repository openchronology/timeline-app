// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// A duration's own page: the timeline open at the duration, the duration as text and as
// structured data for search engines (#335), and what link previews show of it.
import { notFound } from 'next/navigation';
import Editor from '../../../../../components/editor.jsx';
import EntitySummary from '../../../../../components/entity-summary.jsx';
import TimelineSummary from '../../../../../components/timeline-summary.jsx';
import { accessibleTimeline, versionInfo } from '../../../../../lib/timeline.js';
import { timelinePath } from '../../../../../../src/addresses.ts';
import {
  durationOf,
  durationTitle,
  entityFacts,
  entityMetadata,
  entityParam,
  entityStructuredData,
  jsonLd,
  presentTime,
  relatedOf,
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
  return entityMetadata(
    timeline,
    { kind: 'duration', id: band.id },
    durationTitle(duration),
    `${presentTime(timeline, band.first)} – ${presentTime(timeline, band.last)}`,
    duration.metadata?.description,
  );
}
export default async function DurationPage({ params }) {
  const { timeline, user, services, duration, band } = await load(params);
  const entity = { kind: 'duration', id: band.id };
  const related = await relatedOf(services, timeline, entity, user?.id).catch(() => []);
  const data = entityStructuredData(timeline, {
    ...entity,
    title: durationTitle(duration),
    notes: duration.metadata?.description,
    first: band.first,
    last: band.last,
    tags: entityFacts(timeline, duration.metadata).tags,
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
          title={durationTitle(duration)}
          first={band.first}
          last={band.last}
          metadata={duration.metadata}
          related={related}
        />
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
