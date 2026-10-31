// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
'use client';
// Site administration: accounts and their standing (#103), timelines, site settings and the
// report queue, with changes confirmed before they apply.
import { useState, useEffect } from 'react';
import { api } from '../lib/api.js';
import { confirmWithPasskey } from '../lib/passkeys.js';
import { ReportCase } from './admin-reports.jsx';
import { NEWCOMER_DAYS, FULL_DAYS } from '../../server/standing.mjs';
/**
 * An account's standing (#103; server/standing.mjs) and what it rests on: browsing lists the
 * public timelines of established accounts, and their stars and forks count for popularity.
 *
 * `item.standing` is computed by the server (refreshed periodically, hence "pending the next
 * update"); this only explains it, mirroring the server's rules, in one line: what makes an
 * established account so, or every reason another is not.
 *
 * @param {object} item an account from /api/admin/users: `standing` (0 to 1), `created_at`,
 *   `is_admin`, `is_disabled`, `trust`, `endorsers`, `confirmed` and `restricted`
 * @returns {string}
 */
function standing(item) {
  const age = (Date.now() - Date.parse(item.created_at)) / 86400000;
  if (item.standing > 0) {
    const notes = [
      item.is_admin && 'administrator',
      item.trust === 'trusted' && 'marked trusted',
      item.endorsers > 0 && `${item.endorsers} endorsing account${item.endorsers === 1 ? '' : 's'}`,
    ].filter(Boolean);
    return `Established · standing ${Math.round(item.standing * 100)}%${notes.length ? ' · ' + notes.join(', ') : ''}`;
  }
  const reasons = [
    item.is_disabled && 'suspended',
    item.trust === 'untrusted' && 'marked untrusted',
    !item.confirmed && 'no confirmed email or social sign-in',
    item.restricted && 'a moderation restriction in force',
    age < NEWCOMER_DAYS && `newer than ${NEWCOMER_DAYS} days`,
    age >= NEWCOMER_DAYS &&
      age < FULL_DAYS &&
      !item.endorsers &&
      `under ${FULL_DAYS} days old and not starred or forked by an established account`,
  ].filter(Boolean);
  return `Not established: ${reasons.join('; ') || 'pending the next update'}`;
}
/**
 * The administration page's body (/admin), for administrators (the API refuses anyone else).
 *
 * Lists users, timelines or report cases, 25 a page, from GET /api/admin/users,
 * /api/admin/timelines (with `search` and `page`) or /api/admin/reports (with `view` and
 * `page`), each answering `{items, total}` (users also with the site's `settings`). Every
 * change is a PATCH to /api/admin/<kind>/<id> (or /api/admin/settings) through `change`.
 */
