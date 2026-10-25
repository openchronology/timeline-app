// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// Copies the editor's built assets and notices from dist/ into platform/public/ for the
// Next.js platform, with the web app icons from platform/icons/ (scripts/icons.mjs), adding the
// Next.js, React and ldapts licenses to its THIRD_PARTY.txt.
import { cp, mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
const require = createRequire(import.meta.url);
/**
 * The installed folder of package `name`: the nearest folder above its entry point whose
 * package.json names it (ldapts exports no `package.json` subpath to resolve directly).
 */
async function packageRoot(name) {
  for (let dir = dirname(require.resolve(name)); dir !== dirname(dir); dir = dirname(dir)) {
    const manifest = await readFile(join(dir, 'package.json'), 'utf8').catch(() => null);
    if (manifest && JSON.parse(manifest).name === name) return dir;
  }
  throw new Error(`Cannot find the folder of ${name}.`);
}
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
  for (const file of await readdir('platform/icons'))
    if (file !== 'README.md') await cp('platform/icons/' + file, 'platform/public/' + file);
  const notices = [await readFile('dist/THIRD_PARTY.txt', 'utf8')];
  for (const [name, license] of [
    ['next', 'license.md'],
    ['react', 'LICENSE'],
    ['react-dom', 'LICENSE'],
    ['ldapts', 'LICENSE'],
  ]) {
    const root = await packageRoot(name);
    notices.push(name + '/' + license + '\n\n' + (await readFile(join(root, license), 'utf8')));
  }
  await writeFile('platform/public/THIRD_PARTY.txt', notices.join('\n\n'));
}
