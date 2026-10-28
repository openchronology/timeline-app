// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// Background image addresses longer than 256 characters (#365): stored bands keep them up to
// 1,024, saves through the API warn of longer ones, and the migration rebuilds, once, the
// timelines (and the forks reading through to them) whose bands were saved without them.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { Auth, passwordHash } from '../server/auth.mjs';
import { createApplication } from '../server/http.mjs';
import { PostgresStore, rebuildLongBackgrounds } from '../server/store.mjs';
import { beginIndexWrite } from '../server/index-versions.mjs';
import { Versioning } from '../server/versioning.mjs';
import { DURATION_BACKGROUNDS } from '../dist/core.mjs';
if (!process.env.DATABASE_URL) throw new Error('Use a dedicated PostgreSQL test database.');
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
await pool.query(await readFile(new URL('../server/schema.sql', import.meta.url), 'utf8'));
const app = createApplication({ pool });
await new Promise((resolve) => app.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${app.address().port}`,
  owner = randomUUID(),
  forker = randomUUID();
let headers = {};
async function request(path, method = 'GET', data, expected = 200) {
  const response = await fetch(origin + '/api/' + path, {
    method,
    headers: { ...headers, ...(data ? { 'Content-Type': 'application/json' } : {}) },
    ...(data ? { body: JSON.stringify(data) } : {}),
  });
  const value = await response.json();
  assert.equal(response.status, expected, `${method} ${path}: ${JSON.stringify(value)}`);
  return value;
}
const url = (n) => 'https://upload.example.test/' + 'a'.repeat(n - 28);
const wide = url(300),
  huge = url(1100);
// The bands an overview of the timeline draws, by duration ID.
const bands = async (id) =>
  Object.fromEntries(
    (
      await request(`timelines/${id}/query`, 'POST', {
        kind: 'overview',
        lower: '0/1',
        upper: '100/1',
        threshold: '1/1',
      })
    ).durations.map((band) => [band.id, band]),
  );
// Strips the address from a stored band, as bands were saved before #365.
async function oldStyle(id) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await beginIndexWrite(client, id);
    await client.query(
      "UPDATE oc_duration_nodes SET band=band #- '{metadata,backgroundUrl}' WHERE timeline_id=$1",
      [id],
    );
    await client.query('COMMIT');
  } finally {
    client.release();
  }
}
try {
  for (const id of [owner, forker])
    await pool.query(
      'INSERT INTO oc_users(id,username,email,email_verified_at,password_hash,quota_bypass,is_admin,terms_version) VALUES($1,$2,$3,now(),$4,true,true,oc_policy_version())',
      [
        id,
        `backgrounds_${id.slice(0, 8)}`,
        `backgrounds_${id.slice(0, 8)}@example.test`,
        await passwordHash('x'.repeat(20)),
      ],
    );
  const issued = await new Auth(pool, origin).issue(
    (await pool.query('SELECT * FROM oc_users WHERE id=$1', [owner])).rows[0],
  );
  headers = { Cookie: issued.cookie.split(';')[0], 'X-CSRF-Token': issued.csrf };
  const document = {
    format: 'openchronology',
    version: 1,
    title: 'Long backgrounds',
    description: '',
    plugins: [{ manifest: DURATION_BACKGROUNDS, enabled: true }],
    events: [],
    durations: [
      { id: 'wide', start: '10/1', end: '20/1', metadata: { title: 'Wide', backgroundUrl: wide } },
      { id: 'huge', start: '30/1', end: '40/1', metadata: { title: 'Huge', backgroundUrl: huge } },
    ],
  };

  // Creating it succeeds, warning of the address no band carries; the other one shows.
  const created = await request('timelines', 'POST', document, 201);
  assert.deepEqual(created.warnings, [
    {
      code: 'long-background',
      message:
        '1 duration has a background image address longer than 1,024 characters, which is not shown. Use a shorter address.',
      count: 1,
      durations: ['huge'],
    },
  ]);
  let drawn = await bands(created.id);
  assert.equal(drawn.wide.metadata.backgroundUrl, wide, 'A 300-character address is drawn.');
  assert.equal(drawn.huge.metadata.backgroundUrl, undefined);
  assert.equal(drawn.huge.metadata.title, 'Huge');

  // Saving the whole document without it warns of nothing; saving changes that add it warns.
  const short = { ...document, durations: [document.durations[0]] };
  const saved = await request(`timelines/${created.id}`, 'PUT', {
    revision: created.revision,
    document: short,
  });
  assert.equal(saved.warnings, undefined);
  const { events: _events, durations: _durations, ...settings } = short;
  const changed = await request(`timelines/${created.id}/changes`, 'PUT', {
    revision: saved.revision,
    settings,
    changes: [],
    durationChanges: [{ id: 'huge', duration: document.durations[1] }],
  });
  assert.deepEqual(changed.warnings[0].durations, ['huge']);
  // Without the background plugin there is no background to warn of.
  assert.equal(
    (await request('timelines', 'POST', { ...document, title: 'No plugin', plugins: [] }, 201))
      .warnings,
    undefined,
  );
  // Long text that is no web address: the migration leaves this one alone.
  const plain = await request(
    'timelines',
    'POST',
    {
      ...document,
      title: 'Plain',
      durations: [{ id: 'text', start: '1/1', end: '2/1', metadata: { note: 'n'.repeat(300) } }],
    },
    201,
  );
  // Reading a desktop file warns too, where the server has the converter (native-store/).
  if ((await request('session')).fileExchange) {
    const exported = await fetch(origin + '/api/files/export', {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify(document),
    });
    assert.equal(exported.status, 200);
    const read = await fetch(origin + '/api/files/import', {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/vnd.openchronology.sqlite' },
      body: Buffer.from(await exported.arrayBuffer()),
    });
    assert.deepEqual((await read.json()).warnings, created.warnings);
  } else console.log('Without the converter, skipping reading a file.');

  // A timeline saved before #365, and a fork reading through to it, lack the 300-character
  // background until the migration rebuilds them.
  await oldStyle(created.id);
  assert.equal((await bands(created.id)).wide.metadata.backgroundUrl, undefined);
  const store = new PostgresStore(pool);
  const fork = await new Versioning(store).copy(created.id, forker, {
    revision: (await request(`timelines/${created.id}`)).revision,
  });
  await store.idle();
  const forkRow = async () =>
    (await pool.query('SELECT index_bases FROM oc_timelines WHERE id=$1', [fork.id])).rows[0];
  assert((await forkRow()).index_bases.length > 0, 'The fork reads through to its source.');
  assert.equal((await bands(fork.id)).wide.metadata.backgroundUrl, undefined);
  // A row's xmin changes whenever it is written, as a rebuild writes its timeline's row.
  const written = async (id) =>
    (await pool.query('SELECT xmin::text AS x FROM oc_timelines WHERE id=$1', [id])).rows[0].x;
  const untouched = await written(plain.id),
    stale = await written(created.id);
  const before = (await pool.query('SELECT updated_at FROM oc_timelines WHERE id=$1', [created.id]))
    .rows[0].updated_at;
  // As migrate.mjs runs it: in one transaction. Other tests' runs may have recorded it.
  await pool.query("DELETE FROM oc_migrations WHERE name='long-backgrounds'");
  const client = await pool.connect();
  let rebuilt;
  try {
    await client.query('BEGIN');
    rebuilt = await rebuildLongBackgrounds(client);
    await client.query('COMMIT');
    assert.equal(await rebuildLongBackgrounds(client), 0, 'It runs once.');
  } finally {
    client.release();
  }
  assert.notEqual(await written(created.id), stale);
  assert(rebuilt >= 2, `Rebuilt ${rebuilt}.`);
  drawn = await bands(created.id);
  assert.equal(drawn.wide.metadata.backgroundUrl, wide, 'The rebuild draws it.');
  assert.equal((await bands(fork.id)).wide.metadata.backgroundUrl, wide, 'And in the fork.');
  assert.equal((await forkRow()).index_bases.length, 0, 'The fork now has its own index.');
  assert.deepEqual(
    (await pool.query('SELECT updated_at FROM oc_timelines WHERE id=$1', [created.id])).rows[0]
      .updated_at,
    before,
    'A rebuild is not an edit.',
  );
  assert.equal(await written(plain.id), untouched, 'Timelines without such an address are not.');
  console.log('Long background addresses are kept, warned of and rebuilt.');
} finally {
  await new Promise((resolve) => app.close(resolve));
  await pool.query('DELETE FROM oc_timelines WHERE owner_id=ANY($1::uuid[])', [[owner, forker]]);
  await pool.query('DELETE FROM oc_users WHERE id=ANY($1::uuid[])', [[owner, forker]]);
  await pool.end();
}
