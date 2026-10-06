import { BUILTIN_PLUGINS, validatePluginManifest } from '../dist/core.mjs';
import { HttpError } from './store.mjs';
export function createPluginLibrary(definitions = BUILTIN_PLUGINS) {
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
  return {
    search(value = {}) {
      if (
        !value ||
        typeof value !== 'object' ||
        Array.isArray(value) ||
        Object.keys(value).some((key) => !['search', 'page', 'limit'].includes(key))
      )
        throw new HttpError(400, 'Invalid plugin search.');
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
}
