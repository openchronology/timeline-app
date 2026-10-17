// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
/**
 * The plugin library and plugin suites (/api/plugins and /api/plugins/suites): the official
 * plugins and suites bundled with the app, and on a server with PostgreSQL those accounts
 * publish (oc_plugins, oc_plugin_suites), versioned and namespaced `u-<account>-<slug>`.
 * Published versions are immutable: an update is a new version. Plugins and suites that
 * moderators restricted (#115) leave search and detail, and take no new versions.
 */
import {
  BUILTIN_PLUGINS,
  OFFICIAL_SUITES,
  validatePluginManifest,
  validatePluginSuite,
  searchPluginLibrary,
  searchSuiteLibrary,
} from '../dist/core.mjs';
import { HttpError } from './store.mjs';
import { pluginCompiler } from './plugin-sandbox.mjs';
/** The official plugins' scripts, trusted as shipped, so never compiled again. */
const BUILTIN_SCRIPTS = new Set(BUILTIN_PLUGINS.map((p) => p.source).filter(Boolean));
/**
 * Refuses (HTTP 400) a publication with a plugin whose script does not compile, compiled in
 * the sandbox (#157). The catalogue's plugins were compiled when published, and are not again.
 */
export async function checkPublished(manifests, compiler = pluginCompiler()) {
  for (const manifest of manifests)
    if (manifest.source !== undefined && !BUILTIN_SCRIPTS.has(manifest.source))
      try {
        await compiler.check(manifest.source);
      } catch (error) {
        throw new HttpError(
          400,
          `The plugin “${manifest.name}” does not compile: ${error.message}`,
        );
      }
}
/**
 * The plugin library: `search`, `get` and, with a `pool`, `publish`. Without a pool (the
 * apps, tests, a server without PostgreSQL) it serves only `definitions`, searched in memory
 * as the apps search their bundled plugins.
 * @param {object[]} definitions the official plugin manifests (validated; at most 10,000,
 *   each id and version once)
 * @param {import('pg').Pool|null} pool
 * @throws {Error} for an invalid or duplicated definition
 */
