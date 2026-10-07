// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
import { BUILTIN_PLUGINS, validatePluginManifest } from '../dist/core.mjs';
import { HttpError } from './store.mjs';
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
  const latest = new Map();
  for (const p of manifests)
    if (!latest.has(p.id) || latest.get(p.id).version < p.version) latest.set(p.id, p);
  const listed = [...latest.values()].sort((a, b) =>
    a.name < b.name ? -1 : a.name > b.name ? 1 : a.id.localeCompare(b.id),
  );
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
      const needle = search.trim().toLowerCase();
      const matching = listed.filter((p) =>
        (p.name + ' ' + p.description + ' ' + p.id).toLowerCase().includes(needle),
      );
      return {
        plugins: matching.slice((page - 1) * limit, page * limit),
        page,
        limit,
        total: matching.length,
        pages: Math.ceil(matching.length / limit),
        apiVersion: 1,
      };
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
      const { rows } = await pool.query(
        `WITH versions AS (
        SELECT id,version,manifest,published_at FROM oc_plugins UNION ALL
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
    async get(id, version) {
      const { rows } = await pool.query(
        'SELECT manifest FROM oc_plugins WHERE id=$1 AND version=$2',
        [id, Number(version)],
      );
      return rows.length ? validatePluginManifest(rows[0].manifest) : local.get(id, version);
    },
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
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        // Serialize publications by this account to enforce the storage quota concurrently.
        await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [owner]);
        const { rows } = await client.query(
          'SELECT count(*) AS count FROM oc_plugins WHERE owner_id=$1',
          [owner],
        );
        if (Number(rows[0].count) >= 200)
          throw new HttpError(409, 'Account plugin publication limit reached (200 versions).');
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
