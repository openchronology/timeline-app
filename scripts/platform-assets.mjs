// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
const require = createRequire(import.meta.url);
export async function syncPlatformAssets() {
  await mkdir('platform/public', { recursive: true });
  for (const file of [
    'app.js',
    'app.js.map',
    'app.css',
    'app.css.map',
    'LICENSE.txt',
    'NOTICE.txt',
    'THIRD_PARTY.txt',
    'openchronology-web-source.tar.gz',
  ])
    await cp('dist/' + file, 'platform/public/' + file);
  const notices = [await readFile('dist/THIRD_PARTY.txt', 'utf8')];
  for (const [name, license] of [
    ['next', 'license.md'],
    ['react', 'LICENSE'],
    ['react-dom', 'LICENSE'],
  ]) {
    const root = dirname(require.resolve(name + '/package.json'));
    notices.push(name + '/' + license + '\n\n' + (await readFile(join(root, license), 'utf8')));
  }
  await writeFile('platform/public/THIRD_PARTY.txt', notices.join('\n\n'));
}
