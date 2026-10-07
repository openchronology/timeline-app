// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { stageDesktop, targets } from '../scripts/desktop/packages.mjs';
const exec = promisify(execFile);
test('release assembly refuses missing targets and mixed desktop commits', async () => {
  const root = await mkdtemp(join(tmpdir(), 'och-release-check-'));
  const info = { commit: 'a'.repeat(40), version: 'v1.2.3', dirty: false, label: 'v1.2.3' };
  const assemble = () =>
    exec(process.execPath, [resolve('scripts/release-assets.mjs'), 'v1.2.3', root]);
  try {
    await writeFile(join(root, 'build-info.json'), JSON.stringify(info));
    await writeFile(join(root, 'openchronology-offline.html'), 'Build: v1.2.3');
    for (const name of [
      'openchronology-web-source.tar.gz',
      'openchronology-desktop-source.tar.gz',
      'LICENSE.txt',
      'NOTICE.txt',
    ])
      await writeFile(join(root, name), 'test source fixture');
    await assert.rejects(assemble());
    for (const [target, spec] of Object.entries(targets)) {
      await writeFile(join(root, spec.asset), 'test installer fixture');
      await writeFile(join(root, target + '-build-info.json'), JSON.stringify(info));
      if (target.startsWith('macos') || target.startsWith('windows'))
        await writeFile(
          join(root, 'openchronology-native-source-' + target + '.tar.gz'),
          'native source fixture',
        );
    }
    const windowsInfo = join(root, 'windows-amd64-build-info.json');
    await writeFile(windowsInfo, JSON.stringify({ ...info, commit: 'b'.repeat(40) }));
    await assert.rejects(assemble(), /Mismatched desktop identity/);
    await writeFile(windowsInfo, JSON.stringify(info));
    await assemble();
    const sums = await readFile(join(root, 'SHA256SUMS.txt'), 'utf8');
    for (const spec of Object.values(targets)) assert(sums.includes('  ' + spec.asset + '\n'));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test('desktop staging refuses ambiguous bundles and a dirty tagged package', async () => {
  const root = await mkdtemp(join(tmpdir(), 'och-desktop-check-'));
  const previous = process.env.OCH_VCPKG_ROOT;
  delete process.env.OCH_VCPKG_ROOT;
  try {
    await mkdir(join(root, 'dist'));
    await writeFile(
      join(root, 'dist/build-info.json'),
      JSON.stringify({ commit: 'a'.repeat(40), version: 'v1.2.3', dirty: true }),
    );
    await assert.rejects(stageDesktop('linux-deb', 'v1.2.3', root), /identity mismatch/);
    const bundles = join(root, 'src-tauri/target/release/bundle/deb');
    await mkdir(bundles, { recursive: true });
    await writeFile(join(bundles, 'one.deb'), 'one');
    await writeFile(join(bundles, 'two.deb'), 'two');
    await assert.rejects(stageDesktop('linux-deb', '', root), /exactly one/);
  } finally {
    if (previous !== undefined) process.env.OCH_VCPKG_ROOT = previous;
    await rm(root, { recursive: true, force: true });
  }
});
