// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { accessibleTimeline } from '../../../../../lib/timeline.js';
import { Collaboration } from '../../../../../../server/collaboration.mjs';
import PullReview from '../../../../../components/pull-review.jsx';
export const dynamic = 'force-dynamic';
export default async function Pull({ params }) {
  const { id, pull } = await params;
  if (!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(pull)) notFound();
  const { services, user } = await accessibleTimeline(id);
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
      <Link href={'/timelines/' + id + '/pulls'}>← Pull requests</Link>
      <PullReview timelineId={id} initial={proposal} initialComments={comments} signedIn={!!user} />
    </main>
  );
}
