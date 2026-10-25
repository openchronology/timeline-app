// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
'use client';
// Signing in and the account page: registration, sign-in by password or provider, two-factor
// and email checks, password and email changes, active sessions and recovery codes.
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ApiKeysCard,
  Confirmation,
  DeleteAccountCard,
  Disclosure,
  ProfileCard,
  SignInMethodsCard,
} from './account-access.jsx';
import { api } from '../lib/api.js';
import ModerationDecisions from './moderation-decisions.jsx';
import { profilePath } from '../../src/addresses.ts';
import HelpTip from './help-tip.jsx';
/**
 * The sign-in page (/login) and the account page (/account) in one component: a guest sees the
 * form for the current step (`mode`), a signed-in account its settings (AccountSettings): a
 * summary, then cards for its profile, security, sessions, sign-in methods and API keys
 * (account-access.jsx), deleting it, and moderation decisions about its content.
 *
 * It reads GET /api/session (`{server, user, csrf, providers, security, challenge}`) and,
 * when signed in, GET /api/auth/account (`{security, profile, usage, keys, identities,
 * sessions}`), and writes through POST /api/auth/…. Every POST carries `session.csrf` as
 * X-CSRF-Token: for a guest it is the sign-in nonce (the `oc_login` cookie's value, a
 * double-submit check against login CSRF), for an account its session's token; the server
 * refuses a write without it (server/auth.mjs).
 *
 * @param {object} props
 * @param {string} [props.returnTo] where to go after signing in (checked by the page)
 * @param {boolean} [props.login] this is /login: an account already signed in goes straight
 *   to `returnTo`
 */
