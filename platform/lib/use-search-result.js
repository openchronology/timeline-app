// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// A list's search, done in place (#338): what the server rendered for the address the page
// loaded at, then what the search API answers whenever the address asks for another.
import { useEffect, useRef, useState } from 'react';
import { api } from './api.js';

/**
 * The result of POSTing `body` to `endpoint` (an API path), as the list should show it:
 * `initial.result` while `body` is the one the server searched (`initial.body`); otherwise
 * the API's answer, and until it comes, the result shown before it (`loading` true; with none
 * yet, `empty`). A failed search keeps that result, with `error` and `retry`. A null `body`
 * searches nothing and gives null.
 *
 * @param {string} endpoint the API path (lib/api.js), such as `timelines/search`
 * @param {object|null} body the search
 * @param {{body: object|null, result: object|null}} initial what the server searched and found
 * @param {object} empty what a search with nothing to show yet shows
 */
export function useSearchResult(endpoint, body, initial, empty) {
  const key = JSON.stringify(body),
    serverKey = JSON.stringify(initial.body);
  // The latest answer, and a search that failed, each with the search it was for.
  const [found, setFound] = useState(null),
    [failed, setFailed] = useState(null),
    [attempt, setAttempt] = useState(0);
  const shown = useRef(initial.result);
  let result = shown.current,
    loading = false;
  if (!body) result = null;
  else if (key === serverKey) result = initial.result;
  else if (found?.key === key) result = found.result;
  else loading = failed?.key !== key;
  shown.current = result;
  if (!result && loading) result = empty;
  useEffect(() => {
    if (!body || key === serverKey || found?.key === key) return;
    const abort = new AbortController();
    api(endpoint, { method: 'POST', data: body, signal: abort.signal }).then(
      (answer) => setFound({ key, result: answer }),
      (error) => abort.signal.aborted || setFailed({ key, message: error.message }),
    );
    return () => abort.abort();
  }, [key, serverKey, attempt]);
  return {
    result,
    loading,
    error: body && failed?.key === key ? failed.message : null,
    retry: () => (setFailed(null), setAttempt((n) => n + 1)),
  };
}