export default function Admin() {
  const [kind, setKind] = useState('users'),
    [search, setSearch] = useState(''),
    // Which reports (#115): awaiting a decision, restricted, or closed.
    [view, setView] = useState('open'),
    [page, setPage] = useState(1),
    [result, setResult] = useState(null),
    // The signed-in session, for its CSRF token.
    [session, setSession] = useState(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    // Bumped after a change, to fetch the list again.
    [reload, setReload] = useState(0),
    // Whether a passkey can confirm changes: two-factor authentication on, with a passkey
    // (the administrator's own account security, read once).
    [passkeys, setPasskeys] = useState(false);
  useEffect(() => {
    let active = true;
    api('auth/account')
      .then((a) => {
        if (active) setPasskeys(!!a.security?.mfa_enabled && a.security.passkeys?.length > 0);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);
  // Fetches the session and the list whenever what is shown changes. A newer fetch replaces
  // an older one: the cleanup aborts it, and `active` keeps a reply that arrives anyway from
  // overwriting the newer one (typing in the search starts one per keystroke).
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    Promise.all([
      api('session', { signal: controller.signal }),
      api(
        'admin/' +
          kind +
          '?' +
          new URLSearchParams(
            kind === 'reports' ? { view, page: String(page) } : { search, page: String(page) },
          ),
        {
          signal: controller.signal,
        },
      ),
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
  }, [kind, search, view, page, reload]);
  /**
   * Applies one administrative change, then reloads the list; a failure is shown above it.
   *
   * Sends PATCH /api/admin/<path> with `changes`, plus the password and code (or, without a
   * code, a passkey's answer, when the account has passkeys) from the
   * confirmation fields: the server applies a change only with the current password (or, without
   * one, a recent sign-in) and, when on, a second factor (security.fresh in server/administration.mjs). The
   * session's CSRF token goes in the X-CSRF-Token header, as every write on a cookie session
   * needs: another site can make the browser send the cookie but cannot read the token. The
   * code is cleared after a success, since an authenticator code is used once.
   *
   * @param {string} path `settings`, `users/<id>`, `timelines/<id>` or `reports/<id>`
   * @param {object} changes the fields to change, or a report decision
   */
  async function change(path, changes) {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const code = document.getElementById('admin-code').value;
      // Without a code, a passkey confirms the change, when the account has one (#372).
      const passkey = !code && passkeys ? await confirmWithPasskey(session.csrf) : null;
      await api('admin/' + path, {
        method: 'PATCH',
        csrf: session.csrf,
        data: {
          ...changes,
          password: document.getElementById('admin-password').value,
          code,
          ...(passkey ? { passkey } : {}),
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
          Default per-user quota (bytes, or a size such as 500MiB or 2GB; zero makes accounts
          read-only)
          {/* Keyed by the saved value, so the field shows it again once a reload brings it, and
              disabled when the environment file sets it. The pattern matches the sizes the
              server accepts (server/limits.mjs's storageBytes), which checks them again. */}
          <input
            name="quota"
            key={result?.settings?.default_quota_bytes}
            defaultValue={result?.settings?.default_quota_bytes}
            pattern="\s*\d+(\.\d+)?\s*([kKmMgGtT][iI]?)?[bB]?\s*"
            disabled={result?.settings?.default_quota_from_env}
            required
          />
        </label>
        {result?.settings?.default_quota_from_env ? (
          <p className="field-hint">
            Set by <code>DEFAULT_USER_STORAGE_BYTES</code> in the environment file; change it there
            and restart.
          </p>
        ) : (
          <button disabled={busy}>Apply site default</button>
        )}
      </form>
      {/* Read by `change` for every change, rather than asked for each time. */}
      <section className="notice">
        <h2>Confirm administrative changes</h2>
        <p>
          Changes require your current password and, if enabled, a fresh authenticator or recovery
          code. With passkeys, leave the code empty to confirm each change with one instead. Without
          a password (signed up through a provider), sign in again within five minutes of the
          change.
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
            <option value="reports">Reports</option>
          </select>
        </label>
        {kind === 'reports' ? (
          <label>
            Show
            <select
              value={view}
              onChange={(e) => {
                setResult(null);
                setView(e.target.value);
                setPage(1);
              }}
            >
              <option value="open">Awaiting a decision</option>
              <option value="restricted">Restricted</option>
              <option value="closed">Closed</option>
            </select>
          </label>
        ) : (
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
        )}
      </div>
      <p role="alert" className="error">
        {error}
      </p>
      <div className="timeline-grid">
        {kind === 'reports' &&
          result?.items.map((item) => (
            <ReportCase
              key={item.id}
              item={item}
              busy={busy}
              decide={(action, reason, labels) =>
                change('reports/' + item.id, { action, reason, ...(labels ? { labels } : {}) })
              }
            />
          ))}
        {kind !== 'reports' &&
          result?.items.map((item) => (
            <article className="timeline-card" key={item.id}>
              {kind === 'users' ? (
                <>
                  <h2>@{item.username}</h2>
                  <p>
                    {item.email || 'No recovery email'} · {Number(item.used_bytes).toLocaleString()}{' '}
                    bytes used
                  </p>
                  <p className="muted">{standing(item)}</p>
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      const d = new FormData(e.currentTarget);
                      void change('users/' + item.id, {
                        is_admin: d.has('is_admin'),
                        is_disabled: d.has('is_disabled'),
                        quota_bypass: d.has('quota_bypass'),
                        quota_bytes: d.get('quota_bytes') === '' ? null : d.get('quota_bytes'),
                        trust: d.get('trust') || null,
                      });
                    }}
                  >
                    {/* Uncontrolled fields, read whole with FormData when applied. */}
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
                      Custom quota in bytes or a size such as 2GiB (blank inherits site default)
                      <input
                        name="quota_bytes"
                        pattern="\s*\d+(\.\d+)?\s*([kKmMgGtT][iI]?)?[bB]?\s*"
                        defaultValue={item.quota_bytes ?? ''}
                      />
                    </label>
                    <label>
                      Standing
                      <select name="trust" defaultValue={item.trust ?? ''}>
                        <option value="">From its activity</option>
                        <option value="trusted">Trusted: always established</option>
                        <option value="untrusted">Untrusted: never established</option>
                      </select>
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
        {/* 25 a page, as the server lists them; `total` may arrive as a string (a count). */}
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
