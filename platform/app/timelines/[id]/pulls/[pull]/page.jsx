// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// One pull request at …/pulls/<id>: its changes and discussion, to review, merge or close
// (components/pull-review.jsx).
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { accessibleTimeline } from '../../../../../lib/timeline.js';
import { timelinePath } from '../../../../../../src/addresses.ts';
import { Collaboration } from '../../../../../../server/collaboration.mjs';
import PullReview from '../../../../../components/pull-review.jsx';
import { pageTitle, timelineTitle } from '../../../../../lib/sharing.js';
export const dynamic = 'force-dynamic';
/** The page's title: what it is, and the timeline's (#210). */
export async function generateMetadata({ params }) {
  const { id } = await params;
  const { timeline } = await accessibleTimeline(id);
  return { title: pageTitle('Pull request', timelineTitle(timeline)) };
}
export default async function Pull({ params }) {
  const { id, pull } = await params;
  if (!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(pull)) notFound();
  const { services, user, timeline } = await accessibleTimeline(id);
  const service = new Collaboration(services.store);
  let proposal, comments;
  try {
    proposal = await service.get(id, pull, user?.id);
    comments = await service.comments(id, pull, user?.id);
  } catch (e) {
    if (e.status === 404) notFound();
    throw e;
  }
  return (
    <main className="platform">
      <Link href={timelinePath(timeline) + '/pulls'}>← Pull requests</Link>
      <PullReview
        timelineId={id}
        initial={proposal}
        initialComments={comments}
        signedIn={!!user}
        username={user?.username}
      />
    </main>
  );
}
