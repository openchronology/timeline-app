// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// Plugins: the built-ins, field kinds, hover cards, colors, stacks, snapshots and hooks,
// what manifests may not ask for, and the plugin library and its API.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import {
  MOMENT_SOURCES,
  RICH_TEXT_NOTES,
  pluginRichText,
  sourceLinks,
  MOMENT_SHAPES,
  MOMENT_SHAPE_NAMES,
  shapeNames,
  pluginShape,
  pluginSize,
  PLUGIN_EXAMPLE,
  MOMENT_ICONS,
  DURATION_BACKGROUNDS,
  TIMELINE_BACKGROUND,
  pluginBackdrop,
  TIMELINE_THEME,
  pluginTheme,
  settingValue,
  textSizeValue,
  MOMENT_HEADINGS,
  pluginHeading,
  fontValue,
  DEFAULT_HEADING_FONT,
  pluginBackground,
  pluginTargets,
  durationPlugins,
  momentPlugins,
  MOMENT_STACKS,
  MOMENT_COLORS,
  COLOR_SWATCHES,
  colorValue,
  pluginColor,
  FOCUS_ON_HOVER,
  pluginFocus,
  scaleTimeline,
  stackEntries,
  readStack,
  stackEntry,
  checkPluginScript,
  OFFICIAL_SUITES,
  pluginExpand,
  searchText,
  searchRows,
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
  searchPluginLibrary,
  isOfficialPlugin,
  BUILTIN_PLUGINS,
  LOG_SEVERITY_COLORS,
  derivedMetadata,
  derivationKeys,
  durationOverview,
  RELATIONSHIP_ARROWS,
  readRelationshipArrows,
  arcArrowheads,
  arrowsToward,
  pluginDrawsArrows,
} from '../dist/core.mjs';
import { themeProperties, themeScales, textOn } from '../dist/timeline-theme.mjs';
import { createPluginLibrary } from '../server/plugins.mjs';
import { createApplication } from '../server/http.mjs';
import { PostgresStore } from '../server/store.mjs';
const installed = (manifest) => ({ manifest, enabled: true });
test('the built-in plugins compile, as nothing compiles them when they load (#157)', () => {
  for (const manifest of [...BUILTIN_PLUGINS, ...OFFICIAL_SUITES.flatMap((s) => s.plugins)])
    checkPluginScript(manifest);
});
test('every field kind reads wrong-shaped metadata without throwing (#157)', () => {
  // The newest version of each built-in plugin: every field kind, marker and effect.
  const plugins = searchPluginLibrary(BUILTIN_PLUGINS, { limit: 50 }).plugins.map(installed);
  const kinds = new Set(pluginFields(plugins).map((f) => f.kind));
  for (const kind of [
    'text',
    'multiline',
    'image-url',
    'stack',
    'color',
    'shape',
    'size',
    'links',
    'heading',
    'font',
    'relationship-arrows',
  ])
    assert(kinds.has(kind), kind);
  const keys = new Set([
    'title',
    'description',
    'tags',
    'sources',
    ...plugins.flatMap(({ manifest }) => [
      ...manifest.fields.map((f) => f.metadataKey),
      ...(manifest.marker ? [manifest.marker.metadataKey] : []),
      ...(manifest.background ? [manifest.background.metadataKey] : []),
    ]),
  ]);
  const values = [
    null,
    0,
    -1,
    1e308,
    true,
    '',
    'x'.repeat(20000),
    [],
    [null, 7, 'x'],
    {},
    { id: 1 },
    [{ id: 'a', metadata: 'text' }],
    [{ id: 'a', metadata: { stack: [{}] } }],
    [[[]]],
  ];
  for (const value of values)
    for (const key of keys) {
      const metadata = { [key]: value };
      const color = pluginColor(plugins, metadata);
      assert(color === null || typeof color === 'string');
      assert.equal(typeof pluginShape(plugins, metadata), 'string');
      assert.equal(typeof pluginSize(plugins, metadata), 'string');
      pluginHeading(plugins, metadata);
      pluginMarker(plugins, metadata);
      pluginBackground(plugins, metadata);
      arrowsToward(plugins, metadata, 'm:a');
      pluginFocus(plugins);
      pluginExpand(plugins);
      pluginMetadata(plugins, metadata);
      for (const field of pluginFields(plugins).filter((f) => f.kind === 'stack'))
        stackEntries(metadata[field.metadataKey]);
      assert.equal(typeof searchText(metadata).body, 'string');
      searchRows([{ id: 'm', time: '0/1', metadata }], []);
    }
});
test('hover cards are declarative, opt-in and project bounded notes without code', () => {
  assert(pluginFocus([installed(FOCUS_ON_HOVER)]));
  assert(!pluginFocus([{ manifest: FOCUS_ON_HOVER, enabled: false }]));
  const result = pluginMetadata([installed(FOCUS_ON_HOVER)], {
    title: 'Title',
    description: 'x'.repeat(3000),
    secret: 'hidden',
  });
  assert.equal(result.description.length, 2000);
  assert.equal(result.title, 'Title');
  assert(!Object.hasOwn(result, 'secret'));
  assert.throws(() =>
    validatePluginManifest({ ...FOCUS_ON_HOVER, hover: { kind: 'card', script: 'fetch(1)' } }),
  );
  assert.throws(() => validatePluginManifest({ ...FOCUS_ON_HOVER, hover: { kind: 'html' } }));
});
test('UI scaling preserves its anchor, clamps size and virtualizes scaled rows', () => {
  const next = scaleTimeline(1, 0, 0.5, 192);
  assert.equal(next.scale, 0.5);
  assert.equal(next.offset, 96);
  assert.equal(192 * next.scale + next.offset, 192);
  assert.equal(scaleTimeline(1, 0, 0.001, 100).scale, 0.2);
  assert.equal(scaleTimeline(1, 0, 100, 100).scale, 3);
  assert.throws(() => scaleTimeline(0, 0, 1, 0));
  assert.throws(() => scaleTimeline(1, 0, NaN, 0));
  const normal = stackWindow(234, 1, 0, 365, 10000);
  const compact = stackWindow(234, 1, next.offset / next.scale, 365 / next.scale, 10000);
  assert(compact.last > normal.last);
});
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
  // The stack reads what it can of any value and never throws (#157); its editor refuses
  // what it cannot read.
  for (const [bad, readable] of [
    [[{ id: 'a', time: '1/2', metadata: {} }], 0],
    [[{ id: 'a', metadata: { stack: [] } }], 0],
    [
      [
        { id: 'a', metadata: {} },
        { id: 'a', metadata: {} },
      ],
      1,
    ],
    [
      [
        { id: 'a', metadata: { title: 42 } },
        { id: 'b', metadata: {} },
      ],
      1,
    ],
    [[{ id: 'a', metadata: [] }], 0],
    [[null, 7, 'x', [], { id: 'é', metadata: {} }], 0],
  ]) {
    assert.equal(stackEntries(bad).length, readable);
    assert.equal(readStack(bad).unreadable, bad.length - readable);
  }
  for (const value of [42, 'stack', { id: 'a' }, null, true])
    assert.deepEqual(readStack(value), { entries: [], unreadable: 1 });
  assert.deepEqual(readStack(undefined), { entries: [], unreadable: 0 });
  for (const bad of [
    { id: 'a', metadata: { stack: [] } },
    { id: 'a', metadata: { title: 42 } },
  ])
    assert.throws(() => stackEntry(bad));
  assert.equal(
    stackEntries(Array.from({ length: 1001 }, (_, i) => ({ id: String(i), metadata: {} }))).length,
    1001,
  );
  assert.equal(stackEntries([{ id: 'a', metadata: { children: [] } }], ['children']).length, 0);
  // A nested stack is stored as given; the stack field reads that entry as unreadable.
  doc.events[0].metadata.stack[0].metadata.stack = [];
  const stored = validateDocument(doc);
  assert.deepEqual(stored.events[0].metadata.stack[0].metadata.stack, []);
  assert.deepEqual(
    stackEntries(stored.events[0].metadata.stack).map((e) => e.id),
    ['b'],
  );
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
    version: 1,
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
    { sort: 'random' },
    { sort: {} },
  ])
    assert.throws(
      () => library.search(value),
      (error) => error.status === 400,
    );
  for (const sort of ['popularity', 'alphabetical', 'age'])
    assert.equal(library.search({ sort, limit: 1 }).plugins[0].id, 'sample-0');
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
    [
      'dating-context',
      'duration-backgrounds',
      'expand-on-hover',
      'focus-on-hover',
      'geological-ages',
      'moment-headings',
      'historical-dates',
      'log-severity-colors',
      'moment-colors',
      'moment-icons',
      'moment-shapes',
      'moment-stacks',
    ],
  );
  // Twelve to a page: the thirteenth and on are on the next.
  assert.deepEqual(
    (await request(app, '/api/plugins?page=2')).body.plugins.map((p) => p.id),
    [
      'relationship-arrows',
      'rich-text-notes',
      'moment-sources',
      'timeline-background',
      'timeline-theme',
    ],
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
          : sql.includes('AS added')
            ? [{ added: true }]
            : sql.includes('index_clock')
              ? [{ clock: '1', pinned: '' }]
              : [],
      };
    },
    release() {},
  };
  const store = new PostgresStore({ connect: async () => client });
  await store.replace(client, 'id', { ...demo(), plugins });
  assert.deepEqual(
    JSON.parse(queries.find((q) => q.sql.startsWith('UPDATE oc_timelines SET title=')).values[6]),
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
  // BEGIN, repeatable-read, overview, duration bands, relationship arcs,
  // collapsed-duration summary, COMMIT
  assert.equal(queries.length, 7);
});

