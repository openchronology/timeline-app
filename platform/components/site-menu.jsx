// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
'use client';
// The site's navigation in its header: a row of links on wide screens and, on phones, a menu
// button that slides the links in from the side.
import { useEffect, useRef, useState } from 'react';
/**
 * The header's navigation links (`children`). On wide screens they stay a row. On phones (at
 * most 650px) they are in a panel at the side of the screen from the first frame, which the
 * menu button slides in and out: the stylesheet places them, once layout.jsx's first script
 * has marked the page as scripted, so nothing moves when React arrives. It closes on a link, its close button, a tap outside,
 * Escape (returning the focus to the menu button), the focus leaving it, or the screen
 * widening; while it is open the page behind doesn't scroll. Without JavaScript, the links stay
 * in the header, wrapped onto their own row.
 * @param {object} props
 * @param {import('react').ReactNode} props.children the links
 */
export default function SiteMenu({ children }) {
  // Sliding starts once React has the page, so loading it, or turning a phone, doesn't
  // animate the panel out of the header.
  const [animate, setAnimate] = useState(false),
    [open, setOpen] = useState(false);
  const button = useRef(null),
    panel = useRef(null);
  useEffect(() => {
    const frame = requestAnimationFrame(() => setAnimate(true));
    return () => cancelAnimationFrame(frame);
  }, []);
  useEffect(() => {
    if (!open) return;
    const narrow = window.matchMedia('(max-width: 650px)');
    // Wider than a phone, the links are back in the header: nothing is left open.
    const widened = () => narrow.matches || setOpen(false);
    const escape = (event) => {
      if (event.key !== 'Escape') return;
      setOpen(false);
      button.current?.focus();
    };
    const root = document.documentElement,
      overflow = root.style.overflow;
    root.style.overflow = 'hidden';
    document.addEventListener('keydown', escape);
    narrow.addEventListener('change', widened);
    panel.current?.querySelector('a, button')?.focus({ preventScroll: true });
    return () => {
      root.style.overflow = overflow;
      document.removeEventListener('keydown', escape);
      narrow.removeEventListener('change', widened);
    };
  }, [open]);
  return (
    <>
      <button
        ref={button}
        type="button"
        className="site-menu-button"
        aria-expanded={open}
        aria-controls="site-navigation"
        aria-label="Menu"
        onClick={() => setOpen(!open)}
      >
        <span className="site-menu-icon" aria-hidden="true">
          <span />
          <span />
          <span />
        </span>
      </button>
      <div
        className="site-menu-backdrop"
        data-open={open}
        aria-hidden="true"
        onClick={() => setOpen(false)}
      />
      <nav
        ref={panel}
        id="site-navigation"
        aria-label="Platform navigation"
        className="site-nav"
        data-animate={animate}
        data-open={open}
        onClick={(event) => event.target.closest('a') && setOpen(false)}
        onBlur={(event) => {
          if (open && !panel.current?.contains(event.relatedTarget)) setOpen(false);
        }}
      >
        <button
          type="button"
          className="site-menu-close"
          aria-label="Close menu"
          tabIndex={open ? 0 : -1}
          onClick={() => {
            setOpen(false);
            button.current?.focus();
          }}
        >
          ×
        </button>
        {children}
      </nav>
    </>
  );
}
