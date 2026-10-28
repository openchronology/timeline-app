// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// The Node.js tarball the .deb and .rpm packages bundle, downloaded once outside Docker (#369):
// CI caches it and passes it to scripts/server-package.mjs (OCH_NODE_TARBALL), so the package
// builds don't download it from nodejs.org themselves. The version and checksum are the
// Dockerfiles' (nodeRuntime, scripts/server-targets.mjs).
// Usage: node scripts/node-tarball.mjs --print   version, arch and tarball, as key=value lines
//        node scripts/node-tarball.mjs <dir>     downloads (unless present) and checks
//          <dir>/node-v<version>-linux-x64.tar.xz and <dir>/SHASUMS256.txt
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { nodeRuntime } from './server-targets.mjs';

const { version, sha256, arch, tarball } = nodeRuntime();
const [dir] = process.argv.slice(2);
if (!dir) throw new Error('Usage: node scripts/node-tarball.mjs --print | <dir>');
if (dir === '--print') {
  console.log(`version=${version}\narch=${arch}\ntarball=${tarball}`);
  process.exit(0);
}

const exec = promisify(execFile);
await mkdir(dir, { recursive: true });
// As the Dockerfiles' curl (#367): retry, and give up on an attempt that stalls below 1 kB/s for
// 30 s or takes over 3 minutes.
const download = async (name) => {
  if (existsSync(join(dir, name))) return console.log(`Using ${join(dir, name)}`);
  const url = `https://nodejs.org/dist/v${version}/${name}`;
  console.log(`Downloading ${url}`);
  await exec('curl', [
    '-fsSL',
    '--retry',
    '3',
    '--retry-all-errors',
    '--connect-timeout',
    '30',
    '--speed-limit',
    '1024',
    '--speed-time',
    '30',
    '--max-time',
    '180',
    '-o',
    join(dir, name),
    url,
  ]);
};
await download('SHASUMS256.txt');
await download(tarball);

// The tarball must be the one nodejs.org lists and the one the Dockerfiles pin.
const listed = (await readFile(join(dir, 'SHASUMS256.txt'), 'utf8'))
  .split('\n')
  .map((line) => line.trim().split(/\s+/))
  .find(([, name]) => name === tarball)?.[0];
if (listed !== sha256)
  throw new Error(`SHASUMS256.txt lists ${tarball} as ${listed}, not the pinned ${sha256}`);
const actual = createHash('sha256')
  .update(await readFile(join(dir, tarball)))
  .digest('hex');
if (actual !== sha256) throw new Error(`${tarball} has SHA-256 ${actual}, not ${sha256}`);
console.log(`${join(dir, tarball)}: OK (SHA-256 ${sha256})`);
