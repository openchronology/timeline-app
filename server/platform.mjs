// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
/**
 * The platform's services, made once per process from the environment: the PostgreSQL pool,
 * the store, authentication, the request handler (http.mjs) and its settings, and the
 * background work (retention, standing, catching up interrupted refreshes). The Next.js
 * routes (next-handler.mjs, platform/proxy.js) ask for them through platformServices.
 */
import pg from 'pg';
import { resolve } from 'node:path';
import { readFile } from 'node:fs/promises';
import { BUILTIN_PLUGINS } from '../dist/core.mjs';
import { createRequestHandler } from './http.mjs';
import { Challenges } from './challenge.mjs';
import { Auth } from './auth.mjs';
import { PostgresStore } from './store.mjs';
import { pluginCompiler } from './plugin-sandbox.mjs';
import { startRetention } from './retention.mjs';
import { startStanding } from './standing.mjs';
import { providersFromEnv } from './oauth.mjs';
import {
  compareLimits,
  defaultQuota,
  entryLimit,
  LimitError,
  timelineFileBytes,
} from './limits.mjs';
import { analyticsId, platformName, SiteError, supportUrl } from './site.mjs';
import { applyEnvironmentQuota } from './administration.mjs';
/**
 * Where the services are kept: a global symbol rather than a module variable, so every copy
 * of this module the framework loads (route bundles, hot reloads) shares one pool and one set
 * of timers.
 */
const key = Symbol.for('openchronology.platform.services');

/** A deployment setting the platform cannot start with; its message is safe to show users. */
export class ConfigurationError extends Error {}

/**
 * The services, initialized on first call; concurrent callers share the one initialization.
 * A failed initialization is forgotten, so the next request tries again (after the operator
 * fixes the configuration, say).
 * @returns {Promise<object>} the handler's options plus `auth`, `store` and `handler`; `pool`,
 *   `auth` and `store` are null without a database
 * @throws {ConfigurationError} for a setting the platform cannot start with
 */
export async function platformServices() {
  if (!globalThis[key])
    globalThis[key] = initialize().catch((error) => {
      delete globalThis[key];
      throw error;
    });
  return globalThis[key];
}
/**
 * The operator's extra plugins (PLUGIN_LIBRARY): a JSON array of manifests in a file, their
 * scripts compiled once in the sandbox. Validated later with the built-in ones
 * (createPluginLibrary in plugins.mjs).
 * @throws {ConfigurationError} when the file is unreadable, not an array, or a script does
 *   not compile
 */
async function pluginLibrary(path) {
  let plugins;
  try {
    plugins = JSON.parse(await readFile(path, 'utf8'));
  } catch (error) {
    throw new ConfigurationError('PLUGIN_LIBRARY must name a readable JSON file.', {
      cause: error,
    });
  }
  if (!Array.isArray(plugins))
    throw new ConfigurationError('PLUGIN_LIBRARY must contain a JSON array of plugins.');
  // Their scripts are compiled once, in the sandbox (#157), as published plugins' are.
  for (const plugin of plugins)
    if (typeof plugin?.source === 'string')
      await pluginCompiler()
        .check(plugin.source)
        .catch((error) => {
          throw new ConfigurationError(
            `PLUGIN_LIBRARY: the plugin ${plugin.id} does not compile: ${error.message}`,
          );
        });
  return plugins;
}
/**
 * Builds the services from the environment (APP_ORIGIN, DATABASE_URL or the PG variables,
 * limits, PLUGIN_LIBRARY, OAuth providers, FEATURED_TIMELINES, TRUST_PROXY, challenge
 * settings) and starts the background work. Without a database the platform serves the
 * static app and the plugin library only.
 */
async function initialize() {
  const origin = process.env.APP_ORIGIN ?? `http://localhost:${process.env.PORT ?? 5173}`;
  const address = new URL(origin);
  if (address.origin !== origin || !['http:', 'https:'].includes(address.protocol))
    throw new ConfigurationError('APP_ORIGIN must be an HTTP(S) origin without a path.');
  if (process.env.NODE_ENV === 'production' && !process.env.APP_ORIGIN)
    throw new ConfigurationError('Set APP_ORIGIN in production.');
  // ALLOW_INSECURE_ORIGIN=1 permits plain HTTP on a trusted private network.
  if (
    process.env.NODE_ENV === 'production' &&
    address.protocol !== 'https:' &&
    !['localhost', '127.0.0.1', '[::1]'].includes(address.hostname) &&
    process.env.ALLOW_INSECURE_ORIGIN !== '1'
  )
    throw new ConfigurationError(
      'Public production deployments require HTTPS: set APP_ORIGIN to an https:// origin, or ALLOW_INSECURE_ORIGIN=1 for a trusted private network.',
    );
  // At most ten connections per process; a statement running over 30 seconds is cancelled by
  // the server, and waiting over 10 seconds for a connection fails the request.
  const pool =
    process.env.DATABASE_URL || process.env.PGDATABASE
      ? new pg.Pool({
          connectionString: process.env.DATABASE_URL,
          max: 10,
          statement_timeout: 30000,
          connectionTimeoutMillis: 10000,
        })
      : null;
  // Limits from the environment file: refused at startup rather than misapplied.
  let limits, entries;
  try {
    limits = compareLimits();
    entries = entryLimit();
    timelineFileBytes();
    defaultQuota();
    platformName();
    supportUrl();
    analyticsId();
  } catch (error) {
    if (error instanceof LimitError || error instanceof SiteError)
      throw new ConfigurationError(error.message);
    throw error;
  }
  // DEFAULT_USER_STORAGE_BYTES, when set, is the default quota from every start.
  if (pool)
    await applyEnvironmentQuota(pool).catch((error) => {
      // Before the first migration there are no settings yet (42P01, undefined table); the
      // migration applies it.
      if (error.code !== '42P01') throw error;
    });
  const plugins = process.env.PLUGIN_LIBRARY
    ? [...BUILTIN_PLUGINS, ...(await pluginLibrary(process.env.PLUGIN_LIBRARY))]
    : BUILTIN_PLUGINS;
  const providers = providersFromEnv();
  // Timelines the operator features besides those flagged in /admin: comma-separated ids,
  // anything else ignored.
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
    compareLimits: limits,
    entryLimit: entries,
  };
  const store = pool ? new PostgresStore(pool, { compareLimits: limits }) : null;
  // Catalogue text left stale by an interrupted refresh catches up in the background.
  store?.refreshStale().catch((error) => console.error('Catalogue text refresh failed:', error));
  // Copies whose index was still being prepared when the server stopped.
  store?.prepareStale().catch((error) => console.error('Preparing copies failed:', error));
  // Timelines that keep only their last months or years expire older data on a schedule.
  if (store) startRetention(store);
  // Account standing and popularity follow accounts ageing, forks and trending (#103).
  if (pool) startStanding(pool);
  return {
    ...options,
    auth: pool ? new Auth(pool, origin) : null,
    store,
    handler: createRequestHandler(options),
  };
}
