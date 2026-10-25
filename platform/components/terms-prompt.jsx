// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
'use client';
// Asking a signed-in account to agree to the terms of service and privacy policy in force
// (#277), when it has not: accounts made before they took effect, or before a newer version.
import { useState } from 'react';
import { api } from '../lib/api.js';

/**
 * A panel under the header on every page until the account agrees: until then it can read,
 * export, manage or delete its account and sign out, but the server refuses its other changes
 * (server/policies.mjs requireAgreed). Agreeing posts the version shown (`version`) to
 * POST /api/auth/terms with the session's CSRF token, then reloads the page.
 * @param {object} props
 * @param {string} props.version the version in force (the policies' effective date)
 */
export default function TermsPrompt({ version }) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  async function agree(event) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const session = await api('session');
      await api('auth/terms', {
        method: 'POST',
        csrf: session.csrf,
        data: { acceptTerms: new FormData(event.currentTarget).get('acceptTerms') },
      });
      window.location.reload();
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  }
  return (
    <aside className="terms-prompt" role="region" aria-label="Terms of service">
      <form onSubmit={agree}>
        <p>
          <strong>Please review the terms.</strong> The <a href="/terms">terms of service</a> and{' '}
          <a href="/privacy">privacy policy</a> took effect on {version}. Agree to them to keep
          saving and sharing timelines; until then you can still read, export, and manage or delete
          your account.
        </p>
        <label className="checkbox-label">
          <input type="checkbox" name="acceptTerms" value={version} required />
          <span>I agree to the terms of service and have read the privacy policy.</span>
        </label>
        <div className="actions">
          <button className="primary" disabled={busy}>
            Agree
          </button>
        </div>
        <p className="error" role="alert">
          {error}
        </p>
      </form>
    </aside>
  );
}
