// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
'use client';
// The account's passkeys, in Account → Security (#372; server/passkeys.mjs): each with its
// name, when it was added and last used, renaming and removing it, and adding another.
import { useState } from 'react';
import { Confirmation, Disclosure, useAccountAction } from './account-access.jsx';
import { api } from '../lib/api.js';
import { createPasskey, passkeysSupported } from '../lib/passkeys.js';

/** A date as people read it, or "never". */
const when = (value) => (value ? new Date(value).toLocaleDateString() : 'never');

/**
 * The passkeys rows of the security list: a heading row that adds one, then a row for each.
 * Adding one is confirmed as any security change (Confirmation), then the browser makes it;
 * the first second factor of an account answers recovery codes, which `showCodes` shows once.
 * Removing one is confirmed too; renaming is not.
 * @param {object} props
 * @param {object} props.session GET /api/session's answer (its `csrf`, `security.passkeys`)
 * @param {object} props.security the account's `security` (`passkeys`, `mfa_enabled`, …)
 * @param {() => Promise<object>} props.refresh reads the session and account again
 * @param {(codes: string[]) => void} props.showCodes shows new recovery codes
 */
export function PasskeyList({ session, security, refresh, showCodes }) {
  const { action, busy, setBusy, failure, fail } = useAccountAction(session, refresh);
  const [message, setMessage] = useState('');
  const passkeys = security?.passkeys ?? [];
  const available = session.security?.passkeys && passkeysSupported();
  /** Adds a passkey: the confirmation, then the browser's new credential, then its name. */
  async function add(e) {
    e.preventDefault();
    if (busy) return;
    const form = e.currentTarget,
      d = new FormData(form);
    setBusy(true);
    setMessage('');
    try {
      const post = (path, data) =>
        api('auth/passkeys/' + path, { method: 'POST', csrf: session.csrf, data });
      const { publicKey } = await post('register/options', {
        password: d.get('password'),
        code: d.get('code'),
        passkey: d.get('passkey'),
      });
      const credential = await createPasskey(publicKey);
      const result = await post('register', { name: d.get('name'), credential });
      if (result.recoveryCodes) showCodes(result.recoveryCodes);
      setMessage(result.message);
      form.reset();
      form.closest('details')?.removeAttribute('open');
      await refresh();
    } catch (error) {
      fail('add', error.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <li id="add-passkey">
        <strong>Passkeys</strong>
        <span className="muted">
          {passkeys.length ? `${passkeys.length} added` : 'None'}
          {session.security?.passkeySignIn && passkeys.length > 0 && ' · also sign you in'}
        </span>
        {available ? (
          <Disclosure label="Add a passkey">
            <form className="settings-form" onSubmit={add}>
              <p className="muted">
                A passkey on this device, your phone or a security key answers two-factor
                authentication with your fingerprint, face or PIN, and cannot be phished.
              </p>
              <label>
                Name
                <input
                  name="name"
                  maxLength={64}
                  required
                  defaultValue={`Passkey ${passkeys.length + 1}`}
                />
              </label>
              <Confirmation security={security} csrf={session.csrf} />
              <button className="primary" disabled={busy}>
                Continue
              </button>
              {failure('add')}
            </form>
          </Disclosure>
        ) : (
          <span className="muted">
            {session.security?.passkeys
              ? 'This browser cannot make passkeys.'
              : 'Not available on this server.'}
          </span>
        )}
        {message && (
          <p role="status" className="passkey-message">
            {message}
          </p>
        )}
      </li>
      {passkeys.map((p) => (
        <li key={p.id} className="passkey-row">
          <strong>{p.name}</strong>
          <span className="muted">
            Added {when(p.created_at)} · last used {when(p.last_used_at)}
          </span>
          <Disclosure label="Rename">
            <form
              className="settings-form"
              onSubmit={(e) => {
                e.preventDefault();
                const d = new FormData(e.currentTarget);
                void action('rename-' + p.id, 'auth/passkeys/' + p.id, 'PATCH', {
                  name: d.get('name'),
                });
              }}
            >
              <label>
                Name
                <input name="name" maxLength={64} required defaultValue={p.name} />
              </label>
              <button disabled={busy}>Rename</button>
              {failure('rename-' + p.id)}
            </form>
          </Disclosure>
          <Disclosure label="Remove" className="danger">
            <form
              className="settings-form"
              onSubmit={(e) => {
                e.preventDefault();
                const d = new FormData(e.currentTarget);
                void action('remove-' + p.id, 'auth/passkeys/' + p.id, 'DELETE', {
                  password: d.get('password'),
                  code: d.get('code'),
                  passkey: d.get('passkey'),
                });
              }}
            >
              <p className="muted">
                {passkeys.length === 1 && !security.totp_enabled
                  ? 'This is your only second factor: removing it turns off two-factor authentication.'
                  : 'Remove it here, and from the device or password manager that holds it.'}{' '}
                This also signs out your other sessions.
              </p>
              <Confirmation security={security} csrf={session.csrf} />
              <button className="danger" disabled={busy}>
                Remove {p.name}
              </button>
              {failure('remove-' + p.id)}
            </form>
          </Disclosure>
        </li>
      ))}
    </>
  );
}
