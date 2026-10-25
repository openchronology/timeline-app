// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// Shifting and scaling a server timeline's times for good (#96): everything, or what a tag or
// relationship filter selects, as one revision, streaming its progress; durations' fixed ends
// move and ends that follow a moment follow it.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { Auth, passwordHash } from '../server/auth.mjs';
import { createApplication } from '../server/http.mjs';
import { PostgresStore } from '../server/store.mjs';
import { mapTimes } from '../server/time-map.mjs';
import { timeMapping } from '../dist/core.mjs';
if (!process.env.DATABASE_URL) throw new Error('Use a dedicated PostgreSQL test database.');
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
await pool.query(await readFile(new URL('../server/schema.sql', import.meta.url), 'utf8'));
const app = createApplication({ pool });
await new Promise((resolve) => app.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${app.address().port}`,
  owner = randomUUID(),
  reader = randomUUID();
let headers = {},
  readerHeaders = {};
async function request(path, method = 'GET', data, as = headers, expected = 200) {
  const response = await fetch(origin + '/api/' + path, {
    method,
    headers: { ...as, ...(data ? { 'Content-Type': 'application/json' } : {}) },
    ...(data ? { body: JSON.stringify(data) } : {}),
  });
  const value = await response.json();
  assert.equal(response.status, expected, `${method} ${path}: ${JSON.stringify(value)}`);
  return value;
}
/** Maps over HTTP; the streamed lines, the last of which is the result. */
async function map(id, data, as = headers) {
  const response = await fetch(`${origin}/api/timelines/${id}/map-times`, {
    method: 'POST',
    headers: { ...as, Accept: 'application/x-ndjson', 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  const text = await response.text();
  if (response.status !== 200) return { status: response.status, error: JSON.parse(text) };
  assert.match(response.headers.get('content-type'), /ndjson/);
  return {
    status: 200,
    lines: text
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line)),
  };
}
const times = async (id) => {
  const { document } = await request(`timelines/${id}/document`);
  return {
    moments: Object.fromEntries(document.events.map((e) => [e.id, e.time])),
    durations: Object.fromEntries((document.durations ?? []).map((d) => [d.id, [d.start, d.end]])),
  };
};
try {
  const auth = new Auth(pool, origin);
  for (const [id, name] of [
    [owner, 'shifter'],
    [reader, 'onlooker'],
  ])
    await pool.query(
      'INSERT INTO oc_users(id,username,email,email_verified_at,password_hash,quota_bypass,terms_version) VALUES($1,$2,$3,now(),$4,true,oc_policy_version())',
      [
        id,
        `${name}_${id.slice(0, 8)}`,
        `${name}_${id.slice(0, 8)}@example.test`,
        await passwordHash('x'.repeat(20)),
      ],
    );
  const sign = async (id) => {
    const issued = await auth.issue(
      (await pool.query('SELECT * FROM oc_users WHERE id=$1', [id])).rows[0],
    );
    return { Cookie: issued.cookie.split(';')[0], 'X-CSRF-Token': issued.csrf };
  };
  headers = await sign(owner);
  readerHeaders = await sign(reader);
  const created = await request(
    'timelines',
    'POST',
    {
      format: 'openchronology',
      version: 1,
      title: 'Shifted',
      description: '',
      events: [
        { id: 'a', time: '10/1', metadata: { title: 'A', tags: ['war'] } },
        { id: 'b', time: '20/1', metadata: { title: 'B' } },
        { id: 'c', time: '30/1', metadata: { title: 'C', tags: ['war'] } },
        { id: 'd', time: '1/3', metadata: { title: 'D' } },
      ],
      durations: [
        // Fixed at both ends; following a moment at its start; following moments at both.
        { id: 'fixed', start: '10/1', end: '40/1', metadata: { title: 'Fixed', tags: ['war'] } },
        { id: 'half', start: { moment: 'b' }, end: '50/1', metadata: { title: 'Half' } },
        { id: 'anchored', start: { moment: 'a' }, end: { moment: 'c' }, metadata: { title: 'X' } },
      ],
      relationships: [{ a: { moment: 'b' }, b: { moment: 'd' } }],
    },
    headers,
    201,
  );
  await request(`timelines/${created.id}/members`, 'POST', {
    username: `onlooker_${reader.slice(0, 8)}`,
    role: 'viewer',
  });
  let revision = (await request(`timelines/${created.id}`)).revision;
  const revisions = async () =>
    Number(
      (await pool.query('SELECT count(*) FROM oc_revisions WHERE timeline_id=$1', [created.id]))
        .rows[0].count,
    );

  // Refused before anything streams: bad scale, an old revision, a reader.
  assert.equal(
    (await map(created.id, { revision, mapping: { scale: '0', offset: '0' } })).status,
    400,
  );
  assert.equal(
    (await map(created.id, { revision: '0', mapping: { scale: '1', offset: '5' } })).status,
    409,
  );
  assert.equal(
    (await map(created.id, { revision, mapping: { scale: '1', offset: '5' } }, readerHeaders))
      .status,
    403,
  );

  // Only what is tagged: moments a and c, and the fixed duration, shift 5 later.
  const before = await revisions();
  let result = await map(created.id, {
    revision,
    mapping: { scale: '1', offset: '5' },
    filter: { tags: ['war'], mode: 'any' },
  });
  assert.deepEqual(result.lines[0], { progress: { reading: true } });
  const last = result.lines.at(-1);
  assert.deepEqual(last.result.moved, { moments: 2, durations: 1 });
  assert(result.lines.some((line) => line.progress?.total === 3));
  assert.deepEqual(await times(created.id), {
    moments: { a: '15/1', b: '20/1', c: '35/1', d: '1/3' },
    durations: {
      fixed: ['15/1', '45/1'],
      half: [{ moment: 'b' }, '50/1'],
      anchored: [{ moment: 'a' }, { moment: 'c' }],
    },
  });
  assert.equal(await revisions(), before + 1, 'One revision.');
  revision = last.result.timeline.revision;

  // Everything: twice as far from 20, then 1 later. Exact rationals throughout.
  result = await map(created.id, {
    revision,
    mapping: { scale: '2', offset: '1', around: '20' },
  });
  assert.deepEqual(result.lines.at(-1).result.moved, { moments: 4, durations: 2 });
  assert.deepEqual(await times(created.id), {
    moments: { a: '11/1', b: '21/1', c: '51/1', d: '-55/3' },
    durations: {
      fixed: ['11/1', '71/1'],
      half: [{ moment: 'b' }, '81/1'],
      anchored: [{ moment: 'a' }, { moment: 'c' }],
    },
  });
  revision = result.lines.at(-1).result.timeline.revision;

  // What is related to b: b and d (and nothing else) move back 1; decimals are exact.
  result = await map(created.id, {
    revision,
    mapping: { scale: '1', offset: '-0.5' },
    filter: { related: { moment: 'b' }, depth: 'direct', mode: 'any' },
  });
  assert.deepEqual(result.lines.at(-1).result.moved, { moments: 2, durations: 0 });
  const now = await times(created.id);
  assert.deepEqual(now.moments, { a: '11/1', b: '41/2', c: '51/1', d: '-113/6' });
  revision = result.lines.at(-1).result.timeline.revision;

  // Without asking for progress (as the desktop app's client does), one JSON reply.
  const plain = await request(`timelines/${created.id}/map-times`, 'POST', {
    revision,
    mapping: { scale: '1', offset: '1' },
    filter: { tags: ['nothing-has-this'], mode: 'any' },
  });
  assert.deepEqual(plain.moved, { moments: 0, durations: 0 });
  // A mapping that changes nothing saves nothing.
  const unchanged = await revisions();
  result = await map(created.id, { revision, mapping: { scale: '1', offset: '0' } });
  assert.deepEqual(result.lines.at(-1).result.moved, { moments: 0, durations: 0 });
  assert.equal(await revisions(), unchanged);

  // Large ones are applied a slice at a time, still as one revision, telling how far it got.
  const store = new PostgresStore(pool);
  store.patchSlice = 2;
  const t = await store.access(created.id, owner);
  const progress = [];
  const direct = await mapTimes(
    store,
    t,
    owner,
    { revision, mapping: timeMapping({ scale: '1', offset: '100' }), filter: null },
    (p) => progress.push(p),
  );
  assert.deepEqual(direct.moved, { moments: 4, durations: 2 });
  assert.deepEqual(
    progress.map((p) => p.done),
    [0, 2, 4, 6],
  );
  assert(progress.every((p) => p.total === 6));
  assert.equal(await revisions(), unchanged + 1);
  assert.equal((await times(created.id)).moments.a, '111/1');
  console.log('PASS time mapping: everything or a filter, one revision, streamed progress.');
} finally {
  await pool.query('DELETE FROM oc_timelines WHERE owner_id=ANY($1::uuid[])', [[owner, reader]]);
  await pool.query('DELETE FROM oc_users WHERE id=ANY($1::uuid[])', [[owner, reader]]);
  app.close();
  await pool.end();
}
