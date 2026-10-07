// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { releaseVersion } from './build-info.mjs';
import { targets } from './desktop/packages.mjs';
const tag = process.argv[2];
if (!tag || !releaseVersion.test(tag)) throw new Error('Supply the release version tag');
const dir = process.argv[3] || 'release-assets';
const info = JSON.parse(await readFile(`${dir}/build-info.json`, 'utf8'));
if (info.version !== tag || info.dirty || !info.commit)
  throw new Error('Release build identity must match the tag and commit');
const required = [
  'openchronology-web-source.tar.gz',
  'openchronology-desktop-source.tar.gz',
  'LICENSE.txt',
  'NOTICE.txt',
];
const html = await readFile(`${dir}/openchronology-offline.html`, 'utf8');
if (!html.includes('Build: ' + tag)) throw new Error('Missing offline release identity');
for (const [target, spec] of Object.entries(targets)) {
  required.push(spec.asset);
  const desktop = JSON.parse(await readFile(`${dir}/${target}-build-info.json`, 'utf8'));
  if (desktop.commit !== info.commit || desktop.version !== tag || desktop.dirty)
    throw new Error('Mismatched desktop identity: ' + target);
  if (target.startsWith('macos') || target.startsWith('windows'))
    required.push('openchronology-native-source-' + target + '.tar.gz');
}
for (const name of required)
  if (!(await readFile(`${dir}/${name}`)).length) throw new Error('Empty release asset: ' + name);
const lines = [];
for (const name of (await readdir(dir)).sort())
  if (name !== 'SHA256SUMS.txt')
    lines.push(
      createHash('sha256')
        .update(await readFile(`${dir}/${name}`))
        .digest('hex') +
        '  ' +
        name,
    );
await writeFile(`${dir}/SHA256SUMS.txt`, lines.join('\n') + '\n');
