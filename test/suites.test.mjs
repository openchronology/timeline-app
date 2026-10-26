// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// Plugin suites (#78): the official suites, validation, adding one without changing installed
// plugins, and searching suite libraries.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  OFFICIAL_SUITES,
  CAUSAL_FACTOR_ANALYSIS,
  CAUSAL_FACTOR_ANALYSIS_1,
  HISTORY_EDUCATION,
  MOMENT_ICONS,
  MOMENT_COLORS,
  MOMENT_STACKS,
  PLUGIN_EXAMPLE,
  addSuite,
  isOfficialPlugin,
  isOfficialSuite,
  searchSuiteLibrary,
  suiteFromPlugins,
  validatePluginManifest,
  validatePluginSuite,
} from '../dist/core.mjs';
import { createSuiteLibrary } from '../server/plugins.mjs';
import { createApplication } from '../server/http.mjs';

test('the official suites package official plugins as the issue lists them', () => {
  assert.deepEqual(
    CAUSAL_FACTOR_ANALYSIS.plugins.map((p) => p.id),
    [
      'moment-stacks',
      'moment-shapes',
      'moment-colors',
      'presumptive-outline',
      'relationship-arrows',
    ],
  );
  assert.equal(CAUSAL_FACTOR_ANALYSIS.version, 2);
  assert.equal(CAUSAL_FACTOR_ANALYSIS.plugins.find((p) => p.id === 'moment-shapes').version, 3);
  assert.deepEqual(
    CAUSAL_FACTOR_ANALYSIS_1.plugins.map((p) => `${p.id}@${p.version}`),
    ['moment-stacks@2', 'moment-shapes@2', 'moment-colors@2'],
  );
  assert.ok(isOfficialSuite(CAUSAL_FACTOR_ANALYSIS_1));
  assert.deepEqual(
    HISTORY_EDUCATION.plugins.map((p) => p.id),
    [
      'moment-icons',
      'duration-backgrounds',
      'expand-on-hover',
      'rich-text-notes',
      'moment-headings',
    ],
  );
  for (const suite of OFFICIAL_SUITES) {
    assert(isOfficialSuite(suite));
    assert(suite.plugins.every(isOfficialPlugin));
  }
});

test('suites validate their identity, plugins and size', () => {
  const custom = validatePluginManifest(PLUGIN_EXAMPLE);
  const suite = validatePluginSuite({
    apiVersion: 1,
    id: 'class',
    version: 2,
    name: ' My class ',
    description: 'Ours',
    plugins: [MOMENT_ICONS, custom],
  });
  assert.equal(suite.name, 'My class');
  assert.equal(isOfficialSuite(suite), false);
  const base = { apiVersion: 1, id: 'class', version: 1, name: 'Class', description: '' };
  for (const bad of [
    { ...base, plugins: [] },
    { ...base, plugins: [MOMENT_ICONS, MOMENT_ICONS] },
    { ...base, plugins: [{ ...MOMENT_ICONS, fields: [{ kind: 'script' }] }] },
    { ...base, id: 'Class', plugins: [MOMENT_ICONS] },
    { ...base, version: 0, plugins: [MOMENT_ICONS] },
    { ...base, name: ' ', plugins: [MOMENT_ICONS] },
    { ...base, extra: true, plugins: [MOMENT_ICONS] },
    {
      ...base,
      plugins: Array.from({ length: 33 }, (_, i) => ({ ...MOMENT_ICONS, id: 'icons-' + i })),
    },
    {
      ...base,
      plugins: Array.from({ length: 10 }, (_, i) => ({
        ...custom,
        id: 'big-' + i,
        description: 'x'.repeat(2000),
        source: custom.source + ' '.repeat(14000),
      })),
    },
  ])
    assert.throws(() => validatePluginSuite(bad));
  // Made from a timeline's plugins, its ID is a slug of its name.
  assert.equal(
    suiteFromPlugins({ name: '  Grade 9: History! ' }, [MOMENT_ICONS]).id,
    'grade-9-history',
  );
  assert.equal(suiteFromPlugins({ name: '2024 class' }, [MOMENT_ICONS]).id, 'class');
  assert.equal(suiteFromPlugins({ name: '!!!' }, [MOMENT_ICONS]).id, 'suite');
});

