// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
'use client';
// The account page's cards beside its security settings: the profile picture and sensitive
// content, API keys, linked sign-in methods, and deleting the account.
import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api.js';
import { confirmWithPasskey, passkeysSupported } from '../lib/passkeys.js';
import HelpTip from './help-tip.jsx';

/**
 * One card's changes: `action(where, path, method, data)` sends one to /api/<path> with the
 * session's CSRF token, then reads the account again; a failure is kept with `where`, the form
 * or list it came from, and `failure(where)` shows it there. One at a time: a click while one
 * is being sent is ignored.
 * @param {object} session GET /api/session's answer (its `csrf`)
 * @param {() => Promise<object>} refresh reads the session and account again
 */
export function useAccountAction(session, refresh) {
  const [error, setError] = useState(null),
    [busy, setBusy] = useState(false);
  /** @returns {Promise<object|undefined>} the server's answer, or nothing when it failed */
  async function action(where, path, method, data) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const r = await api(path, { method, csrf: session.csrf, data });
      await refresh();
      return r;
    } catch (e) {
      setError({ where, text: e.message });
    } finally {
      setBusy(false);
    }
  }
  const failure = (where) =>
    error?.where === where && (
      <p className="error" role="alert">
        {error.text}
      </p>
    );
  return { action, busy, setBusy, failure, fail: (where, text) => setError({ where, text }) };
}

/**
 * The fields that confirm a change which grants or removes access: the current password, when
 * the account has one, and a code, when two-factor authentication is on (security.fresh). An
 * account without a password confirms with a sign-in in the last five minutes instead. An
 * account with passkeys may use one instead of the code: **Use a passkey** asks the browser
 * for it, and its answer goes with the form as the hidden `passkey` field. Each answer works
 * once, so it is dropped as soon as the form is sent, whether the change then succeeds or not.
 * @param {object} props
 * @param {object} props.security the account's `security` (`has_password`, `mfa_enabled`,
 *   `passkeys`)
 * @param {string} props.csrf the session's CSRF token
 */
export function Confirmation({ security, csrf }) {
  // The passkey's answer (JSON text) once given, and why asking for it failed.
  const [passkey, setPasskey] = useState(''),
    [problem, setProblem] = useState(''),
    [asking, setAsking] = useState(false);
  const offer = security?.mfa_enabled && security?.passkeys?.length > 0 && passkeysSupported();
  // The form these fields are in: once it is sent (its own handler having read the answer,
  // which happens as the event is dispatched), the answer is spent.
  const marker = useRef(null);
  useEffect(() => {
    const form = marker.current?.closest('form');
    if (!form) return;
    const spent = () => setTimeout(() => setPasskey(''), 0);
    form.addEventListener('submit', spent);
    return () => form.removeEventListener('submit', spent);
  }, []);
  async function ask() {
    setAsking(true);
    setProblem('');
    try {
      setPasskey((await confirmWithPasskey(csrf)) ?? '');
    } catch (e) {
      setProblem(e.message);
    } finally {
      setAsking(false);
    }
  }
  return (
    <>
      <span ref={marker} hidden />
      {security?.has_password && (
        <label>
          Current password
          <input
            name="password"
            type="password"
            autoComplete="current-password"
            maxLength={1024}
            required
          />
        </label>
      )}
      {security?.mfa_enabled && !passkey && (
        <label>
          {security.totp_enabled ? 'Authenticator or recovery code' : 'Recovery code'}
          <input name="code" autoComplete="one-time-code" maxLength={40} required={!offer} />
        </label>
      )}
      {offer &&
        (passkey ? (
          <p className="passkey-ready" role="status">
            <input type="hidden" name="passkey" value={passkey} />
            Confirmed with a passkey.
          </p>
        ) : (
          <button type="button" className="passkey-button" disabled={asking} onClick={ask}>
            {security.totp_enabled ? 'Or use a passkey' : 'Use a passkey'}
          </button>
        ))}
      {problem && (
        <p className="error" role="alert">
          {problem}
        </p>
      )}
    </>
  );
}

/**
 * A change kept closed until it is chosen: a button that opens its form beneath it.
 * @param {object} props
 * @param {string} props.label the button's text
 * @param {string} [props.className] the button's class, such as "danger"
 * @param {import('react').ReactNode} props.children the form
 */
