// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
import { boundedJSON } from './browser-copy.js';
import { withChallenges } from './challenge.js';
export async function requestApi<T>(
  path: string,
  method = 'GET',
  data?: unknown,
  csrf?: string | null,
  signal?: AbortSignal,
): Promise<T> {
  signal?.throwIfAborted();
  const send = async (challenge?: string) => {
    if (window.__TAURI__) {
      const reply = await window.__TAURI__.core.invoke<{
        status: number;
        body: { error?: string; challenge?: unknown };
      }>('desktop_request', {
        path,
        method,
        data: data ?? null,
        csrf: csrf ?? null,
        challenge: challenge ?? null,
      });
      signal?.throwIfAborted();
      return reply;
    }
    const response = await fetch('/api/' + path, {
      method,
      signal,
      credentials: 'same-origin',
      headers: {
        ...(data !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(csrf ? { 'X-CSRF-Token': csrf } : {}),
        ...(challenge ? { 'X-Challenge': challenge } : {}),
      },
      ...(data !== undefined ? { body: JSON.stringify(data) } : {}),
    });
    const body = (
      path.endsWith('/browser-fork') ? await boundedJSON(response) : await response.json()
    ) as { error?: string };
    return { status: response.status, body };
  };
  return withChallenges(send, ({ status, body }) => {
    if (status < 200 || status >= 300)
      throw Object.assign(new Error((body as { error?: string }).error ?? 'Request failed.'), {
        status,
      });
    return body as T;
  });
}
export async function importSqlite(file: File, csrf?: string | null): Promise<unknown> {
  if (file.size > 32 * 1024 * 1024) throw new Error('SQLite upload exceeds 32 MiB.');
  const response = await fetch('/api/files/import', {
    method: 'POST',
    credentials: 'same-origin',
    headers: {
      'Content-Type': 'application/vnd.openchronology.sqlite',
      ...(csrf ? { 'X-CSRF-Token': csrf } : {}),
    },
    body: file,
  });
  const value = await response.json();
  if (!response.ok) throw new Error(value.error ?? 'File import failed.');
  return value.document;
}
export async function exportSqlite(
  path: string,
  data?: unknown,
  csrf?: string | null,
): Promise<Blob> {
  const response = await fetch('/api/' + path, {
    method: data === undefined ? 'GET' : 'POST',
    credentials: 'same-origin',
    headers: {
      ...(data === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...(csrf ? { 'X-CSRF-Token': csrf } : {}),
    },
    ...(data === undefined ? {} : { body: JSON.stringify(data) }),
  });
  if (!response.ok) throw new Error((await response.json()).error ?? 'File export failed.');
  return response.blob();
}
