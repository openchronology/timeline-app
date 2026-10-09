// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
import test from 'node:test';
import assert from 'node:assert/strict';
import { BrowserForks, BROWSER_FORK_LIMITS } from '../server/browser-forks.mjs';
import { boundedJSON } from '../dist/browser-copy.mjs';
const id = '11111111-1111-4111-8111-111111111111';
function fixture(
  overrides = {},
  document = {
    format: 'openchronology',
    version: 1,
    title: 'Example',
    description: '',
    events: [],
  },
) {
  const calls = [],
    rates = [];
  const service = new BrowserForks(
    {
      async revisionDocument(client) {
        return (await client.query('SELECT document FROM oc_snapshots')).rows[0]?.document;
      },
      async transaction(work) {
        return work({
          async query(sql) {
            calls.push(sql);
            if (sql.includes('FROM oc_timelines'))
              return {
                rows: [
                  {
                    revision: '1',
                    event_count: '0',
                    document_bytes: '200',
                    snapshot_id: 'snapshot',
                    head_revision_id: 'saved',
                    ...overrides,
                  },
                ],
              };
            if (sql.startsWith('SELECT document')) return { rows: [{ document }] };
            return { rows: [] };
          },
        });
      },
    },
    {
      async rateLimit(address) {
        rates.push(address);
      },
    },
  );
  return { service, calls, rates, document };
}
test('browser forks reject event and byte budgets before fetching a document', async () => {
  for (const limit of [
    { event_count: '5001' },
    { document_bytes: String(BROWSER_FORK_LIMITS.bytes) },
    { document_bytes: null },
  ]) {
    const { service, calls } = fixture(limit);
    await assert.rejects(
      service.copy(id, undefined, 'client'),
      (e) => e.status === 413 && e.message.includes('Nothing was copied'),
    );
    assert(!calls.some((sql) => sql.startsWith('SELECT document')));
    assert.equal(service.active, 0);
  }
});
test('browser forks require a public saved revision and do not write timeline data', async () => {
  const { service, calls, rates, document } = fixture();
  const result = await service.copy(id, '1', 'client');
  assert.deepEqual(result.document, document);
  assert.equal(result.source.savedRevision, 'saved');
  assert.equal(rates[0], 'browser-fork:client');
  assert(calls.some((sql) => sql.includes("t.visibility='public'")));
  assert(!calls.some((sql) => /INSERT|UPDATE|DELETE/.test(sql)));
  assert(calls.some((sql) => sql.includes('1500ms')));
  await assert.rejects(service.copy(id, '2', 'client'), (e) => e.status === 409);
  const privateService = new BrowserForks(
    { transaction: async (work) => work({ query: async () => ({ rows: [] }) }) },
    { rateLimit: async () => {} },
  );
  await assert.rejects(privateService.copy(id, undefined, 'client'), (e) => e.status === 404);
});
test('concurrent browser copy admission is bounded and recovers after failures', async () => {
  const releases = [];
  const service = new BrowserForks(
    {
      transaction: () =>
        new Promise((resolve) => {
          releases.push(resolve);
        }),
    },
    { rateLimit: async () => {} },
  );
  const pending = Array.from({ length: 4 }, () => service.copy(id, undefined, 'client'));
  await assert.rejects(service.copy(id, undefined, 'client'), (e) => e.status === 429);
  for (const release of releases) release({});
  await Promise.all(pending);
  service.store.transaction = async () => {
    throw new Error('database failure');
  };
  assert.equal(service.active, 0);
  await assert.rejects(service.copy(id, undefined, 'client'), /database failure/);
  assert.equal(service.active, 0);
});
test('browser download caps Content-Length and chunked streams before parsing', async () => {
  assert.deepEqual(await boundedJSON(new Response('{"events":[]}')), { events: [] });
  await assert.rejects(
    boundedJSON(new Response('{}', { headers: { 'content-length': '1000' } }), 10),
    /limit/,
  );
  let cancelled = false;
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(new Uint8Array(20));
    },
    cancel() {
      cancelled = true;
    },
  });
  await assert.rejects(boundedJSON(new Response(stream), 10), /limit/);
  assert(cancelled);
});

test('browser copying limits stacked inspector entries as well as timeline points', async () => {
  const document = {
    events: [
      {
        metadata: {
          stack: Array.from({ length: 5000 }, (_, i) => ({ id: String(i), metadata: {} })),
        },
      },
    ],
  };
  const { service } = fixture({}, document);
  await assert.rejects(service.copy(id, undefined, 'client'), (e) => e.status === 413);
});
