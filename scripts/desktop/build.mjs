// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { releaseVersion } from '../build-info.mjs';
import { stageDesktop, targets } from './packages.mjs';
const exec = promisify(execFile),
  target = process.argv[2],
  tag = process.env.RELEASE_TAG || '';
if (!targets[target]) throw Error('Unknown desktop target');
if (tag) {
  if (!releaseVersion.test(tag)) throw Error('Invalid release tag');
  const commit = (await exec('git', ['rev-parse', 'HEAD'])).stdout.trim();
  const tagged = (await exec('git', ['rev-parse', tag + '^{commit}'])).stdout.trim();
  if (commit !== tagged) throw Error('The desktop checkout must match the release tag');
  process.env.OCH_BUILD_COMMIT = commit;
  process.env.OCH_BUILD_VERSION = tag;
}
const config = join(tmpdir(), 'och-desktop-' + target + '.json');
await writeFile(config, JSON.stringify(tag ? { version: tag.replace(/^v/, '') } : {}) + '\n');
const build = () =>
  new Promise((done, reject) => {
    const p = spawn(
      process.execPath,
      [
        resolve('node_modules/@tauri-apps/cli/tauri.js'),
        'build',
        '--bundles',
        targets[target].bundle,
        '--config',
        config,
        '--',
        '--locked',
      ],
      { stdio: 'inherit', env: process.env },
    );
    p.on('error', reject);
    p.on('exit', (code) => (code === 0 ? done() : reject(Error('Desktop build failed: ' + code))));
  });
// Creating the macOS disk image (Tauri's bundle_dmg.sh) intermittently fails on CI runners.
// Retrying reuses the compiled app, so only packaging runs again.
const attempts = target.startsWith('macos') ? 3 : 1;
for (let attempt = 1; ; attempt++) {
  try {
    await build();
    break;
  } catch (error) {
    if (attempt >= attempts) throw error;
    console.warn(`${error.message}; retrying packaging (attempt ${attempt + 1} of ${attempts}).`);
    // A failed attempt can leave its disk image mounted, which would fail the next one.
    const { stdout } = await exec('hdiutil', ['info']).catch(() => ({ stdout: '' }));
    for (const volume of stdout.match(/\/Volumes\/OpenChronology[^\n]*/g) ?? [])
      await exec('hdiutil', ['detach', '-force', volume.trim()]).catch(() => {});
    await new Promise((resume) => setTimeout(resume, 5000));
  }
}
await stageDesktop(target, tag);
