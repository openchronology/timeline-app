// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
import pg from 'pg';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { PostgresStore, backfillEntitySearch } from '../server/store.mjs';
if (!process.env.DATABASE_URL) throw new Error('Use a dedicated PostgreSQL test database.');
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const user = randomUUID();
let timeline;
try {
  await pool.query(await readFile(new URL('../server/schema.sql', import.meta.url), 'utf8'));
  await pool.query('INSERT INTO oc_users(id,username,email_verified_at) VALUES($1,$2,now())', [
    user,
    'search_' + user.slice(0, 8),
  ]);
  const store = new PostgresStore(pool);
  const events = [
    { id: 'late', time: '5/1', metadata: { title: 'Harbor survey', description: 'Later notes' } },
    { id: 'early', time: '1/1', metadata: { title: 'Notes', description: 'A harbour visit' } },
    {
      id: 'stack',
      time: '2/1',
      metadata: {
        title: 'Parent',
        stack: [{ id: 'c', metadata: { title: 'Nested harbor entry' } }],
      },
    },
  ];
  for (let i = 0; i < 30; i++)
    events.push({
      id: 'm' + String(i).padStart(2, '0'),
      time: 10 + i + '/1',
      metadata: { title: 'Filler ' + i, description: 'routine' },
    });
  const doc = {
    format: 'openchronology',
    version: 1,
    title: 'Search',
    description: '',
    events,
    durations: [
      { id: 'span', start: '3/1', end: { moment: 'late' }, metadata: { title: 'Harbor works' } },
    ],
  };
  timeline = await store.create(user, doc);
  const search = (text, page = 1) => store.query(timeline.id, user, { kind: 'search', text, page });
  const found = await search('harbor');
  assert.equal(found.total, '3');
  const ids = found.results.map((r) => r.id);
  // Title matches rank above notes and nested entries; prefixes match ("harbo" → "harbour").
  assert.deepEqual(new Set(ids.slice(0, 2)), new Set(['span', 'late']));
  assert.deepEqual(ids.slice(2), ['stack']);
  assert.deepEqual(
    found.results.find((r) => r.id === 'span'),
    { kind: 'duration', id: 'span', first: '3/1', last: '5/1', title: 'Harbor works', snippet: '' },
  );
  assert.equal((await search('harbo')).total, '4', 'Prefix matching includes "harbour".');
  assert.equal((await search('HARBOR SURVEY')).total, '1');
  const moments = await store.query(timeline.id, user, {
    kind: 'search',
    text: 'harbor',
    page: 1,
    only: 'moment',
  });
  assert.deepEqual(
    moments.results.map((r) => r.kind),
    ['moment', 'moment'],
    'The endpoint selector searches moments only.',
  );
  assert.equal((await search('routine')).results.length, 25);
  assert.equal((await search('routine', 2)).results.length, 5);
  assert.equal((await search(" ' & | ! :* ")).total, '0', 'Operators are not query syntax.');
  // Saves rebuild the search rows, including sparse moves of anchoring moments.
  timeline = await store.save(timeline.id, user, timeline.revision, undefined, {
    settings: { ...doc, events: [], durations: undefined },
    changes: [{ id: 'late', event: { ...events[0], time: '9/1' } }],
    durationChanges: [
      {
        id: 'quay',
        duration: { id: 'quay', start: '0/1', end: '1/2', metadata: { title: 'Quay' } },
      },
    ],
  });
  assert.equal((await search('works')).results[0].last, '9/1');
  assert.equal((await search('quay')).results[0].kind, 'duration');
  // A search pinned to an outdated revision is refused, like other viewport queries.
  await assert.rejects(
    store.query(timeline.id, user, { kind: 'search', text: 'x', page: 1, revision: '0' }),
    /changed/,
  );
  // Timelines saved before entity search existed are indexed by the migration.
  await pool.query('DELETE FROM oc_entity_search WHERE timeline_id=$1', [timeline.id]);
  await pool.query('UPDATE oc_timelines SET search_version=0 WHERE id=$1', [timeline.id]);
  const client = await pool.connect();
  try {
    assert((await backfillEntitySearch(client)) >= 1);
  } finally {
    client.release();
  }
  assert.equal((await search('harbor')).total, '3');
  console.log(
    'PASS PostgreSQL search: ranked prefix matching over moments, stacks and durations, pages, rebuild on save and backfill.',
  );
} finally {
  if (timeline) await pool.query('DELETE FROM oc_timelines WHERE id=$1', [timeline.id]);
  await pool.query('DELETE FROM oc_users WHERE id=$1', [user]);
  await pool.end();
}
