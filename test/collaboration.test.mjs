// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import {
  validateDocument,
  demo,
  validateTags,
  validateAssets,
  PLUGIN_EXAMPLE,
  validatePluginManifest,
  isOfficialPlugin,
  MOMENT_SHAPES,
  TimelineIndex,
} from '../dist/core.mjs';
import {
  searchInput,
  searchTimelines,
  rebaseDocument,
  Collaboration,
} from '../server/collaboration.mjs';
import { PostgresStore } from '../server/store.mjs';
import { createApplication } from '../server/http.mjs';
const id = '11111111-1111-4111-8111-111111111111',
  author = '22222222-2222-4222-8222-222222222222';
const base = validateDocument({
  format: 'openchronology',
  version: 1,
  title: 'Base',
  description: '',
  tags: ['Science'],
  events: [{ id: 'a', time: '1/2', metadata: { title: 'Old' } }],
});
test('tags and embedded raster assets preserve plugin code across snapshots', () => {
  assert.deepEqual(validateTags([' Science ', 'science', 'History']), ['science', 'history']);
  for (const input of [null, [''], ['a,b'], Array(41).fill('a'), ['x'.repeat(65)]])
    assert.throws(() => validateTags(input));
  const assets = { 'https://images.example/icon.png': 'data:image/png;base64,aGVsbG8=' };
  const document = validateDocument({
    ...base,
    assets,
    plugins: [{ manifest: validatePluginManifest(PLUGIN_EXAMPLE), enabled: true }],
  });
  assert.deepEqual(new TimelineIndex(document).document(), document);
  assert.throws(() =>
    validateAssets({ 'https://images.example/x': 'data:image/svg+xml;base64,aGVsbG8=' }),
  );
  assert.throws(() =>
    validateAssets({ 'http://images.example/x': 'data:image/png;base64,aGVsbG8=' }),
  );
  assert(isOfficialPlugin(MOMENT_SHAPES));
  assert(
    !isOfficialPlugin({
      ...MOMENT_SHAPES,
      source: 'function render(m,api) { return api.none(); }',
    }),
  );
});
test('rebase merges independent moment and settings edits but refuses conflicting modifications and deletions', () => {
  const proposal = validateDocument({
    ...base,
    title: 'Proposed',
    events: [...base.events, { id: 'b', time: '2/3', metadata: {} }],
  });
  const upstream = validateDocument({
    ...base,
    description: 'New upstream notes',
    events: [...base.events, { id: 'c', time: '3/4', metadata: {} }],
  });
  const result = rebaseDocument(base, proposal, upstream);
  assert.equal(result.title, 'Proposed');
  assert.equal(result.description, 'New upstream notes');
  assert.equal(result.events.length, 3);
  const left = validateDocument({
    ...base,
    events: [{ ...base.events[0], metadata: { title: 'Left' } }],
  });
  const right = validateDocument({
    ...base,
    events: [{ ...base.events[0], metadata: { title: 'Right' } }],
  });
  assert.throws(
    () => rebaseDocument(base, left, right),
    (e) => e.status === 409,
  );
  assert.throws(
    () => rebaseDocument(base, { ...base, events: [] }, right),
    (e) => e.status === 409,
  );
  assert.equal(rebaseDocument(base, left, left).events[0].metadata.title, 'Left');
});
test('public browse queries are parameterized, paginated, ranked, and restrict private search to its owner', async () => {
  let parameters, sql;
  const pool = {
    query: async (query, args) => {
      sql = query;
      parameters = args;
      return { rows: [{ total: '0', timelines: [] }] };
    },
  };
  const result = await searchTimelines(pool, null, {
    search: '"star map" -secret',
    tag: ' SCIENCE ',
    page: 2,
    limit: 12,
    owner: ' seed ',
  });
  assert.equal(result.pages, 0);
  assert.equal(parameters[1], '"star map" -secret');
  assert.equal(parameters[3], 12);
  assert.equal(parameters[6], 'science');
  assert.equal(parameters[8], 'seed');
  assert(sql.includes("($9='' OR u.username=$9)"));
  assert(sql.includes("t.visibility='public'"));
  assert(sql.includes('websearch_to_tsquery'));
  assert(sql.includes('t.owner_id=$6::uuid'));
  await assert.rejects(searchTimelines(pool, null, { scope: 'mine' }), (e) => e.status === 401);
  for (const input of [
    { page: 0 },
    { limit: 51 },
    { scope: 'all' },
    { search: 'x'.repeat(301) },
    { extra: 1 },
    { owner: 'x'.repeat(65) },
    { owner: {} },
  ])
    assert.throws(() => searchInput(input));
});
test('structured merges combine time and metadata field edits and identify conflicting fields', () => {
  const a = { ...base, events: [{ ...base.events[0], time: '2/3' }] },
    b = {
      ...base,
      events: [{ ...base.events[0], metadata: { title: 'New', description: 'Notes' } }],
    };
  const merged = rebaseDocument(base, a, b);
  assert.equal(merged.events[0].time, '2/3');
  assert.deepEqual(merged.events[0].metadata, { title: 'New', description: 'Notes' });
  assert.throws(
    () =>
      rebaseDocument(base, b, {
        ...base,
        events: [{ ...base.events[0], metadata: { title: 'Other' } }],
      }),
    (e) => e.status === 409 && e.conflicts.includes('moment a.metadata.title'),
  );
});
test('access distinguishes local contributor edits from write access, including public forks', async () => {
  const pool = {
    query: async () => ({ rows: [{ id, role: 'contributor', visibility: 'private' }] }),
  };
  const store = new PostgresStore(pool);
  const contributor = await store.access(id, author);
  assert(contributor.canEdit);
  assert(contributor.canPropose);
  assert(!contributor.canWrite);
  assert(!contributor.canShare);
  pool.query = async () => ({ rows: [{ id, role: null, visibility: 'public' }] });
  assert((await store.access(id, author)).canPropose);
  assert(!(await store.access(id, null)).canEdit);
  pool.query = async () => ({ rows: [{ id, role: null, visibility: 'private' }] });
  await assert.rejects(store.access(id, author), (e) => e.status === 404);
});
test('merges require write access, an open unchanged proposal, and an unchanged upstream base', async () => {
  let role = 'contributor',
    upstream = '1',
    status = 'open',
    replacement = 0,
    committed = 0;
  const proposal = {
    id: author,
    author_id: author,
    status: 'open',
    revision: '1',
    base_revision: '1',
    base_document: base,
    document: base,
  };
  const queries = [];
  const client = {
    query: async (sql, args) => {
      queries.push(sql);
      if (sql.startsWith('SELECT * FROM oc_proposals')) return { rows: [{ ...proposal, status }] };
      return { rows: [] };
    },
  };
  const store = {
    pool: {},
    transaction: async (fn) => fn(client),
    access: async () => ({ id, revision: upstream, canWrite: role === 'writer', canPropose: true }),
    replace: async () => replacement++,
    branchDocument: async () => base,
    checkpoint: async () => author,
  };
  const collaboration = new Collaboration(store);
  collaboration.get = async () => {
    committed++;
    return proposal;
  };
  await assert.rejects(
    collaboration.resolve(id, author, author, { action: 'merge', revision: '1' }),
    (e) => e.status === 403,
  );
  assert.equal(replacement, 0);
  role = 'writer';
  upstream = '2';
  await assert.rejects(
    collaboration.resolve(id, author, author, { action: 'merge', revision: '1' }),
    (e) => e.status === 409,
  );
  assert.equal(replacement, 0);
  upstream = '1';
  status = 'closed';
  await assert.rejects(
    collaboration.resolve(id, author, author, { action: 'merge', revision: '1' }),
    (e) => e.status === 409,
  );
  status = 'open';
  await collaboration.resolve(id, author, author, { action: 'merge', revision: '1' });
  assert.equal(replacement, 1);
  assert.equal(committed, 1);
  assert(queries.some((q) => q.includes('revision=revision+1')));
  role = 'contributor';
  await assert.rejects(
    collaboration.resolve(id, author, author, { action: 'reject', revision: '1' }),
    (e) => e.status === 403,
  );
  await collaboration.resolve(id, author, author, { action: 'close', revision: '1' });
});
async function request(app, url, body, headers = {}) {
  const req = Readable.from(body === undefined ? [] : [Buffer.from(JSON.stringify(body))]);
  Object.assign(req, {
    url,
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    socket: { remoteAddress: '127.0.0.1' },
  });
  return new Promise((resolve, reject) => {
    const res = {
      setHeader() {},
      writeHead(status) {
        this.status = status;
      },
      end(bytes) {
        resolve({ status: this.status, body: JSON.parse(bytes) });
      },
    };
    app.listeners('request')[0](req, res).catch(reject);
  });
}
test('proposal mutations and comments enforce login and origin before accepting private data', async () => {
  const app = createApplication({ pool: { query: async () => ({ rows: [] }) } });
  for (const path of [
    `/api/timelines/${id}/proposals`,
    `/api/timelines/${id}/proposals/${author}/comments`,
    `/api/timelines/${id}/proposals/${author}/resolve`,
  ]) {
    assert.equal((await request(app, path, { body: 'note' })).status, 401);
    assert.equal(
      (await request(app, path, { body: 'note' }, { origin: 'https://evil.example' })).status,
      403,
    );
  }
  assert.equal((await request(app, '/api/timelines/search', { scope: 'mine' })).status, 401);
});

test('timeline sorting defaults and bookmark queries are validated', async () => {
  assert.equal(searchInput({}).sort, 'featured');
  assert.equal(searchInput({ search: 'galaxy' }).sort, 'relevance');
  for (const sort of ['stars', 'popularity', 'alphabetical', 'age', 'relevance'])
    assert.equal(searchInput({ sort }).sort, sort);
  assert.throws(() => searchInput({ sort: 'sql' }));
  assert.throws(() => searchInput({ starredBy: 'someone', scope: 'visible' }));
  await assert.rejects(searchTimelines({}, null, { scope: 'starred' }), (e) => e.status === 401);
});
