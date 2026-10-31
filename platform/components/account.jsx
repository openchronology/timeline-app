// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
'use client';
// Signing in and the account page: registration, sign-in by password, provider or passkey,
// two-factor and email checks, password and email changes, passkeys, active sessions and
// recovery codes.
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import ProviderIcon from './provider-icon.jsx';
import {
  ApiKeysCard,
  Confirmation,
  DeleteAccountCard,
  Disclosure,
  ProfileCard,
  SignInMethodsCard,
} from './account-access.jsx';
import { api } from '../lib/api.js';
import { passkeysSupported, usePasskey } from '../lib/passkeys.js';
import { PasskeyList } from './passkeys.jsx';
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
    // The guest's step: login, register, forgot, reset, verify, directory (signing in with a
    // directory account), or a challenge the server set after the password (mfa: a second
    // factor; email: an address to confirm first).
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
      directory: 'ldap',
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
   * Signs in with a passkey (#372): `factor` answers this browser's two-factor step with one of
   * the account's passkeys (POST /api/auth/passkeys/factor/options, then /api/auth/mfa/complete
   * with the answer as `passkey`); otherwise it signs in with a passkey alone, which the browser
   * chooses (POST /api/auth/passkeys/sign-in/options, then /api/auth/passkeys/sign-in). Then
   * on to `returnTo`, as any sign-in.
   */
  async function passkey(factor) {
    if (busy) return;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const post = (path, data = {}) =>
        api('auth/' + path, { method: 'POST', csrf: session?.csrf, data });
      const { publicKey } = await post(
        factor ? 'passkeys/factor/options' : 'passkeys/sign-in/options',
      );
      const answer = await usePasskey(publicKey);
      if (factor) await post('mfa/complete', { passkey: answer });
      else await post('passkeys/sign-in', { credential: answer });
      router.replace(returnTo);
      router.refresh();
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
      // An authenticator app added beside passkeys keeps the recovery codes it had.
      if (result.enabled) setSetup(null);
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
   * recovery codes are confirmed first, since both sign out the other sessions and revoke API
   * keys.
   */
  function securityForm(event) {
    event.preventDefault();
    const fields = Object.fromEntries(new FormData(event.currentTarget));
    const path = event.nativeEvent.submitter?.value;
    if (
      path === 'auth/mfa/disable' &&
      !confirm(
        account?.security?.passkeys?.length
          ? 'Remove the authenticator app and revoke other sessions and API keys?'
          : 'Disable two-factor authentication and revoke other sessions and API keys?',
      )
    )
      return;
    if (
      path === 'auth/mfa/recovery' &&
      !confirm('Replace all previous recovery codes and revoke other sessions and API keys?')
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
        showCodes={setCodes}
      />
    );
  // Signing in and creating an account offer the site's providers first, then the password
  // form; the other steps (recovery, confirmation, two-factor) show only their own form.
  const entry = ['login', 'register'].includes(mode);
  const providers = session?.server && entry ? (session.providers ?? []) : [];
  const directory = session?.server && entry ? session.directory : null;
  // Signing in with a passkey alone (#372), where the site allows it and the browser can.
  const passkeys =
    session?.server && mode === 'login' && session.security?.passkeySignIn && passkeysSupported();
  const label = (name) => session?.providerLabels?.[name] ?? PROVIDERS[name] ?? name;
  const go = (next) => {
    setMode(next);
    setError('');
  };
  return (
    <div className="account-card auth-card">
      <header className="auth-header">
        <img className="auth-mark" src="/logo-mark.svg" alt="" width="44" height="44" />
        <h1>
          {{
            register: 'Create your account',
            forgot: 'Recover your password',
            reset: 'Choose a new password',
            verify: 'Confirm email',
            mfa: 'Two-factor authentication',
            email: 'Confirm your email address',
            directory: `Sign in with ${session?.directory?.label ?? 'a directory account'}`,
          }[mode] ?? 'Sign in'}
        </h1>
        {mode === 'login' && (
          <p className="muted">Welcome back. Sign in to save and share timelines.</p>
        )}
        {mode === 'register' && (
          <p className="muted">Save timelines to your account and share them with anyone.</p>
        )}
        {mode === 'forgot' && <p className="muted">We'll email a link to choose a new password.</p>}
      </header>
      {!session && !error && <p role="status">Loading your session…</p>}
      {session?.server === false && (
        <p className="notice">
          Server accounts are unavailable. <Link href="/editor">Open a local timeline</Link>.
        </p>
      )}
      {(providers.length > 0 || directory || passkeys) && (
        <>
          <div className="auth-providers">
            {passkeys && (
              <button type="button" disabled={busy} onClick={() => passkey(false)}>
                <ProviderIcon name="passkey" />
                <span>Sign in with a passkey</span>
              </button>
            )}
            {providers.map((name) => (
              <button key={name} type="button" disabled={busy} onClick={() => provider(name)}>
                <ProviderIcon name={name} />
                <span>Continue with {label(name)}</span>
              </button>
            ))}
            {directory && (
              <button type="button" disabled={busy} onClick={() => go('directory')}>
                <ProviderIcon name="ldap" />
                <span>Sign in with {directory.label}</span>
              </button>
            )}
          </div>
          <div className="auth-divider" role="separator">
            <span>or {mode === 'register' ? 'sign up' : 'sign in'} with a password</span>
          </div>
        </>
      )}
      {session?.server && (
        <form className="auth-form" onSubmit={submit}>
          {mode === 'directory' && (
            <label>
              {session.directory?.label ?? 'Directory account'} username
              <input name="username" autoComplete="username" maxLength={256} required />
            </label>
          )}
          {entry && (
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
          {['login', 'directory', 'register', 'reset'].includes(mode) && (
            <div className="auth-field">
              <div className="auth-label-row">
                <label htmlFor="auth-password">Password</label>
                {/* Recovery needs email sending; without it the link is left out. */}
                {mode === 'login' && session.security?.email && (
                  <button
                    type="button"
                    className="link-button"
                    disabled={busy}
                    onClick={() => go('forgot')}
                  >
                    Forgot password?
                  </button>
                )}
              </div>
              <input
                id="auth-password"
                name="password"
                type="password"
                autoComplete={
                  ['login', 'directory'].includes(mode) ? 'current-password' : 'new-password'
                }
                minLength={['login', 'directory'].includes(mode) ? 1 : 15}
                maxLength={1024}
                required
              />
            </div>
          )}
          {['register', 'reset'].includes(mode) && (
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
              <span className="field-hint">
                A unique passphrase of at least 15 characters. Password managers and pasted
                passwords are supported.
              </span>
            </label>
          )}
          {/* Agreeing to the terms (#277): required to create an account, by password or, at
              its email step, by a provider; the value is the version shown, which the server
              checks is the one in force. */}
          {['register', 'email'].includes(mode) && (
            <label className="checkbox-label">
              <input type="checkbox" name="acceptTerms" value={session?.terms ?? ''} required />
              <span>
                I agree to the <Link href="/terms">terms of service</Link> and have read the{' '}
                <Link href="/privacy">privacy policy</Link>.
              </span>
            </label>
          )}
          {mode === 'register' && (
            <p className="muted">
              Email confirmation is required. Open the confirmation link in this browser, then sign
              in.
            </p>
          )}
          {mode === 'email' && (
            <p className="muted">
              A verified address is required before this account can sign in. Confirm the emailed
              link in this browser, then sign in again.
            </p>
          )}
          {mode === 'verify' && (
            <p className="muted">
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
          {/* A passkey answers the two-factor step instead of a code (#372), for an account
              that has one. */}
          {mode === 'mfa' && session.challengePasskey && passkeysSupported() && (
            <button
              type="button"
              className="passkey-button"
              disabled={busy}
              onClick={() => passkey(true)}
            >
              Use a passkey instead
            </button>
          )}
          {/* No token yet (the session is loading) means the server would refuse it. */}
          <button className="primary auth-submit" disabled={busy || !session?.csrf}>
            {
              {
                login: 'Sign in',
                directory: 'Sign in',
                register: 'Create account',
                email: 'Send confirmation',
                mfa: 'Verify code',
                verify: 'Confirm email',
                forgot: 'Send reset link',
                reset: 'Reset password',
              }[mode]
            }
          </button>
        </form>
      )}
      {feedback}
      {session?.server && (
        <p className="auth-switch">
          {mode === 'login' ? (
            session.security?.registration && (
              <>
                New here?{' '}
                <button
                  type="button"
                  className="link-button"
                  disabled={busy}
                  onClick={() => go('register')}
                >
                  Create an account
                </button>
              </>
            )
          ) : mode === 'register' ? (
            <>
              Already have an account?{' '}
              <button
                type="button"
                className="link-button"
                disabled={busy}
                onClick={() => go('login')}
              >
                Sign in
              </button>
            </>
          ) : (
            <button
              type="button"
              className="link-button"
              disabled={busy}
              onClick={() => go('login')}
            >
              Back to sign in
            </button>
          )}
        </p>
      )}
      {/* Creating an account asks with its own checkbox; signing in only mentions it. */}
      {mode === 'login' && (
        <p className="muted auth-legal">
          Creating an account, with a password or a provider, asks you to agree to the{' '}
          <Link href="/terms">terms of service</Link> and{' '}
          <Link href="/privacy">privacy policy</Link>.
        </p>
      )}
    </div>
  );
}

const PROVIDERS = {
  github: 'GitHub',
  google: 'Google',
  facebook: 'Facebook',
  microsoft: 'Microsoft',
};

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
  showCodes,
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
                fresh code or a passkey. An account without a password (signed up through Google,
                GitHub or Facebook) confirms them with a sign-in in the last five minutes instead.
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
                    <Confirmation security={security} csrf={session.csrf} />
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
                    <Confirmation security={security} csrf={session.csrf} />
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
                <span className="muted">
                  {security?.mfa_enabled
                    ? 'Signing in asks for a passkey or a code after your password.'
                    : 'Add an authenticator app or a passkey to turn it on.'}
                </span>
              </li>
              <li>
                <strong>Authenticator app</strong>
                <span className="muted">{security?.totp_enabled ? 'Set up' : 'None'}</span>
                {!security?.totp_enabled && !setup && (
                  <Disclosure label="Set up">
                    <form className="settings-form" onSubmit={securityForm}>
                      <p className="muted">
                        An authenticator app gives a code to enter after your password.
                      </p>
                      <Confirmation security={security} csrf={session.csrf} />
                      <button disabled={busy || !session.security?.mfa} value="auth/mfa/setup">
                        Continue
                      </button>
                    </form>
                  </Disclosure>
                )}
                {security?.totp_enabled && (
                  <Disclosure label="Remove" className="danger">
                    <form className="settings-form" onSubmit={securityForm}>
                      <p className="muted">
                        {security.passkeys?.length
                          ? 'Your passkeys will still answer two-factor authentication.'
                          : 'This turns off two-factor authentication.'}{' '}
                        This also signs out your other sessions and revokes your API keys.
                      </p>
                      <Confirmation security={security} csrf={session.csrf} />
                      <button className="danger" disabled={busy} value="auth/mfa/disable">
                        {security.passkeys?.length
                          ? 'Remove the authenticator app'
                          : 'Turn off two-factor authentication'}
                      </button>
                    </form>
                  </Disclosure>
                )}
              </li>
              <PasskeyList
                session={session}
                security={security}
                refresh={refresh}
                showCodes={showCodes}
              />
              {security?.mfa_enabled && (
                <li>
                  <strong>Recovery codes</strong>
                  <span className="muted">{security.recovery_remaining} left</span>
                  <Disclosure label="Replace">
                    <form className="settings-form" onSubmit={securityForm}>
                      <p className="muted">
                        This also signs out your other sessions and revokes your API keys.
                      </p>
                      <Confirmation security={security} csrf={session.csrf} />
                      <button disabled={busy} value="auth/mfa/recovery">
                        Replace recovery codes
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
