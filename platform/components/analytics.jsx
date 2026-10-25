// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
'use client';
// Google Analytics, when the site enables it: asks the visitor's consent first and loads only
// after it; AnalyticsSettings lets them change their choice.
import { useEffect, useState } from 'react';

/** Where a visitor's choice is kept: in their browser only. */
const CHOICE = 'openchronology-analytics';
function stored() {
  try {
    return localStorage.getItem(CHOICE);
  } catch {
    return null;
  }
}
function store(value) {
  try {
    localStorage.setItem(CHOICE, value);
  } catch {
    // Without storage the banner asks again on the next page.
  }
}
/** Loads Google Analytics, once, without Google signals or ad personalization. */
function load(id, nonce) {
  if (window.gtag) return;
  window.dataLayer = window.dataLayer || [];
  window.gtag = function gtag() {
    window.dataLayer.push(arguments);
  };
  window.gtag('js', new Date());
  window.gtag('config', id, {
    allow_google_signals: false,
    allow_ad_personalization_signals: false,
  });
  const script = document.createElement('script');
  script.async = true;
  script.nonce = nonce;
  script.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(id);
  document.head.append(script);
}

/**
 * Google Analytics, when the platform enables it (GOOGLE_ANALYTICS_ID): loaded only once the
 * visitor accepts it in a banner. **Analytics settings** in the footer asks again.
 */
export default function Analytics({ id, nonce }) {
  const [asking, setAsking] = useState(false);
  useEffect(() => {
    const choice = stored();
    if (choice === 'granted') load(id, nonce);
    else if (choice !== 'denied') setAsking(true);
    const ask = () => setAsking(true);
    window.addEventListener('openchronology:analytics-settings', ask);
    return () => window.removeEventListener('openchronology:analytics-settings', ask);
  }, [id, nonce]);
  if (!asking) return null;
  const choose = (granted) => {
    const before = stored();
    store(granted ? 'granted' : 'denied');
    setAsking(false);
    if (granted) load(id, nonce);
    // Declining after accepting stops analytics from this page on.
    else if (before === 'granted') location.reload();
  };
  return (
    <aside className="analytics-consent" role="dialog" aria-label="Analytics">
      <p>
        May this site use Google Analytics cookies to count visits and see which pages are used?
        Your timelines are never sent. See the <a href="/privacy">privacy policy</a>.
      </p>
      <div className="actions">
        <button type="button" onClick={() => choose(false)}>
          Decline
        </button>
        <button type="button" className="primary" onClick={() => choose(true)}>
          Allow analytics
        </button>
      </div>
    </aside>
  );
}

/** The footer's way back to the banner. */
export function AnalyticsSettings() {
  return (
    <button
      type="button"
      className="link-button"
      onClick={() => window.dispatchEvent(new Event('openchronology:analytics-settings'))}
    >
      Analytics settings
    </button>
  );
}
