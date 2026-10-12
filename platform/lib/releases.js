// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
/**
 * What the download page offers (#111): the desktop app for each operating system, the
 * offline file, and the server for each supported distribution, with their release assets.
 * Asset names follow the release workflow (scripts/desktop/packages.mjs and
 * scripts/server-targets.mjs; test/releases.test.mjs keeps them in step).
 */
export const REPOSITORY = 'openchronology/timeline-app';
export const RELEASES = `https://github.com/${REPOSITORY}/releases`;

/** Desktop downloads, each for one operating system, most common first. */
export const DESKTOP = [
  {
    key: 'windows-amd64',
    os: 'windows',
    name: 'Windows',
    detail: '64-bit installer (.exe)',
    asset: 'openchronology-desktop-windows-amd64-setup.exe',
  },
  {
    key: 'macos-arm64',
    os: 'macos',
    name: 'macOS',
    detail: 'Apple silicon (.dmg)',
    asset: 'openchronology-desktop-macos-arm64.dmg',
  },
  {
    key: 'macos-amd64',
    os: 'macos',
    name: 'macOS',
    detail: 'Intel (.dmg)',
    asset: 'openchronology-desktop-macos-amd64.dmg',
  },
  {
    key: 'linux-deb',
    os: 'linux',
    name: 'Linux',
    detail: 'Debian and Ubuntu (.deb)',
    asset: 'openchronology-desktop-linux-amd64.deb',
  },
  {
    key: 'linux-appimage',
    os: 'linux',
    name: 'Linux',
    detail: 'Any distribution (.AppImage)',
    asset: 'openchronology-desktop-linux-amd64.AppImage',
  },
  {
    key: 'rocky-rpm',
    os: 'linux',
    name: 'Linux',
    detail: 'Rocky Linux and RHEL 10 (.rpm)',
    asset: 'openchronology-desktop-rocky10-amd64.rpm',
  },
];
/** The editor in one HTML file, for any browser and without a network. */
export const OFFLINE = { asset: 'openchronology-offline.html' };
/**
 * Server packages: each distribution's .deb, installed with apt (which also installs
 * PostgreSQL). More platforms join this list as they are supported.
 */
export const SERVERS = [
  {
    key: 'debian13',
    name: 'Debian 13 (trixie)',
    asset: 'openchronology-server-debian13-amd64.deb',
  },
  {
    key: 'ubuntu24.04',
    name: 'Ubuntu 24.04 LTS',
    asset: 'openchronology-server-ubuntu24.04-amd64.deb',
  },
];
export const OTHER_ASSETS = {
  checksums: 'SHA256SUMS.txt',
  source: 'openchronology-web-source.tar.gz',
  desktopSource: 'openchronology-desktop-source.tar.gz',
};

/** The visitor's operating system, from their browser's request headers. */
export function detectPlatform(userAgent = '', hintPlatform = '') {
  const hint = hintPlatform.replaceAll('"', '').toLowerCase();
  const ua = userAgent.toLowerCase();
  if (hint === 'android' || ua.includes('android')) return 'android';
  if (hint === 'ios' || /iphone|ipad|ipod/.test(ua)) return 'ios';
  if (hint === 'windows' || ua.includes('windows')) return 'windows';
  if (hint === 'macos' || ua.includes('mac os x') || ua.includes('macintosh')) return 'macos';
  if (hint === 'chrome os' || ua.includes('cros')) return 'chromeos';
  if (hint === 'linux' || ua.includes('linux') || ua.includes('x11')) return 'linux';
  return null;
}
/** Whether a Linux visitor's browser says it runs on Debian or Ubuntu (some do). */
export function detectDistribution(userAgent = '') {
  const ua = userAgent.toLowerCase();
  if (ua.includes('ubuntu')) return 'ubuntu24.04';
  if (ua.includes('debian')) return 'debian13';
  return null;
}

/** A latest release, with each asset's address and size; null while there is none. */
export function releaseFrom(json) {
  if (!json || typeof json.tag_name !== 'string' || !Array.isArray(json.assets)) return null;
  const assets = {};
  for (const a of json.assets)
    if (
      typeof a?.name === 'string' &&
      typeof a.browser_download_url === 'string' &&
      a.browser_download_url.startsWith('https://')
    )
      assets[a.name] = { url: a.browser_download_url, size: Number(a.size) || 0 };
  return {
    tag: json.tag_name,
    name: typeof json.name === 'string' && json.name ? json.name : json.tag_name,
    published: typeof json.published_at === 'string' ? json.published_at : null,
    notes: typeof json.html_url === 'string' ? json.html_url : `${RELEASES}/tag/${json.tag_name}`,
    assets,
  };
}
/** Where an asset downloads from: the release's own address, or the latest release's. */
export function assetLink(release, asset) {
  return release?.assets[asset]?.url ?? `${RELEASES}/latest/download/${asset}`;
}
export function assetSize(release, asset) {
  const bytes = release?.assets[asset]?.size;
  if (!bytes) return null;
  return bytes >= 1048576
    ? `${(bytes / 1048576).toFixed(bytes >= 104857600 ? 0 : 1)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}
/** The one line that downloads a server package and installs it with apt. */
export function installCommand(release, server) {
  return `curl -fLO ${assetLink(release, server.asset)} && sudo apt install ./${server.asset}`;
}
