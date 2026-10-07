// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import pg from 'pg';
import { PostgresStore } from '../server/store.mjs';
import { searchTimelines } from '../server/collaboration.mjs';
import { liveResponse, TimelineNotifications } from '../server/live.mjs';
if (!process.env.DATABASE_URL) throw new Error('Use a dedicated PostgreSQL test database.');
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL }),
  store = new PostgresStore(pool),
  notifications = new TimelineNotifications(pool);
const users = [randomUUID(), randomUUID(), randomUUID()],
  timelines = [];
let reader;
try {
  await pool.query(await readFile(new URL('../server/schema.sql', import.meta.url), 'utf8'));
  for (const id of users)
    await pool.query('INSERT INTO oc_users(id,username) VALUES($1,$2)', [
      id,
      'compare_' + id.slice(0, 8),
    ]);
  for (const [i, owner] of [users[0], users[1], users[2]].entries()) {
    const timeline = await store.create(owner, {
      format: 'openchronology',
      version: 1,
      title: 'Compare fixture ' + i,
      description: '',
      events: [{ id: 'one', time: '1/3', metadata: { title: 'One' } }],
    });
    timelines.push(timeline.id);
  }
  await pool.query("UPDATE oc_timelines SET visibility='public' WHERE id=$1", [timelines[0]]);
  await pool.query("INSERT INTO oc_members(timeline_id,user_id,role) VALUES($1,$2,'viewer')", [
    timelines[1],
    users[0],
  ]);
  const visible = await searchTimelines(pool, users[0], {
    scope: 'visible',
    search: 'Compare fixture',
  });
  assert(visible.timelines.some((t) => t.id === timelines[0]));
  assert(visible.timelines.some((t) => t.id === timelines[1]));
  assert(!visible.timelines.some((t) => t.id === timelines[2]));
  const guest = await searchTimelines(pool, null, { scope: 'visible', search: 'Compare fixture' });
  assert(guest.timelines.some((t) => t.id === timelines[0]));
  assert(!guest.timelines.some((t) => t.id === timelines[1]));
  const services = {
    pool,
    store,
    notifications,
    origin: 'http://localhost',
    auth: { session: async () => ({ id: users[0] }) },
  };
  const response = await liveResponse(
    new Request('http://localhost/api/live?timelines=' + timelines[1]),
    services,
  );
  reader = response.body.getReader();
  assert.match(new TextDecoder().decode((await reader.read()).value), /event: revision/);
  const original = await store.access(timelines[1], users[1]);
  await store.save(timelines[1], users[1], original.revision, {
    format: 'openchronology',
    version: 1,
    title: 'Updated comparison fixture',
    description: '',
    events: [{ id: 'new', time: '2/3', metadata: { title: 'New' } }],
  });
  const update = await Promise.race([
    reader.read(),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Missing live notification')), 5000),
    ),
  ]);
  assert.match(new TextDecoder().decode(update.value), /"revision":"2"/);
  await pool.query('DELETE FROM oc_members WHERE timeline_id=$1 AND user_id=$2', [
    timelines[1],
    users[0],
  ]);
  assert.match(new TextDecoder().decode((await reader.read()).value), /event: access/);
  console.log(
    'Comparison visibility and committed live notifications passed against PostgreSQL/pgmp.',
  );
} finally {
  await reader?.cancel().catch(() => {});
  notifications.close();
  for (const id of timelines) await pool.query('DELETE FROM oc_timelines WHERE id=$1', [id]);
  for (const id of users) await pool.query('DELETE FROM oc_users WHERE id=$1', [id]);
  await pool.end();
}
