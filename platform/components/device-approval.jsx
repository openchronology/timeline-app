// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
'use client';
// Approving the desktop app's sign-in code with the signed-in account. Anyone can start a
// desktop sign-in and send its link, so the page shows which computer asked, from where and
// when, asks for the code typed from the desktop app's own window, and, when the request came
// from another network than this browser's, asks a second time: approving a request someone
// else started would sign them in to this account.
import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
/** What was typed, as a code: upper case, without the spaces or dashes people add. */
const normalize = (text) => text.toUpperCase().replace(/[\s-]/g, '');
export default function DeviceApproval({ code }) {
  const [request, setRequest] = useState(null),
    [typed, setTyped] = useState(''),
    [mine, setMine] = useState(false),
    [busy, setBusy] = useState(false),
    [approved, setApproved] = useState(false),
    [error, setError] = useState('');
  // The request's details as the server recorded them when the desktop app started it.
  useEffect(() => {
    let current = true;
    api('auth/device/request?userCode=' + encodeURIComponent(code))
      .then((details) => current && setRequest(details))
      .catch((e) => current && setError(e.message));
    return () => {
      current = false;
    };
  }, [code]);
  const entered = normalize(typed),
    matches = entered === code,
    // Whether the request came from this browser's network: 'same', 'different' or 'unknown'.
    network = request?.network,
    confirmed = network === 'same' || mine;
  async function approve(event) {
    event.preventDefault();
    if (!matches || !confirmed) return;
    setBusy(true);
    setError('');
    try {
      const session = await api('session');
      await api('auth/device/approve', {
        method: 'POST',
        csrf: session.csrf,
        data: { userCode: entered, otherNetwork: network !== 'same' && mine },
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
      <p className="notice">
        <strong>Approve only if you just started signing in on your own computer.</strong> If
        someone sent you this link or asked you to approve a code, do not: approving signs their
        desktop app in to your account.
      </p>
      {request && !approved && (
        <>
          <h2>The request</h2>
          <dl>
            <dt>Computer, as it names itself</dt>
            <dd>
              {request.deviceName ?? 'Not given'}
              {request.devicePlatform ? ` (${request.devicePlatform})` : ''}
            </dd>
            <dt>Started</dt>
            <dd>
              {new Date(request.requestedAt).toLocaleString()} ({minutesAgo(request.requestedAt)})
            </dd>
            <dt>From address</dt>
            <dd>{request.clientAddress ?? 'Not recorded'}</dd>
            <dt>Program, as it describes itself</dt>
            <dd>{request.userAgent ?? 'Not given'}</dd>
          </dl>
          {network === 'different' && (
            <p className="error">
              <strong>This request came from another network than this browser.</strong> Your own
              computer is usually on the same network as the browser you approve it in. A VPN or a
              phone's connection can explain the difference, but someone else's computer would look
              just like this. If you are not sure the request is yours, do not approve it.
            </p>
          )}
          {network !== 'same' && network !== 'different' && (
            <p className="error">
              <strong>The site can't tell whether this request came from your network.</strong> Its
              address and this browser's can't be compared. If you are not sure the request is
              yours, do not approve it.
            </p>
          )}
          <form onSubmit={approve}>
            <label>
              The code in the OpenChronology window on your computer
              <input
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
                maxLength={16}
                required
              />
              <span className="field-hint">
                Type it from your own screen, never from a message or from someone who read it out
                to you.
              </span>
              {entered.length >= 10 && !matches && (
                <span className="field-hint">
                  That is not this request's code. Check the code in your desktop app's window.
                </span>
              )}
            </label>
            {network !== 'same' && (
              <label className="checkbox-label">
                <input type="checkbox" checked={mine} onChange={(e) => setMine(e.target.checked)} />
                <span>I started this sign-in myself, on my own computer, on another network.</span>
              </label>
            )}
            <p>
              <button type="submit" className="primary" disabled={busy || !matches || !confirmed}>
                Approve connection
              </button>
            </p>
          </form>
        </>
      )}
      {approved && <p role="status">Approved. Return to the desktop application.</p>}
      <p role="alert" className="error">
        {error}
      </p>
    </div>
  );
}
/** How long ago `time` was, in words: "just now" or "n minutes ago". */
function minutesAgo(time) {
  const minutes = Math.floor((Date.now() - new Date(time).getTime()) / 60000);
  if (minutes < 1) return 'just now';
  return minutes === 1 ? '1 minute ago' : `${minutes} minutes ago`;
}
