// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// A timeline's page, at /<owner>/<slug> (#148) or /timelines/<id>: the editor open at it, its
// first moments and related timelines (#447) as text, its link-preview metadata (its own image,
// when it has one, #339) and its structured data (#428).
// A copy still being prepared waits.
import Editor from '../../../components/editor.jsx';
import TimelineSummary from '../../../components/timeline-summary.jsx';
import PreparingCopy from '../../../components/preparing-copy.jsx';
import { accessibleTimeline, versionInfo } from '../../../lib/timeline.js';
import { timelinePath } from '../../../../src/addresses.ts';
import { relatedTimelines } from '../../../../server/collaboration.mjs';
import {
  firstMoments,
  jsonLd,
  pageMetadata,
  previewOf,
  timelineDescription,
  timelineStructuredData,
  timelineTitle,
  siteName,
} from '../../../lib/sharing.js';
export const dynamic = 'force-dynamic';
export async function generateMetadata({ params }) {
  const { id } = await params;
  const { timeline } = await accessibleTimeline(id, { bounds: true, preparing: true });
  return pageMetadata(
    timeline,
    timelinePath(timeline),
    timelineTitle(timeline),
    timelineDescription(timeline),
    previewOf(timeline),
  );
}
export default async function TimelinePage({ params }) {
  const { id } = await params;
  const { timeline, user, services } = await accessibleTimeline(id, {
    bounds: true,
    preparing: true,
  });
  // A large copy whose index is still being copied opens once it is ready.
  if (timeline.preparing)
    return (
      <main className="platform">
        <PreparingCopy id={id} />
      </main>
    );
  const [comparisonSources, moments, related] = await Promise.all([
    timeline.comparison
      ? Promise.all(
          timeline.comparison.sources.map((source) => services.store.access(source, user?.id)),
        )
      : [],
    timeline.comparison ? [] : firstMoments(services, timeline, 50, user?.id).catch(() => []),
    timeline.comparison || !services.pool
      ? []
      : relatedTimelines(services.pool, user?.id ?? null, timeline.id, services.featured ?? [])
          .then((r) => r.timelines)
          .catch(() => []),
  ]);
  const data = timelineStructuredData(timeline);
  return (
    <main className="editor-page">
      {data && (
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(data) }} />
      )}
      <TimelineSummary timeline={timeline} moments={moments} related={related} />
      <Editor
        siteName={siteName()}
        id={id}
        path={timelinePath(timeline)}
        comparisonSources={comparisonSources.map((source) => ({
          id: source.id,
          path: timelinePath(source),
          title: source.title,
        }))}
        canShare={timeline.canShare}
        timeline={versionInfo(timeline)}
        signedIn={!!user}
      />
    </main>
  );
}
