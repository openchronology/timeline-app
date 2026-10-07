// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api } from '../lib/api.js';
export default function PullReview({ timelineId, initial, initialComments, signedIn }) {
  const router = useRouter(),
    [p, setProposal] = useState(initial),
    [comments, setComments] = useState(initialComments.comments),
    [cursor, setCursor] = useState(initialComments.next),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const base = 'timelines/' + timelineId + '/proposals/' + p.id;
  async function perform(operation) {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await operation();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function resolve(action) {
    await perform(async () => {
      const s = await api('session');
      const value = await api(base + '/resolve', {
        method: 'POST',
        csrf: s.csrf,
        data: { action, revision: p.revision },
      });
      setProposal(value);
      router.refresh();
    });
  }
  async function more() {
    await perform(async () => {
      const page = await api(base + '/comments?' + new URLSearchParams({ after: cursor }));
      setComments((v) => [...v, ...page.comments]);
      setCursor(page.next);
    });
  }
  async function updateFromFork() {
    await perform(async () => {
      const s = await api('session');
      const value = await api(base, {
        method: 'PUT',
        csrf: s.csrf,
        data: {
          title: p.title,
          body: p.body,
          revision: p.revision,
          sourceTimelineId: p.source.id,
          sourceRevisionId: p.source.head_revision_id,
        },
      });
      setProposal(value);
      router.refresh();
    });
  }
  async function comment(event) {
    event.preventDefault();
    const form = event.currentTarget,
      body = new FormData(form).get('body');
    await perform(async () => {
      const s = await api('session');
      await api(base + '/comments', { method: 'POST', csrf: s.csrf, data: { body } });
      const page = await api(base + '/comments');
      setComments(page.comments);
      setCursor(page.next);
      form.reset();
    });
  }
  const old = new Map(p.base_document.events.map((e) => [e.id, e])),
    now = new Map(p.document.events.map((e) => [e.id, e]));
  const added = p.document.events.filter((e) => !old.has(e.id)),
    removed = p.base_document.events.filter((e) => !now.has(e.id)),
    changed = p.document.events.filter(
      (e) => old.has(e.id) && JSON.stringify(old.get(e.id)) !== JSON.stringify(e),
    );
  return (
    <>
      <h1>{p.title}</h1>
      <p>
        @{p.author} · {p.status} · Base revision {p.base_revision} · Upstream {p.upstreamRevision}
      </p>
      <p className="preserve-text">{p.body}</p>
      {p.from_fork && (
        <p className="muted">
          Pinned fork checkpoint: <code>{p.source_revision_id}</code>. Saving the fork does not
          update this review automatically.
        </p>
      )}
      <section>
        <h2>Changes</h2>
        <p>
          {added.length} added, {removed.length} removed, {changed.length} changed moments.
        </p>
        {['title', 'description', 'tags', 'presentation', 'plugins', 'assets']
          .filter((k) => JSON.stringify(p.base_document[k]) !== JSON.stringify(p.document[k]))
          .map((k) => (
            <p key={k}>Changed timeline {k}.</p>
          ))}
        {[
          ['Added', added],
          ['Removed', removed],
          ['Changed', changed],
        ].map(([label, events]) => (
          <div key={label}>
            {events.slice(0, 30).map((e) => (
              <details key={e.id}>
                <summary>
                  {label}: {e.metadata.title || 'Unnamed moment'} · {e.time}
                </summary>
                {label === 'Changed' && <pre>{JSON.stringify(old.get(e.id), null, 2)}</pre>}
                <pre>{JSON.stringify(e, null, 2)}</pre>
              </details>
            ))}
            {events.length > 30 && (
              <p>
                {events.length - 30} more {label.toLowerCase()} moments in the proposed snapshot.
              </p>
            )}
          </div>
        ))}
      </section>
      <div className="actions">
        {p.canUpdate &&
          p.source?.canWrite &&
          p.source.head_revision_id !== p.source_revision_id && (
            <button disabled={busy} onClick={updateFromFork}>
              Update from saved fork
            </button>
          )}
        {p.canMerge && (
          <>
            <button disabled={busy} className="primary" onClick={() => resolve('merge')}>
              Merge
            </button>
            <button disabled={busy} onClick={() => resolve('reject')}>
              Reject
            </button>
          </>
        )}
        {p.canClose && (
          <button disabled={busy} onClick={() => resolve('close')}>
            Close
          </button>
        )}
        {p.canUpdate && p.base_revision !== p.upstreamRevision && (
          <button disabled={busy} onClick={() => resolve('rebase')}>
            Rebase on upstream
          </button>
        )}
      </div>
      <p className="error" role="alert">
        {error}
      </p>
      <section>
        <h2>Discussion</h2>
        {comments.map((c) => (
          <article className="timeline-card" key={c.id}>
            <p>
              @{c.author} ·{' '}
              {new Date(c.created_at).toISOString().replace('T', ' ').replace('Z', ' UTC')}
            </p>
            <p className="preserve-text">{c.body}</p>
          </article>
        ))}
        {cursor && (
          <button disabled={busy} onClick={more}>
            More comments
          </button>
        )}
        {signedIn ? (
          <form onSubmit={comment}>
            <label>
              Add a comment
              <textarea name="body" required maxLength={20000} />
            </label>
            <button disabled={busy}>Comment</button>
          </form>
        ) : (
          <Link href="/login">Sign in to comment</Link>
        )}
      </section>
    </>
  );
}
