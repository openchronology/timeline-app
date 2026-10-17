// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// Every page's frame: the site's header and navigation, its footer with the build, and
// analytics when enabled; also the site's default metadata for link previews.
import './platform.css';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import Analytics, { AnalyticsSettings } from '../components/analytics.jsx';
import { headers } from 'next/headers';
import { siteOrigin } from '../lib/sharing.js';
import { analyticsId, platformName, siteName } from '../../server/site.mjs';
export function generateMetadata() {
  const description = 'Exact timelines, shared on your terms.';
  return {
    // Relative addresses in pages' metadata (link previews, canonical links) are on this site.
    metadataBase: new URL(siteOrigin()),
    title: platformName() ? `${platformName()} · OpenChronology` : 'OpenChronology',
    description,
    openGraph: { type: 'website', siteName: siteName(), locale: 'en_US', description },
    twitter: { card: 'summary_large_image' },
  };
}
export default async function RootLayout({ children }) {
  const build = JSON.parse(
    await readFile(
      resolve(process.env.OCH_APP_ROOT ?? process.cwd(), 'dist/build-info.json'),
      'utf8',
    ),
  );
  // A platform's own name replaces OpenChronology's in its header (PLATFORM_NAME).
  const name = platformName();
  const analytics = analyticsId();
  const nonce = analytics ? (await headers()).get('x-nonce') : null;
  return (
    <html lang="en">
      <body>
        <header className="platform-header">
          <a href="/" className="brand">
            ◷ {name ?? 'openchronology'}
          </a>
          <nav aria-label="Platform navigation">
            <a href="/editor?new=1">＋ New timeline</a>
            <a href="/plugins">Plugin library</a>
            <a href="/account">Account</a>
            <a href="/download">Download</a>
            <a href="/help">Help</a>
          </nav>
        </header>
        {children}
        <footer className="platform-footer">
          © 2026 Athan Clark · GPLv3 · No warranty ·{' '}
          <a href="/legal">Terms, privacy &amp; licenses</a> · <a href="/help">Help</a> ·{' '}
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