test('scripted plugins choose safe effects, compose in sequence and preserve exact times', () => {
  const scripted = validatePluginManifest(PLUGIN_EXAMPLE);
  const plugins = [installed(scripted)];
  const metadata = { status: 'BLOCKED' };
  assert.equal(pluginShape(plugins, metadata), 'diamond');
  assert.equal(pluginColor(plugins, metadata), '#bc6663');
  metadata.status = 'ready'; // Editors may mutate their working metadata; no stale effect cache.
  assert.equal(pluginShape(plugins, metadata), 'circle');
  for (const shape of MOMENT_SHAPE_NAMES)
    assert.equal(pluginShape([installed(MOMENT_SHAPES)], { shape }), shape);
  assert.equal(pluginShape([installed(MOMENT_SHAPES)], { shape: 'url(javascript:x)' }), 'circle');
  assert.equal(
    pluginShape([...plugins, installed(MOMENT_SHAPES)], { status: 'blocked', shape: 'hexagon' }),
    'hexagon',
  );
  const doc = validateDocument({ ...demo(), plugins });
  assert.deepEqual(validateDocument(JSON.parse(JSON.stringify(doc))), doc);
  assert.equal(doc.plugins[0].manifest.source, scripted.source);
});
test('plugin interpreter rejects ambient authority and bounds work; image effects cannot encode metadata into URLs', () => {
  for (const source of [
    'function render(m,api) { return fetch("https://evil.example"); }',
    'function render(m,api) { return api.constructor("return window")(); }',
    'function render(m,api) { while(true) {} return api.none(); }',
    'function render(m,api) { return m.__proto__; }',
    'function render(m,api) { return api.timestamp(api.rational("0")); }',
    'function render(m,api) { return api.shape("circle"); }'.repeat(400),
  ])
    assert.throws(() => checkPluginScript(validatePluginManifest({ ...PLUGIN_EXAMPLE, source })));
  const run = (source) => [installed(validatePluginManifest({ ...PLUGIN_EXAMPLE, source }))];
  assert.equal(
    pluginShape(
      run(
        `function render(m,api) { return ${JSON.stringify(JSON.stringify({ shape: 'diamond', html: 'x' }))}; }`,
      ),
      {},
    ),
    'circle',
  );
  assert.equal(
    pluginShape(run('function render(m,api) { return api.shape(api.get("undeclared")); }'), {
      undeclared: 'diamond',
    }),
    'circle',
  );
  const leaking = validatePluginManifest({
    ...PLUGIN_EXAMPLE,
    fields: [{ kind: 'image-url', metadataKey: 'iconUrl', label: 'Icon' }],
    source: `function render(m,api) { return ${JSON.stringify(JSON.stringify({ icon: 'https://evil.example/leak' }))}; }`,
  });
  assert.equal(pluginMarker([installed(leaking)], { description: 'private' }), null);
  const icon = validatePluginManifest({
    ...leaking,
    source: 'function render(m,api) { return api.icon("iconUrl"); }',
  });
  assert.equal(
    pluginMarker([installed(icon)], { iconUrl: 'https://images.example/safe.png' }),
    'https://images.example/safe.png',
  );
  assert.equal(pluginFocus(run('function render(m,api) { return api.card(); }')), true);
});
test('plugin publication requires an authenticated session and rejects foreign origin', async () => {
  const pool = { query: async () => ({ rows: [] }) };
  const app = createApplication({ pool });
  assert.equal((await request(app, '/api/plugins/publish', 'POST', PLUGIN_EXAMPLE)).status, 401);
  assert.equal(
    (
      await request(app, '/api/plugins/publish', 'POST', PLUGIN_EXAMPLE, {
        origin: 'https://evil.example',
      })
    ).status,
    403,
  );
});

