// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '../lib/api.js';
export default function StarButton({ id, count = '0', starred = false, signedIn = false }) {
  const [state, setState] = useState({ count, starred }),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    router = useRouter();
  useEffect(() => setState({ count, starred }), [count, starred]);
  async function toggle() {
    setBusy(true);
    setError('');
    try {
      const session = await api('session');
      const result = await api(`timelines/${id}/star`, {
        method: 'POST',
        csrf: session.csrf,
        data: { starred: !state.starred },
      });
      setState({ count: result.star_count, starred: result.starred });
      router.refresh();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <span className="timeline-star">
      <button
        type="button"
        aria-pressed={state.starred}
        disabled={!signedIn || busy}
        title={
          signedIn
            ? state.starred
              ? 'Remove from favorites'
              : 'Add to favorites'
            : 'Sign in to star timelines'
        }
        onClick={toggle}
      >
        {state.starred ? '★ Starred' : '☆ Star'} · {BigInt(state.count ?? 0).toLocaleString()}
      </button>
      {error && <span role="alert">{error}</span>}
    </span>
  );
}
