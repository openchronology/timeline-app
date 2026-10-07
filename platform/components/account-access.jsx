// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
'use client';
import { useState } from 'react';
import { api } from '../lib/api.js';
export default function AccountAccess({ session, account, refresh }) {
  const [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [token, setToken] = useState(null),
    [avatar, setAvatar] = useState(account?.profile?.avatarUrl ?? '');
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
        Storage: {Number(account?.usage?.used_bytes ?? 0).toLocaleString()} bytes used ·{' '}
        {account?.usage?.quota_bypass || account?.usage?.is_admin
          ? 'Unlimited'
          : Number(account?.usage?.effective_quota_bytes ?? 0).toLocaleString() + ' byte limit'}
      </p>
      {avatar && (
        <img
          className="account-avatar"
          src={avatar}
          alt="Your avatar"
          crossOrigin="anonymous"
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
      <h2>API keys</h2>
      <p>
        Keys act with your timeline permissions and storage limit. They cannot manage accounts or
        the site. Use HTTPS and send the key in the Authorization header; never put it in a URL.
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
    </section>
  );
}
