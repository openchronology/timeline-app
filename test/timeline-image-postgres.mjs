// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// A timeline's own image (#339) against PostgreSQL: its owner sets, replaces and removes it
// through the settings and through the document; it is kept with the timeline's settings, so
// its metadata, exports, saved history, forks and the catalogue's cards carry it; only HTTPS
// links are taken, and only its owner sets it through the settings.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { Auth, passwordHash } from '../server/auth.mjs';
import { createApplication } from '../server/http.mjs';
if (!process.env.DATABASE_URL) throw new Error('Use a dedicated PostgreSQL test database.');
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
await pool.query(await readFile(new URL('../server/schema.sql', import.meta.url), 'utf8'));
const app = createApplication({ pool });
await new Promise((resolve) => app.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${app.address().port}`,
  owner = randomUUID(),
  writer = randomUUID();
let headers = {};
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
const first = { url: 'https://images.example.test/rome.jpg', alt: 'The Forum at dawn' },
  second = {
    url: 'https://images.example.test/aqueduct.png',
    alt: 'An aqueduct',
    width: 1600,
    height: 900,
  };
try {
  const auth = new Auth(pool, origin);
  const names = {};
  for (const [id, name] of [
    [owner, 'imager'],
    [writer, 'helper'],
  ]) {
    names[id] = `${name}_${id.slice(0, 8)}`;
    await pool.query(
      'INSERT INTO oc_users(id,username,email,email_verified_at,password_hash,quota_bypass,terms_version) VALUES($1,$2,$3,now(),$4,true,oc_policy_version())',
      [id, names[id], `${names[id]}@example.test`, await passwordHash('x'.repeat(20))],
    );
  }
  const sign = async (id) => {
    const issued = await auth.issue(
      (await pool.query('SELECT * FROM oc_users WHERE id=$1', [id])).rows[0],
    );
    return { Cookie: issued.cookie.split(';')[0], 'X-CSRF-Token': issued.csrf };
  };
  headers = await sign(owner);
  const writerHeaders = await sign(writer);
  const document = {
    format: 'openchronology',
    version: 1,
    title: 'Rome, pictured',
    description: '',
    events: [{ id: 'm', time: '1/1', metadata: { title: 'Founded' } }],
  };
  const created = await request('timelines', 'POST', document, headers, 201);
  const settings = `timelines/${created.id}/settings`;
  assert.equal((await request(`timelines/${created.id}`)).image, null, 'None at first.');

  // Set through the settings: a revision of its own, in the metadata and the document.
  const set = await request(settings, 'PATCH', { image: first });
  assert.deepEqual(set.image, first);
  assert.equal(BigInt(set.revision), BigInt(created.revision) + 1n);
  assert.deepEqual((await request(`timelines/${created.id}/document`)).document.image, first);
  assert.equal(
    (await request(`timelines/${created.id}/document`)).document.events.length,
    1,
    'Its moments stay.',
  );
  // Refused: other schemes, credentials, long alt text, half a size, unknown fields, comparisons.
  for (const image of [
    { url: 'http://images.example.test/a.png', alt: '' },
    { url: 'javascript:alert(1)', alt: '' },
    { url: 'https://user:pass@images.example.test/a.png', alt: '' },
    { url: 'https://images.example.test/a.png', alt: 'x'.repeat(1001) },
    { url: 'https://images.example.test/a.png', alt: '', width: 10 },
    { url: 'https://images.example.test/a.png', alt: '', title: 'x' },
    'https://images.example.test/a.png',
  ])
    await request(settings, 'PATCH', { image }, headers, 400);
  assert.deepEqual((await request(`timelines/${created.id}`)).image, first, 'Unchanged.');
  // Only its owner changes its settings; a writer saves the document instead.
  await request(
    `timelines/${created.id}/members`,
    'POST',
    { username: names[writer], role: 'writer' },
    headers,
  );
  await request(settings, 'PATCH', { image: null }, writerHeaders, 403);

  // Replaced, with its size; alongside another setting, both apply.
  const replaced = await request(settings, 'PATCH', { image: second, visibility: 'public' });
  assert.deepEqual(replaced.image, second);
  assert.equal(replaced.visibility, 'public');

  // Saved history keeps each version: the revision before the replacement had the first.
  const history = await request(`timelines/${created.id}/history?page=1`);
  const items = history.items ?? history.revisions ?? history.history;
  assert.ok(Array.isArray(items), JSON.stringify(history).slice(0, 300));
  const images = [];
  for (const item of items) {
    const saved = await request(`timelines/${created.id}/history/${item.id}`);
    images.push((saved.document ?? saved).image ?? null);
  }
  assert.ok(
    images.some((i) => i?.url === first.url),
    'The first image is in saved history.',
  );
  assert.ok(
    images.some((i) => i === null),
    'So is the revision without one.',
  );

  // Forks and duplicates keep it, and the catalogue's cards show it.
  const current = await request(`timelines/${created.id}`);
  const fork = await request(
    `timelines/${created.id}/fork`,
    'POST',
    { revision: current.revision },
    writerHeaders,
    201,
  );
  assert.deepEqual(
    (await request(`timelines/${fork.id}`, 'GET', undefined, writerHeaders)).image,
    second,
  );
  const duplicate = await request(
    `timelines/${created.id}/duplicate`,
    'POST',
    { revision: current.revision },
    headers,
    201,
  );
  assert.deepEqual((await request(`timelines/${duplicate.id}`)).image, second);
  const found = await request('timelines/search', 'POST', { owner: names[owner], scope: 'mine' });
  const card = found.timelines.find((t) => t.id === created.id);
  assert.deepEqual(card.image, second, 'Its card has its image.');

  // Through the document: a writer's sparse save keeps it (settings sent back), changes it, or
  // removes it, and a whole-document save sets it.
  let state = await request(`timelines/${created.id}`, 'GET', undefined, writerHeaders);
  const sparse = (image, revision) => ({
    revision,
    settings: {
      format: 'openchronology',
      version: 1,
      title: state.title,
      description: state.description,
      ...(image ? { image } : {}),
    },
    changes: [{ id: 'n', event: { id: 'n', time: '2/1', metadata: { title: 'Later' } } }],
  });
  state = await request(
    `timelines/${created.id}/changes`,
    'PUT',
    sparse({ ...first, alt: 'Changed by a writer' }, state.revision),
    writerHeaders,
  );
  assert.equal(state.image.alt, 'Changed by a writer');
  state = await request(
    `timelines/${created.id}/changes`,
    'PUT',
    sparse(null, state.revision),
    writerHeaders,
  );
  assert.equal(state.image, null, 'A save without it removes it.');
  const whole = await request(`timelines/${created.id}`, 'PUT', {
    revision: state.revision,
    document: { ...document, image: second },
  });
  assert.deepEqual(whole.image, second);
  // An image saved with an editor's base merges like the other settings: an owner's change
  // meanwhile is kept when the editor did not change it.
  const before = await request(`timelines/${created.id}`);
  await request(settings, 'PATCH', { image: first });
  const merged = await request(`timelines/${created.id}/changes`, 'PUT', {
    ...sparse(second, before.revision),
    changes: [{ id: 'o', event: { id: 'o', time: '3/1', metadata: { title: 'Merged' } } }],
    base: {
      settings: {
        title: before.title,
        description: before.description,
        tags: null,
        image: before.image,
        presentation: null,
        plugins: null,
        assets: null,
      },
      moments: [{ id: 'o', event: null }],
      durations: [],
    },
  });
  assert.deepEqual(merged.image, first, 'The owner’s change survives an editor’s save.');
  // Removed through the settings.
  const removed = await request(settings, 'PATCH', { image: null });
  assert.equal(removed.image, null);
  assert.equal((await request(`timelines/${created.id}/document`)).document.image, undefined);
  // A comparison has none of its own.
  const comparison = await request(
    'timelines',
    'POST',
    {
      ...document,
      events: [],
      comparison: { sources: [created.id, duplicate.id], combined: false },
    },
    headers,
    201,
  );
  await request(`timelines/${comparison.id}/settings`, 'PATCH', { image: first }, headers, 409);
  console.log(
    'PASS timeline image: set, replaced and removed through settings and documents; kept by history, forks, copies and cards; only HTTPS links.',
  );
} finally {
  await pool.query(
    'DELETE FROM oc_history_settings WHERE timeline_id IN (SELECT id FROM oc_timelines WHERE owner_id=ANY($1::uuid[]))',
    [[owner, writer]],
  );
  await pool.query('DELETE FROM oc_timelines WHERE owner_id=ANY($1::uuid[])', [[owner, writer]]);
  await pool.query('DELETE FROM oc_users WHERE id=ANY($1::uuid[])', [[owner, writer]]);
  app.close();
  await pool.end();
}
