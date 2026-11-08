// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// Renders the AUR packages (#331) from deploy/arch: openchronology-server, built from a platform
// archive, and openchronology-desktop-bin, unpacked from a desktop .deb. Each goes in its own
// folder of `--out` with the files its PKGBUILD names, ready for `makepkg --printsrcinfo` and
// a push to aur.archlinux.org. Releases render them for their assets; CI builds and installs
// the server's from local files.
// Usage: node scripts/aur-packages.mjs --out <dir> [--version <version>]
//          [--platform <tarball> [--platform-url <url>]] [--desktop <deb> [--desktop-url <url>]]
// A file without its URL is copied beside the PKGBUILD and named as a local source. Without
// --version: the release tag's (RELEASE_TAG), or this checkout's development version.
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseArgs, promisify } from 'node:util';
import { freebsdVersion, upstreamVersion } from './server-targets.mjs';

/** The files openchronology-server's PKGBUILD names beside it, by where they come from. */
export const SERVER_FILES = {
  'deploy/debian-server': [
    'openchronology.service',
    'openchronology-mail.service',
    'openchronology-syslog.service',
    'openchronology-github.service',
    'openchronology-journald.service',
    'openchronology.env',
    'syslog.env',
    'github.env',
    'journald.env',
    'openchronology-migrate',
    'openchronology-reset-admin-password',
    'och-import-logs',
    'och-import-github',
    'openchronology-log-files',
  ],
  'deploy/arch': [
    'openchronology-setup',
    'openchronology-server.sysusers',
    'openchronology-server.tmpfiles',
    'README.Arch',
  ],
};
// The pinned pgmp source's checksum, which the Windows build checks the same download against:
// a release never takes it from whatever the download returns that day.
const PGMP_SHA256 = 'deploy/windows-server/pgmp.sha256';

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
/** An AUR version: pacman compares dotted parts, so a suffix becomes more of them. */
export const aurVersion = (upstream) => freebsdVersion(upstream);

/**
 * Renders the packages into `out`. `platform` and `desktop` are { file, url? }; either may be
 * left out, and its package is not rendered.
 * @returns {Promise<string[]>} the folders written
 */
export async function renderAur({ out, version, platform, desktop }) {
  if (!/^[0-9][0-9A-Za-z.]*$/.test(version))
    throw new Error('An AUR version is dotted letters and digits.');
  const written = [];
  if (platform) {
    const dir = join(out, 'openchronology-server');
    await mkdir(dir, { recursive: true });
    const local = Object.entries(SERVER_FILES).flatMap(([from, names]) =>
      names.map((name) => ({ from: join(from, name), name })),
    );
    const archive = `openchronology-server-platform-${version}.tar.gz`;
    if (!platform.url) await copyFile(platform.file, join(dir, archive));
    const pgmp = (await readFile(PGMP_SHA256, 'utf8')).trim();
    if (!/^[0-9a-f]{64}$/.test(pgmp)) throw new Error(`${PGMP_SHA256} is not a SHA-256 checksum.`);
    const sums = [sha256(await readFile(platform.file)), pgmp];
    for (const { from, name } of local) {
      const bytes = await readFile(from);
      await writeFile(join(dir, name), bytes);
      sums.push(sha256(bytes));
    }
    await copyFile(
      'deploy/arch/openchronology-server.install',
      join(dir, 'openchronology-server.install'),
    );
    const pkgbuild = (await readFile('deploy/arch/openchronology-server.PKGBUILD.in', 'utf8'))
      .replace('@VERSION@', version)
      .replace(
        '"openchronology-server-platform-$pkgver.tar.gz::@PLATFORM_URL@"',
        platform.url
          ? `"openchronology-server-platform-$pkgver.tar.gz::${platform.url}"`
          : '"openchronology-server-platform-$pkgver.tar.gz"',
      )
      .replace('@LOCAL_SOURCES@', local.map(({ name }) => `        '${name}'`).join('\n'))
      .replace('@SHA256SUMS@', sums.map((sum) => `'${sum}'`).join('\n            '));
    await writeFile(join(dir, 'PKGBUILD'), pkgbuild);
    written.push(dir);
  }
  if (desktop) {
    const dir = join(out, 'openchronology-desktop-bin');
    await mkdir(dir, { recursive: true });
    const deb = `openchronology-desktop-${version}.deb`;
    if (!desktop.url) await copyFile(desktop.file, join(dir, deb));
    const pkgbuild = (await readFile('deploy/arch/openchronology-desktop-bin.PKGBUILD.in', 'utf8'))
      .replace('@VERSION@', version)
      .replace(
        '"openchronology-desktop-$pkgver.deb::@DESKTOP_URL@"',
        desktop.url
          ? `"openchronology-desktop-$pkgver.deb::${desktop.url}"`
          : '"openchronology-desktop-$pkgver.deb"',
      )
      .replace('@DESKTOP_SHA256@', sha256(await readFile(desktop.file)));
    await writeFile(join(dir, 'PKGBUILD'), pkgbuild);
    written.push(dir);
  }
  return written;
}
if (import.meta.url === `file://${process.argv[1]}`) {
  const { values } = parseArgs({
    options: {
      out: { type: 'string' },
      version: { type: 'string' },
      platform: { type: 'string' },
      'platform-url': { type: 'string' },
      desktop: { type: 'string' },
      'desktop-url': { type: 'string' },
    },
  });
  if (!values.out || (!values.platform && !values.desktop))
    throw new Error('Supply --out and --platform or --desktop.');
  let version = values.version;
  if (!version) {
    const exec = promisify(execFile);
    const git = async (...args) => (await exec('git', args)).stdout.trim();
    const pkg = JSON.parse(await readFile('package.json', 'utf8'));
    const stamp = await git('show', '-s', '--format=%cd', '--date=format:%Y%m%d%H%M', 'HEAD');
    version = aurVersion(
      process.env.RELEASE_TAG
        ? upstreamVersion(process.env.RELEASE_TAG)
        : `${pkg.version}~dev.${stamp}.${(await git('rev-parse', 'HEAD')).slice(0, 7)}`,
    );
  }
  const dirs = await renderAur({
    out: values.out,
    version,
    platform: values.platform && { file: values.platform, url: values['platform-url'] },
    desktop: values.desktop && { file: values.desktop, url: values['desktop-url'] },
  });
  for (const dir of dirs) console.log(dir);
}
