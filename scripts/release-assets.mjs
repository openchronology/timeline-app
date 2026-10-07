// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
import { mkdir, cp, readFile, writeFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { releaseVersion } from './build-info.mjs';
const tag = process.argv[2];
if (!tag || !releaseVersion.test(tag)) throw new Error('Supply the release version tag');
const info = JSON.parse(await readFile('dist/build-info.json', 'utf8'));
if (info.version !== tag || info.dirty || !info.commit)
  throw new Error('Release build identity must match the tag and commit');
for (const file of ['dist/index.html', 'dist/openchronology-offline.html'])
  if (!(await readFile(file, 'utf8')).includes('Build: ' + tag))
    throw new Error('Missing release identity in ' + file);
const bundles = (await readdir('src-tauri/target/release/bundle/deb')).filter((f) =>
  f.endsWith('.deb'),
);
if (bundles.length !== 1) throw new Error('Expected exactly one Linux desktop package');
await mkdir('release-assets', { recursive: true });
for (const [from, to] of [
  ['dist/openchronology-offline.html', 'openchronology-offline.html'],
  ['src-tauri/target/release/bundle/deb/' + bundles[0], 'openchronology-desktop-linux-amd64.deb'],
  ['dist/openchronology-web-source.tar.gz', 'openchronology-web-source.tar.gz'],
  ['dist/openchronology-desktop-source.tar.gz', 'openchronology-desktop-source.tar.gz'],
  ['dist/build-info.json', 'build-info.json'],
  ['LICENSE', 'LICENSE.txt'],
  ['NOTICE', 'NOTICE.txt'],
])
  await cp(from, 'release-assets/' + to);
const lines = [];
for (const name of (await readdir('release-assets')).sort())
  if (name !== 'SHA256SUMS.txt')
    lines.push(
      createHash('sha256')
        .update(await readFile('release-assets/' + name))
        .digest('hex') +
        '  ' +
        name,
    );
await writeFile('release-assets/SHA256SUMS.txt', lines.join('\n') + '\n');