test('community publication namespaces immutable versions and rolls back quota/conflict failures', async () => {
  const records = [],
    commands = [];
  let releases = 0,
    quota = 0;
  const client = {
    async query(sql, args = []) {
      commands.push(sql);
      if (sql.startsWith('SELECT count'))
        return { rows: [{ count: Math.max(quota, records.length) }] };
      if (sql.startsWith('INSERT')) {
        if (records.some((p) => p.id === args[0] && p.version === args[1])) return { rows: [] };
        records.push(args[3]);
        return { rows: [{ id: args[0] }] };
      }
      return { rows: [] };
    },
    release() {
      releases++;
    },
  };
  const library = createPluginLibrary(undefined, { connect: async () => client });
  const owner = '11111111-1111-4111-8111-111111111111';
  const published = await library.publish(owner, PLUGIN_EXAMPLE);
  assert.equal(published.id, 'u-' + owner.replaceAll('-', '') + '-status-symbols');
  assert.equal(published.source, PLUGIN_EXAMPLE.source);
  assert(commands.includes('COMMIT'));
  assert.equal(releases, 1);
  await assert.rejects(library.publish(owner, published), (error) => error.status === 409);
  assert.equal(commands.at(-1), 'ROLLBACK');
  assert.equal(releases, 2);
  const update = await library.publish(owner, { ...published, version: 2 });
  assert.equal(update.version, 2);
  await assert.rejects(
    library.publish('22222222-2222-4222-8222-222222222222', published),
    (error) => error.status === 400,
  );
  await assert.rejects(
    library.publish(owner, { ...PLUGIN_EXAMPLE, source: undefined }),
    (error) => error.status === 400,
  );
  quota = 200;
  await assert.rejects(
    library.publish(owner, { ...published, version: 3 }),
    (error) => error.status === 409,
  );
  assert.equal(commands.at(-1), 'ROLLBACK');
});

test('the ellipse is a Moment shapes 3 shape; pinned versions 1 and 2 treat it as unknown', () => {
  assert.equal(MOMENT_SHAPES.version, 3);
  assert.deepEqual(MOMENT_SHAPES.shapes, ['ellipse']);
  assert(isOfficialPlugin(MOMENT_SHAPES));
  const versions = BUILTIN_PLUGINS.filter((p) => p.id === 'moment-shapes');
  assert.deepEqual(
    versions.map((p) => p.version),
    [1, 2, 3],
  );
  const older = versions.filter((p) => p.version < 3);
  for (const manifest of older) {
    // Older pinned definitions validate exactly as they did, with no added shapes.
    assert.equal(manifest.shapes, undefined);
    assert.deepEqual(validatePluginManifest(JSON.parse(JSON.stringify(manifest))), manifest);
    assert(isOfficialPlugin(manifest));
    assert.equal(pluginShape([installed(manifest)], { shape: 'ellipse' }), 'circle');
    assert.equal(pluginShape([installed(manifest)], { shape: 'terminator' }), 'terminator');
    assert(!shapeNames(manifest).includes('ellipse'));
  }
  assert.deepEqual(shapeNames(MOMENT_SHAPES), [...MOMENT_SHAPE_NAMES]);
  assert.equal(shapeNames().length, 12);
  // Version 3 draws a stored ellipse; one stored under version 2 is kept and drawn once upgraded.
  const doc = validateDocument({ ...demo(), plugins: [installed(older[1])] });
  doc.events[0].metadata.shape = 'ellipse';
  const reloaded = validateDocument(JSON.parse(JSON.stringify(doc)));
  assert.equal(reloaded.events[0].metadata.shape, 'ellipse');
  assert.equal(pluginShape(reloaded.plugins, reloaded.events[0].metadata), 'circle');
  assert.equal(pluginShape([installed(MOMENT_SHAPES)], reloaded.events[0].metadata), 'ellipse');
  assert.equal(pluginSize([installed(MOMENT_SHAPES)], { shapeSize: 'large' }), 'large');
  // Scripts: api.shape("ellipse") counts only in a plugin whose manifest lists the ellipse.
  const script = {
    ...PLUGIN_EXAMPLE,
    source: 'function render(m,api) { return api.shape("ellipse"); }',
  };
  assert.equal(pluginShape([installed(validatePluginManifest(script))]), 'circle');
  assert.equal(
    pluginShape([installed(validatePluginManifest({ ...script, shapes: ['ellipse'] }))]),
    'ellipse',
  );
  // Even a literal effect string is checked against the plugin's shapes.
  const literal = {
    ...PLUGIN_EXAMPLE,
    source: 'function render(m,api) { return \'{"shape":"ellipse"}\'; }',
  };
  assert.equal(pluginShape([installed(validatePluginManifest(literal))]), 'circle');
  // A declarative custom shape marker opts in the same way.
  const custom = {
    apiVersion: 1,
    id: 'condition-shapes',
    version: 1,
    name: 'Condition shapes',
    description: 'Ovals for conditions.',
    fields: [{ kind: 'shape', metadataKey: 'form', label: 'Form' }],
    marker: { kind: 'shape', metadataKey: 'form' },
  };
  assert.equal(
    pluginShape([installed(validatePluginManifest(custom))], { form: 'ellipse' }),
    'circle',
  );
  assert.equal(
    pluginShape([installed(validatePluginManifest({ ...custom, shapes: ['ellipse'] }))], {
      form: 'ellipse',
    }),
    'ellipse',
  );
  for (const shapes of [[], ['circle'], ['ellipse', 'ellipse'], ['oval'], 'ellipse', [1]])
    assert.throws(() => validatePluginManifest({ ...custom, shapes }), /added shapes/);
});

