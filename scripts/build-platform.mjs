// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// npm run build: builds the editor (scripts/build.mjs), then the Next.js platform as the
// standalone server that npm start and the Docker image run.
import { syncPlatformAssets } from './platform-assets.mjs';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { cp, readFile, rename, writeFile } from 'node:fs/promises';
await import('./build.mjs');
await syncPlatformAssets();
await new Promise((resolveBuild, reject) => {
  const child = spawn(
    process.execPath,
    [resolve('node_modules/next/dist/bin/next'), 'build', 'platform', '--webpack'],
    { stdio: 'inherit', env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' } },
  );
  child.on('error', reject);
  child.on('exit', (code) =>
    code === 0 ? resolveBuild() : reject(new Error('Next.js build failed: ' + code)),
  );
});

// Make the generated server usable by npm start as well as the Docker image.
await cp('platform/public', 'platform/.next/standalone/platform/public', { recursive: true });
await cp('platform/.next/static', 'platform/.next/standalone/platform/.next/static', {
  recursive: true,
});

// The application root is ESM; Next generates a CommonJS standalone launcher. It starts with
// server/peer-address.cjs, which tells route handlers each request's address.
const launcher = 'platform/.next/standalone/platform/server.cjs';
await rename('platform/.next/standalone/platform/server.js', launcher);
await writeFile(
  launcher,
  (await readFile('server/peer-address.cjs', 'utf8')) + '\n' + (await readFile(launcher, 'utf8')),
);
