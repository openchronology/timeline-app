// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// Every page's frame: the site's header, which stays at the top of the screen, with its
// navigation (a side menu on phones) and the visitor's account (sign in
// and sign up, or the account's menu) and, for an account that has not agreed to the terms in
// force, a request to (#277), its footer with the build, a Support link, the color scheme's
// choice (#382) and analytics when enabled; also the site's default metadata for link previews.
// The head's inline script sets the chosen scheme before the first paint.
import './platform.css';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import Analytics, { AnalyticsSettings } from '../components/analytics.jsx';
import AccountMenu from '../components/account-menu.jsx';
import SiteMenu from '../components/site-menu.jsx';
import TermsPrompt from '../components/terms-prompt.jsx';
import ThemeChoice from '../components/theme-choice.jsx';
import { THEME_BOOT } from '../../src/theme-choice.ts';
import { POLICY_VERSION } from '../../server/policies.mjs';
import { currentSession } from '../lib/session.js';
import { headers } from 'next/headers';
import { siteOrigin, sitePreview } from '../lib/sharing.js';
import { analyticsId, platformName, siteName, supportUrl } from '../../server/site.mjs';
import { landingEnabled } from '../../server/landing.mjs';
export function generateMetadata() {
  const description =
    'A free, open-source timeline editor: exact times at any scale, sources on every moment, shared on your terms.';
  // Pages without a preview image of their own show the site's (#390).
  const images = [sitePreview()];
  return {
    // Relative addresses in pages' metadata (link previews, canonical links) are on this site.
    metadataBase: new URL(siteOrigin()),
    title: platformName() ? `${platformName()} · OpenChronology` : 'OpenChronology',
    description,
    openGraph: { type: 'website', siteName: siteName(), locale: 'en_US', description, images },
    twitter: { card: 'summary_large_image', images },
    // Added to an iPhone's home screen, the site opens on its own, under its name.
    appleWebApp: { capable: true, title: siteName(), statusBarStyle: 'black-translucent' },
  };
}
// The browser's toolbar and the phone's status bar take the header's color.
export const viewport = { themeColor: '#192d25' };
export default async function RootLayout({ children }) {
  const build = JSON.parse(
    await readFile(
      resolve(process.env.OCH_APP_ROOT ?? process.cwd(), 'dist/build-info.json'),
      'utf8',
    ),
  );
  // A platform's own name replaces OpenChronology's in its header (PLATFORM_NAME).
  const name = platformName();
  // Where visitors can support the platform (SUPPORT_URL): a link in the header and footer.
  const support = supportUrl();
  const analytics = analyticsId();
  // With the landing page at / (#379), the timeline browser is a link of its own.
  const landing = landingEnabled();
  // Read for every page, so each renders per request: its header shows who is visiting.
  const request = await headers();
  // The nonce the content security policy lets scripts run by (proxy.js), when it set one.
  const nonce = request.get('x-nonce');
  // Who is visiting, for the header's end: a guest is offered to sign in, and to sign up when
  // the site takes registrations; an account gets its menu. Without accounts, neither.
  let user = null,
    accounts = false,
    registration = false;
  try {
    const current = await currentSession();
    user = current.user;
    accounts = !!current.services.auth;
    registration = !!current.services.auth?.security?.available;
  } catch (error) {
    console.error(error);
  }
  return (
    // The inline script sets data-theme on <html> before React hydrates it.
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          nonce={nonce ?? undefined}
          suppressHydrationWarning
          dangerouslySetInnerHTML={{ __html: THEME_BOOT }}
        />
      </head>
      <body>
        <header className="platform-header">
          <a href="/" className="brand">
            <img src="/logo-mark.svg" alt="" width="28" height="28" />
            {name ?? 'openchronology'}
          </a>
          <SiteMenu>
            {landing ? <a href="/explore">Explore</a> : null}
            <a href="/editor?new=1">＋ New timeline</a>
            <a href="/plugins">Plugin library</a>
            <a href="/download">Download</a>
            <a href="/help">Help</a>
            {support ? (
              <a href={support} className="support-link">
                ♥ Support
              </a>
            ) : null}
          </SiteMenu>
          {user ? (
            <AccountMenu
              username={user.username}
              avatarUrl={user.avatarUrl}
              isAdmin={user.isAdmin}
              timelinesHref={landing ? '/explore#mine' : null}
            />
          ) : accounts ? (
            <div className="header-account">
              <a href="/login" className="button">
                Sign in
              </a>
              {registration && (
                <a href="/login?mode=register" className="button primary">
                  Sign up
                </a>
              )}
            </div>
          ) : null}
        </header>
        {user?.termsRequired ? <TermsPrompt version={POLICY_VERSION} /> : null}
        {children}
        <footer className="platform-footer">
          © 2026 Athan Clark · GPLv3 · No warranty · <a href="/terms">Terms</a> ·{' '}
          <a href="/privacy">Privacy</a> · <a href="/legal">Licenses</a> · <a href="/help">Help</a>{' '}
          ·{' '}
          {support ? (
            <>
              <a href={support}>Support this site</a> ·{' '}
            </>
          ) : null}
          <a href="/docs/api">HTTP API</a> ·{' '}
          <a href="/openchronology-web-source.tar.gz" download>
            Source
          </a>{' '}
          · <a href="https://github.com/openchronology/timeline-app">GitHub</a>
          {' · '}
          <span className="build-identity">Build: {build.label}</span>
          <ThemeChoice />
          {name ? ' · Powered by OpenChronology' : ''}
          {analytics ? (
            <>
              {' · '}
              <AnalyticsSettings />
            </>
          ) : null}
        </footer>
        {analytics ? <Analytics id={analytics} nonce={nonce} /> : null}
      </body>
    </html>
  );
}
