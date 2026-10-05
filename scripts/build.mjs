import { build } from 'esbuild';
import { mkdir, copyFile, writeFile } from 'node:fs/promises';
import { buildOffline } from './offline.mjs';
import { dependencyLicenses } from './licenses.mjs';
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
  }),
  build({
    entryPoints: ['src/core.ts'],
    outfile: 'dist/core.mjs',
    bundle: true,
    format: 'esm',
    platform: 'node',
    target: 'es2022',
    sourcemap: true,
  }),
]);
await copyFile('src/index.html', 'dist/index.html');
const licenses = await dependencyLicenses();
await writeFile('dist/THIRD_PARTY.txt', licenses.join('\n\n'));
await buildOffline();
