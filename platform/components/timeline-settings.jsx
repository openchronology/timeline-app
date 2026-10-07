// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
'use client';
import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { dismissOnBackdrop } from '../../src/dialogs.ts';
import { api } from '../lib/api.js';
export default function TimelineSettings({ initial, initialMembers }) {
  const router = useRouter(),
    dialog = useRef(null),
    [timeline, setTimeline] = useState(initial),
    [members, setMembers] = useState(initialMembers),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  useEffect(() => dismissOnBackdrop(dialog.current), []);
  const base = 'timelines/' + timeline.id;
  async function mutate(path, method, data) {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const s = await api('session');
      const value = await api(base + path, { method, csrf: s.csrf, data });
      if (path === '/settings') setTimeline(value);
      if (path === '/members') setMembers((await api(base + '/members')).members);
      if (path === '') router.replace('/');
      else router.refresh();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  function member(event) {
    event.preventDefault();
    const f = new FormData(event.currentTarget);
    void mutate('/members', 'POST', { username: f.get('username'), role: f.get('role') });
  }
  return (
    <>
      <h1>Sharing &amp; settings</h1>
      <section>
        <h2>Visibility</h2>
        <label>
          Who can view this timeline?
          <select
            value={timeline.visibility}
            disabled={busy}
            onChange={(e) => mutate('/settings', 'PATCH', { visibility: e.target.value })}
          >
            <option value="private">Private — invited accounts only</option>
            <option value="public" disabled={timeline.publication_restricted}>
              Public — anyone can view upstream
            </option>
          </select>
        </label>
        <p className="muted">
          Public timelines appear in search and expose their saved history. Signed-in viewers can
          fork and recommend changes; only writers and the owner can change upstream.
        </p>
        <p>
          Share: <a href={'/timelines/' + timeline.id}>{'/timelines/' + timeline.id}</a>
        </p>
        {timeline.publication_restricted && (
          <p className="muted">This copy contains private upstream data and must remain private.</p>
        )}
        <label>
          <input
            type="checkbox"
            checked={timeline.allow_private_forks}
            disabled={busy}
            onChange={(e) => mutate('/settings', 'PATCH', { allowPrivateForks: e.target.checked })}
          />
          Allow invited readers to fork this timeline while private
        </label>
        <p className="muted">
          Forks have independent owners and collaborators. Revoking access stops future upstream
          reads and syncs, but cannot erase copies already made.
        </p>
      </section>
      <section>
        <h2>Collaborators</h2>
        {members.map((m) => (
          <p key={m.username}>
            @{m.username} · {m.role}{' '}
            <button
              disabled={busy}
              onClick={() => mutate('/members', 'DELETE', { username: m.username })}
            >
              Remove
            </button>
          </p>
        ))}
        <form onSubmit={member}>
          <label>
            Username
            <input name="username" required maxLength={32} />
          </label>
          <label>
            Access
            <select name="role">
              <option value="viewer">Viewer — read</option>
              <option value="contributor">Contributor — propose changes</option>
              <option value="writer">Writer — merge and publish upstream</option>
            </select>
          </label>
          <button disabled={busy}>Add or update collaborator</button>
        </form>
      </section>
      <p className="error" role="alert">
        {error}
      </p>
      <section>
        <h2>Delete timeline</h2>
        <p>
          This permanently deletes the timeline, pull requests and their comments. Independently
          owned forks remain. Saved ancestors needed by those forks or other reviews are retained.
        </p>
        <button className="danger" disabled={busy} onClick={() => dialog.current.showModal()}>
          Delete timeline…
        </button>
        <dialog ref={dialog}>
          <h2>Delete this timeline?</h2>
          <p>This action cannot be undone. Export a copy first if you want to retain its data.</p>
          <div className="actions">
            <button disabled={busy} onClick={() => dialog.current.close()}>
              Cancel
            </button>
            <button disabled={busy} className="danger" onClick={() => mutate('', 'DELETE', {})}>
              Delete permanently
            </button>
          </div>
          <p role="alert">{error}</p>
        </dialog>
      </section>
    </>
  );
}
