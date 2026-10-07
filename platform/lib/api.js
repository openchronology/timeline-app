// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
export async function api(path, { method = 'GET', data, csrf, signal } = {}) {
  const response = await fetch('/api/' + path, {
    method,
    credentials: 'same-origin',
    cache: 'no-store',
    signal,
    headers: {
      ...(data !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(csrf ? { 'X-CSRF-Token': csrf } : {}),
    },
    ...(data !== undefined ? { body: JSON.stringify(data) } : {}),
  });
  const value = await response.json();
  if (!response.ok) throw new Error(value.error ?? 'Request failed.');
  return value;
}
