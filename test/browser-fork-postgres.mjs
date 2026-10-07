// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
import assert from 'node:assert/strict';
import pg from 'pg';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { PostgresStore } from '../server/store.mjs';
import { Auth } from '../server/auth.mjs';
import { BrowserForks } from '../server/browser-forks.mjs';
import { SEED_TIMELINES } from '../server/seed-data.mjs';
if (!process.env.DATABASE_URL) throw new Error('Use a dedicated test database.');
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const owner = randomUUID(),
  ids = [];
const store = new PostgresStore(pool),
  auth = new Auth(pool, 'http://localhost:5173');
const copies = new BrowserForks(store, auth);
try {
  await pool.query(await readFile(new URL('../server/schema.sql', import.meta.url), 'utf8'));
  await pool.query('INSERT INTO oc_users(id,username) VALUES($1,$2)', [
    owner,
    'browser_copy_' + owner.slice(0, 8),
  ]);
  const document = structuredClone(SEED_TIMELINES[0].document);
  const timeline = await store.create(owner, document);
  ids.push(timeline.id);
  await assert.rejects(copies.copy(timeline.id, undefined, 'test-client'), (e) => e.status === 404);
  await pool.query("UPDATE oc_timelines SET visibility='public' WHERE id=$1", [timeline.id]);
  // Upgrade a legacy unmeasured snapshot while preserving immutable documents.
  const legacySnapshot = randomUUID();
  await pool.query('INSERT INTO oc_snapshots(id,document) VALUES($1,$2::jsonb)', [
    legacySnapshot,
    JSON.stringify(document),
  ]);
  await pool.query(await readFile(new URL('../server/schema.sql', import.meta.url), 'utf8'));
  const measured = (
    await pool.query('SELECT document,document_bytes FROM oc_snapshots WHERE id=$1', [
      legacySnapshot,
    ])
  ).rows[0];
  assert.deepEqual(measured.document, document);
  assert(Number(measured.document_bytes) >= Buffer.byteLength(JSON.stringify(document)));
  await assert.rejects(
    pool.query("UPDATE oc_snapshots SET document='{}'::jsonb WHERE id=$1", [legacySnapshot]),
    /immutable/,
  );
  await pool.query('DELETE FROM oc_snapshots WHERE id=$1', [legacySnapshot]);
  const result = await copies.copy(timeline.id, timeline.revision, 'test-client');
  assert.deepEqual(result.document, document);
  assert.equal(result.source.savedRevision, timeline.head_revision_id);
  assert.equal((await store.access(timeline.id, owner)).revision, timeline.revision);
  assert.equal(
    (await pool.query('SELECT count(*) AS count FROM oc_timelines WHERE owner_id=$1', [owner]))
      .rows[0].count,
    '1',
  );
  await assert.rejects(copies.copy(timeline.id, '999', 'test-client'), (e) => e.status === 409);
  const large = {
    ...document,
    events: Array.from({ length: 5001 }, (_, i) => ({
      id: 'e-' + i,
      time: i + '/1',
      metadata: {},
    })),
  };
  const crowded = await store.create(owner, large);
  ids.push(crowded.id);
  await pool.query("UPDATE oc_timelines SET visibility='public' WHERE id=$1", [crowded.id]);
  await assert.rejects(copies.copy(crowded.id, undefined, 'test-client'), (e) => e.status === 413);
  const bytes = {
    ...document,
    events: [
      { id: 'oversized', time: '0/1', metadata: { description: 'x'.repeat(4 * 1024 * 1024) } },
    ],
  };
  const bulky = await store.create(owner, bytes);
  ids.push(bulky.id);
  await pool.query("UPDATE oc_timelines SET visibility='public' WHERE id=$1", [bulky.id]);
  await assert.rejects(copies.copy(bulky.id, undefined, 'test-client'), (e) => e.status === 413);
  // Admission uses existing auth rate limits and cannot be bypassed by repeating downloads.
  for (let i = 0; i < 10; i++) await copies.copy(timeline.id, undefined, 'rate-client');
  await assert.rejects(copies.copy(timeline.id, undefined, 'rate-client'), (e) => e.status === 429);
  console.log(
    'PASS PostgreSQL browser copying: public ACL, immutable data, no persistent fork, event/byte budgets, revision checks and rate limits.',
  );
} finally {
  for (const id of ids) {
    await pool.query('DELETE FROM oc_timelines WHERE id=$1', [id]);
    await store.transaction((client) => store.removeHistory(client, id));
  }
  await pool.query('DELETE FROM oc_users WHERE id=$1', [owner]);
  await pool.end();
}