export function createPluginLibrary(definitions = BUILTIN_PLUGINS, pool = null) {
  if (!Array.isArray(definitions) || definitions.length > 10000)
    throw new Error('Invalid plugin library.');
  const manifests = definitions.map(validatePluginManifest);
  const identities = new Set();
  for (const p of manifests) {
    const key = p.id + '/' + p.version;
    if (identities.has(key)) throw new Error('Duplicate plugin library version.');
    identities.add(key);
  }
  // Search shows the newest published version; detail URLs retain pinned older versions.
  const local = {
    search(value = {}) {
      if (
        !value ||
        typeof value !== 'object' ||
        Array.isArray(value) ||
        Object.keys(value).some((key) => !['search', 'page', 'limit', 'sort'].includes(key))
      )
        throw new HttpError(400, 'Invalid plugin search.');
      const { search = '', page = 1, limit = 12, sort = 'popularity' } = value;
      if (
        typeof search !== 'string' ||
        search.length > 200 ||
        !Number.isSafeInteger(page) ||
        page < 1 ||
        page > 10000 ||
        !Number.isSafeInteger(limit) ||
        limit < 1 ||
        limit > 50 ||
        !['popularity', 'alphabetical', 'age'].includes(sort)
      )
        throw new HttpError(400, 'Invalid plugin search or pagination.');
      // The same search the apps run on their bundled official plugins. `sort` is checked
      // but not applied here: only the PostgreSQL search ranks by installs or age.
      return searchPluginLibrary(manifests, { search, page, limit });
    },
    get(id, version) {
      const plugin = manifests.find((p) => p.id === id && p.version === Number(version));
      if (!plugin) throw new HttpError(404, 'Plugin version not found.');
      return plugin;
    },
  };
  if (!pool) return local;
  return {
    async search(value = {}) {
      // Reuse the static library's strict validation before issuing SQL.
      local.search(value);
      const { search = '', page = 1, limit = 12, sort = 'popularity' } = value;
      // One query for a page and its total over published and official plugins:
      //   versions: every published version not restricted by moderators, and the official
      //     manifests passed as JSON ($1), dated at the epoch so they sort as oldest;
      //   ages: when each plugin was first published (the age sort);
      //   latest: each plugin's newest version (DISTINCT ON keeps the first row per id in
      //     the ORDER BY, the highest version);
      //   usage: installs, the number of public timelines with the plugin enabled, read from
      //     each timeline's plugins array (a full scan of public timelines; a non-array value
      //     counts as none);
      //   matching: the latest versions whose name, description or id contain the search
      //     (lower-cased plain text, strpos);
      //   page: ordered by installs (popularity) or first publication (age, newest first),
      //     then by name in byte order ("C" collation, so the order does not depend on the
      //     server's locale) and id.
      const { rows } = await pool.query(
        `WITH versions AS (
        SELECT id,version,manifest,published_at FROM oc_plugins WHERE NOT EXISTS(SELECT 1 FROM oc_moderation_cases mc WHERE mc.target_kind='plugin' AND mc.target_id=oc_plugins.id AND mc.status='restricted') UNION ALL
        SELECT m->>'id', (m->>'version')::bigint,m,'epoch'::timestamptz FROM jsonb_array_elements($1::jsonb) m
      ), ages AS (SELECT id,min(published_at) AS first_published FROM versions GROUP BY id),
      latest AS (SELECT DISTINCT ON(id) * FROM versions ORDER BY id,version DESC),
      usage AS (
        SELECT plugin->'manifest'->>'id' AS id,count(DISTINCT t.id) AS installs
        FROM oc_timelines t CROSS JOIN LATERAL jsonb_array_elements(
          CASE WHEN jsonb_typeof(t.plugins)='array' THEN t.plugins ELSE '[]'::jsonb END
        ) plugin WHERE t.visibility='public' AND plugin->'enabled' IS DISTINCT FROM 'false'::jsonb
        GROUP BY plugin->'manifest'->>'id'
      ),
      matching AS (SELECT l.*,a.first_published,coalesce(u.installs,0) AS installs FROM latest l
        JOIN ages a USING(id) LEFT JOIN usage u USING(id)
        WHERE strpos(lower((manifest->>'name') || ' ' || (manifest->>'description') || ' ' || l.id),$2)>0),
      page AS (SELECT manifest FROM matching ORDER BY
        CASE WHEN $5='popularity' THEN installs ELSE 0 END DESC,
        CASE WHEN $5='age' THEN first_published ELSE 'epoch'::timestamptz END DESC,
        manifest->>'name' COLLATE "C",id LIMIT $3 OFFSET $4)
      SELECT (SELECT count(*) FROM matching) AS total,coalesce((SELECT jsonb_agg(manifest) FROM page),'[]'::jsonb) AS plugins`,
        [JSON.stringify(manifests), search.trim().toLowerCase(), limit, (page - 1) * limit, sort],
      );
      const total = Number(rows[0].total);
      return {
        apiVersion: 1,
        plugins: rows[0].plugins.map(validatePluginManifest),
        total,
        page,
        limit,
        pages: Math.ceil(total / limit),
      };
    },
    /**
     * Plugin `id` at `version`: a published one unless moderators restricted it, else an
     * official one; 404 otherwise (local.get).
     */
    async get(id, version) {
      const { rows } = await pool.query(
        `SELECT manifest FROM oc_plugins WHERE id=$1 AND version=$2 AND NOT EXISTS(SELECT 1 FROM oc_moderation_cases mc WHERE mc.target_kind='plugin' AND mc.target_id=oc_plugins.id AND mc.status='restricted')`,
        [id, Number(version)],
      );
      return rows.length ? validatePluginManifest(rows[0].manifest) : local.get(id, version);
    },
    /**
     * Publishes a plugin version for account `owner`. The manifest must carry a restricted
     * render script that compiles in the sandbox, its id is namespaced to the account
     * (`u-<owner without dashes>-<slug>`; a slug sent with or without the prefix), and it is at
     * most 32 KiB. Refused (409) at 200 versions per account or when the version exists, (403)
     * when moderators restricted the plugin. Storage is charged to the account by the
     * oc_track_storage trigger on insert, which enforces the quota.
     * @returns {Promise<object>} the manifest as published
     */
    async publish(owner, value) {
      let manifest;
      try {
        manifest = validatePluginManifest(value);
      } catch (error) {
        throw new HttpError(400, error.message);
      }
      if (!manifest.source)
        throw new HttpError(400, 'Published plugins require a restricted render script.');
      const prefix = 'u-' + owner.replaceAll('-', '') + '-';
      const slug = manifest.id.startsWith(prefix) ? manifest.id.slice(prefix.length) : manifest.id;
      if (!/^[a-z][a-z0-9-]{0,28}$/.test(slug))
        throw new HttpError(400, 'Use a plugin slug of at most 29 characters.');
      manifest = validatePluginManifest({ ...manifest, id: prefix + slug });
      if (Buffer.byteLength(JSON.stringify(manifest, null, 2)) > 32768)
        throw new HttpError(400, 'Published plugin exceeds 32 KiB.');
      await checkPublished([manifest]);
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        // Serialize publications by this account (a transaction-scoped advisory lock on its
        // id), so concurrent ones cannot both pass the 200-version count below or race on the
        // storage quota the insert's trigger charges.
        await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [owner]);
        await refuseRestricted(client, 'plugin', manifest.id);
        const { rows } = await client.query(
          'SELECT count(*) AS count FROM oc_plugins WHERE owner_id=$1',
          [owner],
        );
        if (Number(rows[0].count) >= 200)
          throw new HttpError(409, 'Account plugin publication limit reached (200 versions).');
        // ON CONFLICT DO NOTHING with RETURNING: no row back means the version exists, which
        // is answered with a 409 rather than a unique-violation error.
        const result = await client.query(
          'INSERT INTO oc_plugins(id,version,owner_id,manifest) VALUES($1,$2,$3,$4) ON CONFLICT(id,version) DO NOTHING RETURNING id',
          [manifest.id, manifest.version, owner, manifest],
        );
        if (!result.rows.length)
          throw new HttpError(
            409,
            'This plugin version already exists. Increment the version to publish an update.',
          );
        await client.query('COMMIT');
        return manifest;
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    },
  };
}
/**
 * Refuses (403) a new version of a plugin or suite moderators restricted (#115): a restricted
 * case on its id, found through the partial unique index oc_moderation_cases_current.
 */
