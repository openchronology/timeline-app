// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
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
      return { status: response.status, body: await response.json() };
    },
    ({ status, body }) => {
      if (status < 200 || status >= 300) throw new Error(body.error ?? 'Request failed.');
      return body;
    },
  );
}
