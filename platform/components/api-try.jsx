// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
'use client';
// Trying an operation of the API (#178) from its reference: as the signed-in account, or with
// an API key given here (kept only while the page is open).
import { useState } from 'react';

/** At most this much of a response is shown. */
const SHOWN = 200000;
export default function ApiTry({ method, path, parameters, body }) {
  const [values, setValues] = useState({}),
    [text, setText] = useState(body === null ? null : JSON.stringify(body, null, 2)),
    [key, setKey] = useState(''),
    [busy, setBusy] = useState(false),
    [result, setResult] = useState(null);
  const set = (name, value) => setValues((current) => ({ ...current, [name]: value }));
  async function send(event) {
    event.preventDefault();
    setBusy(true);
    setResult(null);
    try {
      let url = path.replace(/\{([^}]+)\}/g, (_, name) => encodeURIComponent(values[name] ?? ''));
      const query = new URLSearchParams();
      for (const p of parameters)
        if (p.in === 'query' && values[p.name]) query.set(p.name, values[p.name]);
      if (query.size) url += '?' + query;
      const headers = {};
      if (text !== null) headers['Content-Type'] = 'application/json';
      if (key) headers.Authorization = 'Bearer ' + key.trim();
      // Changes a session makes carry its CSRF token.
      else if (!['get', 'head'].includes(method)) {
        const session = await (await fetch('/api/session', { credentials: 'same-origin' })).json();
        if (session.csrf) headers['X-CSRF-Token'] = session.csrf;
      }
      if (text !== null) JSON.parse(text);
      const started = performance.now();
      const response = await fetch(url, {
        method: method.toUpperCase(),
        headers,
        credentials: key ? 'omit' : 'same-origin',
        ...(text !== null && method !== 'get' ? { body: text } : {}),
      });
      let shown = await response.text();
      try {
        shown = JSON.stringify(JSON.parse(shown), null, 2);
      } catch {}
      setResult({
        status: `${response.status} ${response.statusText}`.trim(),
        ok: response.ok,
        type: response.headers.get('content-type') ?? '',
        milliseconds: Math.round(performance.now() - started),
        body: shown.length > SHOWN ? shown.slice(0, SHOWN) + '\n…' : shown,
      });
    } catch (error) {
      setResult({ status: 'Not sent', ok: false, type: '', body: error.message });
    } finally {
      setBusy(false);
    }
  }
  return (
    <details className="api-try">
      <summary>Try it</summary>
      <form onSubmit={send}>
        {method !== 'get' && method !== 'head' && (
          <p className="notice">This sends a real request to this server, as you.</p>
        )}
        {parameters
          .filter((p) => p.in === 'path' || p.in === 'query')
          .map((p) => (
            <label key={p.in + p.name}>
              <code>{p.name}</code> <span className="muted">({p.in})</span>
              <input
                value={values[p.name] ?? ''}
                required={p.in === 'path' || p.required}
                placeholder={String(p.schema?.example ?? '')}
                onChange={(e) => set(p.name, e.target.value)}
              />
            </label>
          ))}
        {text !== null && (
          <label>
            Request body (JSON)
            <textarea
              className="api-body"
              value={text}
              spellCheck={false}
              onChange={(e) => setText(e.target.value)}
            />
          </label>
        )}
        <label>
          API key <span className="muted">(optional: without one, as the signed-in account)</span>
          <input
            type="password"
            autoComplete="off"
            value={key}
            placeholder="och_key_…"
            onChange={(e) => setKey(e.target.value)}
          />
        </label>
        <button disabled={busy}>{busy ? 'Sending…' : 'Send'}</button>
      </form>
      {result && (
        <div className="api-result" role="status">
          <p>
            <strong className={result.ok ? 'api-ok' : 'api-failed'}>{result.status}</strong>
            {result.type && <span className="muted"> · {result.type}</span>}
            {result.milliseconds !== undefined && (
              <span className="muted"> · {result.milliseconds} ms</span>
            )}
          </p>
          {result.body && <pre>{result.body}</pre>}
        </div>
      )}
    </details>
  );
}
