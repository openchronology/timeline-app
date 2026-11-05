// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// Builds the AUR desktop package (scripts/aur-packages.mjs) with makepkg in a fresh Arch Linux
// container and installs it: the app, its launcher and icon, and every library it links found
// among its dependencies (#331).
// Usage: node test/desktop-arch.mjs <folder with the rendered openchronology-desktop-bin PKGBUILD>
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);
const folder = resolve(process.argv[2] ?? '');
if (!existsSync(join(folder, 'PKGBUILD')))
  throw new Error(
    'Pass the folder scripts/aur-packages.mjs rendered openchronology-desktop-bin in.',
  );
const name = 'och-desktop-arch-' + process.pid;
const sh = async (script) => {
  try {
    const { stdout, stderr } = await run('docker', ['exec', name, 'bash', '-c', script], {
      maxBuffer: 64 * 1024 * 1024,
    });
    return stdout + stderr;
  } catch (error) {
    throw new Error(`${script}\n${error.stdout ?? ''}${error.stderr ?? ''}`);
  }
};

await run('docker', ['run', '-d', '--rm', '--name', name, 'archlinux:latest', 'sleep', 'infinity']);
try {
  // As server-arch.mjs: no download sandbox in a container.
  await sh("sed -i '/^\\[options\\]/a DisableSandbox' /etc/pacman.conf");
  await sh('pacman -Syu --noconfirm --needed base-devel >/dev/null');
  await sh('useradd -m builder');
  await run('docker', ['cp', folder, `${name}:/home/builder/desktop`]);
  await sh('chown -R builder:builder /home/builder/desktop');
  const build = (script) => sh(`cd /home/builder/desktop && runuser -u builder -- ${script}`);
  assert.match(await build('makepkg --printsrcinfo'), /pkgbase = openchronology-desktop-bin/);
  // Nothing is compiled: the dependencies are for running it, which pacman installs below.
  await build('makepkg --noconfirm --nodeps 2>&1');
  const pkg = (await build('ls openchronology-desktop-bin-*.pkg.tar.zst')).trim();
  // pacman installs its dependencies from the repositories.
  await sh(`pacman -U --noconfirm /home/builder/desktop/${pkg} >/dev/null`);
  assert.match(await sh('ls -l /usr/bin/openchronology-desktop'), /^-rwxr-xr-x/);
  assert.match(
    await sh('cat /usr/share/applications/OpenChronology.desktop'),
    /^Exec=openchronology-desktop/m,
  );
  await sh('test -f /usr/share/icons/hicolor/256x256/apps/openchronology-desktop.png');
  await sh('test -f /usr/share/licenses/openchronology-desktop-bin/LICENSE');
  const ldd = await sh('ldd /usr/bin/openchronology-desktop');
  assert.doesNotMatch(ldd, /not found/, ldd);
  assert.match(ldd, /libwebkit2gtk-4\.1/);
  console.log(
    'PASS desktop package on Arch Linux: built with makepkg and installed, with its launcher, icon, licence and every library it links.',
  );
} finally {
  await run('docker', ['rm', '-f', name]).catch(() => {});
}
