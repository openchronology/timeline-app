// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
'use client';
import { useState, useEffect } from 'react';
import { api } from '../lib/api.js';
export default function Admin() {
  const [kind, setKind] = useState('users'),
    [search, setSearch] = useState(''),
    [page, setPage] = useState(1),
    [result, setResult] = useState(null),
    [session, setSession] = useState(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [reload, setReload] = useState(0);
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    Promise.all([
      api('session', { signal: controller.signal }),
      api('admin/' + kind + '?' + new URLSearchParams({ search, page: String(page) }), {
        signal: controller.signal,
      }),
    ])
      .then(([s, r]) => {
        if (active) {
          setSession(s);
          setResult(r);
          setError('');
        }
      })
      .catch((e) => {
        if (active && e.name !== 'AbortError') setError(e.message);
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [kind, search, page, reload]);
  async function change(path, changes) {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await api('admin/' + path, {
        method: 'PATCH',
        csrf: session.csrf,
        data: {
          ...changes,
          password: document.getElementById('admin-password').value,
          code: document.getElementById('admin-code').value,
        },
      });
      document.getElementById('admin-code').value = '';
      setReload((n) => n + 1);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <h1>Site administration</h1>
      <p>
        Storage limits measure logical JSON bytes for timelines, saved history, proposals, comments
        and published plugin definitions. Indexes and account settings are excluded. Deleting a
        timeline can retain ancestors needed by forks.
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const data = new FormData(e.currentTarget);
          void change('settings', { default_quota_bytes: data.get('quota') });
        }}
      >
        <label>
          Default per-user quota (bytes; zero makes accounts read-only)
          <input
            name="quota"
            key={result?.settings.default_quota_bytes}
            defaultValue={result?.settings.default_quota_bytes}
            type="number"
            min="0"
            max="10000000000000"
            required
          />
        </label>
        <button disabled={busy}>Apply site default</button>
      </form>
      <section className="notice">
        <h2>Confirm administrative changes</h2>
        <p>
          Sign in within the last five minutes. Changes require your current password and, if
          enabled, a fresh authenticator or recovery code.
        </p>
        <label>
          Current password
          <input id="admin-password" type="password" autoComplete="current-password" />
        </label>
        <label>
          Authenticator or recovery code
          <input id="admin-code" autoComplete="one-time-code" />
        </label>
      </section>
      <div className="search-controls">
        <label>
          Manage
          <select
            value={kind}
            onChange={(e) => {
              setResult(null);
              setKind(e.target.value);
              setPage(1);
            }}
          >
            <option value="users">Users</option>
            <option value="timelines">Timelines</option>
          </select>
        </label>
        <label>
          Search
          <input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            maxLength={200}
          />
        </label>
      </div>
      <p role="alert" className="error">
        {error}
      </p>
      <div className="timeline-grid">
        {result?.items.map((item) => (
          <article className="timeline-card" key={item.id}>
            {kind === 'users' ? (
              <>
                <h2>@{item.username}</h2>
                <p>
                  {item.email || 'No recovery email'} · {Number(item.used_bytes).toLocaleString()}{' '}
                  bytes used
                </p>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const d = new FormData(e.currentTarget);
                    void change('users/' + item.id, {
                      is_admin: d.has('is_admin'),
                      is_disabled: d.has('is_disabled'),
                      quota_bypass: d.has('quota_bypass'),
                      quota_bytes: d.get('quota_bytes') === '' ? null : d.get('quota_bytes'),
                    });
                  }}
                >
                  {['is_admin', 'is_disabled', 'quota_bypass'].map((flag) => (
                    <label key={flag} className="checkbox-label">
                      <input type="checkbox" name={flag} defaultChecked={item[flag]} />
                      {
                        {
                          is_admin: 'Administrator',
                          is_disabled: 'Suspend access (revokes sessions and keys)',
                          quota_bypass: 'Bypass storage limit',
                        }[flag]
                      }
                    </label>
                  ))}
                  <label>
                    Custom quota in bytes (blank inherits site default)
                    <input
                      name="quota_bytes"
                      type="number"
                      min="0"
                      max="10000000000000"
                      defaultValue={item.quota_bytes ?? ''}
                    />
                  </label>
                  <button disabled={busy}>Apply user settings</button>
                </form>
              </>
            ) : (
              <>
                <h2>
                  <a href={'/timelines/' + item.id}>{item.title}</a>
                </h2>
                <p>
                  @{item.owner} · {item.visibility} · {Number(item.event_count).toLocaleString()}{' '}
                  moments
                </p>
                <div className="actions">
                  <button
                    disabled={busy}
                    onClick={() => change('timelines/' + item.id, { featured: !item.featured })}
                  >
                    {item.featured ? 'Unfeature' : 'Feature'}
                  </button>
                  <button
                    disabled={busy}
                    onClick={() =>
                      change('timelines/' + item.id, {
                        visibility: item.visibility === 'public' ? 'private' : 'public',
                      })
                    }
                  >
                    Make {item.visibility === 'public' ? 'private' : 'public'}
                  </button>
                  <button
                    className="danger"
                    disabled={busy}
                    onClick={() => {
                      if (
                        confirm(
                          'Permanently delete this timeline and its reviews? Retained fork ancestors remain.',
                        )
                      )
                        void change('timelines/' + item.id, { delete: true });
                    }}
                  >
                    Delete
                  </button>
                </div>
              </>
            )}
          </article>
        ))}
      </div>
      <nav className="pager">
        <button disabled={page <= 1 || busy} onClick={() => setPage((p) => p - 1)}>
          Previous
        </button>
        <span>
          {result?.total ?? 0} results · Page {page}
        </span>
        <button
          disabled={!result || page * 25 >= Number(result.total) || busy}
          onClick={() => setPage((p) => p + 1)}
        >
          Next
        </button>
      </nav>
    </>
  );
}
