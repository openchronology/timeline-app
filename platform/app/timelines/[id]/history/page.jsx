// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
import Link from 'next/link';
import { accessibleTimeline } from '../../../../lib/timeline.js';
import { Versioning } from '../../../../../server/versioning.mjs';
export const dynamic = 'force-dynamic';
export default async function History({ params, searchParams }) {
  const { id } = await params,
    query = await searchParams;
  const { services, user, timeline } = await accessibleTimeline(id);
  const history = await new Versioning(services.store).history(
    id,
    user?.id,
    Number(query.page ?? 1),
  );
  return (
    <main className="platform">
      <Link href={'/timelines/' + id}>← Timeline</Link>
      <h1>Saved history: {timeline.title}</h1>
      <p>
        Each server save, sync and merge creates an immutable checkpoint. Earlier history from
        before this upgrade is unavailable.
      </p>
      {history.revisions.map((r) => (
        <article className="timeline-card" key={r.id}>
          <h2>
            <Link href={'/timelines/' + id + '/history/' + r.id}>
              Revision {r.number} · {r.kind}
            </Link>
          </h2>
          <p>
            {r.author ? '@' + r.author : 'Former account'} · {new Date(r.created_at).toISOString()}
          </p>
          <p className="muted">
            <code>{r.id}</code> · {r.parents.length} parent{r.parents.length === 1 ? '' : 's'}
          </p>
        </article>
      ))}
      <nav className="pager">
        {history.page > 1 && <Link href={'?page=' + (history.page - 1)}>Previous</Link>}
        <span>Page {history.page}</span>
        {history.more && <Link href={'?page=' + (history.page + 1)}>Next</Link>}
      </nav>
    </main>
  );
}
