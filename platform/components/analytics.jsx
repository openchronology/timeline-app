// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
'use client';
// Google Analytics, when the site enables it: asks the visitor's consent first and loads only
// after it; AnalyticsSettings lets them change their choice. Each page view is sent by this
// component, with the address and title lib/analytics.js allows, never Google's own reading
// of the page.
import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { SHOWN_PATH, SHOWN_TITLE, analyticsPage } from '../lib/analytics.js';

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
/** The page now showing, as analytics may see it (lib/analytics.js). */
function currentPage(site) {
  const main = document.querySelector(`main[${SHOWN_PATH}]`);
  return analyticsPage({
    origin: location.origin,
    pathname: location.pathname,
    site,
    shown: main
      ? { path: main.getAttribute(SHOWN_PATH), title: main.getAttribute(SHOWN_TITLE) }
      : null,
  });
}
/** The last page view sent: its path, not to count a page twice, and its address. */
let last = null;
/**
 * Sends the page now showing as a page view, once analytics are loaded. The address and title
 * are also set for every later event, so none carries the page's real ones. Its referrer is
 * the page before, as it was sent; or, for the first, the page it came from on another site,
 * since an address on this one could be a private timeline's.
 */
function pageView(site) {
  if (!window.gtag || last?.path === location.pathname) return;
  const page = currentPage(site);
  const referrer =
    last?.location ??
    (document.referrer && new URL(document.referrer).origin !== location.origin
      ? document.referrer
      : '');
  last = { path: location.pathname, location: page.page_location };
  window.gtag('set', { ...page, page_referrer: referrer });
  window.gtag('event', 'page_view', { ...page, page_referrer: referrer });
}
/**
 * Loads Google Analytics, once, without Google signals or ad personalization, and without its
 * own page views, which would send the page's real address and title: pageView sends them.
 */
function load(id, nonce, site) {
  if (window.gtag) return;
  window.dataLayer = window.dataLayer || [];
  window.gtag = function gtag() {
    window.dataLayer.push(arguments);
  };
  window.gtag('js', new Date());
  window.gtag('config', id, {
    allow_google_signals: false,
    allow_ad_personalization_signals: false,
    send_page_view: false,
    ...currentPage(site),
  });
  pageView(site);
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
export default function Analytics({ id, nonce, site }) {
  const [asking, setAsking] = useState(false);
  const pathname = usePathname();
  useEffect(() => {
    const choice = stored();
    if (choice === 'granted') load(id, nonce, site);
    else if (choice !== 'denied') setAsking(true);
    const ask = () => setAsking(true);
    window.addEventListener('openchronology:analytics-settings', ask);
    return () => window.removeEventListener('openchronology:analytics-settings', ask);
  }, [id, nonce, site]);
  // A page reached within the site: counted once its content is in place, so a public
  // timeline's page has marked itself.
  useEffect(() => pageView(site), [pathname, site]);
  if (!asking) return null;
  const choose = (granted) => {
    const before = stored();
    store(granted ? 'granted' : 'denied');
    setAsking(false);
    if (granted) load(id, nonce, site);
    // Declining after accepting stops analytics from this page on.
    else if (before === 'granted') location.reload();
  };
  return (
    <aside className="analytics-consent" role="dialog" aria-label="Analytics">
      <p>
        May this site use Google Analytics cookies to count visits and see which pages are used?
        Your timelines are never sent, nor the titles or addresses of any that aren't public. See
        the <a href="/privacy">privacy policy</a>.
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