test('shape sizes are bounded, opt-in and retained in exported timeline metadata', () => {
  const plugins = [installed(MOMENT_SHAPES)];
  for (const shapeSize of ['small', 'medium', 'large']) {
    assert.equal(pluginSize(plugins, { shapeSize }), shapeSize);
    const doc = validateDocument({ ...demo(), plugins });
    doc.events[0].metadata.shapeSize = shapeSize;
    const reloaded = validateDocument(JSON.parse(JSON.stringify(doc)));
    assert.equal(pluginSize(reloaded.plugins, reloaded.events[0].metadata), shapeSize);
  }
  assert.equal(pluginSize(plugins, { shapeSize: 'gigantic' }), 'medium');
  assert.equal(
    pluginSize([{ manifest: MOMENT_SHAPES, enabled: false }], { shapeSize: 'large' }),
    'medium',
  );
  assert.equal(
    pluginSize([
      installed(
        validatePluginManifest({
          ...PLUGIN_EXAMPLE,
          source: 'function render(m,api) { return api.size("small"); }',
        }),
      ),
    ]),
    'small',
  );
});

test('Sources plugin reads existing metadata, preserves exports and restricts outgoing links', () => {
  const plugins = [installed(MOMENT_SOURCES)];
  assert.equal(createPluginLibrary().search({ search: 'Sources' }).plugins[0].id, 'moment-sources');
  assert.deepEqual(pluginFields(plugins), [
    { kind: 'links', metadataKey: 'sources', label: 'Sources' },
  ]);
  const sources = ['https://example.org/history', 'https://example.org/research?q=ice'];
  assert.deepEqual(sourceLinks(sources), sources);
  assert.deepEqual(sourceLinks(undefined), []);
  for (const invalid of [
    ['javascript:alert(1)'],
    ['https://user:secret@example.org'],
    ['data:text/html,test'],
    ['http://example.org'],
    [{}],
    Array(101).fill(sources[0]),
  ])
    assert.throws(() => sourceLinks(invalid));
  const document = demo();
  document.plugins = plugins;
  document.events[0].metadata.sources = sources;
  document.events[0].metadata.stack = [{ id: 'child', metadata: { sources } }];
  const roundtrip = validateDocument(
    JSON.parse(JSON.stringify(new TimelineIndex(document).document())),
  );
  assert.deepEqual(roundtrip.events[0].metadata.sources, sources);
  assert.deepEqual(roundtrip.events[0].metadata.stack[0].metadata.sources, sources);
  assert.deepEqual(roundtrip.plugins, plugins);
});

test('rich notes are an opt-in host capability preserved with Markdown in saved documents', () => {
  const plugins = [installed(RICH_TEXT_NOTES), installed(MOMENT_STACKS), installed(FOCUS_ON_HOVER)];
  assert(pluginRichText(plugins));
  assert(!pluginRichText([{ manifest: RICH_TEXT_NOTES, enabled: false }]));
  const notes = '# Heading\n\n**Bold** and *italic* [source](https://example.org)';
  const document = validateDocument({
    ...demo(),
    plugins,
    events: [
      {
        id: 'rich',
        time: '1/3',
        metadata: {
          title: 'Full title',
          description: notes,
          sources: ['https://example.org'],
          stack: [{ id: 'child', metadata: { title: 'Child', description: notes } }],
        },
      },
    ],
  });
  const restored = validateDocument(JSON.parse(JSON.stringify(document)));
  assert.deepEqual(restored, document);
  assert.equal(restored.events[0].metadata.stack[0].metadata.description, notes);
  assert.throws(() => validatePluginManifest({ ...RICH_TEXT_NOTES, notes: { kind: 'html' } }));
  assert.throws(() =>
    validatePluginManifest({ ...RICH_TEXT_NOTES, notes: { kind: 'markdown', script: 'evil' } }),
  );
  const title = 'A long full title '.repeat(150);
  const projection = pluginMetadata(plugins, {
    title,
    description: notes,
    sources: ['https://example.org', 'javascript:alert(1)'],
  });
  assert.equal(projection.title, title);
  assert.deepEqual(projection.sources, ['https://example.org']);
});
test('apps without a server search the official plugins exactly as the built-in server library', () => {
  const server = createPluginLibrary();
  for (const query of [
    {},
    { search: 'moment' },
    { search: '  HOVER ' },
    { search: 'nothing like this' },
    { limit: 4, page: 2 },
    { limit: 4, page: 9 },
  ])
    assert.deepEqual(searchPluginLibrary(BUILTIN_PLUGINS, query), server.search(query));
  // The newest version of each official plugin, in name order, each one official.
  const all = searchPluginLibrary(BUILTIN_PLUGINS, { limit: 50 }).plugins;
  assert.equal(all.length, new Set(BUILTIN_PLUGINS.map((p) => p.id)).size);
  for (const plugin of all) {
    assert(isOfficialPlugin(plugin));
    assert(BUILTIN_PLUGINS.every((p) => p.id !== plugin.id || p.version <= plugin.version));
  }
  assert.deepEqual(
    all.map((p) => p.name),
    [...all.map((p) => p.name)].sort(),
  );
});

