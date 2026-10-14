// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
'use client';
import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
/**
 * A large fork or duplicate whose index is still being copied: waits for it, then opens the
 * timeline.
 */
export default function PreparingCopy({ id }) {
  const [error, setError] = useState('');
  useEffect(() => {
    let stopped = false;
    const check = async () => {
      try {
        const timeline = await api('timelines/' + id);
        if (stopped) return;
        if (!timeline.preparing) return window.location.reload();
        setError('');
      } catch (e) {
        if (!stopped) setError(e.message);
      }
      if (!stopped) setTimeout(check, 2000);
    };
    const timer = setTimeout(check, 2000);
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [id]);
  return (
    <section className="account-card" aria-live="polite">
      <h1>Preparing your copy</h1>
      <p>
        Copying a large timeline takes a little while. This page opens it as soon as it is ready;
        you can leave and come back.
      </p>
      <p className="error" role="alert">
        {error}
      </p>
    </section>
  );
}