export default function Account({ returnTo = '/', login = false }) {
  const router = useRouter();
  const [session, setSession] = useState(null),
    [account, setAccount] = useState(null),
    [error, setError] = useState(''),
    [message, setMessage] = useState(''),
    [busy, setBusy] = useState(false),
    // The guest's step: login, register, forgot, reset, verify, or a challenge the server set
    // after the password (mfa: a second factor; email: an address to confirm first).
    [mode, setMode] = useState('login'),
    // The token from an emailed link (#verify=… or #reset=…), sent with that step's form.
    [token, setToken] = useState(''),
    // A two-factor setup in progress: `{secret, uri}` from /api/auth/mfa/setup, until enabled.
    [setup, setSetup] = useState(null),
    // Fresh recovery codes, shown once, until the reader says they stored them.
    [codes, setCodes] = useState(null);
  /**
   * Reads the session again, and the account when signed in, after anything that may have
   * changed them; signing out also drops a pending two-factor setup and unsaved codes.
   * @returns {Promise<object>} the session
   */
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
  // On the first render: the step the address asks for, then the session. `active` keeps a
  // reply that arrives after the page is left from setting state.
  useEffect(() => {
    let active = true;
    if (new URLSearchParams(location.search).get('mode') === 'register') setMode('register');
    // An emailed link carries its token in the fragment, which browsers never send to a server
    // (or in a Referer), and it is removed from the address and history at once.
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
        // A sign-in that stopped at a challenge (on another load of this page) resumes there.
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
  /**
   * Sends the guest's form for the current step to POST /api/auth/<step> with its fields (and
   * the emailed token for verify and reset), then moves on by what the server answers:
   * `{challenge}` asks for another step; `{verificationRequired}` (and the email and forgot
   * steps) stay put with the server's message; verify and reset return to signing in; anything
   * else signed in, so the page goes to `returnTo` and re-renders the server's parts.
   */
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
  /**
   * Starts signing in with a provider (GitHub, Google or Facebook), or linking one to the
   * signed-in account: POST /api/auth/<name>/start answers `{url}`, the provider's
   * authorization page, which the browser then opens. The provider returns to `returnTo` (the
   * account page when linking).
   */
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
  /**
   * A signed-in account's change: POST /api/<path> with `data`, then shows the server's message
   * and reads the account again. A two-factor setup answers `{secret, uri}`, kept until it is
   * confirmed; enabling it or replacing the codes answers `{recoveryCodes}`, shown once.
   * @returns {Promise<object|undefined>} the server's answer, or nothing when it failed
   */
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
  /**
   * The security form has one button per change; the pressed button's value is the API path,
   * and every change sends the same fields (the current password and code the server asks for
   * to confirm it, and the new values). Disabling two-factor authentication and replacing the
   * recovery codes are confirmed first, since both sign out the other sessions.
   */
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
  // Whether to show the guest's forms: no account yet, or a step that an emailed link or a
  // challenge put the page in even while a session exists.
  const anonymous = !session?.user || ['mfa', 'email', 'verify', 'reset'].includes(mode);
  // The server's message or failure: at the top of the account page (its cards show their
  // own), else under the sign-in forms.
  const feedback = (
    <>
      <p role="status">{message}</p>
      <p className="error" role="alert">
        {error}
      </p>
    </>
  );
  if (session?.user && !anonymous)
    return (
      <AccountSettings
        session={session}
        account={account}
        refresh={refresh}
        busy={busy}
        action={action}
        securityForm={securityForm}
        setup={setup}
        codes={codes}
        clearCodes={() => setCodes(null)}
        signOut={() => {
          setSetup(null);
          setCodes(null);
          void action('auth/logout');
        }}
        link={provider}
        feedback={feedback}
      />
    );
  return (
    <div className="account-card">
      <h1>
        {{
          register: 'Create account',
          forgot: 'Recover your password',
          reset: 'Choose a new password',
          verify: 'Confirm email',
          mfa: 'Two-factor authentication',
          email: 'Confirm your email address',
        }[mode] ?? 'Sign in'}
      </h1>
      {!session && !error && <p role="status">Loading your session…</p>}
      {session?.server === false && (
        <p className="notice">
          Server accounts are unavailable. <Link href="/editor">Open a local timeline</Link>.
        </p>
      )}
      {session?.server && (
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
          {['register', 'email'].includes(mode) && (
            <label>
              Year of birth
              <input
                name="birthYear"
                type="number"
                inputMode="numeric"
                min={1900}
                max={new Date().getFullYear()}
                autoComplete="bday-year"
                required
              />
              <span className="field-hint">
                Only the year is kept, to set up your account (see the privacy policy).
              </span>
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
            {/* No token yet (the session is loading) means the server would refuse it. */}
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
      {session?.server && (
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
            <button key={name} disabled={busy} onClick={() => provider(name)}>
              Continue with {PROVIDERS[name] ?? name}
            </button>
          ))}
        </div>
      )}
      {feedback}
      <p className="muted">
        The <Link href="/terms">terms of service</Link> and{' '}
        <Link href="/privacy">privacy policy</Link> are available before registration.
      </p>
    </div>
  );
}

const PROVIDERS = { github: 'GitHub', google: 'Google', facebook: 'Facebook' };

/** Bytes as people read them: B, KiB, MiB or GiB, to a tenth below ten. */
function size(bytes) {
  const units = ['B', 'KiB', 'MiB', 'GiB', 'TiB'];
  let value = Number(bytes),
    unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${unit && value < 10 ? value.toFixed(1) : Math.round(value)} ${units[unit]}`;
}

/**
 * The signed-in account page: a summary across the top (picture, name, email, storage, and
 * links to the profile, administration and signing out), then its settings as cards, two
 * columns wide on a wide screen. Each change opens its own small form, asking for only what it
 * needs. The security and sessions cards send their changes through Account's `action`
 * (`securityForm` reads the pressed button's path), whose answer shows in `feedback`.
 */
function AccountSettings({
  session,
  account,
  refresh,
  busy,
  action,
  securityForm,
  setup,
  codes,
  clearCodes,
  signOut,
  link,
  feedback,
}) {
  const security = account?.security;
  const usage = account?.usage;
  const unlimited = usage?.quota_bypass || usage?.is_admin;
  const quota = Number(usage?.effective_quota_bytes ?? 0);
  const used = Number(usage?.used_bytes ?? 0);
  const avatar = account?.profile?.avatarUrl;
  return (
    <div className="account-page">
      <header className="account-summary">
        {avatar ? (
          <img className="account-avatar" src={avatar} alt="" referrerPolicy="no-referrer" />
        ) : (
          <span className="account-avatar placeholder" aria-hidden="true">
            {session.user.username[0].toUpperCase()}
          </span>
        )}
        <div className="account-identity">
          <h1>@{session.user.username}</h1>
          <p className="muted">
            {security?.email ?? 'No email address'}
            {security?.email && (
              <span className={'status-badge' + (security.email_verified_at ? ' on' : '')}>
                {security.email_verified_at ? 'Verified' : 'Unconfirmed'}
              </span>
            )}
          </p>
        </div>
        {usage && (
          <div className="storage-meter">
            <span>
              Storage: {size(used)}
              {unlimited ? ' · unlimited' : ` of ${size(quota)}`}
            </span>
            {!unlimited && quota > 0 && (
              <meter min={0} max={quota} value={Math.min(used, quota)} high={quota * 0.9}>
                {Math.round((used / quota) * 100)}%
              </meter>
            )}
          </div>
        )}
        <nav className="actions" aria-label="Account">
          <Link href={profilePath(session.user.username)}>Your public profile</Link>
          {session.user.isAdmin && <a href="/admin">Site administration</a>}
          <button disabled={busy} onClick={signOut}>
            Sign out
          </button>
        </nav>
      </header>
      {codes && (
        <section className="notice">
          <h2>Save your recovery codes</h2>
          <p>
            Each code works once, after your password or social sign-in. Store them offline. These
            codes will not be displayed again.
          </p>
          <pre>{codes.join('\n')}</pre>
          <button onClick={clearCodes}>I have stored these codes</button>
        </section>
      )}
      <div className="account-feedback">{feedback}</div>
      <ModerationDecisions session={session} />
      {!account ? (
        <p role="status">Loading your account…</p>
      ) : (
        <div className="settings-grid">
          <ProfileCard session={session} account={account} refresh={refresh} />
          <section className="settings-card" id="security">
            <h2>
              Security
              <HelpTip
                topic="authentication#two-factor-authentication-and-recovery"
                about="account security"
              >
                Changes ask for your current password and, with two-factor authentication on, a
                fresh code. An account without a password (signed up through Google, GitHub or
                Facebook) confirms them with a sign-in in the last five minutes instead.
              </HelpTip>
            </h2>
            <ul className="settings-list">
              <li>
                <strong>Email</strong>
                <span className="muted">{security?.email ?? 'None'}</span>
                <Disclosure label="Change">
                  <form className="settings-form" onSubmit={securityForm}>
                    <label>
                      New email address
                      <input
                        name="email"
                        type="email"
                        autoComplete="email"
                        maxLength={254}
                        required
                      />
                    </label>
                    <Confirmation security={security} />
                    <button disabled={busy} value="auth/email/change">
                      Send email confirmation
                    </button>
                  </form>
                </Disclosure>
              </li>
              <li>
                <strong>Password</strong>
                <span className="muted">{security?.has_password ? 'Set' : 'None'}</span>
                <Disclosure label="Change">
                  <form className="settings-form" onSubmit={securityForm}>
                    <label>
                      New password
                      <input
                        name="newPassword"
                        type="password"
                        autoComplete="new-password"
                        minLength={15}
                        maxLength={1024}
                        required
                      />
                    </label>
                    <label>
                      Confirm new password
                      <input
                        name="passwordConfirmation"
                        type="password"
                        autoComplete="new-password"
                        maxLength={1024}
                        required
                      />
                    </label>
                    <Confirmation security={security} />
                    <button disabled={busy} value="auth/password/change">
                      Change password and sign out
                    </button>
                  </form>
                </Disclosure>
              </li>
              <li>
                <strong>Two-factor authentication</strong>
                <span className={'status-badge' + (security?.mfa_enabled ? ' on' : '')}>
                  {security?.mfa_enabled ? 'On' : 'Off'}
                </span>
                {!security?.mfa_enabled && !setup && (
                  <Disclosure label="Set up">
                    <form className="settings-form" onSubmit={securityForm}>
                      <p className="muted">
                        An authenticator app gives a code to enter after your password.
                      </p>
                      <Confirmation security={security} />
                      <button disabled={busy || !session.security?.mfa} value="auth/mfa/setup">
                        Continue
                      </button>
                    </form>
                  </Disclosure>
                )}
              </li>
              {security?.mfa_enabled && (
                <li>
                  <strong>Recovery codes</strong>
                  <span className="muted">{security.recovery_remaining} left</span>
                  <Disclosure label="Replace">
                    <form className="settings-form" onSubmit={securityForm}>
                      <p className="muted">This also signs out your other sessions.</p>
                      <Confirmation security={security} />
                      <button disabled={busy} value="auth/mfa/recovery">
                        Replace recovery codes
                      </button>
                    </form>
                  </Disclosure>
                  <Disclosure label="Turn off two-factor" className="danger">
                    <form className="settings-form" onSubmit={securityForm}>
                      <p className="muted">This also signs out your other sessions.</p>
                      <Confirmation security={security} />
                      <button className="danger" disabled={busy} value="auth/mfa/disable">
                        Turn off two-factor authentication
                      </button>
                    </form>
                  </Disclosure>
                </li>
              )}
            </ul>
            {setup && (
              <form className="notice settings-form" onSubmit={securityForm}>
                <p>Add this key to your authenticator app, then enter its six-digit code.</p>
                <code>{setup.secret}</code>
                <p>
                  <a href={setup.uri}>Open in an authenticator app</a>
                </p>
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
                <label>
                  Code from the app
                  <input name="code" autoComplete="one-time-code" maxLength={40} required />
                </label>
                <button className="primary" disabled={busy} value="auth/mfa/enable">
                  Confirm and turn on
                </button>
              </form>
            )}
          </section>
          <section className="settings-card" id="sessions">
            <h2>Sessions</h2>
            <ul className="settings-list">
              {account.sessions.map((s, i) => (
                <li key={i}>
                  <strong>{s.kind === 'desktop' ? 'Desktop app' : 'Browser'}</strong>
                  <span className="muted">since {new Date(s.created_at).toLocaleString()}</span>
                  {s.current && <span className="status-badge on">This session</span>}
                </li>
              ))}
            </ul>
            <div className="actions">
              <button
                disabled={busy || account.sessions.length < 2}
                onClick={() => action('auth/revoke-others')}
              >
                Sign out other sessions
              </button>
            </div>
          </section>
          <SignInMethodsCard
            session={session}
            account={account}
            refresh={refresh}
            link={link}
            linking={busy}
          />
          <ApiKeysCard session={session} account={account} refresh={refresh} />
          <DeleteAccountCard session={session} account={account} refresh={refresh} />
        </div>
      )}
    </div>
  );
}
