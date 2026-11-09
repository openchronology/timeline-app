// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// Saved views (#550) in PostgreSQL: who may read, change, share, fork, duplicate and reassign
// them; a timeline's default view following the view it names, and its copy once that is gone;
// and a file's views becoming its creator's saved views.
import pg from 'pg';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { PostgresStore } from '../server/store.mjs';
import { SavedViews, checkedViewReference } from '../server/saved-views.mjs';
if (!process.env.DATABASE_URL) throw new Error('Use a dedicated PostgreSQL test database.');
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const [owner, reader, outsider] = [randomUUID(), randomUUID(), randomUUID()];
const name = (id) => 'sv_' + id.slice(0, 8);
const status = async (promise, code) =>
  assert.equal(await promise.then(() => 200).catch((error) => error.status ?? error), code);
const created = [];
try {
  await pool.query(await readFile(new URL('../server/schema.sql', import.meta.url), 'utf8'));
  for (const id of [owner, reader, outsider])
    await pool.query(
      'INSERT INTO oc_users(id,username,email_verified_at,terms_version) VALUES($1,$2,now(),oc_policy_version())',
      [id, name(id)],
    );
  const store = new PostgresStore(pool);
  const views = new SavedViews(store);
  const doc = (title, extra = {}) => ({
    format: 'openchronology',
    version: 1,
    title,
    description: '',
    events: [
      { id: 'a', time: '1/1', metadata: { title: 'A', tags: ['war'] } },
      { id: 'b', time: '2/1', metadata: { title: 'B', tags: ['trade'] } },
    ],
    ...extra,
  });
  // A private timeline its owner shares with the reader; the outsider may not read it.
  const timeline = await store.create(owner, doc('Wars'));
  created.push(timeline.id);
  await pool.query("INSERT INTO oc_members(timeline_id,user_id,role) VALUES($1,$2,'viewer')", [
    timeline.id,
    reader,
  ]);
  const war = { tags: ['war'] };
  const view = await views.create(owner, {
    timeline: timeline.id,
    title: '  Wars apart ',
    separation: war,
  });
  assert.equal(view.title, 'Wars apart');
  assert.equal(view.visibility, 'private');
  assert.deepEqual(view.timeline, { id: timeline.id, title: 'Wars' });
  assert.equal(view.canShare, true);
  // Private: only its owner.
  await status(views.get(view.id, reader), 404);
  assert.deepEqual((await views.list(timeline.id, reader)).views, []);
  await status(views.update(view.id, reader, { title: 'Mine' }), 404);
  // Public: anyone who may read the timeline, read-only.
  await status(views.update(view.id, owner, { visibility: 'public' }), 200);
  const seen = await views.get(view.id, reader);
  assert.equal(seen.role, 'public');
  assert.equal(seen.canEdit, false);
  assert.equal(seen.canFork, true);
  assert.deepEqual(
    (await views.list(timeline.id, reader)).views.map((v) => v.id),
    [view.id],
  );
  await status(views.get(view.id, outsider), 404);
  await status(views.list(timeline.id, outsider), 404);
  await status(views.update(view.id, reader, { title: 'Mine' }), 403);
  // Shared as an editor: changes it, but neither shares it nor makes it private.
  await views.setMember(view.id, owner, { username: name(reader), role: 'editor' });
  assert.deepEqual((await views.members(view.id, reader)).members, [
    { username: name(reader), role: 'editor' },
  ]);
  await status(views.update(view.id, reader, { title: 'Wars, edited' }), 200);
  await status(views.update(view.id, reader, { visibility: 'private' }), 403);
  await status(views.setMember(view.id, reader, { username: name(outsider), role: 'viewer' }), 403);
  await status(views.remove(view.id, reader), 403);
  await status(views.update(view.id, owner, { separation: { tags: [] } }), 400);
  // Forked (remembering its source) and duplicated: private copies of the reader's.
  const fork = await views.copy(view.id, reader, {}, { fork: true });
  assert.equal(fork.owner, name(reader));
  assert.equal(fork.visibility, 'private');
  assert.deepEqual(fork.upstream, { id: view.id, title: 'Wars, edited' });
  assert.deepEqual(fork.timeline, { id: timeline.id, title: 'Wars' });
  await status(views.copy(fork.id, reader, {}, { fork: true }), 400);
  const copy = await views.copy(fork.id, reader, { title: 'Template' }, { fork: false });
  assert.equal(copy.upstream, null);
  assert.equal(copy.title, 'Template');
  // Reassigned to the reader's own timeline, as a template; not to one they cannot read.
  const other = await store.create(reader, doc('Trade'));
  created.push(other.id);
  const moved = await views.update(copy.id, reader, { timeline: other.id });
  assert.deepEqual(moved.timeline, { id: other.id, title: 'Trade' });
  const hidden = await store.create(outsider, doc('Hidden'));
  created.push(hidden.id);
  await status(views.update(copy.id, reader, { timeline: hidden.id }), 404);
  await status(views.copy(view.id, reader, { timeline: hidden.id }, { fork: true }), 404);
  assert.deepEqual((await views.mine(reader)).views.map((v) => v.title).sort(), [
    'Template',
    'Wars, edited',
    'Wars, edited',
  ]);
  // A default view naming the view opens as the view is now, and as its copy once it is gone.
  const saved = await store.save(timeline.id, owner, timeline.revision, {
    ...doc('Wars'),
    view: { id: view.id, separation: war },
  });
  assert.deepEqual(saved.view, { id: view.id, separation: war });
  await views.update(view.id, owner, { separation: { tags: ['trade'] } });
  assert.deepEqual((await store.access(timeline.id, reader)).view, {
    id: view.id,
    separation: { tags: ['trade'] },
  });
  assert.equal((await views.list(timeline.id, owner)).views[0].isDefault, true);
  await views.remove(view.id, owner);
  assert.deepEqual((await store.access(timeline.id, reader)).view.separation, war);
  await status(views.get(fork.id, reader), 200);
  assert.equal((await views.get(fork.id, reader)).upstream, null);
  // A saved view's ID is kept only for one of the timeline's that the saver may read.
  const privateView = await views.create(owner, {
    timeline: timeline.id,
    title: 'Private',
    separation: war,
  });
  assert.deepEqual(
    await checkedViewReference(pool, timeline.id, reader, { id: privateView.id, separation: war }),
    { separation: war },
  );
  assert.deepEqual(
    await checkedViewReference(pool, other.id, owner, { id: privateView.id, separation: war }),
    { separation: war },
  );
  assert.equal(
    (await checkedViewReference(pool, timeline.id, owner, { id: privateView.id, separation: war }))
      .id,
    privateView.id,
  );
  // A file's views become its creator's saved views, the default naming its own.
  const imported = await store.create(
    owner,
    doc('From a file', {
      views: [
        { id: 'trade', title: 'Trade', separation: { tags: ['trade'] } },
        { id: 'war', title: 'War', description: 'Battles', separation: war },
      ],
      view: { id: 'war', separation: war },
    }),
  );
  created.push(imported.id);
  const adopted = (await views.list(imported.id, owner)).views;
  assert.deepEqual(
    adopted.map((v) => [v.title, v.description, v.visibility, v.isDefault]),
    [
      ['War', 'Battles', 'private', true],
      ['Trade', '', 'private', false],
    ],
  );
  assert.equal(imported.view.id, adopted[0].id);
  // Deleting a timeline keeps its views, of no timeline, until they are reassigned.
  await pool.query('DELETE FROM oc_timelines WHERE id=$1', [imported.id]);
  assert.equal((await views.get(adopted[1].id, owner)).timeline, null);
  console.log(
    'PASS PostgreSQL saved views: private, public, shared with editors; forks, duplicates and reassigning; defaults that follow the view and keep a copy; views from files.',
  );
} finally {
  for (const id of created) await pool.query('DELETE FROM oc_timelines WHERE id=$1', [id]);
  await pool.query('DELETE FROM oc_users WHERE id=ANY($1::uuid[])', [[owner, reader, outsider]]);
  await pool.end();
}