async function refuseRestricted(client, kind, id) {
  const { rows } = await client.query(
    "SELECT 1 FROM oc_moderation_cases WHERE target_kind=$1 AND target_id=$2 AND status='restricted'",
    [kind, id],
  );
  if (rows.length)
    throw new HttpError(
      403,
      `Moderators restricted this ${kind}, so it cannot be published. You can ask for a review in your account.`,
    );
}
/**
 * Plugin suites (#78): the official suites, and on a server with PostgreSQL the suites
 * accounts publish, versioned and namespaced like published plugins.
 */
export function createSuiteLibrary(definitions = OFFICIAL_SUITES, pool = null) {
  const suites = definitions.map(validatePluginSuite);
  /** A suite search, checked: `{search, page, limit}` (up to 50); 400 otherwise. */
  const check = (value = {}) => {
    if (
      !value ||
      typeof value !== 'object' ||
      Array.isArray(value) ||
      Object.keys(value).some((key) => !['search', 'page', 'limit'].includes(key))
    )
      throw new HttpError(400, 'Invalid suite search.');
    const { search = '', page = 1, limit = 12 } = value;
    if (
      typeof search !== 'string' ||
      search.length > 200 ||
      !Number.isSafeInteger(page) ||
      page < 1 ||
      page > 10000 ||
      !Number.isSafeInteger(limit) ||
      limit < 1 ||
      limit > 50
    )
      throw new HttpError(400, 'Invalid suite search or pagination.');
    return { search, page, limit };
  };
  const local = {
    search: (value) => searchSuiteLibrary(suites, check(value)),
    get(id, version) {
      const suite = suites.find((s) => s.id === id && s.version === Number(version));
      if (!suite) throw new HttpError(404, 'Suite version not found.');
      return suite;
    },
  };
  if (!pool) return local;
  return {
    async search(value = {}) {
      const { search, page, limit } = check(value);
      // As the plugin search: published versions not restricted, with the official suites
      // ($1), each suite's newest version, matched on its name, description, id and its
      // plugins' names, ordered by name ("C" collation) and id. Suites have no sort.
      const { rows } = await pool.query(
        `WITH versions AS (
          SELECT id,version,suite FROM oc_plugin_suites WHERE NOT EXISTS(SELECT 1 FROM oc_moderation_cases mc WHERE mc.target_kind='suite' AND mc.target_id=oc_plugin_suites.id AND mc.status='restricted') UNION ALL
          SELECT s->>'id',(s->>'version')::bigint,s FROM jsonb_array_elements($1::jsonb) s
        ), latest AS (SELECT DISTINCT ON(id) * FROM versions ORDER BY id,version DESC),
        matching AS (SELECT * FROM latest WHERE strpos(lower(concat_ws(' ',suite->>'name',
          suite->>'description',id,(SELECT string_agg(p->>'name',' ') FROM jsonb_array_elements(suite->'plugins') p))),$2)>0),
        page AS (SELECT suite FROM matching ORDER BY suite->>'name' COLLATE "C",id LIMIT $3 OFFSET $4)
        SELECT (SELECT count(*) FROM matching) AS total,coalesce((SELECT jsonb_agg(suite) FROM page),'[]'::jsonb) AS suites`,
        [JSON.stringify(suites), search.trim().toLowerCase(), limit, (page - 1) * limit],
      );
      const total = Number(rows[0].total);
      return {
        apiVersion: 1,
        suites: rows[0].suites.map(validatePluginSuite),
        total,
        page,
        limit,
        pages: Math.ceil(total / limit),
      };
    },
    /** Suite `id` at `version`: published and not restricted, else official; else 404. */
    async get(id, version) {
      const { rows } = await pool.query(
        `SELECT suite FROM oc_plugin_suites WHERE id=$1 AND version=$2 AND NOT EXISTS(SELECT 1 FROM oc_moderation_cases mc WHERE mc.target_kind='suite' AND mc.target_id=oc_plugin_suites.id AND mc.status='restricted')`,
        [id, Number(version)],
      );
      return rows.length ? validatePluginSuite(rows[0].suite) : local.get(id, version);
    },
    /**
     * Publishes a suite version for account `owner`, namespaced as plugins are; its plugins'
     * scripts must compile. Limits and refusals as for plugins (200 versions, existing
     * version, restricted suite).
     * @returns {Promise<object>} the suite as published
     */
    async publish(owner, value) {
      let suite;
      try {
        suite = validatePluginSuite(value);
      } catch (error) {
        throw new HttpError(400, error.message);
      }
      // Namespaced like published plugins: u-<account>-<slug>.
      const prefix = 'u-' + owner.replaceAll('-', '') + '-';
      const slug = suite.id.startsWith(prefix) ? suite.id.slice(prefix.length) : suite.id;
      if (!/^[a-z][a-z0-9-]{0,28}$/.test(slug))
        throw new HttpError(400, 'Use a suite slug of at most 29 characters.');
      suite = validatePluginSuite({ ...suite, id: prefix + slug });
      await checkPublished(suite.plugins);
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        // The account's suite lock: the same key as its plugin lock with seed 1, a separate
        // lock, so plugin and suite publications do not wait on each other.
        await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,1))', [owner]);
        await refuseRestricted(client, 'suite', suite.id);
        const { rows } = await client.query(
          'SELECT count(*) AS count FROM oc_plugin_suites WHERE owner_id=$1',
          [owner],
        );
        if (Number(rows[0].count) >= 200)
          throw new HttpError(409, 'Account suite publication limit reached (200 versions).');
        // No row back: the version exists (409).
        const result = await client.query(
          'INSERT INTO oc_plugin_suites(id,version,owner_id,suite) VALUES($1,$2,$3,$4) ON CONFLICT(id,version) DO NOTHING RETURNING id',
          [suite.id, suite.version, owner, suite],
        );
        if (!result.rows.length)
          throw new HttpError(
            409,
            'This suite version already exists. Increment the version to publish an update.',
          );
        await client.query('COMMIT');
        return suite;
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    },
  };
}
