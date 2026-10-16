// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// Saving edits made on a revision others have saved since (#165): what no one else changed
// merges onto the newer revision, field by field; conflicts are refused, named, and can be
// settled by keeping one's own version (sending it without what it was made on).
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { Auth, passwordHash } from '../server/auth.mjs';
import { createApplication } from '../server/http.mjs';
if (!process.env.DATABASE_URL) throw new Error('Use a dedicated PostgreSQL test database.');
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
await pool.query(await readFile(new URL('../server/schema.sql', import.meta.url), 'utf8'));
const app = createApplication({
  pool,
  mailer: { async send() {} },
  securityKey: Buffer.alloc(32, 31),
  passwordCheck: async () => {},
});
await new Promise((resolve) => app.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${app.address().port}`,
  auth = new Auth(pool, origin),
  owner = randomUUID();
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
let headers = {};
const moment = (id, title, extra = {}) => ({
  id,
  time: '1/' + (id.charCodeAt(0) - 95),
  metadata: { title, ...extra },
});
try {
  await pool.query(
    'INSERT INTO oc_users(id,username,email,email_verified_at,password_hash,quota_bypass) VALUES($1,$2,$3,now(),$4,true)',
    [
      owner,
      'merge_' + owner.slice(0, 8),
      `merge_${owner.slice(0, 8)}@example.test`,
      await passwordHash('x'.repeat(20)),
    ],
  );
  const issued = await auth.issue(
    (await pool.query('SELECT * FROM oc_users WHERE id=$1', [owner])).rows[0],
  );
  headers = { Cookie: issued.cookie.split(';')[0], 'X-CSRF-Token': issued.csrf };
  const created = await request(
    'timelines',
    'POST',
    {
      format: 'openchronology',
      version: 1,
      title: 'Merging saves',
      description: 'The original description',
      tags: ['merge'],
      events: ['a', 'b', 'c', 'd'].map((id) => moment(id, 'Moment ' + id)),
      durations: [{ id: 'span', start: '1/9', end: '1/8', metadata: { title: 'Span' } }],
    },
    201,
  );
  const id = created.id;
  // What an editor loads: the timeline's settings and the moments and durations it opens.
  const loaded = await request(`timelines/${id}`);
  const read = async (kind, entity, revision = loaded.revision) =>
    request(`timelines/${id}/query`, 'POST', { kind, id: entity, revision });
  const before = {};
  for (const m of ['a', 'b', 'c', 'd']) before[m] = (await read('moment', m)).event;
  before.span = (await read('duration', 'span')).duration;
  const settingsOf = (t) => ({
    format: 'openchronology',
    version: 1,
    title: t.title,
    description: t.description,
    ...(t.tags ? { tags: t.tags } : {}),
  });
  const base = (moments, durations = [], settings = loaded) => ({
    settings: {
      title: settings.title,
      description: settings.description,
      tags: settings.tags ?? null,
      presentation: null,
      plugins: null,
      assets: null,
    },
    moments: moments.map((m) => ({ id: m, event: before[m] ?? null })),
    durations: durations.map((d) => ({ id: d, duration: before[d] ?? null })),
  });

  // Someone else saves meanwhile: renames b, adds a moment, rewrites the description.
  const theirs = await request(`timelines/${id}/changes`, 'PUT', {
    revision: loaded.revision,
    settings: { ...settingsOf(loaded), description: 'Their description' },
    changes: [
      { id: 'b', event: { ...before.b, metadata: { ...before.b.metadata, title: 'Their b' } } },
      { id: 'e', event: moment('e', 'Their new moment') },
    ],
  });
  assert.notEqual(theirs.revision, loaded.revision);

  // Without what the edits were made on, a save on the old revision is refused, as before.
  const mine = {
    revision: loaded.revision,
    settings: { ...settingsOf(loaded), title: 'My title' },
    changes: [
      { id: 'a', event: { ...before.a, metadata: { ...before.a.metadata, title: 'My a' } } },
      { id: 'b', event: { ...before.b, metadata: { ...before.b.metadata, notes: 'My notes' } } },
      { id: 'c', event: null },
      { id: 'f', event: moment('f', 'My new moment') },
    ],
    durationChanges: [{ id: 'span', duration: { ...before.span, metadata: { title: 'My span' } } }],
    relationshipChanges: [{ a: { moment: 'a' }, b: { moment: 'e' }, related: true }],
  };
  const refused = await request(`timelines/${id}/changes`, 'PUT', mine, 409);
  assert.equal(refused.conflicts, undefined);

  // With it, everything merges: each side's fields, moments and settings.
  const merged = await request(`timelines/${id}/changes`, 'PUT', {
    ...mine,
    base: base(['a', 'b', 'c', 'f'], ['span']),
  });
  assert.equal(BigInt(merged.revision), BigInt(theirs.revision) + 1n);
  assert.equal(merged.title, 'My title');
  assert.equal(merged.description, 'Their description');
  const document = (await request(`timelines/${id}/document`)).document;
  const events = new Map(document.events.map((e) => [e.id, e]));
  assert.deepEqual([...events.keys()].sort(), ['a', 'b', 'd', 'e', 'f']);
  assert.equal(events.get('a').metadata.title, 'My a');
  assert.deepEqual(events.get('b').metadata, { title: 'Their b', notes: 'My notes' });
  assert.equal(document.durations.find((d) => d.id === 'span').metadata.title, 'My span');
  assert.equal(document.relationships.length, 1);

  // Conflicts: the same field changed both ways, a moment edited here and deleted there, a
  // setting changed both ways. Nothing is saved, and each is named.
  const now = await request(`timelines/${id}`);
  for (const m of ['a', 'd']) before[m] = (await read('moment', m, now.revision)).event;
  const third = await request(`timelines/${id}/changes`, 'PUT', {
    revision: now.revision,
    settings: { ...settingsOf(now), description: 'A third description' },
    changes: [
      { id: 'a', event: { ...before.a, metadata: { ...before.a.metadata, title: 'Their a' } } },
      { id: 'd', event: null },
    ],
  });
  const stale = {
    revision: now.revision,
    settings: { ...settingsOf(now), description: 'My description' },
    changes: [
      { id: 'a', event: { ...before.a, metadata: { ...before.a.metadata, title: 'Mine again' } } },
      { id: 'd', event: { ...before.d, metadata: { ...before.d.metadata, notes: 'Kept' } } },
      { id: 'g', event: moment('g', 'Unconflicted') },
    ],
  };
  const conflict = await request(
    `timelines/${id}/changes`,
    'PUT',
    { ...stale, base: base(['a', 'd', 'g'], [], now) },
    409,
  );
  assert.deepEqual(conflict.conflicts.map((c) => [c.kind, c.id]).sort(), [
    ['moment', 'a'],
    ['moment', 'd'],
    ['setting', 'description'],
  ]);
  assert.equal(conflict.conflicts.find((c) => c.id === 'a').title, 'Mine again');
  assert.equal((await request(`timelines/${id}`)).revision, third.revision);

  // Keeping one's own versions: sent without what they were made on, they replace the saved
  // ones; the rest still merges.
  const kept = base(['a', 'd', 'g'], [], now);
  kept.moments = kept.moments.filter((m) => m.id === 'g');
  delete kept.settings.description;
  await request(`timelines/${id}/changes`, 'PUT', { ...stale, base: kept });
  const settled = (await request(`timelines/${id}/document`)).document;
  const final = new Map(settled.events.map((e) => [e.id, e]));
  assert.equal(final.get('a').metadata.title, 'Mine again');
  assert.equal(final.get('d').metadata.notes, 'Kept');
  assert(final.has('g'));
  assert.equal(settled.description, 'My description');

  // An editor on the latest revision saves as before, base or not.
  const latest = await request(`timelines/${id}`);
  await request(`timelines/${id}/changes`, 'PUT', {
    revision: latest.revision,
    settings: settingsOf(latest),
    changes: [{ id: 'h', event: moment('h', 'Plain') }],
    base: base([], [], latest),
  });
  // On the latest revision too, an edit to what changed after it was loaded conflicts: the
  // editor follows others' saves with its edits staged.
  const sameRevision = await request(
    `timelines/${id}/changes`,
    'PUT',
    {
      revision: (await request(`timelines/${id}`)).revision,
      settings: settingsOf(latest),
      changes: [{ id: 'a', event: { ...before.a, metadata: { title: 'Stale edit' } } }],
      base: base(['a'], [], latest),
    },
    409,
  );
  assert.deepEqual(
    sameRevision.conflicts.map((c) => c.id),
    ['a'],
  );
  // A malformed base is refused.
  await request(
    `timelines/${id}/changes`,
    'PUT',
    {
      revision: latest.revision,
      settings: settingsOf(latest),
      changes: [],
      base: { moments: 'x' },
    },
    400,
  );
  console.log(
    'PASS save merging: merged fields, moments and settings; conflicts named; own versions kept.',
  );
} finally {
  await pool.query('DELETE FROM oc_timelines WHERE owner_id=$1', [owner]);
  await pool.query('DELETE FROM oc_users WHERE id=$1', [owner]);
  app.close();
  await pool.end();
}
