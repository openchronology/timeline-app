// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// Builds the @openchronology/timeline package (packages/timeline): its element script with the
// offline editor inside, dist/openchronology-offline.html (scripts/offline.mjs, built first), and
// its license and notices. `--version <v>` sets the package's version, as the release does.
import { build } from 'esbuild';
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { copyrightBanner } from './legal.mjs';

const { values } = parseArgs({ options: { version: { type: 'string' } } });
const root = 'packages/timeline';
const html = await readFile('dist/openchronology-offline.html', 'utf8');
const element = await readFile(`${root}/src/element.js`, 'utf8');
if (!element.includes("'__OFFLINE_HTML__'")) throw new Error('element.js lost its placeholder.');
const result = await build({
  stdin: {
    contents: element.replace("'__OFFLINE_HTML__'", () => JSON.stringify(html)),
    loader: 'js',
    sourcefile: 'element.js',
  },
  format: 'iife',
  target: 'es2022',
  minify: true,
  write: false,
  banner: { js: copyrightBanner },
});
await mkdir(`${root}/dist`, { recursive: true });
await writeFile(`${root}/dist/timeline.js`, result.outputFiles[0].text);
for (const file of ['LICENSE', 'NOTICE']) await copyFile(file, `${root}/${file}`);
await copyFile('dist/THIRD_PARTY.txt', `${root}/THIRD_PARTY.txt`).catch(() => {});
if (values.version) {
  const manifest = JSON.parse(await readFile(`${root}/package.json`, 'utf8'));
  manifest.version = values.version.replace(/^v/, '');
  await writeFile(`${root}/package.json`, JSON.stringify(manifest, null, 2) + '\n');
}
console.log(`${root}/dist/timeline.js: ${result.outputFiles[0].contents.length} bytes`);
