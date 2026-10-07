// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import AccountAccess from './account-access.jsx';
import { api } from '../lib/api.js';
export default function Account({ returnTo = '/', login = false }) {
  const router = useRouter();
  const [session, setSession] = useState(null),
    [account, setAccount] = useState(null),
    [error, setError] = useState(''),
    [message, setMessage] = useState(''),
    [busy, setBusy] = useState(false),
    [mode, setMode] = useState('login'),
    [token, setToken] = useState(''),
    [setup, setSetup] = useState(null),
    [codes, setCodes] = useState(null);
  async function refresh() {
    const s = await api('session');
    setSession(s);
    setAccount(s.user ? await api('auth/account') : null);
    if (!s.user) {
      setSetup(null);
      setCodes(null);
    }
    return s;
  }
  useEffect(() => {
    let active = true;
    if (new URLSearchParams(location.search).get('mode') === 'register') setMode('register');
    const hash = new URLSearchParams(location.hash.slice(1));
    const value = hash.get('verify') ?? hash.get('reset');
    if (value) {
      setToken(value);
      setMode(hash.has('verify') ? 'verify' : 'reset');
      history.replaceState(null, '', location.pathname + location.search);
    }
    api('session')
      .then(async (s) => {
        if (!active) return;
        setSession(s);
        if (!value && s.challenge) setMode(s.challenge);
        if (s.user) {
          if (login && !value) router.replace(returnTo);
          else {
            const a = await api('auth/account');
            if (active) setAccount(a);
          }
        }
      })
      .catch((e) => active && setError(e.message));
    return () => {
      active = false;
    };
  }, [login, returnTo, router]);
  async function submit(event) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    setMessage('');
    const fields = Object.fromEntries(new FormData(event.currentTarget));
    const path = {
      login: 'login',
      register: 'register',
      mfa: 'mfa/complete',
      email: 'email/enroll',
      verify: 'email/verify',
      forgot: 'password/forgot',
      reset: 'password/reset',
    }[mode];
    try {
      const result = await api('auth/' + path, {
        method: 'POST',
        csrf: session?.csrf,
        data: { ...fields, ...(['verify', 'reset'].includes(mode) ? { token } : {}) },
      });
      setMessage(result.message ?? '');
      if (result.challenge) {
        setMode(result.challenge);
        await refresh();
        return;
      }
      if (result.verificationRequired || ['email', 'forgot'].includes(mode)) {
        await refresh();
        return;
      }
      if (['verify', 'reset'].includes(mode)) {
        setToken('');
        setMode('login');
        await refresh();
        return;
      }
      router.replace(returnTo);
      router.refresh();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function provider(name) {
    setBusy(true);
    setError('');
    try {
      const result = await api('auth/' + name + '/start', {
        method: 'POST',
        csrf: session?.csrf,
        data: { returnTo: session?.user ? '/account' : returnTo, link: !!session?.user },
      });
      location.assign(result.url);
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  }
  async function action(path, data = {}) {
    if (busy) return;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const result = await api(path, { method: 'POST', csrf: session?.csrf, data });
      setMessage(result.message ?? '');
      if (result.secret) setSetup(result);
      if (result.recoveryCodes) {
        setCodes(result.recoveryCodes);
        setSetup(null);
      }
      await refresh();
      router.refresh();
      return result;
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  function securityForm(event) {
    event.preventDefault();
    const fields = Object.fromEntries(new FormData(event.currentTarget));
    const path = event.nativeEvent.submitter?.value;
    if (
      path === 'auth/mfa/disable' &&
      !confirm('Disable two-factor authentication and revoke other sessions?')
    )
      return;
    if (
      path === 'auth/mfa/recovery' &&
      !confirm('Replace all previous recovery codes and revoke other sessions?')
    )
      return;
    void action(path, fields);
  }
  const anonymous = !session?.user || ['mfa', 'email', 'verify', 'reset'].includes(mode);
  return (
    <div className="account-card">
      <h1>
        {session?.user && !anonymous
          ? '@' + session.user.username
          : ({
              register: 'Create account',
              forgot: 'Recover your password',
              reset: 'Choose a new password',
              verify: 'Confirm email',
              mfa: 'Two-factor authentication',
              email: 'Confirm your email address',
            }[mode] ?? 'Sign in')}
      </h1>
      {session?.user && !anonymous && (
        <p>
          <Link href={'/users/' + encodeURIComponent(session.user.username)}>
            Your public profile
          </Link>
        </p>
      )}
      {!session && !error && <p role="status">Loading your session…</p>}
      {session?.server === false && (
        <p className="notice">
          Server accounts are unavailable. <Link href="/editor">Open a local timeline</Link>.
        </p>
      )}
      {session?.server && anonymous && (
        <form onSubmit={submit}>
          {['login', 'register'].includes(mode) && (
            <label>
              Username
              <input
                name="username"
                autoComplete="username"
                pattern="[A-Za-z0-9][A-Za-z0-9_-]{2,31}"
                minLength={3}
                maxLength={32}
                required
              />
            </label>
          )}
          {['register', 'forgot', 'email'].includes(mode) && (
            <label>
              Email address
              <input name="email" type="email" autoComplete="email" maxLength={254} required />
            </label>
          )}
          {['login', 'register', 'reset'].includes(mode) && (
            <label>
              Password
              <input
                name="password"
                type="password"
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                minLength={mode === 'login' ? 1 : 15}
                maxLength={1024}
                required
              />
            </label>
          )}
          {['register', 'reset'].includes(mode) && (
            <>
              <label>
                Confirm password
                <input
                  name="passwordConfirmation"
                  type="password"
                  autoComplete="new-password"
                  minLength={15}
                  maxLength={1024}
                  required
                />
              </label>
              <p className="muted">
                Use a unique passphrase of at least 15 characters. Password managers and pasted
                passwords are supported.
              </p>
            </>
          )}
          {mode === 'register' && (
            <p>
              Email confirmation is required. Open the confirmation link in this browser, then sign
              in.
            </p>
          )}
          {mode === 'email' && (
            <p>
              A verified address is required before this account can sign in. Confirm the emailed
              link in this browser, then sign in again.
            </p>
          )}
          {mode === 'verify' && (
            <p>
              Confirm only if you requested this registration or email change. Confirmation will not
              sign you in automatically.
            </p>
          )}
          {mode === 'mfa' && (
            <label>
              Authenticator or recovery code
              <input name="code" autoComplete="one-time-code" maxLength={40} required />
            </label>
          )}
          <div className="actions">
            <button className="primary" disabled={busy || !session?.csrf}>
              {
                {
                  login: 'Sign in',
                  register: 'Create account',
                  email: 'Send confirmation',
                  mfa: 'Verify code',
                  verify: 'Confirm email',
                  forgot: 'Send reset link',
                  reset: 'Reset password',
                }[mode]
              }
            </button>
          </div>
        </form>
      )}
      {session?.server && anonymous && (
        <div className="actions">
          {mode !== 'login' && (
            <button
              disabled={busy}
              onClick={() => {
                setMode('login');
                setError('');
              }}
            >
              Back to sign in
            </button>
          )}
          {mode === 'login' && (
            <>
              <button
                disabled={busy || !session.security?.registration}
                onClick={() => {
                  setMode('register');
                  setError('');
                }}
              >
                Create account
              </button>
              <button disabled={busy || !session.security?.email} onClick={() => setMode('forgot')}>
                Forgot password?
              </button>
            </>
          )}
        </div>
      )}
      {session?.server && ['login', 'register'].includes(mode) && (
        <div className="actions">
          {(session.providers ?? []).map((name) => (
            <button
              key={name}
              disabled={busy || account?.identities.includes(name)}
              onClick={() => provider(name)}
            >
              {session.user ? 'Link' : 'Continue with'}{' '}
              {name === 'github' ? 'GitHub' : name === 'facebook' ? 'Facebook' : 'Google'}
            </button>
          ))}
        </div>
      )}
      {session?.user && !anonymous && (
        <section>
          <h2>Account security</h2>
          <p>
            {account?.security?.email ?? 'No email address'}
            {account?.security?.email_verified_at ? ' · verified' : ''}
          </p>
          <p>
            Two-factor authentication: {account?.security?.mfa_enabled ? 'enabled' : 'not enabled'}.{' '}
            {account?.security?.mfa_enabled
              ? `${account.security.recovery_remaining} recovery codes remain.`
              : 'An authenticator app provides a second sign-in factor.'}
          </p>
          <p className="muted">
            For security changes, sign in within the last five minutes. Enter your current password
            if this account has one; if MFA is enabled, enter a fresh code.
          </p>
          <form onSubmit={securityForm}>
            {account?.security?.has_password && (
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
            {(account?.security?.mfa_enabled || setup) && (
              <label>
                Authenticator or recovery code
                <input name="code" autoComplete="one-time-code" maxLength={40} required />
              </label>
            )}
            {setup && (
              <div className="notice">
                <p>Add this key to your authenticator app, then enter its six-digit code.</p>
                <code>{setup.secret}</code>
                <p>
                  <a href={setup.uri}>Open in an authenticator app</a>
                </p>
              </div>
            )}
            <div className="actions">
              {!account?.security?.mfa_enabled ? (
                <button
                  disabled={busy || !session.security?.mfa}
                  value={setup ? 'auth/mfa/enable' : 'auth/mfa/setup'}
                >
                  {setup ? 'Confirm and enable MFA' : 'Set up two-factor authentication'}
                </button>
              ) : (
                <>
                  <button disabled={busy} value="auth/mfa/recovery">
                    Replace recovery codes
                  </button>
                  <button disabled={busy} value="auth/mfa/disable">
                    Disable two-factor authentication
                  </button>
                </>
              )}
            </div>
            <details>
              <summary>Change password</summary>
              <label>
                New password
                <input
                  name="newPassword"
                  type="password"
                  autoComplete="new-password"
                  minLength={15}
                  maxLength={1024}
                />
              </label>
              <label>
                Confirm new password
                <input
                  name="passwordConfirmation"
                  type="password"
                  autoComplete="new-password"
                  maxLength={1024}
                />
              </label>
              <button disabled={busy} value="auth/password/change">
                Change password and sign out
              </button>
            </details>
            <details>
              <summary>Change email</summary>
              <label>
                New email address
                <input name="email" type="email" autoComplete="email" maxLength={254} />
              </label>
              <button disabled={busy} value="auth/email/change">
                Send email confirmation
              </button>
            </details>
          </form>
          <h2>Active sessions</h2>
          {account?.sessions.map((s, i) => (
            <p key={i}>
              {s.kind === 'desktop' ? 'Desktop' : 'Browser'}
              {s.current ? ' (this session)' : ''} · {new Date(s.created_at).toLocaleString()}
            </p>
          ))}
          <div className="actions">
            <button disabled={busy} onClick={() => action('auth/revoke-others')}>
              Sign out other sessions
            </button>
            <button
              disabled={busy}
              onClick={() => {
                setSetup(null);
                setCodes(null);
                void action('auth/logout');
              }}
            >
              Sign out
            </button>
          </div>
        </section>
      )}
      {session?.user && !anonymous && account && (
        <AccountAccess session={session} account={account} refresh={refresh} />
      )}
      {codes && (
        <section className="notice">
          <h2>Save your recovery codes</h2>
          <p>
            Each code works once, after your password or social sign-in. Store them offline. These
            codes will not be displayed again.
          </p>
          <pre>{codes.join('\n')}</pre>
          <button onClick={() => setCodes(null)}>I have stored these codes</button>
        </section>
      )}
      <p role="status">{message}</p>
      <p className="error" role="alert">
        {error}
      </p>
      <p className="muted">
        <Link href="/legal">Terms and privacy notices</Link> are available before registration.
      </p>
    </div>
  );
}
