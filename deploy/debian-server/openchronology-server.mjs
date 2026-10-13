// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// Starts the platform from the installed package. systemd passes the configuration through
// EnvironmentFile; started any other way, it is read here (without overriding the environment),
// as systemd reads it (#118). OCH_CONFIG names another file.
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadEnvFile } from './server/env-file.mjs';
const app = dirname(fileURLToPath(import.meta.url));
loadEnvFile(process.env.OCH_CONFIG || '/etc/openchronology/openchronology.env');
// The configuration names the listening address HOST; Next.js reads HOSTNAME, which shells
// also set to the machine's name.
process.env.HOSTNAME = process.env.HOST || '127.0.0.1';
process.env.PORT ||= '5173';
process.env.NODE_ENV = 'production';
process.env.NEXT_TELEMETRY_DISABLED = '1';
process.env.OCH_APP_ROOT = app;
process.env.OCH_CONVERTER ||= join(
  app,
  'bin',
  process.platform === 'win32' ? 'och-convert.exe' : 'och-convert',
);
// A file URL: on Windows (deploy/windows-server), an absolute path is not a module address.
await import(pathToFileURL(join(app, 'platform', 'server.cjs')).href);
