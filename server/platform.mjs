// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
import pg from 'pg';
import { resolve } from 'node:path';
import { readFile } from 'node:fs/promises';
import { BUILTIN_PLUGINS } from '../dist/core.mjs';
import { createRequestHandler } from './http.mjs';
import { Challenges } from './challenge.mjs';
import { Auth } from './auth.mjs';
import { PostgresStore } from './store.mjs';
import { providersFromEnv } from './oauth.mjs';
const key = Symbol.for('openchronology.platform.services');

export async function platformServices() {
  if (!globalThis[key])
    globalThis[key] = initialize().catch((error) => {
      delete globalThis[key];
      throw error;
    });
  return globalThis[key];
}
async function initialize() {
  const origin = process.env.APP_ORIGIN ?? `http://localhost:${process.env.PORT ?? 5173}`;
  const address = new URL(origin);
  if (address.origin !== origin || !['http:', 'https:'].includes(address.protocol))
    throw new Error('APP_ORIGIN must be an HTTP(S) origin without a path.');
  if (process.env.NODE_ENV === 'production' && !process.env.APP_ORIGIN)
    throw new Error('Set APP_ORIGIN in production.');
  if (
    process.env.NODE_ENV === 'production' &&
    address.protocol !== 'https:' &&
    !['localhost', '127.0.0.1', '[::1]'].includes(address.hostname)
  )
    throw new Error('Public production deployments require HTTPS.');
  const pool =
    process.env.DATABASE_URL || process.env.PGDATABASE
      ? new pg.Pool({
          connectionString: process.env.DATABASE_URL,
          max: 10,
          statement_timeout: 30000,
          connectionTimeoutMillis: 10000,
        })
      : null;
  const plugins = process.env.PLUGIN_LIBRARY
    ? [...BUILTIN_PLUGINS, ...JSON.parse(await readFile(process.env.PLUGIN_LIBRARY, 'utf8'))]
    : BUILTIN_PLUGINS;
  const providers = providersFromEnv();
  const featured = (process.env.FEATURED_TIMELINES ?? '')
    .split(',')
    .filter((id) => /^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(id));
  const options = {
    staticDir: resolve(process.env.OCH_APP_ROOT ?? process.cwd(), 'dist'),
    pool,
    origin,
    plugins,
    providers,
    featured,
    trustProxy: process.env.TRUST_PROXY === '1',
    challenges: Challenges.settings(process.env),
  };
  const store = pool ? new PostgresStore(pool) : null;
  // Catalogue text left stale by an interrupted refresh catches up in the background.
  store?.refreshStale().catch((error) => console.error('Catalogue text refresh failed:', error));
  return {
    ...options,
    auth: pool ? new Auth(pool, origin) : null,
    store,
    handler: createRequestHandler(options),
  };
}
