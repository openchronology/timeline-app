// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
import Editor from '../../../components/editor.jsx';
import TimelineSummary from '../../../components/timeline-summary.jsx';
import { accessibleTimeline, versionInfo } from '../../../lib/timeline.js';
import {
  firstMoments,
  pageMetadata,
  timelineDescription,
  timelineTitle,
} from '../../../lib/sharing.js';
export const dynamic = 'force-dynamic';
export async function generateMetadata({ params }) {
  const { id } = await params;
  const { timeline } = await accessibleTimeline(id, { bounds: true });
  return pageMetadata(
    timeline,
    '/timelines/' + timeline.id,
    timelineTitle(timeline),
    timelineDescription(timeline),
  );
}
export default async function TimelinePage({ params }) {
  const { id } = await params;
  const { timeline, user, services } = await accessibleTimeline(id, { bounds: true });
  const [comparisonSources, moments] = await Promise.all([
    timeline.comparison
      ? Promise.all(
          timeline.comparison.sources.map((source) => services.store.access(source, user?.id)),
        )
      : [],
    timeline.comparison ? [] : firstMoments(services, timeline, 50, user?.id).catch(() => []),
  ]);
  return (
    <main className="editor-page">
      <TimelineSummary timeline={timeline} moments={moments} />
      <Editor
        id={id}
        comparisonSources={comparisonSources.map((source) => ({
          id: source.id,
          title: source.title,
        }))}
        canShare={timeline.canShare}
        timeline={versionInfo(timeline)}
        signedIn={!!user}
      />
    </main>
  );
}
