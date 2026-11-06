// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// A duration's own page: the timeline open at the duration, the duration as text and as
// structured data for search engines (#335) with its links to other timelines (#422), and
// what link previews show of it.
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
  entityBreadcrumbs,
  entityParam,
  eventListed,
  entityStructuredData,
  jsonLd,
  linksOf,
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
  const { timeline, services, duration, band } = await load(params);
  const entity = { kind: 'duration', id: band.id };
  return entityMetadata(
    timeline,
    entity,
    durationTitle(duration),
    `${presentTime(timeline, band.first)} – ${presentTime(timeline, band.last)}`,
    duration.metadata?.description,
    // Not for search engines unless its timeline lists it (#467).
    { listed: await eventListed(services, timeline, entity) },
  );
}
export default async function DurationPage({ params }) {
  const { timeline, user, services, duration, band } = await load(params);
  const entity = { kind: 'duration', id: band.id };
  const [related, elsewhere] = await Promise.all([
    relatedOf(services, timeline, entity, user?.id).catch(() => []),
    // Its links to other timelines (#422), so either end's page leads to the other.
    linksOf(services, timeline, entity, user?.id).catch(() => []),
  ]);
  const data = entityStructuredData(timeline, {
    ...entity,
    title: durationTitle(duration),
    notes: duration.metadata?.description,
    first: band.first,
    last: band.last,
    tags: entityFacts(timeline, duration.metadata).tags,
  });
  const trail = entityBreadcrumbs(timeline, entity, durationTitle(duration));
  return (
    <main className="editor-page">
      {data && (
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(data) }} />
      )}
      {/* Its trail: its timeline's owner, the timeline, it (#474). */}
      {trail && (
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(trail) }} />
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
          elsewhere={elsewhere}
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
