// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
'use client';
// Copying a timeline: forking or duplicating it on the server, or forking it in the browser.
import { useState } from 'react';
import { api } from '../lib/api.js';
export default function VersionActions({ timeline, signedIn, onGuestFork }) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  async function copy(action) {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const session = await api('session');
      const fork = await api(`timelines/${timeline.id}/${action}`, {
        method: 'POST',
        csrf: session.csrf,
        data: { revision: timeline.revision },
      });
      window.location.assign('/timelines/' + fork.id);
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  }
  return (
    <>
      <a target="_top" href={timeline.path + '/history'}>
        History
      </a>
      {/* Someone else's timeline is forked; one's own is duplicated (#259). A fork already
          made is opened again. */}
      {timeline.canFork && (
        <button disabled={busy} onClick={() => copy('fork')}>
          Fork on server
        </button>
      )}
      {timeline.canDuplicate && (
        <button disabled={busy} onClick={() => copy('duplicate')}>
          Duplicate
        </button>
      )}
      {!signedIn && timeline.visibility === 'public' && (
        <button onClick={onGuestFork}>Fork in browser</button>
      )}
      {!signedIn && (
        <button
          disabled
          title="Sign in to fork this timeline on the server"
          aria-label="Fork on server (sign in required)"
        >
          Fork on server
        </button>
      )}
      {timeline.upstream_id && (
        <>
          <a target="_top" href={'/timelines/' + timeline.upstream_id}>
            Upstream
          </a>
          {timeline.canWrite && (
            <>
              <a target="_top" href={timeline.path + '/sync'}>
                Sync upstream
              </a>
              {/* Only once the fork has saved changes of its own to propose. */}
              {timeline.forkChanged && (
                <a target="_top" href={timeline.path + '/pulls/new'}>
                  Propose saved changes
                </a>
              )}
            </>
          )}
        </>
      )}
      {error && (
        <span className="error" role="alert">
          {error}
        </span>
      )}
    </>
  );
}
