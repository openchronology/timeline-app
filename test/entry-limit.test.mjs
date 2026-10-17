// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// The entry limit (#129): validation follows the server’s limit, and a document too large for
// PostgreSQL is refused before it reaches the database.
import test from 'node:test';
import assert from 'node:assert/strict';
import { validateDocument, entryLimit, setEntryLimit, DEFAULT_ENTRY_LIMIT } from '../dist/core.mjs';

const document = (moments, durations = 0, relationships = 0) => ({
  format: 'openchronology',
  version: 1,
  title: 'Limits',
  description: '',
  events: Array.from({ length: moments }, (_, i) => ({
    id: 'm' + i,
    time: String(i),
    metadata: { title: 'M' + i },
  })),
  durations: Array.from({ length: durations }, (_, i) => ({
    id: 'd' + i,
    start: '0',
    end: String(i + 1),
    metadata: {},
  })),
  relationships: Array.from({ length: relationships }, (_, i) => ({
    a: { moment: 'm0' },
    b: { moment: 'm' + (i + 1) },
  })),
});

test('validation follows the entry limit a server sets (#129)', (t) => {
  t.after(() => setEntryLimit(DEFAULT_ENTRY_LIMIT));
  assert.equal(entryLimit(), 200000);
  setEntryLimit(3);
  assert.equal(validateDocument(document(3, 3, 2)).events.length, 3);
  assert.throws(() => validateDocument(document(4)), /A timeline holds at most 3 moments\./);
  assert.throws(() => validateDocument(document(3, 4)), /Use at most 3 durations per timeline\./);
  assert.throws(() => validateDocument(document(5, 0, 4)), /A timeline holds at most 3 moments\./);
  setEntryLimit(1000);
  assert.throws(
    () => validateDocument(document(6, 0, 1001)),
    /Use at most 1,000 relationships per timeline\./,
  );
  setEntryLimit(Infinity);
  assert.equal(validateDocument(document(5, 5, 4)).relationships.length, 4);
  // Every copy of the module in a process (the platform's bundles) shares it.
  assert.equal(globalThis[Symbol.for('openchronology.entryLimit')], Infinity);
  for (const value of [0, -1, 2.5, NaN, 2 ** 53])
    assert.throws(() => setEntryLimit(value), RangeError, String(value));
});

test('a whole document too large for PostgreSQL is refused with a reason, before the database', async () => {
  const { PostgresStore, SNAPSHOT_BYTES } = await import('../server/store.mjs');
  const store = new PostgresStore(null),
    queries = [];
  const client = { query: async (sql) => (queries.push(sql), { rows: [] }) };
  const note = 'x'.repeat(19000);
  const big = document(Math.ceil(SNAPSHOT_BYTES / note.length) + 1);
  for (const event of big.events) event.metadata.description = note;
  await assert.rejects(
    store.recordRevision(client, 'timeline', 'user', big, 'save'),
    (error) => error.status === 413 && /too large \(over 200 MB\)/.test(error.message),
  );
  assert.equal(queries.length, 0);
  await store.recordRevision(client, 'timeline', 'user', document(3), 'save');
  assert.equal(queries.length, 2);
});
