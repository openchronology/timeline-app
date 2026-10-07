// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
import { build } from 'esbuild';
import { mkdir, writeFile } from 'node:fs/promises';
import { buildOffline } from './offline.mjs';
import { dependencyLicenses } from './licenses.mjs';
import { copyrightBanner } from './legal.mjs';
import { buildHtml } from './html.mjs';
await mkdir('dist', { recursive: true });
await Promise.all([
  build({
    entryPoints: ['src/app.ts'],
    outfile: 'dist/app.js',
    bundle: true,
    format: 'esm',
    target: 'es2022',
    sourcemap: true,
    define: { __OFFLINE_HTML__: 'false' },
    banner: { js: copyrightBanner },
  }),
  build({
    entryPoints: ['src/core.ts'],
    outfile: 'dist/core.mjs',
    bundle: true,
    format: 'esm',
    platform: 'node',
    target: 'es2022',
    sourcemap: true,
    banner: { js: copyrightBanner },
  }),
]);
await build({
  entryPoints: [
    'src/remote-cache.ts',
    'src/comparison.ts',
    'src/live-updates.ts',
    'src/browser-copy.ts',
    'src/summary-expansion.ts',
    'src/image-assets.ts',
    'src/dialogs.ts',
  ],
  outdir: 'dist',
  outExtension: { '.js': '.mjs' },
  plugins: [
    {
      name: 'shared-core',
      setup(b) {
        b.onResolve({ filter: /^\.\/core\.js$/ }, () => ({ path: './core.mjs', external: true }));
      },
    },
  ],
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'es2022',
  banner: { js: copyrightBanner },
});
await buildHtml();
const licenses = await dependencyLicenses();
await writeFile('dist/THIRD_PARTY.txt', licenses.join('\n\n'));
await buildOffline();
await import('./source.mjs');
