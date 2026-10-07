// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
import { context } from 'esbuild';
import { mkdir } from 'node:fs/promises';
import { watch } from 'node:fs';
import { copyrightBanner } from './legal.mjs';
import { buildHtml } from './html.mjs';
import { syncPlatformAssets } from './platform-assets.mjs';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
try {
  process.loadEnvFile?.('.env');
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}
await import('./build.mjs');
await syncPlatformAssets();
await mkdir('dist', { recursive: true });
await buildHtml();
let refreshTimer;
let refresh = Promise.resolve();
function refreshHtml() {
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(() => {
    refresh = refresh
      .then(buildHtml)
      .then(syncPlatformAssets)
      .catch((error) => console.error('HTML rebuild failed:', error));
  }, 50);
}
// esbuild watches imported JS/CSS, while these files form the independently copied template.
watch('src', (_event, filename) => {
  if (!filename || filename.toString() === 'index.html') refreshHtml();
});
watch('legal', refreshHtml);
watch('.', (_event, filename) => {
  if (!filename || ['LICENSE', 'NOTICE', 'THIRD_PARTY.md'].includes(filename.toString()))
    refreshHtml();
});
await import('./source.mjs');
for (const [entry, outfile, platform] of [
  ['src/app.ts', 'dist/app.js', 'browser'],
  ['src/core.ts', 'dist/core.mjs', 'node'],
]) {
  const ctx = await context({
    entryPoints: [entry],
    outfile,
    bundle: true,
    format: 'esm',
    target: 'es2022',
    platform,
    sourcemap: true,
    define: { __OFFLINE_HTML__: 'false' },
    banner: { js: copyrightBanner },
    plugins: [
      {
        name: 'sync-platform-assets',
        setup(builder) {
          builder.onEnd(async (result) => {
            if (!result.errors.length) await syncPlatformAssets();
          });
        },
      },
    ],
  });
  await ctx.watch();
  await ctx.rebuild();
}
const next = spawn(
  process.execPath,
  [
    resolve('node_modules/next/dist/bin/next'),
    'dev',
    'platform',
    '--webpack',
    '-p',
    process.env.PORT ?? '5173',
    '-H',
    process.env.HOST ?? '127.0.0.1',
  ],
  { stdio: 'inherit', env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' } },
);
next.on('error', (error) => {
  console.error(error);
  process.exit(1);
});
next.on('exit', (code) => process.exit(code ?? 1));
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => next.kill(signal));