test('duration backgrounds: an image behind durations only, the last valid one winning', () => {
  assert(isOfficialPlugin(DURATION_BACKGROUNDS));
  assert.deepEqual(pluginTargets(DURATION_BACKGROUNDS), ['durations']);
  // Without targets, a background still applies to durations only.
  const { targets: _targets, ...untargeted } = DURATION_BACKGROUNDS;
  assert.deepEqual(pluginTargets(validatePluginManifest(untargeted)), ['durations']);
  for (const background of [{ kind: 'video', metadataKey: 'x' }, { kind: 'image' }, 'image'])
    assert.throws(() => validatePluginManifest({ ...DURATION_BACKGROUNDS, background }));
  const installed = [{ manifest: DURATION_BACKGROUNDS, enabled: true }];
  // The duration editor gets its image URL field; moments get nothing from it.
  const [forDurations] = durationPlugins(installed);
  assert.deepEqual(
    forDurations.manifest.fields.map((f) => f.kind),
    ['image-url'],
  );
  assert.deepEqual(forDurations.manifest.background, {
    kind: 'image',
    metadataKey: 'backgroundUrl',
  });
  assert.deepEqual(momentPlugins(installed), []);
  const image = 'https://images.example/age.jpg';
  assert.equal(pluginBackground(installed, { backgroundUrl: image }), image);
  for (const bad of ['http://images.example/a.jpg', 'javascript:alert(1)', '', 3])
    assert.equal(pluginBackground(installed, { backgroundUrl: bad }), null);
  assert.equal(
    pluginBackground([{ ...installed[0], enabled: false }], { backgroundUrl: image }),
    null,
  );
  const other = validatePluginManifest({
    ...DURATION_BACKGROUNDS,
    id: 'other-backgrounds',
    fields: [{ kind: 'image-url', metadataKey: 'otherUrl', label: 'Other' }],
    background: { kind: 'image', metadataKey: 'otherUrl' },
  });
  const both = [...installed, { manifest: other, enabled: true }];
  assert.equal(
    pluginBackground(both, { backgroundUrl: image, otherUrl: image + '?2' }),
    image + '?2',
  );
  // An invalid later one falls back to the earlier.
  assert.equal(pluginBackground(both, { backgroundUrl: image, otherUrl: 'nope' }), image);
});
test('timeline background: one image for the whole timeline, set on the plugin (#223)', () => {
  assert(isOfficialPlugin(TIMELINE_BACKGROUND));
  // Nothing to set on events: its one setting belongs to the installed plugin.
  assert.deepEqual(TIMELINE_BACKGROUND.fields, []);
  assert.deepEqual(TIMELINE_BACKGROUND.settings, [
    { kind: 'image-url', key: 'imageUrl', label: 'Background image URL' },
  ]);
  const image = 'https://images.example/sky.jpg';
  const [installed] = validateInstalledPlugins([
    { manifest: TIMELINE_BACKGROUND, enabled: true, settings: { imageUrl: image } },
  ]);
  assert.deepEqual(installed.settings, { imageUrl: image });
  assert.equal(pluginBackdrop([installed]), image);
  assert.equal(pluginBackdrop([{ ...installed, enabled: false }]), null);
  // Empty values and settings the manifest doesn't declare are left out; bad addresses refused.
  assert.equal(
    validateInstalledPlugins([
      { manifest: TIMELINE_BACKGROUND, enabled: true, settings: { imageUrl: '', other: 'x' } },
    ])[0].settings,
    undefined,
  );
  for (const bad of ['http://images.example/a.jpg', 'javascript:alert(1)', 3])
    assert.throws(
      () =>
        validateInstalledPlugins([
          { manifest: TIMELINE_BACKGROUND, enabled: true, settings: { imageUrl: bad } },
        ]),
      /HTTPS image address/,
    );
  assert.throws(() =>
    validateInstalledPlugins([{ manifest: TIMELINE_BACKGROUND, enabled: true, settings: [] }]),
  );
  // A backdrop reads one of its plugin's own image settings, and settings are image addresses.
  for (const change of [
    { backdrop: { kind: 'image', setting: 'missing' } },
    { backdrop: { kind: 'video', setting: 'imageUrl' } },
    { settings: [{ kind: 'text', key: 'imageUrl', label: 'Text' }] },
    { settings: [] },
  ])
    assert.throws(() => validatePluginManifest({ ...TIMELINE_BACKGROUND, ...change }));
  // The last enabled plugin with one set wins.
  const other = validatePluginManifest({ ...TIMELINE_BACKGROUND, id: 'other-background' });
  const second = 'https://images.example/sea.jpg';
  assert.equal(
    pluginBackdrop([installed, { manifest: other, enabled: true, settings: { imageUrl: second } }]),
    second,
  );
  assert.equal(pluginBackdrop([installed, { manifest: other, enabled: true }]), image);
});
test('timeline theme: colors and fonts for the whole timeline, set on the plugin (#230)', () => {
  assert(isOfficialPlugin(TIMELINE_THEME));
  assert.deepEqual(TIMELINE_THEME.fields, []);
  assert.equal(TIMELINE_THEME.settings.length, 10);
  const [installed] = validateInstalledPlugins([
    {
      manifest: TIMELINE_THEME,
      enabled: true,
      settings: { textColor: '#AABBCC', measureFont: ' Georgia, serif ', haloColor: '' },
    },
  ]);
  // Colors are kept in lower case, fonts trimmed, and empty values left out.
  assert.deepEqual(installed.settings, { textColor: '#aabbcc', measureFont: 'Georgia, serif' });
  assert.deepEqual(pluginTheme([installed]), { text: '#aabbcc', measureFont: 'Georgia, serif' });
  assert.deepEqual(pluginTheme([{ ...installed, enabled: false }]), {});
  // Each value is checked by its setting's kind.
  for (const [key, bad, message] of [
    ['textColor', 'red', /color such as/],
    ['textColor', '#abc', /color such as/],
    ['textFont', 'url(https://fonts.example/a.woff)', /font names/],
    ['textFont', 'Georgia; color: red', /font names/],
    ['backgroundColor', 'https://images.example/a.jpg', /color such as/],
  ])
    assert.throws(
      () =>
        validateInstalledPlugins([
          { manifest: TIMELINE_THEME, enabled: true, settings: { [key]: bad } },
        ]),
      message,
    );
  const color = TIMELINE_THEME.settings[0];
  assert.equal(settingValue(color, '#00FF00'), '#00ff00');
  assert.equal(settingValue(color, 'https://images.example/a.jpg'), null);
  // A theme's roles read its own settings of the right kind.
  for (const change of [
    { theme: {} },
    { theme: { text: 'missing' } },
    { theme: { text: 'textFont' } },
    { theme: { textFont: 'textColor' } },
    { theme: { sparkle: 'textColor' } },
    { settings: [{ kind: 'gradient', key: 'textColor', label: 'Gradient' }] },
  ])
    assert.throws(() => validatePluginManifest({ ...TIMELINE_THEME, ...change }));
  // The last enabled plugin that sets a role wins it; others keep the earlier one's.
  const other = validatePluginManifest({ ...TIMELINE_THEME, id: 'other-theme' });
  assert.deepEqual(
    pluginTheme([
      installed,
      {
        manifest: other,
        enabled: true,
        settings: { textColor: '#010203', markerColor: '#aa0000' },
      },
    ]),
    { text: '#010203', measureFont: 'Georgia, serif', marker: '#aa0000' },
  );
  // As the stage's properties: the roles set, with their shades; nothing for the rest.
  assert.deepEqual(themeProperties({}), {});
  assert.deepEqual(
    themeProperties({ text: '#112233', duration: '#000000', measureFont: 'serif' }),
    {
      '--timeline-text': '#112233',
      '--timeline-text-soft': 'color-mix(in srgb, #112233 65%, transparent)',
      '--timeline-measure-font': 'serif',
      '--timeline-duration': '#000000',
      '--timeline-duration-text': '#ffffff',
    },
  );
  assert.equal(textOn('#ffffff'), '#1b1f1c');
  assert.equal(textOn('#73958b'), '#1b1f1c');
  assert.equal(textOn('#1f3a5f'), '#ffffff');
});
test('timeline theme sizes: label and measure text sizes, as percentages (#267)', () => {
  assert.equal(TIMELINE_THEME.version, 2);
  // Version 1, without sizes, stays available, so timelines that installed it keep working.
  const first = BUILTIN_PLUGINS.find((p) => p.id === 'timeline-theme' && p.version === 1);
  assert.equal(first.settings.length, 8);
  assert.equal(first.theme.textSize, undefined);
  const [old] = validateInstalledPlugins([
    { manifest: first, enabled: true, settings: { textColor: '#112233' } },
  ]);
  assert.deepEqual(pluginTheme([old]), { text: '#112233' });
  // Sizes are whole percentages from 50 to 200, kept as strings.
  for (const [given, saved] of [
    ['125', '125'],
    [150, '150'],
    [' 75% ', '75'],
    ['50', '50'],
    ['200', '200'],
    ['49', null],
    ['201', null],
    ['1.5', null],
    ['large', null],
    ['', null],
    [null, null],
  ])
    assert.equal(textSizeValue(given), saved, String(given));
  const [installed] = validateInstalledPlugins([
    {
      manifest: TIMELINE_THEME,
      enabled: true,
      settings: { textSize: '150%', measureSize: 75, textColor: '#112233' },
    },
  ]);
  assert.deepEqual(installed.settings, {
    textSize: '150',
    measureSize: '75',
    textColor: '#112233',
  });
  const theme = pluginTheme([installed]);
  assert.deepEqual(theme, { text: '#112233', textSize: '150', measureSize: '75' });
  assert.deepEqual(themeScales(theme), { text: 1.5, measure: 0.75 });
  assert.deepEqual(themeScales({}), { text: 1, measure: 1 });
  assert.deepEqual(themeProperties({ textSize: '150', measureSize: '75' }), {
    '--timeline-text-scale': '1.5',
    '--timeline-measure-scale': '0.75',
  });
  assert.throws(
    () =>
      validateInstalledPlugins([
        { manifest: TIMELINE_THEME, enabled: true, settings: { textSize: '300' } },
      ]),
    /size from 50% to 200%/,
  );
  // A size role reads a size setting, and a color or font role can't.
  for (const theme of [
    { textSize: 'textColor' },
    { text: 'textSize' },
    { textFont: 'measureSize' },
  ])
    assert.throws(() => validatePluginManifest({ ...TIMELINE_THEME, theme }));
});

