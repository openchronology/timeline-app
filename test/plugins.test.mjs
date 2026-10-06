import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import {
  MOMENT_ICONS,
  MOMENT_STACKS,
  MOMENT_COLORS,
  COLOR_SWATCHES,
  colorValue,
  pluginColor,
  stackEntries,
  stackWindow,
  validatePluginManifest,
  validateInstalledPlugins,
  pluginFields,
  pluginMarker,
  pluginMetadata,
  imageURL,
  TimelineIndex,
  validateDocument,
  demo,
} from '../dist/core.mjs';
import { createPluginLibrary } from '../server/plugins.mjs';
import { createApplication } from '../server/http.mjs';
import { PostgresStore } from '../server/store.mjs';
const installed = (manifest) => ({ manifest, enabled: true });
test('color swatches and custom colors are bounded CSS values and combine with image markers', () => {
  const plugins = [installed(MOMENT_COLORS), installed(MOMENT_ICONS)];
  for (const swatch of COLOR_SWATCHES)
    assert.equal(pluginColor(plugins, { color: swatch.value }), swatch.value || null);
  assert.equal(colorValue('#Ab12Ef'), '#ab12ef');
  for (const bad of ['red', 'url(https://example.com)', '#fff', '#12345678', '#xyzxyz', null, {}])
    assert.equal(colorValue(bad), null);
  const metadata = { color: '#abcdef', iconUrl: 'https://images.example/a.png' };
  assert.equal(pluginColor(plugins, metadata), '#abcdef');
  assert.equal(pluginMarker(plugins, metadata), metadata.iconUrl);
  assert.equal(pluginColor([{ manifest: MOMENT_COLORS, enabled: false }], metadata), null);
  assert.deepEqual(pluginMetadata(plugins, metadata), metadata);
});
test('stacks persist metadata and order without adding timeline points or storing child time', () => {
  const doc = validateDocument({
    ...demo(),
    plugins: [installed(MOMENT_STACKS), installed(MOMENT_ICONS)],
  });
  doc.events[0].metadata.stack = [
    {
      id: 'a',
      metadata: {
        title: 'First',
        description: 'Notes',
        iconUrl: 'https://images.example/a.png',
        custom: { flag: true },
      },
    },
    { id: 'b', metadata: { title: 'Second' } },
  ];
  const index = new TimelineIndex(validateDocument(doc));
  assert.equal(index.byId.size, doc.events.length);
  assert.deepEqual(validateDocument(JSON.parse(JSON.stringify(index.document()))), doc);
  assert.deepEqual(
    stackEntries(doc.events[0].metadata.stack).map((e) => e.id),
    ['a', 'b'],
  );
  for (const bad of [
    [{ id: 'a', time: '1/2', metadata: {} }],
    [{ id: 'a', metadata: { stack: [] } }],
    [
      { id: 'a', metadata: {} },
      { id: 'a', metadata: {} },
    ],
    [{ id: 'a', metadata: { title: 42 } }],
    [{ id: 'a', metadata: [] }],
  ])
    assert.throws(() => stackEntries(bad));
  assert.equal(
    stackEntries(Array.from({ length: 1001 }, (_, i) => ({ id: String(i), metadata: {} }))).length,
    1001,
  );
  assert.throws(() => stackEntries([{ id: 'a', metadata: { children: [] } }], ['children']));
  doc.events[0].metadata.stack[0].metadata.stack = [];
  assert.throws(() => validateDocument(doc), /cannot contain another stack/);
});
test('stack branches virtualize arbitrary depth in either direction independently of time', () => {
  for (const direction of [-1, 1]) {
    const start = stackWindow(direction < 0 ? 128 : 234, direction, 0, 365, 1000000);
    assert(start.last - start.first < 10);
    const depth = 500000;
    const offset = 192 - (start.start + start.step * depth);
    const deep = stackWindow(direction < 0 ? 128 : 234, direction, offset, 365, 1000000);
    assert(deep.first <= depth && deep.last >= depth);
    assert(deep.last - deep.first < 10);
  }
  const entry = { id: 'child', metadata: { title: 'Child' } };
  assert.deepEqual(
    pluginMetadata([installed(MOMENT_STACKS)], { stack: [entry], secret: 'unused' }),
    { stack: [entry] },
  );
  assert.deepEqual(
    pluginMetadata([{ manifest: MOMENT_STACKS, enabled: false }], { stack: [entry] }),
    {},
  );
});
const later = validatePluginManifest({
  ...MOMENT_ICONS,
  id: 'other-icons',
  name: 'Other icons',
  fields: [{ kind: 'text', metadataKey: 'iconUrl', label: 'Other field' }],
  marker: { kind: 'image', metadataKey: 'otherIcon' },
});
test('plugin snapshots preserve order, enabled state and metadata through JSON and the rational map', () => {
  const document = validateDocument({
    ...demo(),
    plugins: [installed(MOMENT_ICONS), { ...installed(later), enabled: false }],
  });
  document.events[0].metadata.iconUrl = 'https://images.example/icon.png';
  const index = new TimelineIndex(document);
  assert.deepEqual(index.document(), document);
  assert.deepEqual(validateDocument(JSON.parse(JSON.stringify(index.document()))), document);
  index.plugins = undefined;
  assert.equal(index.document().events[0].metadata.iconUrl, 'https://images.example/icon.png');
  assert(!Object.hasOwn(validateDocument(demo()), 'plugins'));
});
test('ordered hooks override matching fields and valid marker sources; inactive plugins retain data', () => {
  const plugins = [installed(MOMENT_ICONS), installed(later)];
  const metadata = {
    iconUrl: 'https://images.example/a.png',
    otherIcon: 'https://images.example/b.png',
    privateNote: 'not needed',
  };
  assert.equal(pluginFields(plugins)[0].label, 'Other field');
  assert.equal(pluginMarker(plugins, metadata), metadata.otherIcon);
  assert.equal(pluginMarker(plugins.toReversed(), metadata), metadata.iconUrl);
  assert.equal(
    pluginMarker([plugins[0], { ...plugins[1], enabled: false }], metadata),
    metadata.iconUrl,
  );
  assert.equal(
    pluginMarker(plugins, { ...metadata, otherIcon: 'javascript:alert(1)' }),
    metadata.iconUrl,
  );
  assert.deepEqual(pluginMetadata(plugins, metadata), {
    iconUrl: metadata.iconUrl,
    otherIcon: metadata.otherIcon,
  });
  assert.deepEqual(pluginMetadata([], metadata), {});
});
test('plugin manifests cannot request script, HTML, CSS, reserved keys or unsupported capabilities', () => {
  for (const value of [
    { ...MOMENT_ICONS, script: 'fetch(1)' },
    { ...MOMENT_ICONS, apiVersion: 2 },
    { ...MOMENT_ICONS, version: 0 },
    { ...MOMENT_ICONS, marker: { kind: 'html', metadataKey: 'iconUrl' } },
    { ...MOMENT_ICONS, fields: [{ kind: 'image-url', metadataKey: '__proto__', label: 'x' }] },
    { ...MOMENT_ICONS, fields: [{ kind: 'text', metadataKey: 'title', label: 'x' }] },
    { ...MOMENT_ICONS, fields: Array(9).fill(MOMENT_ICONS.fields[0]) },
  ])
    assert.throws(() => validatePluginManifest(value));
  assert.throws(() => validateInstalledPlugins([installed(MOMENT_ICONS), installed(MOMENT_ICONS)]));
  assert.throws(() => validateInstalledPlugins(Array(33).fill(installed(MOMENT_ICONS))));
  assert.throws(() => validateInstalledPlugins([{ manifest: MOMENT_ICONS, enabled: 'yes' }]));
  for (const url of [
    'javascript:alert(1)',
    'file:///a',
    'data:image/svg+xml,a',
    '//example.com/a',
    'http://example.com/a',
    'https://user:pass@example.com/a',
    'https://example.com/' + 'x'.repeat(4096),
    'https://example.com/' + 'é'.repeat(1000),
    17,
  ])
    assert.equal(imageURL(url), null);
  assert.equal(imageURL('https://images.example/a.png'), 'https://images.example/a.png');
});
test('plugin library search paginates latest versions while keeping pinned versions available', () => {
  const manifests = Array.from({ length: 27 }, (_, i) => ({
    ...MOMENT_ICONS,
    id: `sample-${i}`,
    name: `Sample ${String(i).padStart(2, '0')}`,
  }));
  const library = createPluginLibrary([...manifests, { ...manifests[0], version: 2 }]);
  const first = library.search({ search: 'sample', page: 1, limit: 12 });
  assert.equal(first.total, 27);
  assert.equal(first.pages, 3);
  assert.equal(first.plugins.length, 12);
  assert.equal(first.plugins[0].version, 2);
  assert.equal(library.search({ page: 3, limit: 12 }).plugins.length, 3);
  assert.equal(library.search({ search: 'does-not-exist' }).total, 0);
  assert.equal(library.get('sample-0', 1).version, 1);
  for (const value of [
    null,
    [],
    { page: 0 },
    { limit: 51 },
    { search: 17 },
    { search: 'x'.repeat(201) },
    { unknown: true },
  ])
    assert.throws(
      () => library.search(value),
      (error) => error.status === 400,
    );
  assert.throws(() => createPluginLibrary([MOMENT_ICONS, MOMENT_ICONS]));
});
async function request(app, path, method = 'GET', body, headers = {}) {
  const req = Readable.from(body === undefined ? [] : [Buffer.from(JSON.stringify(body))]);
  Object.assign(req, {
    url: path,
    method,
    headers: { 'content-type': 'application/json', ...headers },
    socket: { remoteAddress: '127.0.0.1' },
  });
  return new Promise((resolve, reject) => {
    const res = {
      headers: {},
      setHeader(k, v) {
        this.headers[k] = v;
      },
      writeHead(status, h) {
        this.status = status;
        Object.assign(this.headers, h);
      },
      end(bytes) {
        resolve({ status: this.status, headers: this.headers, body: JSON.parse(bytes) });
      },
    };
    app.listeners('request')[0](req, res).catch(reject);
  });
}
test('public plugin API works without accounts or PostgreSQL and validates its input', async () => {
  const app = createApplication();
  assert.deepEqual(
    (await request(app, '/api/plugins')).body.plugins.map((p) => p.id),
    ['moment-colors', 'moment-icons', 'moment-stacks'],
  );
  assert.equal((await request(app, '/api/plugins?search=absent&page=1&limit=1')).body.total, 0);
  const response = await request(app, '/api/plugins/search', 'POST', {
    search: 'icons',
    page: 1,
    limit: 12,
  });
  assert.equal(response.status, 200);
  assert.equal(response.body.plugins[0].id, 'moment-icons');
  assert.equal((await request(app, '/api/plugins/moment-icons/1')).status, 200);
  assert.equal((await request(app, '/api/plugins/moment-icons/9')).status, 404);
  assert.equal((await request(app, '/api/plugins/search', 'POST', null)).status, 400);
  assert.equal(
    (await request(app, '/api/plugins/search', 'POST', { search: 'x'.repeat(5000) })).status,
    413,
  );
  assert.equal(
    (await request(app, '/api/plugins/search', 'POST', {}, { origin: 'https://attacker.example' }))
      .status,
    403,
  );
});
test('Postgres persists plugin settings and projects metadata in overview queries without per-event requests', async () => {
  const queries = [];
  const plugins = [installed(MOMENT_ICONS), installed(MOMENT_STACKS), installed(MOMENT_COLORS)];
  const stack = [
    { id: 'child', metadata: { title: 'Child', iconUrl: 'https://images.example/child.png' } },
  ];
  const client = {
    async query(sql, values) {
      queries.push({ sql, values });
      return {
        rows: sql.includes('oc_overview_v2')
          ? [
              {
                first_time: '1/1',
                last_time: '1/1',
                event_count: '1',
                distinct_count: 1,
                event_id: 'event',
                title: 'Moment',
                metadata: {
                  iconUrl: 'https://images.example/icon.png',
                  color: '#123abc',
                  stack,
                  secret: 'not sent',
                },
                visited_nodes: 3,
              },
            ]
          : [],
      };
    },
    release() {},
  };
  const store = new PostgresStore({ connect: async () => client });
  await store.replace(client, 'id', { ...demo(), plugins });
  assert.deepEqual(
    JSON.parse(queries.find((q) => q.sql.startsWith('UPDATE oc_timelines SET')).values[6]),
    plugins,
  );
  store.access = async () => ({ title: 'Timeline', description: '', plugins, revision: '1' });
  assert.deepEqual((await store.snapshot('id', 'user')).document.plugins, plugins);
  queries.length = 0;
  const frame = await store.query('id', null, {
    kind: 'overview',
    lower: '0',
    upper: '2',
    threshold: '0',
  });
  assert.deepEqual(frame.groups[0].metadata, {
    iconUrl: 'https://images.example/icon.png',
    color: '#123abc',
    stack,
  });
  assert.equal(queries.filter((q) => q.sql.includes('oc_overview_v2')).length, 1);
  assert.equal(queries.length, 4); // BEGIN, repeatable-read, overview, COMMIT
});
