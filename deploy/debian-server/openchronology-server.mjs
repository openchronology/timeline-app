// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// Starts the platform from the installed package. systemd passes the configuration through
// EnvironmentFile; started any other way, it is read here (without overriding the environment).
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
try {
  process.loadEnvFile('/etc/openchronology/openchronology.env');
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}
const app = dirname(fileURLToPath(import.meta.url));
// The configuration names the listening address HOST; Next.js reads HOSTNAME, which shells
// also set to the machine's name.
process.env.HOSTNAME = process.env.HOST || '127.0.0.1';
process.env.PORT ||= '5173';
process.env.NODE_ENV = 'production';
process.env.NEXT_TELEMETRY_DISABLED = '1';
process.env.OCH_APP_ROOT = app;
process.env.OCH_CONVERTER ||= `${app}/bin/och-convert`;
await import(`${app}/platform/server.cjs`);
