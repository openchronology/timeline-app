// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
import pg from 'pg';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { PostgresStore } from '../server/store.mjs';
import { TimelineIndex, Viewport, Q } from '../dist/core.mjs';
if (!process.env.DATABASE_URL) throw new Error('Use a dedicated PostgreSQL test database.');
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const user = randomUUID();
let timeline;
try {
  await pool.query(await readFile(new URL('../server/schema.sql', import.meta.url), 'utf8'));
  await pool.query('INSERT INTO oc_users(id,username,email_verified_at) VALUES($1,$2,now())', [
    user,
    'durations_' + user.slice(0, 8),
  ]);
  const store = new PostgresStore(pool);
  const doc = {
    format: 'openchronology',
    version: 1,
    title: 'Intervals',
    description: '',
    events: [],
  };
  for (let i = 0; i < 300; i++)
    doc.events.push(
      {
        id: 'a' + i,
        time: '-100/1',
        metadata: {
          durations: [{ id: 'd' + i, endId: 'b' + i, metadata: { title: 'Span ' + i } }],
        },
      },
      { id: 'b' + i, time: '100/1', metadata: {} },
    );
  timeline = await store.create(user, doc);
  const target = await store.query(timeline.id, user, {
    kind: 'events',
    id: 'a299',
    lower: '-100/1',
    upper: '-100/1',
    limit: 1,
  });
  assert.equal(
    target.events[0].id,
    'a299',
    'A duration endpoint resolves by ID beyond the first page of coincident moments.',
  );
  const query = { kind: 'overview', lower: '0/1', upper: '1/1', threshold: '0/1' };
  const frame = await store.query(timeline.id, user, query);
  assert.equal(frame.groups.length, 0);
  assert.equal(frame.durations.length, 256);
  assert(frame.durationsTruncated);
  assert(frame.durations.every((b) => b.first === '-100/1' && b.last === '100/1'));
  assert.equal(
    (await store.query(timeline.id, user, { ...query, lower: '200/1', upper: '201/1' })).durations
      .length,
    0,
  );
  const small = { ...doc, events: doc.events.slice(0, 2) };
  timeline = await store.save(timeline.id, user, timeline.revision, small);
  const expected = new TimelineIndex(small).frame(new Viewport(Q.zero, Q.one), 1000).durations;
  assert.deepEqual((await store.query(timeline.id, user, query)).durations, expected);
  timeline = await store.save(timeline.id, user, timeline.revision, undefined, {
    settings: { ...small, events: [] },
    changes: [{ id: 'b0', event: { ...small.events[1], time: '1/3' } }],
  });
  assert.equal((await store.query(timeline.id, user, query)).durations[0].last, '1/3');
  const checkpoint = timeline.head_revision_id;
  timeline = await store.save(timeline.id, user, timeline.revision, undefined, {
    settings: { ...small, events: [] },
    changes: [{ id: 'b0', event: null }],
  });
  assert.equal((await store.query(timeline.id, user, query)).durations.length, 0);
  assert.equal(
    (await store.snapshot(timeline.id, user)).document.events[0].metadata.durations.length,
    0,
  );
  assert.equal(
    (
      await pool.query(
        'SELECT s.document FROM oc_revisions r JOIN oc_snapshots s ON s.id=r.snapshot_id WHERE r.id=$1',
        [checkpoint],
      )
    ).rows[0].document.events[0].metadata.durations.length,
    1,
  );
  const invalid = {
    ...small.events[0],
    metadata: { durations: [{ id: 'bad', endId: 'absent', metadata: {} }] },
  };
  await assert.rejects(
    store.save(timeline.id, user, timeline.revision, undefined, {
      settings: { ...small, events: [] },
      changes: [{ id: 'a0', event: invalid }],
    }),
    /existing/,
  );
  assert.equal((await store.query(timeline.id, user, query)).durations.length, 0);
  console.log(
    'PASS PostgreSQL durations: exact interval pruning, bounded frames, sparse moves/deletion, immutable history and invalid-link rollback.',
  );
} finally {
  if (timeline) await pool.query('DELETE FROM oc_timelines WHERE id=$1', [timeline.id]);
  await pool.query('DELETE FROM oc_users WHERE id=$1', [user]);
  await pool.end();
}
