// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
'use client';
// The banner that tells a signed-in administrator of a newer release (#601), with its notes and
// how to upgrade; dismissing it keeps it away until the next release.
import { useState } from 'react';

/**
 * @param {object} props
 * @param {string} props.current the release this server runs, such as "v0.25.0"
 * @param {string} props.latest the newer release
 * @param {string} props.notes its release notes
 * @param {string} props.upgrade how to upgrade a server
 */
export default function UpdateBanner({ current, latest, notes, upgrade }) {
  const [hidden, setHidden] = useState(false);
  const [error, setError] = useState('');
  if (hidden) return null;
  const dismiss = async () => {
    try {
      const session = await (await fetch('/api/session', { credentials: 'same-origin' })).json();
      const response = await fetch('/api/admin/update-notice', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': session.csrf ?? '' },
        body: JSON.stringify({ version: latest }),
      });
      if (!response.ok) throw new Error((await response.json()).error ?? 'Not dismissed.');
      setHidden(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };
  return (
    <aside className="update-banner" role="status" data-release={latest}>
      <span>
        OpenChronology <strong>{latest}</strong> is available; this server runs {current}. Only
        administrators see this.
      </span>
      <span className="update-banner-actions">
        <a href={notes}>What’s new</a>
        <a href={upgrade}>How to upgrade</a>
        <button type="button" className="link-button" onClick={dismiss}>
          Dismiss until the next release
        </button>
      </span>
      {error ? <span className="update-banner-error">{error}</span> : null}
    </aside>
  );
}
