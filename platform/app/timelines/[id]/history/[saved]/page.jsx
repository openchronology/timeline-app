// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { accessibleTimeline } from '../../../../../lib/timeline.js';
import { Versioning } from '../../../../../../server/versioning.mjs';
import RevisionDownload from '../../../../../components/revision-download.jsx';
export const dynamic = 'force-dynamic';
export default async function Saved({ params }) {
  const { id, saved } = await params;
  const { services, user } = await accessibleTimeline(id);
  let snapshot;
  try {
    snapshot = await new Versioning(services.store).historical(id, saved, user?.id);
  } catch (e) {
    if (e.status === 400 || e.status === 404) notFound();
    throw e;
  }
  return (
    <main className="platform">
      <Link href={'/timelines/' + id + '/history'}>← Saved history</Link>
      <h1>{snapshot.document.title}</h1>
      <p>
        Saved checkpoint <code>{saved}</code> · {snapshot.document.events.length} moments.
      </p>
      <RevisionDownload document={snapshot.document} savedId={saved} />
      <details>
        <summary>Saved timeline document</summary>
        <pre>{JSON.stringify(snapshot.document, null, 2)}</pre>
      </details>
    </main>
  );
}