test('relationship arrows: what each end says, read tolerantly and drawn as a union (#326)', () => {
  assert(isOfficialPlugin(RELATIONSHIP_ARROWS));
  assert.deepEqual(
    [RELATIONSHIP_ARROWS.id, RELATIONSHIP_ARROWS.version],
    ['relationship-arrows', 1],
  );
  assert.deepEqual(pluginTargets(RELATIONSHIP_ARROWS), ['moments', 'durations']);
  const plugins = [installed(RELATIONSHIP_ARROWS)];
  const field = {
    kind: 'relationship-arrows',
    metadataKey: 'arrows',
    label: 'Relationship arrows',
  };
  for (const target of [momentPlugins(plugins), durationPlugins(plugins)])
    assert.deepEqual(pluginFields(target), [field]);
  assert(pluginDrawsArrows(plugins));
  assert(!pluginDrawsArrows([{ ...plugins[0], enabled: false }]));
  assert(!pluginDrawsArrows([]));

  // Reading never throws: odd entries are unreadable and keep their places.
  const stored = [
    { target: { moment: 'b' }, arrow: 'to' },
    { target: { moment: 'b' }, arrow: 'sideways' },
    { target: { duration: 'd' }, arrow: 'both' },
    { target: { moment: 'b', duration: 'd' }, arrow: 'to' },
    { target: { event: 'b' }, arrow: 'to' },
    { target: { moment: 'bad id!' }, arrow: 'to' },
    { target: { moment: 'c' }, arrow: 'from', extra: 1 },
    null,
    'to',
    [],
    { target: { moment: 'c' }, arrow: 'none' },
  ];
  assert.deepEqual(readRelationshipArrows(stored), {
    entries: [
      { target: { moment: 'b' }, arrow: 'to', index: 0 },
      { target: { duration: 'd' }, arrow: 'both', index: 2 },
      { target: { moment: 'c' }, arrow: 'none', index: 10 },
    ],
    unreadable: 8,
  });
  assert.deepEqual(readRelationshipArrows(undefined), { entries: [], unreadable: 0 });
  for (const value of [null, 'x', 7, {}, true])
    assert.deepEqual(readRelationshipArrows(value), { entries: [], unreadable: 1 });

  // From A's point of view: "to" is an arrowhead at B's end, "from" at A's, "both" at both.
  const says = (arrow) => ({ arrows: [{ target: { moment: 'b' }, arrow }] });
  const arc = (a, b) =>
    arcArrowheads({ key: 'm:a', plugins, metadata: a }, { key: 'm:b', plugins, metadata: b });
  assert.deepEqual(arc(says('to'), {}), { a: false, b: true });
  assert.deepEqual(arc(says('from'), {}), { a: true, b: false });
  assert.deepEqual(arc(says('both'), {}), { a: true, b: true });
  assert.deepEqual(arc(says('none'), {}), { a: false, b: false });
  const back = (arrow) => ({ arrows: [{ target: { moment: 'a' }, arrow }] });
  // The union of both ends: A says both and B says "to" A; each says "to" the other.
  assert.deepEqual(arc(says('both'), back('to')), { a: true, b: true });
  assert.deepEqual(arc(says('to'), back('to')), { a: true, b: true });
  assert.deepEqual(arc(says('to'), back('from')), { a: false, b: true });
  assert.deepEqual(arc(says('none'), back('none')), { a: false, b: false });
  // An end whose metadata isn't at hand says nothing; nor do entries for other entities,
  // unreadable ones, or a disabled plugin.
  assert.deepEqual(arc(null, back('to')), { a: true, b: false });
  assert.deepEqual(arc(null, null), { a: false, b: false });
  assert.deepEqual(arc({ arrows: [{ target: { moment: 'zz' }, arrow: 'both' }] }, {}), {
    a: false,
    b: false,
  });
  assert.deepEqual(arc({ arrows: stored }, {}), { a: false, b: true });
  assert.deepEqual(arc({ arrows: 'both' }, { arrows: { a: 'to' } }), { a: false, b: false });
  assert.deepEqual(
    arcArrowheads(
      { key: 'm:a', plugins: [{ ...plugins[0], enabled: false }], metadata: says('both') },
      { key: 'm:b', plugins: [], metadata: back('both') },
    ),
    { a: false, b: false },
  );
  // A moment and a duration: each read with its own plugins.
  assert.deepEqual(
    arcArrowheads(
      {
        key: 'd:d',
        plugins: durationPlugins(plugins),
        metadata: { arrows: [{ target: { moment: 'a' }, arrow: 'to' }] },
      },
      { key: 'm:a', plugins: momentPlugins(plugins), metadata: {} },
    ),
    { a: false, b: true },
  );
  assert.deepEqual(arrowsToward(plugins, says('both'), 'm:b'), { self: true, other: true });

  // Overviews carry the entries: moments' plugin projection, and duration bands' small arrays.
  assert.deepEqual(pluginMetadata(plugins, says('to')), says('to'));
  assert.deepEqual(durationOverview({ title: 'Span', ...says('from'), n: 1 }), {
    title: 'Span',
    ...says('from'),
  });
  assert.deepEqual(durationOverview({ big: ['x'.repeat(2000)], tags: ['a'] }), { tags: ['a'] });

  // The field kind is general plugin API, validated; stacks don't take it.
  const custom = validatePluginManifest({
    apiVersion: 1,
    id: 'causes',
    version: 1,
    name: 'Causes',
    description: 'Arrows from causes.',
    fields: [{ kind: 'relationship-arrows', metadataKey: 'causes', label: 'Causes' }],
  });
  assert.deepEqual(pluginTargets(custom), ['moments', 'durations']);
  assert.deepEqual(
    arrowsToward(
      [installed(custom)],
      { causes: [{ target: { moment: 'x' }, arrow: 'to' }] },
      'm:x',
    ),
    { self: false, other: true },
  );
  assert.throws(() =>
    validatePluginManifest({
      ...custom,
      fields: [{ kind: 'relationship-arrow', metadataKey: 'causes', label: 'Causes' }],
    }),
  );
  // A saved timeline keeps every entry, dangling or unreadable, whether or not the plugin is on.
  const doc = {
    format: 'openchronology',
    version: 1,
    title: 'Arrows',
    description: '',
    plugins: [{ ...plugins[0], enabled: false }],
    events: [
      { id: 'a', time: '0/1', metadata: { title: 'A', arrows: stored } },
      { id: 'b', time: '1/1', metadata: { title: 'B' } },
    ],
    durations: [
      {
        id: 'd',
        start: '1/1',
        end: '2/1',
        metadata: { arrows: [{ target: { moment: 'gone' }, arrow: 'to' }] },
      },
    ],
    relationships: [{ a: { moment: 'a' }, b: { moment: 'b' } }],
  };
  const saved = validateDocument(JSON.parse(JSON.stringify(doc)));
  assert.deepEqual(saved.events[0].metadata.arrows, stored);
  assert.deepEqual(saved.durations[0].metadata.arrows, doc.durations[0].metadata.arrows);
});

