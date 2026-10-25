// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// Every page's frame: the site's header with its navigation and the visitor's account (sign in
// and sign up, or the account's menu) and, for an account that has not agreed to the terms in
// force, a request to (#277), its footer with the build, a Support link and analytics
// when enabled; also the site's default metadata for link previews.
import './platform.css';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import Analytics, { AnalyticsSettings } from '../components/analytics.jsx';
import AccountMenu from '../components/account-menu.jsx';
import TermsPrompt from '../components/terms-prompt.jsx';
import { POLICY_VERSION } from '../../server/policies.mjs';
import { currentSession } from '../lib/session.js';
import { headers } from 'next/headers';
import { siteOrigin } from '../lib/sharing.js';
import { analyticsId, platformName, siteName, supportUrl } from '../../server/site.mjs';
export function generateMetadata() {
  const description = 'Exact timelines, shared on your terms.';
  return {
    // Relative addresses in pages' metadata (link previews, canonical links) are on this site.
    metadataBase: new URL(siteOrigin()),
    title: platformName() ? `${platformName()} · OpenChronology` : 'OpenChronology',
    description,
    openGraph: { type: 'website', siteName: siteName(), locale: 'en_US', description },
    twitter: { card: 'summary_large_image' },
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
  // Read for every page, so each renders per request: its header shows who is visiting.
  const request = await headers();
  const nonce = analytics ? request.get('x-nonce') : null;
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
    <html lang="en">
      <body>
        <header className="platform-header">
          <a href="/" className="brand">
            <img src="/logo-mark.svg" alt="" width="28" height="28" />
            {name ?? 'openchronology'}
          </a>
          <nav aria-label="Platform navigation">
            <a href="/editor?new=1">＋ New timeline</a>
            <a href="/plugins">Plugin library</a>
            <a href="/download">Download</a>
            <a href="/help">Help</a>
            {support ? (
              <a href={support} className="support-link">
                ♥ Support
              </a>
            ) : null}
          </nav>
          {user ? (
            <AccountMenu
              username={user.username}
              avatarUrl={user.avatarUrl}
              isAdmin={user.isAdmin}
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
          </a>
          {' · '}
          <span className="build-identity">Build: {build.label}</span>
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
