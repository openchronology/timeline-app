// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// Calling the platform's HTTP API from the browser, with the CSRF token and any
// human-verification challenge it asks for.
import { withChallenges } from '../../src/challenge.ts';
export async function api(path, { method = 'GET', data, csrf, signal } = {}) {
  return withChallenges(
    async (challenge) => {
      const response = await fetch('/api/' + path, {
        method,
        credentials: 'same-origin',
        cache: 'no-store',
        signal,
        headers: {
          ...(data !== undefined ? { 'Content-Type': 'application/json' } : {}),
          ...(csrf ? { 'X-CSRF-Token': csrf } : {}),
          ...(challenge ? { 'X-Challenge': challenge } : {}),
        },
        ...(data !== undefined ? { body: JSON.stringify(data) } : {}),
      });
      // A proxy or crashed server can answer without JSON; report its status instead.
      const body = await response.json().catch(() => ({
        error: `Request failed (HTTP ${response.status}).`,
      }));
      return { status: response.status, body };
    },
    ({ status, body }) => {
      if (status < 200 || status >= 300) throw new Error(body.error ?? 'Request failed.');
      return body;
    },
  );
}
