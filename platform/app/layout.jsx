// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
import './platform.css';
import Downloads from '../components/downloads.jsx';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
export const metadata = {
  title: 'OpenChronology · timescale.info',
  description: 'Exact timelines, shared on your terms.',
};
export default async function RootLayout({ children }) {
  const build = JSON.parse(
    await readFile(
      resolve(process.env.OCH_APP_ROOT ?? process.cwd(), 'dist/build-info.json'),
      'utf8',
    ),
  );
  return (
    <html lang="en">
      <body>
        <header className="platform-header">
          <a href="/" className="brand">
            ◷ openchronology
          </a>
          <nav aria-label="Platform navigation">
            <a href="/editor?new=1">＋ New timeline</a>
            <a href="/plugins">Plugin library</a>
            <a href="/account">Account</a>
            <Downloads />
          </nav>
        </header>
        {children}
        <footer className="platform-footer">
          © 2026 Athan Clark · GPLv3 · No warranty ·{' '}
          <a href="/legal">Terms, privacy &amp; licenses</a> ·{' '}
          <a href="/openchronology-web-source.tar.gz" download>
            Source
          </a>
          {' · '}
          <span className="build-identity">Build: {build.label}</span>
        </footer>
      </body>
    </html>
  );
}
