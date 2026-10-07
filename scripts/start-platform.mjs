// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
try {
  process.loadEnvFile?.('.env');
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}
const child = spawn(process.execPath, [resolve('platform/.next/standalone/platform/server.cjs')], {
  stdio: 'inherit',
  env: {
    ...process.env,
    NODE_ENV: 'production',
    OCH_APP_ROOT: resolve('.'),
    HOSTNAME: process.env.HOST ?? '127.0.0.1',
    PORT: process.env.PORT ?? '5173',
    NEXT_TELEMETRY_DISABLED: '1',
  },
});
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
child.on('error', (error) => {
  console.error(error);
  process.exitCode = 1;
});
child.on('exit', (code) => {
  process.exitCode = code ?? 1;
});