export function Disclosure({ label, className = '', children }) {
  return (
    <details className="account-disclosure">
      <summary className={'button ' + className}>{label}</summary>
      <div className="account-disclosure-body">{children}</div>
    </details>
  );
}

/**
 * The profile card: the picture (uploaded, or an address), previewed before it is saved, and
 * whether sensitive content shows without its warnings.
 * @param {object} props
 * @param {object} props.session GET /api/session's answer
 * @param {object} props.account GET /api/auth/account's answer (`profile`: `avatarUrl`, `minor`,
 *   `showSensitive`)
 * @param {() => Promise<object>} props.refresh reads the session and account again
 */
export function ProfileCard({ session, account, refresh }) {
  const { action, busy, failure, fail } = useAccountAction(session, refresh);
  const saved = account?.profile?.avatarUrl ?? '';
  // The picture being edited (an address or a data: URL), previewed until it is saved.
  const [avatar, setAvatar] = useState(saved);
  const save = (avatarUrl) =>
    action('avatar', 'auth/profile', 'PATCH', { avatarUrl }).then(() => setAvatar(avatarUrl));
  return (
    <section className="settings-card" id="profile">
      <h2>Profile</h2>
      <div className="avatar-row">
        {avatar ? (
          // The preview loads the address without a Referer, so the image's host learns nothing
          // about the account page. Not as a CORS request: most image hosts send no CORS headers,
          // and such an image would not show (#193).
          <img
            className="account-avatar"
            src={avatar}
            alt="Your avatar"
            referrerPolicy="no-referrer"
          />
        ) : (
          <span className="account-avatar placeholder" aria-hidden="true">
            {session.user.username[0].toUpperCase()}
          </span>
        )}
        <div className="actions">
          <label className="button">
            Upload picture
            <input
              className="sr-only"
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={(e) => {
                // An uploaded picture becomes a data: URL, saved like an address; the server
                // checks its size and that it really is a PNG, JPEG or WebP. Clearing the input
                // lets the same file be chosen again.
                const f = e.target.files?.[0];
                e.target.value = '';
                if (!f) return;
                if (f.size > 262144) return fail('avatar', 'Avatar exceeds 256 KiB.');
                const reader = new FileReader();
                reader.onload = () => setAvatar(String(reader.result));
                reader.readAsDataURL(f);
              }}
            />
          </label>
          {saved && avatar === saved && (
            <button disabled={busy} onClick={() => void save('')}>
              Remove
            </button>
          )}
        </div>
      </div>
      <p className="muted">PNG, JPEG or WebP, up to 256 KiB.</p>
      <Disclosure label="Use an image address">
        <label>
          Image address
          <input
            value={avatar.startsWith('data:') ? '' : avatar}
            onChange={(e) => setAvatar(e.target.value)}
            maxLength={2048}
            placeholder="https://…"
          />
        </label>
      </Disclosure>
      {avatar !== saved && (
        <div className="actions">
          <button className="primary" disabled={busy} onClick={() => void save(avatar)}>
            Save picture
          </button>
          <button disabled={busy} onClick={() => setAvatar(saved)}>
            Cancel
          </button>
        </div>
      )}
      {failure('avatar')}
      <h3>Sensitive content</h3>
      {/* Minors can't turn the warnings off: the server refuses it (#115). */}
      {account?.profile?.minor ? (
        <p className="muted">
          Timelines and events labelled as containing nudity, graphic violence or disturbing content
          open behind a warning, with their images blurred until you show them. Accounts of people
          under 18 always see these warnings.
        </p>
      ) : (
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={!!account?.profile?.showSensitive}
            disabled={busy}
            onChange={(e) =>
              void action('sensitive', 'auth/profile', 'PATCH', {
                showSensitive: e.target.checked,
              })
            }
          />
          Show labelled nudity, graphic violence and disturbing content, and their images, without
          warnings
        </label>
      )}
      {failure('sensitive')}
    </section>
  );
}

/**
 * The API keys card: the account's keys, each to revoke or remove, and a form for a new one
 * whose secret is shown once (the server keeps only a hash).
 * @param {object} props
 * @param {object} props.session GET /api/session's answer
 * @param {object} props.account GET /api/auth/account's answer (`keys`, `security`)
 * @param {() => Promise<object>} props.refresh reads the session and account again
 */
