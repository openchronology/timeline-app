// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
import pg from 'pg';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { PostgresStore, convertLegacyDurations } from '../server/store.mjs';
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
    durations: [],
  };
  for (let i = 0; i < 300; i++) {
    doc.events.push(
      { id: 'a' + i, time: '-100/1', metadata: {} },
      { id: 'b' + i, time: '100/1', metadata: {} },
    );
    doc.durations.push({
      id: 'd' + String(i).padStart(3, '0'),
      start: { moment: 'a' + i },
      end: { moment: 'b' + i },
      metadata: { title: 'Span ' + i, color: '#aa0000', notes: { long: true } },
    });
  }
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
  // Viewport bands carry short plugin fields but not arbitrary metadata.
  assert.deepEqual(frame.durations[0].metadata, {
    title: frame.durations[0].metadata.title,
    color: '#aa0000',
  });
  assert.deepEqual(
    (await store.query(timeline.id, user, { kind: 'duration', id: 'd299' })).duration,
    doc.durations[299],
  );
  assert.equal(
    (await store.query(timeline.id, user, { ...query, lower: '200/1', upper: '201/1' })).durations
      .length,
    0,
  );
  const small = {
    ...doc,
    events: doc.events.slice(0, 2),
    durations: [doc.durations[0], { id: 'fixed', start: '-5/1', end: '1/3', metadata: {} }],
  };
  timeline = await store.save(timeline.id, user, timeline.revision, small);
  const expected = new TimelineIndex(small).frame(new Viewport(Q.zero, Q.one), 1000).durations;
  const sorted = (bands) => [...bands].sort((a, b) => a.id.localeCompare(b.id));
  assert.deepEqual(
    sorted((await store.query(timeline.id, user, query)).durations),
    sorted(expected),
  );
  const settings = { ...small, events: [], durations: undefined };
  const band = async (id) =>
    (await store.query(timeline.id, user, query)).durations.find((b) => b.id === id);
  timeline = await store.save(timeline.id, user, timeline.revision, undefined, {
    settings,
    changes: [{ id: 'b0', event: { ...small.events[1], time: '1/3' } }],
  });
  assert.equal((await band('d000')).last, '1/3');
  const checkpoint = timeline.head_revision_id;
  // Deleting an anchoring moment pins the duration at its last saved time.
  timeline = await store.save(timeline.id, user, timeline.revision, undefined, {
    settings,
    changes: [{ id: 'b0', event: null }],
    durationChanges: [
      { id: 'fixed', duration: null },
      { id: 'new', duration: { id: 'new', start: '1/4', end: { moment: 'a0' }, metadata: {} } },
    ],
  });
  assert.equal((await band('d000')).last, '1/3');
  assert.equal(await band('fixed'), undefined);
  assert.equal((await band('new')).first, '-100/1');
  const snapshot = (await store.snapshot(timeline.id, user)).document;
  assert.equal(snapshot.durations.find((d) => d.id === 'd000').end, '1/3');
  assert.deepEqual(
    (await store.revisionDocument(pool, checkpoint)).durations.find((d) => d.id === 'd000').end,
    { moment: 'b0' },
  );
  await assert.rejects(
    store.save(timeline.id, user, timeline.revision, undefined, {
      settings,
      changes: [],
      durationChanges: [
        {
          id: 'bad',
          duration: { id: 'bad', start: { moment: 'absent' }, end: '1/1', metadata: {} },
        },
      ],
    }),
    /existing moments/,
  );
  assert.equal((await store.query(timeline.id, user, query)).durations.length, 2);
  // Legacy rows: links stored in moment metadata convert when the server rebuilds the index.
  const legacy = {
    format: 'openchronology',
    version: 1,
    title: 'Legacy',
    description: '',
    events: [
      {
        id: 'x',
        time: '-1/1',
        metadata: { durations: [{ id: 'old', endId: 'y', metadata: { title: 'Old' } }] },
      },
      { id: 'y', time: '1/1', metadata: {} },
    ],
  };
  const old = await store.create(user, legacy);
  try {
    // Recreate the pre-migration shape: links in moment metadata, rows without definitions.
    await pool.query('UPDATE oc_duration_nodes SET definition=NULL WHERE timeline_id=$1', [old.id]);
    await pool.query(
      `UPDATE oc_moments SET event=jsonb_set(event,'{metadata,durations}',$2::jsonb) WHERE timeline_id=$1 AND id='x'`,
      [old.id, JSON.stringify(legacy.events[0].metadata.durations)],
    );
    const before = (await pool.query('SELECT updated_at FROM oc_timelines WHERE id=$1', [old.id]))
      .rows[0].updated_at;
    const client = await pool.connect();
    try {
      assert((await convertLegacyDurations(client)) >= 1);
    } finally {
      client.release();
    }
    const after = await pool.query(
      `SELECT t.updated_at,(SELECT count(*) FROM oc_moments m WHERE m.timeline_id=t.id AND m.event->'metadata' ? 'durations') AS links FROM oc_timelines t WHERE t.id=$1`,
      [old.id],
    );
    assert.equal(after.rows[0].links, '0');
    assert.deepEqual(
      after.rows[0].updated_at,
      before,
      'Migration does not reorder recent timelines.',
    );
    assert.deepEqual((await store.query(old.id, user, { kind: 'duration', id: 'old' })).duration, {
      id: 'old',
      start: { moment: 'x' },
      end: { moment: 'y' },
      metadata: { title: 'Old' },
    });
  } finally {
    await pool.query('DELETE FROM oc_timelines WHERE id=$1', [old.id]);
  }
  console.log(
    'PASS PostgreSQL durations: standalone definitions, anchored and fixed endpoints, bounded frames, sparse edits, pinned deletions, immutable history and legacy conversion.',
  );
} finally {
  if (timeline) await pool.query('DELETE FROM oc_timelines WHERE id=$1', [timeline.id]);
  await pool.query('DELETE FROM oc_users WHERE id=$1', [user]);
  await pool.end();
}
