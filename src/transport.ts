// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// Requests to a server's API: by fetch in a browser, or through the desktop app's connections
// (Tauri), answering challenges, and SQLite import and export with progress.
import { boundedJSON } from './browser-copy.js';
import { withChallenges } from './challenge.js';
let credentials: RequestCredentials = 'same-origin';
/** Requests carry no cookies from here on: an embedded timeline is seen as a guest sees it. */
export function anonymousRequests() {
  credentials = 'omit';
}
/** The desktop's server in use: its requests go there unless they name another. */
let nativeServer = '';
export function useNativeServer(origin: string) {
  nativeServer = origin;
}
export async function requestApi<T>(
  path: string,
  method = 'GET',
  data?: unknown,
  csrf?: string | null,
  signal?: AbortSignal,
  server?: string,
): Promise<T> {
  signal?.throwIfAborted();
  const send = async (challenge?: string) => {
    if (window.__TAURI__) {
      const reply = await window.__TAURI__.core.invoke<{
        status: number;
        body: { error?: string; challenge?: unknown };
      }>('desktop_request', {
        server: server ?? nativeServer,
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
      credentials,
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
        // A save's conflicts with what was saved meanwhile (server/save-merge.mjs).
        conflicts: (body as { conflicts?: unknown }).conflicts,
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
/**
 * POSTs `data` to an API path that streams its progress as JSON lines (server/http.mjs,
 * progressLines), telling `progress` each step; resolves with the result. The desktop app's
 * requests go through its native client, which takes one JSON reply instead, without steps.
 */
export async function requestProgress<T, P = unknown>(
  path: string,
  data: unknown,
  csrf: string | null | undefined,
  progress: (step: P) => void,
): Promise<T> {
  if (window.__TAURI__) return requestApi<T>(path, 'POST', data, csrf);
  const response = await fetch('/api/' + path, {
    method: 'POST',
    credentials,
    headers: {
      Accept: 'application/x-ndjson',
      'Content-Type': 'application/json',
      ...(csrf ? { 'X-CSRF-Token': csrf } : {}),
    },
    body: JSON.stringify(data),
  });
  if (!response.ok || !response.body) {
    const body = (await response.json().catch(() => ({}))) as { error?: string };
    throw Object.assign(new Error(body.error ?? 'Request failed.'), { status: response.status });
  }
  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffered = '';
  for (;;) {
    const { value, done } = await reader.read();
    buffered += value ?? '';
    const lines = buffered.split('\n');
    buffered = done ? '' : lines.pop()!;
    for (const line of lines) {
      if (!line.trim()) continue;
      const step = JSON.parse(line) as {
        progress?: P;
        result?: T;
        error?: { status: number; message: string };
      };
      if (step.error)
        throw Object.assign(new Error(step.error.message), { status: step.error.status });
      if ('result' in step) return step.result as T;
      if (step.progress !== undefined) progress(step.progress);
    }
    if (done) throw new Error('The server stopped before finishing. Reload to see what was saved.');
  }
}
