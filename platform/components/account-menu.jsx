// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
'use client';
// The signed-in account's menu at the end of the site's header: its name, opening links to the
// account page, its profile and administration, and signing out.
import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api.js';
import { profilePath } from '../../src/addresses.ts';
/**
 * A button with the account's picture (or initial) and name. It opens a menu, which closes on
 * a choice, a click elsewhere, or Escape (returning the focus to the button). Signing out
 * posts to /api/auth/logout with the session's CSRF token, then goes to the home page.
 * @param {object} props
 * @param {string} props.username the signed-in account's name
 * @param {string} [props.avatarUrl] its picture, if it has one
 * @param {boolean} [props.isAdmin] it administers the site
 */
export default function AccountMenu({ username, avatarUrl, isAdmin }) {
  const [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false);
  const root = useRef(null),
    button = useRef(null);
  useEffect(() => {
    if (!open) return;
    const outside = (event) => {
      if (!root.current?.contains(event.target)) setOpen(false);
    };
    const escape = (event) => {
      if (event.key !== 'Escape') return;
      setOpen(false);
      button.current?.focus();
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', escape);
    };
  }, [open]);
  async function signOut() {
    if (busy) return;
    setBusy(true);
    try {
      const session = await api('session');
      await api('auth/logout', { method: 'POST', csrf: session.csrf, data: {} });
    } finally {
      window.location.assign('/');
    }
  }
  return (
    <div className="account-menu" ref={root}>
      <button
        ref={button}
        className="account-menu-button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        {avatarUrl ? (
          <img className="menu-avatar" src={avatarUrl} alt="" referrerPolicy="no-referrer" />
        ) : (
          <span className="menu-avatar" aria-hidden="true">
            {username[0].toUpperCase()}
          </span>
        )}
        <span className="account-menu-name">{username}</span>
        <span aria-hidden="true">▾</span>
      </button>
      {open && (
        <div className="account-menu-list" role="menu">
          <p className="account-menu-heading">
            Signed in as <strong>@{username}</strong>
          </p>
          <a role="menuitem" href="/account">
            Account
          </a>
          <a role="menuitem" href={profilePath(username)}>
            Your profile
          </a>
          {isAdmin && (
            <a role="menuitem" href="/admin">
              Site administration
            </a>
          )}
          <hr />
          <button role="menuitem" disabled={busy} onClick={signOut}>
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
