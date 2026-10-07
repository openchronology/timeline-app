// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
'use client';
export default function ErrorPage({ reset }) {
  return (
    <main className="platform">
      <h1>The page is temporarily unavailable</h1>
      <p>Please try again. Your local timeline files remain on your device.</p>
      <button onClick={reset}>Try again</button>
    </main>
  );
}
