// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
import Link from 'next/link';
import { accessibleTimeline } from '../../../../lib/timeline.js';
import { Collaboration } from '../../../../../server/collaboration.mjs';
export const dynamic = 'force-dynamic';
export default async function Pulls({ params, searchParams }) {
  const { id } = await params,
    query = await searchParams;
  const page = Math.max(
    1,
    Math.min(10000, Number.isSafeInteger(Number(query.page)) ? Number(query.page) : 1),
  );
  const { services, user, timeline } = await accessibleTimeline(id);
  const result = await new Collaboration(services.store).list(id, user?.id, { page, limit: 12 });
  const base = '/timelines/' + id;
  return (
    <main className="platform">
      <Link href={base}>← {timeline.title || 'Untitled timeline'}</Link>
      <h1>Pull requests</h1>
      <p>
        Recommend changes from the timeline editor. Only owners and writers can merge changes into
        upstream.
      </p>
      <div className="timeline-grid">
        {result.proposals.map((p) => (
          <article className="timeline-card" key={p.id}>
            <h2>
              <Link href={base + '/pulls/' + p.id}>{p.title}</Link>
            </h2>
            <p>
              @{p.author} · {p.status} · Base revision {p.base_revision}
            </p>
          </article>
        ))}
      </div>
      <p>
        {result.total} pull requests · Page {page} of {Math.max(1, result.pages)}
      </p>
      <nav className="pager" aria-label="Pull request pages">
        {page > 1 && <Link href={base + '/pulls?page=' + (page - 1)}>Previous</Link>}
        {page < result.pages && <Link href={base + '/pulls?page=' + (page + 1)}>Next</Link>}
      </nav>
    </main>
  );
}