test('headings: a level makes a moment a heading, in its font or Times New Roman', () => {
  assert(isOfficialPlugin(MOMENT_HEADINGS));
  assert.deepEqual(pluginTargets(MOMENT_HEADINGS), ['moments']);
  const installed = [{ manifest: MOMENT_HEADINGS, enabled: true }];
  assert.equal(pluginHeading(installed, { title: 'Moment' }), null);
  assert.equal(pluginHeading(installed, { headingLevel: 'h7' }), null);
  assert.equal(pluginHeading(installed, { headingLevel: '' }), null);
  assert.deepEqual(pluginHeading(installed, { headingLevel: 'h2' }), {
    level: 'h2',
    font: DEFAULT_HEADING_FONT,
  });
  assert.deepEqual(
    pluginHeading(installed, { headingLevel: 'h1', headingFont: 'Georgia, serif' }),
    {
      level: 'h1',
      font: 'Georgia, serif',
    },
  );
  // A font that is not a family list falls back to the default.
  assert.equal(
    pluginHeading(installed, { headingLevel: 'h1', headingFont: 'x; color: red' }).font,
    DEFAULT_HEADING_FONT,
  );
  assert.equal(pluginHeading([{ ...installed[0], enabled: false }], { headingLevel: 'h1' }), null);
  assert.deepEqual(momentPlugins(installed), installed);
  assert.deepEqual(durationPlugins(installed), []);
  for (const font of [
    'Baskerville, serif',
    '"EB Garamond", serif',
    "'Fira Sans', sans-serif",
    'cursive',
  ])
    assert.equal(fontValue(font), font);
  for (const font of [
    'url(https://evil.example/font.woff)',
    'serif; background: red',
    'a, , b',
    '"unterminated, serif',
    '',
    'x'.repeat(201),
    3,
  ])
    assert.equal(fontValue(font), null, String(font));
  // Field and marker kinds validate.
  assert.throws(() =>
    validatePluginManifest({ ...MOMENT_HEADINGS, marker: { kind: 'headline', metadataKey: 'x' } }),
  );
  assert.throws(() =>
    validatePluginManifest({
      ...MOMENT_HEADINGS,
      fields: [{ kind: 'typeface', metadataKey: 'x', label: 'x' }],
    }),
  );
});

