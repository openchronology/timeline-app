// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '../lib/api.js';
export default function ForkOperation({ fork, upstream, sync = false }) {
  const router = useRouter(),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  async function submit(event) {
    event.preventDefault();
    if (busy) return;
    const fields = new FormData(event.currentTarget);
    setBusy(true);
    setError('');
    try {
      const session = await api('session');
      if (sync) {
        await api('timelines/' + fork.id + '/sync', {
          method: 'POST',
          csrf: session.csrf,
          data: { revision: fork.revision },
        });
        router.push('/timelines/' + fork.id);
      } else {
        const p = await api('timelines/' + upstream.id + '/proposals', {
          method: 'POST',
          csrf: session.csrf,
          data: {
            title: fields.get('title'),
            body: fields.get('body'),
            sourceTimelineId: fork.id,
            sourceRevisionId: fork.head_revision_id,
          },
        });
        router.push('/timelines/' + upstream.id + '/pulls/' + p.id);
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={submit} className="account-card">
      <h1>{sync ? 'Sync upstream' : 'Propose saved changes'}</h1>
      <p>
        From <strong>{fork.title}</strong> {sync ? 'with' : 'into'}{' '}
        <strong>{upstream.title}</strong>.
      </p>
      <p className="muted">
        Only saved revisions participate. Save browser edits to your fork first.
      </p>
      {!sync && (
        <>
          <p className="muted">
            Source checkpoint: <code>{fork.head_revision_id}</code>. Later saves will not change
            this proposal automatically.
          </p>
          <label>
            Title
            <input name="title" required maxLength={300} />
          </label>
          <label>
            Description
            <textarea name="body" maxLength={20000} />
          </label>
        </>
      )}
      {sync && (
        <p>
          Independent changes will merge into a new saved revision of your fork. Conflicts preserve
          both versions and leave your fork unchanged.
        </p>
      )}
      <button className="primary" disabled={busy}>
        {sync ? 'Sync saved fork' : 'Open pull request'}
      </button>
      <p className="error" role="alert">
        {error}
      </p>
    </form>
  );
}
