// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// npm's Arborist rewrites modern Yarn lockfiles as v1 even during npm ci.
// Hide that unrelated lockfile only during installation; keep npm's own locked install.
import { rename, readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
const backup = '.och-yarn-lock-' + process.pid;
let protectedYarn = false;
try {
  const yarn = await readFile('yarn.lock', 'utf8').catch((error) => {
    if (error.code !== 'ENOENT') throw error;
    return '';
  });
  if (yarn.includes('__metadata:')) {
    await rename('yarn.lock', backup);
    protectedYarn = true;
  }
  await new Promise((resolve, reject) => {
    const child = spawn('npm', ['ci'], { stdio: 'inherit', shell: process.platform === 'win32' });
    child.on('error', reject);
    child.on('exit', (code) =>
      code === 0 ? resolve() : reject(new Error('npm ci failed: ' + code)),
    );
  });
} finally {
  if (protectedYarn) await rename(backup, 'yarn.lock');
}
