// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
'use client';
// The account page's access settings: profile picture, sensitive content, linked sign-in
// methods, API keys, and deleting the account.
import { useState } from 'react';
import { api } from '../lib/api.js';
import HelpTip from './help-tip.jsx';
/**
 * The account page's second half, under its security settings (Account renders it once the
 * account is loaded): storage used, the profile picture, sensitive content, API keys, linked
 * providers and deleting the account.
 *
 * Everything shown comes from the `account` that Account read (GET /api/auth/account); each
 * change is a request to /api/auth/… with the session's CSRF token, followed by `refresh()` so
 * the page shows the result. Changes that grant or remove access (creating a key, unlinking a
 * provider, deleting the account) also send the current password and, when on, a two-factor
 * code: the server asks for a recent sign-in confirmed with them (security.fresh).
 *
 * @param {object} props
 * @param {object} props.session GET /api/session's answer (its `csrf` and `user`)
 * @param {object} props.account GET /api/auth/account's answer: `profile` (`avatarUrl`,
 *   `minor`, `showSensitive`), `usage`, `keys` and `identities`
 * @param {() => Promise<object>} props.refresh reads the session and account again
 */
export default function AccountAccess({ session, account, refresh }) {
  const [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    // A key just created: its secret, shown once and never again (the server keeps a hash).
    [token, setToken] = useState(null),
    // The avatar being edited (an address or a data: URL), previewed before it is saved.
    [avatar, setAvatar] = useState(account?.profile?.avatarUrl ?? '');
  /**
   * Sends one change to /api/<path>, then reads the account again; a failure is shown at the
   * end of the section. One at a time: a click while one is being sent is ignored.
   * @param {string} path the API path, after /api/
   * @param {string} method its HTTP method
   * @param {object} [data] the JSON body
   * @returns {Promise<object|undefined>} the server's answer, or nothing when it failed
   */
  async function action(path, method, data) {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const r = await api(path, { method, csrf: session.csrf, data });
      await refresh();
      return r;
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  /**
   * Creates an API key: POST /api/auth/api-keys with its name, lifetime in days, scopes (always
   * reading timelines, and writing them when chosen) and the confirmation password and code.
   * The answer's `token` is the key itself, shown once; the form is cleared, so the password
   * is not left in it.
   */
  async function create(e) {
    e.preventDefault();
    const form = e.currentTarget,
      d = new FormData(form);
    const r = await action('auth/api-keys', 'POST', {
      name: d.get('name'),
      days: Number(d.get('days')),
      scopes: d.has('write') ? ['timelines:read', 'timelines:write'] : ['timelines:read'],
      password: d.get('password'),
      code: d.get('code'),
    });
    if (r?.token) {
      setToken(r.token);
      form.reset();
    }
  }
  return (
    <section>
      <h2>Profile and account access</h2>
      {session.user.isAdmin && (
        <p>
          <a href="/admin">Site administration</a>
        </p>
      )}
      <p>
        {/* Administrators and accounts allowed past the limit have none. */}
        Storage: {Number(account?.usage?.used_bytes ?? 0).toLocaleString()} bytes used ·{' '}
        {account?.usage?.quota_bypass || account?.usage?.is_admin
          ? 'Unlimited'
          : Number(account?.usage?.effective_quota_bytes ?? 0).toLocaleString() + ' byte limit'}
      </p>
      {avatar && (
        // The preview loads the address without a Referer, so the image's host learns nothing
        // about the account page. Not as a CORS request: most image hosts send no CORS headers,
        // and such an image would not show (#193).
        <img
          className="account-avatar"
          src={avatar}
          alt="Your avatar"
          referrerPolicy="no-referrer"
        />
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void action('auth/profile', 'PATCH', { avatarUrl: avatar });
        }}
      >
        <label>
          Avatar image URL
          <input
            value={avatar}
            onChange={(e) => setAvatar(e.target.value)}
            maxLength={2048}
            placeholder="https://…"
          />
        </label>
        <label>
          Or upload PNG, JPEG or WebP (256 KiB maximum)
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={(e) => {
              // An uploaded picture becomes a data: URL, saved like an address; the server checks
              // its size and that it really is a PNG, JPEG or WebP. Clearing the input lets the
              // same file be chosen again.
              const f = e.target.files?.[0];
              e.target.value = '';
              if (!f) return;
              if (f.size > 262144) {
                setError('Avatar exceeds 256 KiB.');
                return;
              }
              const reader = new FileReader();
              reader.onload = () => setAvatar(String(reader.result));
              reader.readAsDataURL(f);
            }}
          />
        </label>
        <div className="actions">
          <button disabled={busy}>Save avatar</button>
          <button type="button" disabled={busy} onClick={() => setAvatar('')}>
            Clear avatar
          </button>
        </div>
      </form>
      <h2>Sensitive content</h2>
      {/* Minors can't turn the warnings off: the server refuses it (#115). */}
      {account?.profile?.minor ? (
        <p className="muted">
          Timelines, moments and durations labelled as containing nudity, graphic violence or
          disturbing content open behind a warning, with their images blurred until you show them.
          Accounts of people under 18 always see these warnings.
        </p>
      ) : (
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={!!account?.profile?.showSensitive}
            disabled={busy}
            onChange={(e) =>
              void action('auth/profile', 'PATCH', { showSensitive: e.target.checked })
            }
          />
          Show sensitive content without warnings (labelled nudity, graphic violence and disturbing
          content, and their images)
        </label>
      )}
      <h2>
        API keys
        <HelpTip topic="api#calling-it" about="API keys">
          For programs: a key reaches your timelines through the HTTP API, with the scopes you
          choose.
        </HelpTip>
      </h2>
      <p>
        Keys act with your timeline permissions and storage limit. They cannot manage accounts or
        the site. Use HTTPS and send the key in the Authorization header; never put it in a URL. The{' '}
        <a href="/docs/api">HTTP API reference</a> lists what they can do.
      </p>
      <form onSubmit={create}>
        <label>
          Key name
          <input name="name" maxLength={80} required placeholder="Aggregation service" />
        </label>
        <label>
          Expires after (days)
          <input name="days" type="number" min="1" max="365" defaultValue="90" required />
        </label>
        <label className="checkbox-label">
          <input name="write" type="checkbox" />
          Allow timeline writes (reads are always included)
        </label>
        <label>
          Current password
          <input name="password" type="password" autoComplete="current-password" />
        </label>
        <label>
          Authenticator or recovery code (if enabled)
          <input name="code" autoComplete="one-time-code" />
        </label>
        <p className="muted">Key creation requires a sign-in within the last five minutes.</p>
        <button disabled={busy}>Create API key</button>
      </form>
      {token && (
        <div className="notice">
          <h3>Copy this key now</h3>
          <p>It will not be shown again.</p>
          <pre>{token}</pre>
          <button onClick={() => setToken(null)}>I have stored the key</button>
        </div>
      )}
      {(account?.keys ?? []).map((k) => (
        <article key={k.id}>
          <h3>{k.name}</h3>
          <p>
            {k.prefix}… · {k.scopes.join(', ')} · Expires{' '}
            {new Date(k.expires_at).toLocaleDateString()} ·{' '}
            {k.revoked_at ? 'Revoked' : new Date(k.expires_at) < new Date() ? 'Expired' : 'Active'}
          </p>
          <div className="actions">
            {/* Revoking (POST) stops the key but keeps it listed; removing (DELETE) forgets it. */}
            <button
              disabled={busy || !!k.revoked_at}
              onClick={() => action('auth/api-keys/' + k.id, 'POST', {})}
            >
              Revoke
            </button>
            <button
              disabled={busy}
              onClick={() => {
                if (confirm('Remove this API key permanently? It will immediately stop working.'))
                  void action('auth/api-keys/' + k.id, 'DELETE');
              }}
            >
              Remove
            </button>
          </div>
        </article>
      ))}
      <h2>Linked sign-in methods</h2>
      <p>
        Use the existing provider buttons to link Google, GitHub or Facebook. To remove a linked
        provider, confirm your current credentials below.
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const d = new FormData(e.currentTarget);
          void action('auth/identities/unlink', 'POST', {
            provider: d.get('provider'),
            password: d.get('password'),
            code: d.get('code'),
          });
        }}
      >
        <label>
          Linked provider
          <select name="provider">
            {(account?.identities ?? []).map((p) => (
              <option key={p}>{p}</option>
            ))}
          </select>
        </label>
        <label>
          Current password
          <input name="password" type="password" autoComplete="current-password" />
        </label>
        <label>
          Authenticator or recovery code
          <input name="code" autoComplete="one-time-code" />
        </label>
        <button disabled={busy || !account?.identities?.length}>Unlink provider</button>
      </form>
      <p className="error" role="alert">
        {error}
      </p>
      <h2>Delete your account</h2>
      <p className="muted">
        Deletes your account and what is yours: your timelines (with their saved history, pull
        requests and comments; others’ forks of them stay theirs), the pull requests and comments
        you wrote on other timelines, your published plugins and suites, stars, API keys and sign-in
        methods. Changes already merged into other people’s timelines stay there. Export what you
        want to keep first. This cannot be undone.
      </p>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          const d = new FormData(e.currentTarget);
          if (busy) return;
          setBusy(true);
          setError('');
          try {
            // Not through action(): there is no account left to refresh afterwards.
            await api('auth/account', {
              method: 'DELETE',
              csrf: session.csrf,
              data: {
                confirm: d.get('confirm'),
                // Only what was given: an account with no password (signed up through a
                // provider), or without two-factor authentication, sends none.
                ...(d.get('password') ? { password: d.get('password') } : {}),
                ...(d.get('code') ? { code: d.get('code') } : {}),
              },
            });
            window.location.assign('/');
          } catch (failure) {
            setError(failure.message);
            setBusy(false);
          }
        }}
      >
        <label>
          Type your username to confirm
          <input name="confirm" autoComplete="off" required />
        </label>
        <label>
          Current password (if your account has one)
          <input name="password" type="password" autoComplete="current-password" />
        </label>
        <label>
          Authenticator or recovery code (if two-factor authentication is on)
          <input name="code" autoComplete="one-time-code" />
        </label>
        <button className="danger" disabled={busy}>
          Delete my account
        </button>
      </form>
    </section>
  );
}
