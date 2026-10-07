// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import pg from 'pg';
import { PostgresStore } from '../server/store.mjs';
import { createApplication } from '../server/http.mjs';
import { demo, validateDocument } from '../dist/core.mjs';
const pool = new pg.Pool(
  process.env.DATABASE_URL ? { connectionString: process.env.DATABASE_URL } : {},
);
const owner = randomUUID(),
  timelines = [];
let app;
try {
  await pool.query(await readFile(new URL('../server/schema.sql', import.meta.url), 'utf8'));
  await pool.query('INSERT INTO oc_users(id,username,email_verified_at) VALUES($1,$2,now())', [
    owner,
    'follow_' + owner.slice(0, 8),
  ]);
  const store = new PostgresStore(pool);
  let doc = validateDocument({
    ...demo(),
    events: Array.from({ length: 20 }, (_, i) => ({
      id: randomUUID(),
      time: `${i}/3`,
      metadata: { title: 'Point ' + i },
    })),
  });
  let timeline = await store.create(owner, doc);
  timelines.push(timeline.id);
  let recent = await store.recent(timeline.id, owner);
  assert.equal(recent.event_generation, '1');
  assert.deepEqual(recent.times, ['19/3', '6/1', '17/3', '16/3', '5/1', '14/3', '13/3', '4/1']);
  assert.deepEqual((await store.recent(timeline.id, owner, 'first')).times, [
    '0/1',
    '1/3',
    '2/3',
    '1/1',
    '4/3',
    '5/3',
    '2/1',
    '7/3',
  ]);
  await assert.rejects(store.recent(timeline.id, null), (e) => e.status === 404);
  doc.events[0].metadata.title = 'Edited';
  doc.events[0].time = '-1/3';
  timeline = await store.save(timeline.id, owner, timeline.revision, doc);
  assert.equal((await store.recent(timeline.id, owner)).event_generation, '1');
  doc.events.shift();
  timeline = await store.save(timeline.id, owner, timeline.revision, doc);
  assert.equal((await store.recent(timeline.id, owner)).event_generation, '1');
  // Same total count, but a different root moment: this still signals an addition.
  doc.events.shift();
  doc.events.push({
    id: randomUUID(),
    time: '10000000000000000000000000000000000000001/3',
    metadata: {},
  });
  timeline = await store.save(timeline.id, owner, timeline.revision, doc);
  assert.equal((await store.recent(timeline.id, owner)).event_generation, '2');
  assert.equal(
    (await store.recent(timeline.id, owner)).times[0],
    '10000000000000000000000000000000000000001/3',
  );
  // Coincident moments do not inflate the result or transmit metadata.
  doc.events.push(
    ...Array.from({ length: 100 }, () => ({
      id: randomUUID(),
      time: '19/3',
      metadata: { notes: 'x'.repeat(2048) },
    })),
  );
  timeline = await store.save(timeline.id, owner, timeline.revision, doc);
  recent = await store.recent(timeline.id, owner);
  assert.equal(recent.times.length, 8);
  assert.equal(new Set(recent.times).size, 8);
  assert(JSON.stringify(recent).length < 512);
  await pool.query("UPDATE oc_timelines SET visibility='public' WHERE id=$1", [timeline.id]);
  app = createApplication({ pool });
  await new Promise((r) => app.listen(0, '127.0.0.1', r));
  const url = `http://127.0.0.1:${app.address().port}/api/timelines/${timeline.id}/recent`;
  const response = await fetch(url);
  assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).times, recent.times);
  assert.equal((await fetch(url + '?direction=invalid')).status, 400);
  let empty = await store.create(owner, validateDocument({ ...demo(), events: [] }));
  timelines.push(empty.id);
  assert.deepEqual((await store.recent(empty.id, owner)).times, []);
  console.log(
    'PostgreSQL follow latest: bounded exact coordinates, additions, authorization, HTTP passed.',
  );
} finally {
  if (app) await new Promise((r) => app.close(r));
  await pool.query('DELETE FROM oc_timelines WHERE id=ANY($1::uuid[])', [timelines]);
  await pool.query('DELETE FROM oc_users WHERE id=$1', [owner]);
  await pool.end();
}
