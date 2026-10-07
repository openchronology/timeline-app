// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
import Editor from '../../../components/editor.jsx';
import { accessibleTimeline, versionInfo } from '../../../lib/timeline.js';
export const dynamic = 'force-dynamic';
export default async function TimelinePage({ params }) {
  const { id } = await params;
  const { timeline, user, services } = await accessibleTimeline(id);
  const comparisonSources = timeline.comparison
    ? await Promise.all(
        timeline.comparison.sources.map((source) => services.store.access(source, user?.id)),
      )
    : [];
  return (
    <main className="editor-page">
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