export function ApiKeysCard({ session, account, refresh }) {
  const { action, busy, failure } = useAccountAction(session, refresh);
  // A key just created: its secret, shown once and never again.
  const [token, setToken] = useState(null);
  /**
   * Creates a key: POST /api/auth/api-keys with its name, lifetime in days, scopes (always
   * reading timelines, and writing them when chosen) and the confirmation. The form is
   * cleared and closed, so the password is not left in it.
   */
  async function create(e) {
    e.preventDefault();
    const form = e.currentTarget,
      d = new FormData(form);
    const r = await action('keys', 'auth/api-keys', 'POST', {
      name: d.get('name'),
      days: Number(d.get('days')),
      scopes: d.has('write') ? ['timelines:read', 'timelines:write'] : ['timelines:read'],
      password: d.get('password'),
      code: d.get('code'),
      passkey: d.get('passkey'),
    });
    if (r?.token) {
      setToken(r.token);
      form.reset();
      form.closest('details')?.removeAttribute('open');
    }
  }
  const keys = account?.keys ?? [];
  return (
    <section className="settings-card wide" id="api-keys">
      <h2>
        API keys
        <HelpTip topic="api#calling-it" about="API keys">
          For programs: a key reaches your timelines through the HTTP API, with the scopes you
          choose. Keys act with your timeline permissions and storage limit, and cannot manage
          accounts or the site. Send a key over HTTPS in the Authorization header, never in a URL.
        </HelpTip>
      </h2>
      <p className="muted">
        For programs that read or change your timelines through the <a href="/docs/api">HTTP API</a>
        .
      </p>
      {token && (
        <div className="notice">
          <h3>Copy this key now</h3>
          <p>It will not be shown again.</p>
          <pre>{token}</pre>
          <button onClick={() => setToken(null)}>I have stored the key</button>
        </div>
      )}
      {keys.length ? (
        <ul className="settings-list">
          {keys.map((k) => (
            <li key={k.id}>
              <div>
                <strong>{k.name}</strong>
                <span className="muted">
                  {' '}
                  {k.prefix}… · {k.scopes.join(', ')} · Expires{' '}
                  {new Date(k.expires_at).toLocaleDateString()}
                </span>
              </div>
              <span className="status-badge">
                {k.revoked_at
                  ? 'Revoked'
                  : new Date(k.expires_at) < new Date()
                    ? 'Expired'
                    : 'Active'}
              </span>
              <div className="actions">
                {/* Revoking (POST) stops the key but keeps it listed; removing (DELETE) forgets
                    it. */}
                <button
                  disabled={busy || !!k.revoked_at}
                  onClick={() => action('keys', 'auth/api-keys/' + k.id, 'POST', {})}
                >
                  Revoke
                </button>
                <button
                  disabled={busy}
                  onClick={() => {
                    if (
                      confirm('Remove this API key permanently? It will immediately stop working.')
                    )
                      void action('keys', 'auth/api-keys/' + k.id, 'DELETE');
                  }}
                >
                  Remove
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p>No API keys yet.</p>
      )}
      <Disclosure label="New API key">
        <form onSubmit={create} className="settings-form">
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
          <Confirmation security={account?.security} csrf={session.csrf} />
          <div className="actions">
            <button className="primary" disabled={busy}>
              Create API key
            </button>
          </div>
        </form>
      </Disclosure>
      {failure('keys')}
    </section>
  );
}

const PROVIDERS = {
  github: 'GitHub',
  google: 'Google',
  facebook: 'Facebook',
  microsoft: 'Microsoft',
};

/**
 * The sign-in methods card: each provider the site offers, linked (to unlink, confirmed by the
 * current credentials) or not (to link, through `link`, which opens the provider). A directory
 * account (`ldap`, when the site offers directory sign-in) links with its own username and
 * password instead, through POST /api/auth/ldap/link.
 * @param {object} props
 * @param {object} props.session GET /api/session's answer (`providers`, `providerLabels`,
 *   `directory`)
 * @param {object} props.account GET /api/auth/account's answer (`identities`, `security`)
 * @param {() => Promise<object>} props.refresh reads the session and account again
 * @param {(name: string) => void} props.link starts linking a provider
 * @param {boolean} props.linking a link has been started
 */
export function SignInMethodsCard({ session, account, refresh, link, linking }) {
  const { action, busy, failure } = useAccountAction(session, refresh);
  const identities = account?.identities ?? [];
  // Linked providers the site no longer offers are still listed, so they can be unlinked.
  const names = [
    ...new Set([
      ...(session.providers ?? []),
      ...(session.directory ? ['ldap'] : []),
      ...identities,
    ]),
  ];
  const label = (name) =>
    name === 'ldap'
      ? (session.directory?.label ?? 'Directory account')
      : (session.providerLabels?.[name] ?? PROVIDERS[name] ?? name);
  return (
    <section className="settings-card" id="sign-in">
      <h2>Sign-in methods</h2>
      <ul className="settings-list">
        <li>
          <strong>Password</strong>
          <span className="status-badge">{account?.security?.has_password ? 'Set' : 'None'}</span>
        </li>
        {names.map((name) => (
          <li key={name}>
            <strong>{label(name)}</strong>
            {identities.includes(name) ? (
              <>
                <span className="status-badge on">Linked</span>
                <Disclosure label="Unlink">
                  <form
                    className="settings-form"
                    onSubmit={(e) => {
                      e.preventDefault();
                      const d = new FormData(e.currentTarget);
                      void action('unlink', 'auth/identities/unlink', 'POST', {
                        provider: name,
                        password: d.get('password'),
                        code: d.get('code'),
                        passkey: d.get('passkey'),
                      });
                    }}
                  >
                    <Confirmation security={account?.security} csrf={session.csrf} />
                    <button disabled={busy}>Unlink {label(name)}</button>
                  </form>
                </Disclosure>
              </>
            ) : name === 'ldap' ? (
              <>
                <span className="status-badge">Not linked</span>
                <Disclosure label="Link">
                  <form
                    className="settings-form"
                    onSubmit={(e) => {
                      e.preventDefault();
                      const d = new FormData(e.currentTarget);
                      void action('link', 'auth/ldap/link', 'POST', {
                        username: d.get('username'),
                        password: d.get('password'),
                      });
                    }}
                  >
                    <label>
                      Username
                      <input name="username" autoComplete="off" maxLength={256} required />
                    </label>
                    <label>
                      Password
                      <input
                        name="password"
                        type="password"
                        autoComplete="off"
                        maxLength={1024}
                        required
                      />
                    </label>
                    <p className="muted">
                      Within five minutes of signing in. Your directory password is checked, not
                      kept.
                    </p>
                    <button disabled={busy}>Link {label(name)}</button>
                  </form>
                </Disclosure>
              </>
            ) : (
              <>
                <span className="status-badge">Not linked</span>
                <button disabled={busy || linking} onClick={() => link(name)}>
                  Link
                </button>
              </>
            )}
          </li>
        ))}
      </ul>
      {!names.length && <p className="muted">This site offers no other ways to sign in.</p>}
      {failure('unlink')}
      {failure('link')}
    </section>
  );
}

/**
 * The danger zone: deleting the account and everything that is its own, confirmed by typing
 * the username and by the current credentials. On success the browser goes to the home page.
 * @param {object} props
 * @param {object} props.session GET /api/session's answer
 * @param {object} props.account GET /api/auth/account's answer (`security`)
 * @param {() => Promise<object>} props.refresh reads the session and account again
 */
export function DeleteAccountCard({ session, account, refresh }) {
  const { busy, setBusy, failure, fail } = useAccountAction(session, refresh);
  return (
    <section className="settings-card wide danger-zone" id="delete">
      <h2>Delete your account</h2>
      <p className="muted">
        Deletes your account and what is yours: your timelines (with their saved history, pull
        requests and comments; others’ forks of them stay theirs), the pull requests and comments
        you wrote on other timelines, your published plugins and suites, stars, API keys and sign-in
        methods. Changes already merged into other people’s timelines stay there. Export what you
        want to keep first. This cannot be undone.
      </p>
      <Disclosure label="Delete my account…" className="danger">
        <form
          className="settings-form"
          onSubmit={async (e) => {
            e.preventDefault();
            const d = new FormData(e.currentTarget);
            if (busy) return;
            setBusy(true);
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
                  ...(d.get('passkey') ? { passkey: d.get('passkey') } : {}),
                },
              });
              window.location.assign('/');
            } catch (e) {
              fail('delete', e.message);
              setBusy(false);
            }
          }}
        >
          <label>
            Type your username to confirm
            <input name="confirm" autoComplete="off" required />
          </label>
          <Confirmation security={account?.security} csrf={session.csrf} />
          <button className="danger" disabled={busy}>
            Delete my account
          </button>
        </form>
      </Disclosure>
      {failure('delete')}
    </section>
  );
}
