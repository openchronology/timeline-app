// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// Measures on a server timeline (#572): declarations saved with its settings and kept by
// forks, exports and history; values checked by whole and sparse saves; and renaming,
// removing or narrowing a measure only through POST /measures, which rewrites the values as
// one revision.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { Auth, passwordHash } from '../server/auth.mjs';
import { createApplication } from '../server/http.mjs';
import { PostgresStore } from '../server/store.mjs';
import { changeMeasures } from '../server/measure-change.mjs';
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
const MEASURES = { cost: { type: 'mpz', label: 'Cost' }, hours: { type: 'mpq' } };
const SETTINGS = { format: 'openchronology', version: 1, title: 'Invoices', description: '' };
const values = async (id) => {
  const { document } = await request(`timelines/${id}/document`);
  return {
    measures: document.measures,
    moments: Object.fromEntries(document.events.map((e) => [e.id, e.metadata.measures])),
    durations: Object.fromEntries(
      (document.durations ?? []).map((d) => [d.id, d.metadata.measures]),
    ),
  };
};
try {
  const auth = new Auth(pool, origin);
  for (const [id, name] of [
    [owner, 'measurer'],
    [reader, 'watcher'],
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

  // A value the timeline doesn't declare is refused when it is created.
  await request(
    'timelines',
    'POST',
    {
      ...SETTINGS,
      events: [{ id: 'a', time: '1/1', metadata: { measures: { cost: '5' } } }],
    },
    headers,
    400,
  );
  const created = await request(
    'timelines',
    'POST',
    {
      ...SETTINGS,
      measures: MEASURES,
      events: [
        {
          id: 'a',
          time: '1/1',
          metadata: { title: 'A', measures: { cost: '1250', hours: '3/2' } },
        },
        { id: 'b', time: '2/1', metadata: { title: 'B', measures: { hours: '0.25' } } },
        { id: 'c', time: '3/1', metadata: { title: 'C', measures: { cost: '0' } } },
      ],
      durations: [
        { id: 'd', start: '1/1', end: '5/1', metadata: { title: 'D', measures: { cost: '40' } } },
      ],
    },
    headers,
    201,
  );
  const id = created.id;
  await request(`timelines/${id}/members`, 'POST', {
    username: `watcher_${reader.slice(0, 8)}`,
    role: 'viewer',
  });
  // Stored canonically, zeros left out; the declarations come back with the metadata.
  assert.deepEqual(await values(id), {
    measures: MEASURES,
    moments: { a: { cost: '1250', hours: '3/2' }, b: { hours: '1/4' }, c: undefined },
    durations: { d: { cost: '40' } },
  });
  let timeline = await request(`timelines/${id}`);
  assert.deepEqual(timeline.measures, MEASURES);

  // Sparse saves: values checked by the settings they send.
  const save = (body, expected = 200) =>
    request(`timelines/${id}/changes`, 'PUT', body, headers, expected);
  const settings = { ...SETTINGS, measures: MEASURES };
  let refused = await save(
    {
      revision: timeline.revision,
      settings,
      changes: [
        { id: 'b', event: { id: 'b', time: '2/1', metadata: { measures: { cost: '1/2' } } } },
      ],
    },
    400,
  );
  assert.match(refused.error, /cost is a whole number/);
  refused = await save(
    {
      revision: timeline.revision,
      settings,
      durationChanges: [
        {
          id: 'd',
          duration: { id: 'd', start: '1/1', end: '5/1', metadata: { measures: { tips: '1' } } },
        },
      ],
      changes: [],
    },
    400,
  );
  assert.match(refused.error, /declares no measure named tips/);
  timeline = await save({
    revision: timeline.revision,
    settings: { ...SETTINGS, measures: { ...MEASURES, tips: { type: 'mpz' } } },
    changes: [
      {
        id: 'b',
        event: { id: 'b', time: '2/1', metadata: { title: 'B', measures: { tips: '3' } } },
      },
    ],
  });
  assert.deepEqual((await values(id)).moments.b, { tips: '3' });
  // Widening and relabelling are plain settings changes.
  const widened = {
    cost: { type: 'mpq', label: 'Cost' },
    hours: { type: 'mpq', label: 'Hours' },
    tips: { type: 'mpz' },
  };
  timeline = await save({
    revision: timeline.revision,
    settings: { ...SETTINGS, measures: widened },
    changes: [],
  });
  assert.deepEqual((await values(id)).measures, widened);
  // Removing, renaming or narrowing one is not: it would leave values it no longer allows.
  for (const measures of [
    { cost: widened.cost, hours: widened.hours },
    { price: widened.cost, hours: widened.hours, tips: widened.tips },
    { ...widened, hours: { type: 'mpz' } },
  ]) {
    refused = await save(
      { revision: timeline.revision, settings: { ...SETTINGS, measures }, changes: [] },
      409,
    );
    assert.match(refused.error, /POST \/api\/timelines\/\{id\}\/measures/);
  }

  // POST /measures: renames move values, removals drop them, as one revision.
  const revisions = async () =>
    Number(
      (await pool.query('SELECT count(*) FROM oc_revisions WHERE timeline_id=$1', [id])).rows[0]
        .count,
    );
  const before = await revisions();
  const change = (body, as = headers, expected = 200) =>
    request(`timelines/${id}/measures`, 'POST', body, as, expected);
  await change({ revision: timeline.revision, measures: {} }, readerHeaders, 403);
  await change({ revision: '0', measures: {} }, headers, 409);
  await change({ revision: timeline.revision, measures: { Bad: { type: 'mpz' } } }, headers, 400);
  await change(
    { revision: timeline.revision, measures: widened, renames: { nope: 'cost' } },
    headers,
    400,
  );
  // Narrowing hours is refused while a value is a fraction, naming it.
  refused = await change(
    { revision: timeline.revision, measures: { ...widened, hours: { type: 'mpz' } } },
    headers,
    409,
  );
  assert.match(refused.error, /hours can't become whole numbers while moment a has 3\/2\./);
  let result = await change({
    revision: timeline.revision,
    measures: { price: widened.cost, hours: widened.hours },
    renames: { cost: 'price' },
  });
  assert.deepEqual(result.changed, { moments: 2, durations: 1 });
  assert.deepEqual(await values(id), {
    measures: { price: widened.cost, hours: widened.hours },
    moments: { a: { price: '1250', hours: '3/2' }, b: undefined, c: undefined },
    durations: { d: { price: '40' } },
  });
  assert.equal(await revisions(), before + 1, 'One revision.');
  timeline = result.timeline;
  assert.deepEqual(timeline.measures, { price: widened.cost, hours: widened.hours });

  // A copy (sharing its index, as a fork does) carries the declarations and values.
  const fork = await request(
    `timelines/${id}/duplicate`,
    'POST',
    { revision: timeline.revision },
    headers,
    201,
  );
  assert.deepEqual((await values(fork.id)).moments.a, { price: '1250', hours: '3/2' });
  assert.deepEqual((await request(`timelines/${fork.id}`)).measures, timeline.measures);

  // Applied a slice at a time, still one revision; removing every measure clears the setting.
  const store = new PostgresStore(pool);
  store.patchSlice = 1;
  const progress = [];
  const t = await store.access(id, owner);
  const direct = await changeMeasures(
    store,
    t,
    owner,
    { revision: t.revision, measures: {} },
    (p) => progress.push(p),
  );
  assert.deepEqual(direct.changed, { moments: 1, durations: 1 });
  assert(progress.length >= 2);
  assert.deepEqual(await values(id), {
    measures: undefined,
    moments: { a: undefined, b: undefined, c: undefined },
    durations: { d: undefined },
  });
  assert.equal((await request(`timelines/${id}`)).measures, null);
  console.log('PASS measures: declarations, values, sparse saves and rewrites on the server.');
} finally {
  await pool.query('DELETE FROM oc_timelines WHERE owner_id=ANY($1::uuid[])', [[owner, reader]]);
  await pool.query('DELETE FROM oc_users WHERE id=ANY($1::uuid[])', [[owner, reader]]);
  app.close();
  await pool.end();
}
