// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// Requests to a server's API: by fetch in a browser, or through the desktop app's connections
// (Tauri), answering challenges, and SQLite import and export with progress.
import { boundedJSON } from './browser-copy.js';
import { withChallenges } from './challenge.js';
/** Whether browser API requests send the session cookie (see anonymousRequests). */
let credentials: RequestCredentials = 'same-origin';
/** Requests carry no cookies from here on: an embedded timeline is seen as a guest sees it. */
export function anonymousRequests() {
  credentials = 'omit';
}
/** The desktop's server in use: its requests go there unless they name another. */
let nativeServer = '';
/** Points the desktop app's API requests at a server origin (the one it is connected to). */
export function useNativeServer(origin: string) {
  nativeServer = origin;
}
/**
 * Calls the API at `/api/<path>` and resolves with its JSON body. In the browser it uses
 * fetch with the current credentials mode, a JSON body when `data` is given, and the CSRF
 * token for state-changing requests; in the desktop app the native `desktop_request`
 * command sends it to `server` (or the server in use), with the session held natively.
 * Human-verification challenges (428) are answered and the request retried. A non-2xx
 * reply rejects with an Error carrying the server's message, the `status`, and any save
 * `conflicts`. Rejects with an AbortError if `signal` fires (on the desktop, only checked
 * before and after the native call, which cannot be interrupted).
 */
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
    // Copying a timeline into the browser downloads a whole document, so its size is
    // capped while reading rather than after parsing.
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
/**
 * Uploads a `.och` SQLite file for the server to convert into a timeline document, which it
 * returns (nothing is saved). Refuses files over 32 MiB before uploading (the server
 * enforces its own limit too) and rejects with the server's message on failure.
 */
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
/**
 * Downloads a timeline as a `.och` SQLite file: GET for a saved timeline at `path`, or POST
 * with `data` (a document) for the server to convert. Resolves with the file's Blob and
 * rejects with the server's message on failure. Browser only; always sends the session.
 */
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
  // Read newline-delimited JSON as it arrives: keep the unfinished last line buffered until
  // its newline (or the end of the stream) comes. A `result` line ends the request, an
  // `error` line rejects it, and `progress` lines are passed on as they come.
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
    // The stream ended without a result: the connection dropped or the server failed midway.
    if (done) throw new Error('The server stopped before finishing. Reload to see what was saved.');
  }
}
