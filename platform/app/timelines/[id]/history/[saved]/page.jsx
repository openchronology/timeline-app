// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { accessibleTimeline } from '../../../../../lib/timeline.js';
import { Versioning } from '../../../../../../server/versioning.mjs';
import RevisionDownload from '../../../../../components/revision-download.jsx';
export const dynamic = 'force-dynamic';
/** Checkpoints of timelines up to this many moments are shown inline; larger ones only download. */
const SHOWN = 5000;
export default async function Saved({ params }) {
  const { id, saved } = await params;
  const { services, user, timeline } = await accessibleTimeline(id);
  const versions = new Versioning(services.store);
  let snapshot = null;
  try {
    if (Number(timeline.event_count ?? 0) <= SHOWN)
      snapshot = await versions.historical(id, saved, user?.id);
    else if (!(await versions.historyRevision(id, saved, user?.id))) notFound();
  } catch (e) {
    if (e.status === 400 || e.status === 404) notFound();
    // Not kept: the timeline keeps no saved history.
    if (e.status === 409)
      return (
        <main className="platform">
          <Link href={'/timelines/' + id + '/history'}>← Saved history</Link>
          <h1>Revision not kept</h1>
          <p>{e.message}</p>
        </main>
      );
    throw e;
  }
  return (
    <main className="platform">
      <Link href={'/timelines/' + id + '/history'}>← Saved history</Link>
      <h1>{snapshot?.document.title ?? timeline.title}</h1>
      <p>
        Saved checkpoint <code>{saved}</code>
        {snapshot && <> · {snapshot.document.events.length} moments</>}.
      </p>
      <RevisionDownload timelineId={id} savedId={saved} />
      {snapshot ? (
        <details>
          <summary>Saved timeline document</summary>
          <pre>{JSON.stringify(snapshot.document, null, 2)}</pre>
        </details>
      ) : (
        <p className="muted">
          This timeline has over {SHOWN.toLocaleString('en')} moments: export the checkpoint to read
          it.
        </p>
      )}
    </main>
  );
}
