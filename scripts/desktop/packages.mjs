// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
import { mkdir, cp, readFile, writeFile, readdir, mkdtemp, rm } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
export const targets = {
  'linux-deb': { bundle: 'deb', suffix: '.deb', asset: 'openchronology-desktop-linux-amd64.deb' },
  'rocky-rpm': { bundle: 'rpm', suffix: '.rpm', asset: 'openchronology-desktop-rocky10-amd64.rpm' },
  'macos-arm64': { bundle: 'dmg', suffix: '.dmg', asset: 'openchronology-desktop-macos-arm64.dmg' },
  'macos-amd64': { bundle: 'dmg', suffix: '.dmg', asset: 'openchronology-desktop-macos-amd64.dmg' },
  'windows-amd64': {
    bundle: 'nsis',
    suffix: '.exe',
    asset: 'openchronology-desktop-windows-amd64-setup.exe',
  },
};
export async function stageDesktop(target, tag = '', root = '.') {
  const spec = targets[target];
  if (!spec) throw Error('Unknown desktop target');
  const info = JSON.parse(await readFile(join(root, 'dist/build-info.json'), 'utf8'));
  if (tag && (info.version !== tag || info.dirty || !info.commit))
    throw Error('Desktop release identity mismatch');
  const dir = join(root, 'src-tauri/target/release/bundle', spec.bundle);
  const files = (await readdir(dir)).filter((name) => name.endsWith(spec.suffix));
  if (files.length !== 1) throw Error('Expected exactly one ' + target + ' package');
  const output = join(root, 'desktop-artifacts');
  await mkdir(output, { recursive: true });
  await cp(join(dir, files[0]), join(output, spec.asset));
  await writeFile(join(output, target + '-build-info.json'), JSON.stringify(info, null, 2) + '\n');
  if (process.env.OCH_VCPKG_ROOT) await nativeSources(process.env.OCH_VCPKG_ROOT, output, target);
}
async function nativeSources(vcpkg, output, target) {
  const exec = promisify(execFile),
    temp = await mkdtemp(join(tmpdir(), 'och-native-source-'));
  try {
    const root = join(temp, 'native-dependencies');
    await mkdir(root);
    const archives = (await readdir(join(vcpkg, 'downloads'))).filter(
      (name) => /(gmp|sqlite)/i.test(name) && /\.(zip|tar\.(xz|gz|bz2))$/.test(name),
    );
    if (
      !archives.some((name) => /gmp/i.test(name)) ||
      !archives.some((name) => /sqlite/i.test(name))
    )
      throw Error('Missing GMP or SQLite preferred source archive');
    for (const name of archives) await cp(join(vcpkg, 'downloads', name), join(root, name));
    for (const name of ['gmp', 'sqlite3'])
      await cp(join(vcpkg, 'ports', name), join(root, 'ports', name), { recursive: true });
    const revision = (await exec('git', ['-C', vcpkg, 'rev-parse', 'HEAD'])).stdout.trim();
    await writeFile(
      join(root, 'README.txt'),
      'GMP and SQLite sources embedded in ' +
        target +
        '.\nvcpkg revision: ' +
        revision +
        '\nUse the included port build recipes with this vcpkg revision.\nUpstream archives contain their licenses and preferred C sources.\n',
    );
    await exec('tar', [
      '-czf',
      join(output, 'openchronology-native-source-' + target + '.tar.gz'),
      '-C',
      temp,
      'native-dependencies',
    ]);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
}