test('adding a suite appends what is missing and never changes an installed plugin', () => {
  const older = validatePluginManifest({ ...MOMENT_COLORS, version: 1, source: undefined });
  const installed = [
    { manifest: older, enabled: false },
    { manifest: MOMENT_ICONS, enabled: true },
  ];
  const { plugins, added, kept } = addSuite(installed, CAUSAL_FACTOR_ANALYSIS);
  assert.deepEqual(
    added.map((p) => p.id),
    ['moment-stacks', 'moment-shapes', 'presumptive-outline', 'relationship-arrows'],
  );
  assert.deepEqual(
    kept.map((p) => p.id),
    ['moment-colors'],
  );
  assert.deepEqual(plugins.slice(0, 2), installed);
  assert.deepEqual(plugins[2], { manifest: MOMENT_STACKS, enabled: true });
  assert.equal(plugins.length, 6);
  // A timeline holds at most 32 plugins.
  const full = Array.from({ length: 31 }, (_, i) => ({
    manifest: { ...MOMENT_ICONS, id: 'filler-' + i },
    enabled: true,
  }));
  assert.throws(() => addSuite(full, CAUSAL_FACTOR_ANALYSIS), /at most 32 plugins; remove 4/);
});

test('suite libraries search names, descriptions and plugin names, newest versions first', async () => {
  assert.equal(
    searchSuiteLibrary(OFFICIAL_SUITES, { search: 'headings' }).suites[0].id,
    'history-education',
  );
  assert.equal(searchSuiteLibrary(OFFICIAL_SUITES, { search: 'CAUSAL' }).total, 1);
  assert.equal(searchSuiteLibrary(OFFICIAL_SUITES, { search: 'absent' }).total, 0);
  const newer = { ...HISTORY_EDUCATION, version: 2, name: 'History education 2' };
  const library = createSuiteLibrary([...OFFICIAL_SUITES, newer]);
  const all = library.search({});
  assert.equal(all.total, 2);
  assert.equal(all.suites.find((s) => s.id === 'history-education').version, 2);
  assert.equal(library.get('history-education', 1).version, 1);
  assert.throws(() => library.get('history-education', 3), /not found/);
  for (const bad of [null, { page: 0 }, { limit: 51 }, { sort: 'age' }, { search: 3 }])
    assert.throws(() => library.search(bad), /Invalid suite search/);

  // Served by the API without accounts or PostgreSQL.
  const app = createApplication();
  const call = (path, method = 'GET', body) =>
    new Promise((resolve, reject) => {
      const chunks = body === undefined ? [] : [Buffer.from(JSON.stringify(body))];
      const req = Object.assign(
        (async function* () {
          yield* chunks;
        })(),
        {
          url: path,
          method,
          headers: { 'content-type': 'application/json' },
          socket: { remoteAddress: '127.0.0.1' },
        },
      );
      const res = {
        headers: {},
        setHeader(k, v) {
          this.headers[k] = v;
        },
        writeHead(status) {
          this.status = status;
        },
        end(bytes) {
          resolve({ status: this.status, body: JSON.parse(bytes) });
        },
      };
      app.listeners('request')[0](req, res).catch(reject);
    });
  const listed = await call('/api/plugins/suites?search=history');
  assert.equal(listed.status, 200);
  assert.deepEqual(
    listed.body.suites.map((s) => s.id),
    ['history-education'],
  );
  const searched = await call('/api/plugins/suites/search', 'POST', { search: '', page: 1 });
  assert.equal(searched.body.total, 2);
  assert.equal(
    (await call('/api/plugins/suites/causal-factor-analysis/1')).body.name,
    'Causal factor analysis',
  );
  assert.equal((await call('/api/plugins/suites/causal-factor-analysis/9')).status, 404);
  assert.equal((await call('/api/plugins/suites/search', 'POST', { sort: 'age' })).status, 400);
});
