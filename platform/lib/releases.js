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
/** Where each offline edition is published: openchronology.github.io/<edition>/. */
export const EDITION_SITE = 'https://openchronology.github.io';
/**
 * An offline edition's file (src/editions.ts, #197), as scripts/offline.mjs names it, and its
 * page on the organization's site, which is the same file.
 * @param {{id: string, name: string}} edition
 */
export function editionFile(edition) {
  return {
    asset: `openchronology-offline-${edition.id}.html`,
    page: `${EDITION_SITE}/${edition.id}/`,
    detail: `${edition.name} offline file (.html)`,
  };
}
/**
 * Server packages: each system's .deb, .rpm or FreeBSD .pkg, installed with apt, dnf or pkg
 * (which also install PostgreSQL). More platforms join this list as they are supported.
 */
export const SERVERS = [
  {
    key: 'windows',
    name: 'Windows',
    // A self-contained installer: its own PostgreSQL 17, run as Windows services.
    asset: 'openchronology-server-windows-amd64-setup.exe',
    installer: 'exe',
    guide: 'deploy/windows-server/README.Windows.txt',
  },
  {
    key: 'macos',
    name: 'macOS (Homebrew)',
    // Homebrew builds it from this release's platform archive; there is no file to download.
    asset: 'openchronology-server-platform.tar.gz',
    installer: 'brew',
    guide: 'deploy/homebrew/README.Homebrew',
  },
  {
    key: 'debian13',
    name: 'Debian 13 (trixie)',
    asset: 'openchronology-server-debian13-amd64.deb',
    installer: 'apt',
    guide: 'deploy/debian-server/README.Debian',
  },
  {
    key: 'ubuntu24.04',
    name: 'Ubuntu 24.04 LTS',
    asset: 'openchronology-server-ubuntu24.04-amd64.deb',
    installer: 'apt',
    guide: 'deploy/debian-server/README.Debian',
  },
  {
    key: 'rocky10',
    name: 'Rocky Linux and RHEL 10',
    asset: 'openchronology-server-rocky10-amd64.rpm',
    installer: 'dnf',
    guide: 'deploy/rpm-server/README.RPM',
  },
  {
    key: 'fedora44',
    name: 'Fedora 44',
    asset: 'openchronology-server-fedora44-amd64.rpm',
    installer: 'dnf',
    guide: 'deploy/rpm-server/README.RPM',
  },
  {
    key: 'freebsd15',
    name: 'FreeBSD 15',
    asset: 'openchronology-server-freebsd15-amd64.pkg',
    installer: 'pkg',
    guide: 'deploy/freebsd-server/README.FreeBSD',
  },
  {
    key: 'freebsd14',
    name: 'FreeBSD 14',
    asset: 'openchronology-server-freebsd14-amd64.pkg',
    installer: 'pkg',
    guide: 'deploy/freebsd-server/README.FreeBSD',
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
  if (hint === 'freebsd' || ua.includes('freebsd')) return 'freebsd';
  if (hint === 'linux' || ua.includes('linux') || ua.includes('x11')) return 'linux';
  return null;
}
/** Which distribution a Linux visitor's browser says it runs on (some do). */
export function detectDistribution(userAgent = '') {
  const ua = userAgent.toLowerCase();
  if (ua.includes('ubuntu')) return 'ubuntu24.04';
  if (ua.includes('debian')) return 'debian13';
  if (ua.includes('fedora')) return 'fedora44';
  if (ua.includes('rocky') || ua.includes('red hat') || ua.includes('rhel')) return 'rocky10';
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
/**
 * The one line that downloads a server package and installs it: with curl and sudo apt or
 * dnf, or on FreeBSD (run as root) with its own fetch and pkg, then openchronology-setup
 * (FreeBSD packages start nothing themselves).
 */
export function installCommand(release, server) {
  if (server.installer === 'brew')
    return 'brew install openchronology/tap/openchronology-server && openchronology-setup';
  if (server.installer === 'exe')
    return `Invoke-WebRequest ${assetLink(release, server.asset)} -OutFile "$env:TEMP\\${server.asset}"; Start-Process -Wait -Verb RunAs "$env:TEMP\\${server.asset}"`;
  const url = assetLink(release, server.asset);
  return server.installer === 'pkg'
    ? `fetch ${url} && pkg install -y ./${server.asset} && openchronology-setup`
    : `curl -fLO ${url} && sudo ${server.installer} install ./${server.asset}`;
}

/**
 * The Linux distributions the download page's guides tell apart, in the order it offers them:
 * each family installs the same way. Arch installs from the AUR (`AUR`).
 */
export const LINUX_FAMILIES = [
  { key: 'debian', name: 'Debian / Ubuntu' },
  { key: 'fedora', name: 'Fedora' },
  { key: 'rocky', name: 'Rocky / RHEL' },
  { key: 'arch', name: 'Arch' },
  { key: 'other', name: 'Other' },
];
/** Which family of `LINUX_FAMILIES` a Linux visitor's browser names, or null (most don't). */
export function detectLinux(userAgent = '') {
  const ua = userAgent.toLowerCase();
  if (/ubuntu|debian|mint|pop!?_os/.test(ua)) return 'debian';
  if (ua.includes('fedora')) return 'fedora';
  if (/rocky|red hat|rhel|alma|centos/.test(ua)) return 'rocky';
  if (/arch ?linux|manjaro|endeavouros/.test(ua)) return 'arch';
  return null;
}
/**
 * Arch's packages, on the AUR (deploy/arch): the desktop app from the release's .deb, and the
 * server built for the system. They update with the system through an AUR helper.
 */
export const AUR = {
  desktop: 'openchronology-desktop-bin',
  server: 'openchronology-server',
  page: (name) => `https://aur.archlinux.org/packages/${name}`,
};
/** Installing an AUR package: with a helper such as yay, or by hand with makepkg. */
export function aurSteps(name) {
  return [
    {
      text: 'With an AUR helper such as yay:',
      command: `yay -S ${name}`,
      label: `Install ${name} with yay`,
    },
    {
      text: 'Or by hand, with makepkg:',
      command: `git clone https://aur.archlinux.org/${name}.git && cd ${name} && makepkg -si`,
      label: `Build and install ${name} with makepkg`,
    },
  ];
}
/** The desktop app's systems, as the download page's tabs name them. */
export const DESKTOP_SYSTEMS = [
  { key: 'windows', name: 'Windows' },
  { key: 'macos', name: 'Mac' },
  { key: 'linux', name: 'Linux', variants: LINUX_FAMILIES },
];
/** The server's systems, as the download page's tabs name them. */
export const SERVER_SYSTEMS = [...DESKTOP_SYSTEMS, { key: 'freebsd', name: 'FreeBSD' }];

/** A file for a guide: where it downloads from, what it is and its size. */
function guideFile(release, asset, label, primary = false) {
  return {
    asset,
    href: assetLink(release, asset),
    label,
    size: assetSize(release, asset),
    primary,
  };
}
/** The desktop file with this key (DESKTOP). */
const desktop = (key) => DESKTOP.find((file) => file.key === key);
/** The lines that download a Linux desktop file and install or start it. */
function desktopCommand(release, file, installer) {
  const fetch = `curl -fLO ${assetLink(release, file.asset)}`;
  return installer === 'appimage'
    ? `${fetch} && chmod +x ${file.asset} && ./${file.asset}`
    : `${fetch} && sudo ${installer} install ./${file.asset}`;
}
/**
 * The desktop app's guide for each system and Linux family, by "system" or "linux/<family>":
 * a heading, what to do, the files and any commands. Plain data, so the page can hand it to
 * its tabs (components/download-chooser.jsx).
 */
export function desktopGuides(release) {
  const file = (key, primary) => {
    const f = desktop(key);
    return guideFile(release, f.asset, f.detail, primary);
  };
  const appImage = desktop('linux-appimage');
  const intro =
    'Work with local timeline files, offline, and connect to OpenChronology servers when you want to share.';
  return {
    windows: {
      heading: 'Desktop app for Windows',
      intro,
      files: [{ ...file('windows-amd64', true), name: 'Windows' }],
      steps: [{ text: 'Download the installer and run it. Windows 10 and 11, 64-bit.' }],
    },
    macos: {
      heading: 'Desktop app for macOS',
      intro,
      files: [{ ...file('macos-arm64', true), name: 'macOS' }, file('macos-amd64')],
      steps: [{ text: 'Open the disk image and drag OpenChronology into Applications.' }],
      note: 'Most Macs since 2020 have Apple silicon; choose Intel for older ones (Apple menu → About This Mac).',
    },
    'linux/debian': {
      heading: 'Desktop app for Linux: Debian and Ubuntu',
      intro,
      files: [{ ...file('linux-deb', true), name: 'Debian and Ubuntu' }],
      steps: [
        {
          text: 'Download and install in one line:',
          command: desktopCommand(release, desktop('linux-deb'), 'apt'),
          label: 'Install on Debian or Ubuntu',
        },
      ],
    },
    'linux/rocky': {
      heading: 'Desktop app for Linux: Rocky Linux and RHEL',
      intro,
      files: [{ ...file('rocky-rpm', true), name: 'Rocky Linux and RHEL' }],
      steps: [
        {
          text: 'Download and install in one line:',
          command: desktopCommand(release, desktop('rocky-rpm'), 'dnf'),
          label: 'Install on Rocky Linux or RHEL',
        },
      ],
    },
    'linux/fedora': {
      heading: 'Desktop app for Linux: Fedora',
      intro,
      files: [{ ...file('linux-appimage', true), name: 'Fedora' }],
      steps: [
        {
          text: 'The AppImage runs as it is; download it, make it executable and start it:',
          command: desktopCommand(release, appImage, 'appimage'),
          label: 'Run the AppImage on Fedora',
        },
      ],
    },
    'linux/arch': {
      heading: 'Desktop app for Linux: Arch',
      intro,
      files: [],
      steps: aurSteps(AUR.desktop),
      links: [{ href: AUR.page(AUR.desktop), label: `${AUR.desktop} on the AUR` }],
      note: 'Updating with your AUR helper (yay -Syu) brings each new release.',
    },
    'linux/other': {
      heading: 'Desktop app for Linux',
      intro,
      files: [{ ...file('linux-appimage', true), name: 'Linux' }],
      steps: [
        {
          text: 'The AppImage runs on most distributions (it needs FUSE 2); download it, make it executable and start it:',
          command: desktopCommand(release, appImage, 'appimage'),
          label: 'Run the AppImage',
        },
      ],
    },
  };
}
/** The command that runs the server and its database from the source with Docker Compose. */
export const DOCKER_COMMAND = `git clone https://github.com/${REPOSITORY}.git && cd timeline-app && cp .env.example .env && docker compose up --build --wait`;
/** Where the setup guides are read: the repository's main branch on GitHub. */
export const DOCS = `https://github.com/${REPOSITORY}/blob/main`;
/**
 * The server's guide for each system and Linux family, as `desktopGuides` gives the desktop
 * app's. A family with two packages (Debian and Ubuntu) lists `first`'s first: the key of
 * the server (SERVERS) the visitor's browser named.
 */
export function serverGuides(release, first = null) {
  const server = (key) => SERVERS.find((s) => s.key === key);
  const install = (key, text) => {
    const s = server(key);
    return {
      text: text ?? `${s.name}:`,
      command: installCommand(release, s),
      label: `Install on ${s.name}`,
    };
  };
  const pkg = (key) => {
    const s = server(key);
    return guideFile(release, s.asset, `${s.name} package (.${s.asset.split('.').pop()}), amd64`);
  };
  const guide = (key) => ({ href: `${DOCS}/${server(key).guide}`, label: 'Setup guide' });
  const intro =
    'Run your own OpenChronology server for your organization or community. The package installs PostgreSQL, sets up the database and starts the service on port 5173; put an HTTPS proxy in front of it and set your address in /etc/openchronology/openchronology.env.';
  const docker = {
    text: 'Then build and run the server and its database from the source:',
    command: DOCKER_COMMAND,
    label: 'Run with Docker Compose',
  };
  const dockerGuide = { href: `${DOCS}/docs/docker.md`, label: 'Docker deployment guide' };
  const order = (keys) => [...keys].sort((a, b) => (b === first) - (a === first));
  return {
    windows: {
      heading: 'Server for Windows',
      intro: 'A self-contained installer with its own PostgreSQL 17, run as Windows services.',
      steps: [
        install(
          'windows',
          'Download and run the installer, in PowerShell (it asks for administrator rights):',
        ),
      ],
      files: [
        guideFile(release, server('windows').asset, 'Installer (.exe), 64-bit, with PostgreSQL 17'),
      ],
      links: [guide('windows')],
    },
    macos: {
      heading: 'Server for macOS',
      intro: 'Homebrew builds and installs the server and PostgreSQL, on Apple silicon or Intel.',
      steps: [install('macos', 'Install with Homebrew:')],
      files: [],
      links: [guide('macos')],
    },
    'linux/debian': {
      heading: 'Server for Debian and Ubuntu',
      intro,
      steps: order(['debian13', 'ubuntu24.04']).map((key) => install(key)),
      files: order(['debian13', 'ubuntu24.04']).map(pkg),
      links: [guide('debian13')],
    },
    'linux/fedora': {
      heading: 'Server for Fedora',
      intro,
      steps: [install('fedora44', 'Download and install in one line:')],
      files: [pkg('fedora44')],
      links: [guide('fedora44')],
    },
    'linux/rocky': {
      heading: 'Server for Rocky Linux and RHEL',
      intro,
      steps: [install('rocky10', 'Download and install in one line:')],
      files: [pkg('rocky10')],
      links: [guide('rocky10')],
    },
    'linux/arch': {
      heading: 'Server for Arch',
      intro:
        'The AUR package builds the server for this system; like Arch packages, it leaves PostgreSQL and the database to openchronology-setup.',
      steps: [
        ...aurSteps(AUR.server),
        {
          text: 'Then set up PostgreSQL and the database, and start the server:',
          command: 'sudo openchronology-setup',
          label: 'Set up the server on Arch',
        },
      ],
      files: [],
      links: [
        { href: AUR.page(AUR.server), label: `${AUR.server} on the AUR` },
        { href: `${DOCS}/deploy/arch/README.Arch`, label: 'Setup guide' },
      ],
      note: 'Updating with your AUR helper (yay -Syu) brings each new release and migrates the database.',
    },
    'linux/other': {
      heading: 'Server for other Linux distributions',
      intro:
        'On any system with Docker Engine and Compose, run the server and its database from the source.',
      steps: [{ ...docker, text: 'Build and run it:' }],
      files: [],
      links: [dockerGuide],
    },
    freebsd: {
      heading: 'Server for FreeBSD',
      intro:
        'The package installs PostgreSQL; openchronology-setup sets up the database and starts the service.',
      steps: order(['freebsd15', 'freebsd14']).map((key) =>
        install(key, `${server(key).name}, as root:`),
      ),
      files: order(['freebsd15', 'freebsd14']).map(pkg),
      links: [guide('freebsd15')],
    },
  };
}