test('derived metadata: computed for the plugins to read, never over what an entity has (#122)', () => {
  const severity = [installed(LOG_SEVERITY_COLORS)];
  // Every log format: the severity tag, or the format's own severity where it tags none.
  assert.equal(pluginColor(severity, { tags: ['syslog', 'severity:err'] }), '#bc6663');
  assert.equal(pluginColor(severity, { journald: { severity: 'warning' } }), '#d6ad4c');
  assert.equal(pluginColor(severity, { 'nginx-combined': { severity: 'crit' } }), '#8f3f3c');
  assert.equal(pluginColor(severity, { tags: ['severity:debug'] }), '#9aa49f');
  assert.equal(pluginColor(severity, { tags: ['severity:notice'] }), '#7aadc4');
  // The tag comes first; a level the map doesn't color (info) passes to the next source.
  assert.equal(
    pluginColor(severity, { tags: ['severity:err'], syslog: { severity: 'debug' } }),
    '#bc6663',
  );
  assert.equal(
    pluginColor(severity, { tags: ['severity:info'], syslog: { severity: 'alert' } }),
    '#8f3f3c',
  );
  assert.equal(pluginColor(severity, { tags: ['severity:info'] }), null);
  assert.equal(pluginColor(severity, { title: 'Not a log entry' }), null);
  // A color the entry has wins, and nothing is written into the entry.
  const entry = { color: '#5f8b67', tags: ['severity:err'] };
  assert.equal(pluginColor(severity, entry), '#5f8b67');
  const log = { tags: ['severity:err'] };
  assert.deepEqual(derivedMetadata(severity, log), { tags: ['severity:err'], color: '#bc6663' });
  assert.deepEqual(log, { tags: ['severity:err'] });
  // Without derivations (or disabled), the metadata itself.
  assert.equal(derivedMetadata([installed(MOMENT_COLORS)], log), log);
  assert.equal(derivedMetadata([{ ...severity[0], enabled: false }], log), log);
  assert.equal(pluginColor([{ ...severity[0], enabled: false }], log), null);

  // The color plugin reads the derived color in either order, with its script too.
  for (const plugins of [
    [installed(MOMENT_COLORS), installed(LOG_SEVERITY_COLORS)],
    [installed(LOG_SEVERITY_COLORS), installed(MOMENT_COLORS)],
    [
      {
        ...installed(LOG_SEVERITY_COLORS),
        manifest: { ...LOG_SEVERITY_COLORS, marker: undefined },
      },
      installed(MOMENT_COLORS),
    ],
  ])
    assert.equal(pluginColor(plugins, log), '#bc6663');

  // A custom plugin: derivations chain, and a script reads what its own derive sets.
  const custom = validatePluginManifest({
    apiVersion: 1,
    id: 'status-from-logs',
    version: 1,
    name: 'Status from logs',
    description: 'Shapes from a derived level.',
    fields: [],
    derive: [
      { metadataKey: 'level', from: [{ path: 'app.log.level' }, { tag: 'severity' }] },
      { metadataKey: 'status', from: [{ path: 'level' }], map: { err: 'blocked' } },
    ],
    source:
      'function render(moment: string, api: PluginAPI): string { return api.get("status") === "blocked" ? api.shape("diamond") : api.none(); }',
  });
  checkPluginScript(custom);
  assert.equal(pluginShape([installed(custom)], { tags: ['severity:err'] }), 'diamond');
  assert.equal(pluginShape([installed(custom)], { app: { log: { level: 'err' } } }), 'diamond');
  assert.equal(pluginShape([installed(custom)], { app: { log: { level: 7 } } }), 'circle');
  assert.equal(pluginShape([installed(custom)], { tags: ['severity:info'] }), 'circle');
  assert.deepEqual(derivationKeys(custom), ['level', 'app', 'tags', 'status']);
  assert.deepEqual(derivationKeys(LOG_SEVERITY_COLORS).slice(0, 3), ['color', 'tags', 'syslog']);

  // An overview carries what the derivations read, and nothing else of it.
  const full = {
    title: 'disk full',
    tags: ['syslog', 'severity:err', 'host:web-1'],
    syslog: { severity: 'err', host: 'web-1', structuredData: { secret: 'x' } },
    private: 'not projected',
  };
  const projected = pluginMetadata(severity, full);
  assert.deepEqual(projected.tags, ['severity:err']);
  assert.deepEqual(projected.syslog, { severity: 'err' });
  assert.equal(projected.private, undefined);
  assert.equal(pluginColor(severity, projected), pluginColor(severity, full));
  // Durations: bands carry their tags, and the plugin applies to them.
  const band = durationOverview({ title: 'outage', tags: ['severity:crit'], journald: {} });
  assert.deepEqual(band.tags, ['severity:crit']);
  assert.equal(pluginColor(durationPlugins(severity), band), '#8f3f3c');

  // What a derivation may declare.
  const derive = (rules) => validatePluginManifest({ ...custom, source: undefined, derive: rules });
  for (const rules of [
    [],
    {},
    Array.from({ length: 9 }, () => ({ metadataKey: 'a', from: [{ tag: 'a' }] })),
    [{ metadataKey: 'a', from: [] }],
    [{ metadataKey: 'a', from: Array.from({ length: 17 }, () => ({ tag: 'a' })) }],
    [{ metadataKey: 'title', from: [{ tag: 'a' }] }],
    [{ metadataKey: 'tags', from: [{ tag: 'a' }] }],
    [{ metadataKey: 'a', from: [{ tag: 'severity:' }] }],
    [{ metadataKey: 'a', from: [{ tag: 'Severity' }] }],
    [{ metadataKey: 'a', from: [{ tag: 'a', path: 'b' }] }],
    [{ metadataKey: 'a', from: [{ path: 'a..b' }] }],
    [{ metadataKey: 'a', from: [{ path: 'a.b.c.d.e' }] }],
    [{ metadataKey: 'a', from: [{ path: 'a.__proto__' }] }],
    [{ metadataKey: 'a', from: [{ path: 'a.*' }] }],
    [{ metadataKey: 'a', from: [{ tag: 'a' }], map: { b: 3 } }],
    [{ metadataKey: 'a', from: [{ tag: 'a' }], map: { b: 'x'.repeat(257) } }],
    [{ metadataKey: 'a', from: [{ tag: 'a' }], map: ['b'] }],
    [{ metadataKey: 'a', from: [{ tag: 'a' }], script: 'x' }],
  ])
    assert.throws(() => derive(rules), JSON.stringify(rules));
  assert.equal(derive([{ metadataKey: 'a', from: [{ path: 'a-b.c_d' }] }]).derive.length, 1);
  // A map key named like an object's own properties is only a value.
  assert.equal(
    pluginColor(
      [
        installed(
          derive([{ metadataKey: 'color', from: [{ tag: 'k' }], map: { toString: '#123456' } }]),
        ),
      ],
      { tags: ['k:hasOwnProperty'] },
    ),
    null,
  );
});
