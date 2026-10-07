// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
'use client';
import { useState } from 'react';
import { api } from '../lib/api.js';
export default function DeviceApproval({ code }) {
  const [busy, setBusy] = useState(false),
    [approved, setApproved] = useState(false),
    [error, setError] = useState('');
  async function approve() {
    setBusy(true);
    setError('');
    try {
      const session = await api('session');
      await api('auth/device/approve', {
        method: 'POST',
        csrf: session.csrf,
        data: { userCode: code },
      });
      setApproved(true);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="account-card">
      <h1>Connect OpenChronology desktop</h1>
      <p>
        Approve only if you started this connection in your desktop app and this code matches its
        window.
      </p>
      <strong>{code}</strong>
      {approved ? (
        <p role="status">Approved. Return to the desktop application.</p>
      ) : (
        <p>
          <button className="primary" disabled={busy} onClick={approve}>
            Approve connection
          </button>
        </p>
      )}
      <p role="alert" className="error">
        {error}
      </p>
    </div>
  );
}
