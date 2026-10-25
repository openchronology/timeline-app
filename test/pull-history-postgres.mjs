// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// Pull requests keep no whole documents: a submitted timeline is kept as rows that read
// through to its base revision, charged what it changes; reviews get a summary computed
// from history; the proposed timeline is read only when asked for; deleting the timeline
// removes it all.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import pg from 'pg';
import { PostgresStore } from '../server/store.mjs';
import { Collaboration } from '../server/collaboration.mjs';
import { validateDocument } from '../dist/core.mjs';
if (!process.env.DATABASE_URL) throw new Error('Use a dedicated PostgreSQL test database.');
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL }),
  store = new PostgresStore(pool),
  pulls = new Collaboration(store);
// The owner, and a contributor proposing changes (an owner saves directly instead).
const owner = randomUUID(),
  author = randomUUID(),
  timelines = [];
const order = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const normal = (d) => ({ ...d, events: [...d.events].sort((a, b) => order(a.id, b.id)) });
const count = async (sql, params) => Number((await pool.query(sql, params)).rows[0].n);
try {
  const schema = await readFile(new URL('../server/schema.sql', import.meta.url), 'utf8');
  await pool.query(schema);
  for (const id of [owner, author])
    await pool.query(
      'INSERT INTO oc_users(id,username,email_verified_at,terms_version) VALUES($1,$2,now(),oc_policy_version())',
      [id, 'pulls_' + id.slice(0, 8)],
    );
  const moment = (i, title = 'Moment ' + i) => ({
    id: 'm' + i,
    time: `${i}/1`,
    metadata: { title, description: 'Notes '.repeat(20) },
  });
  const original = validateDocument({
    format: 'openchronology',
    version: 1,
    title: 'Pulls',
    description: 'Upstream',
    events: Array.from({ length: 400 }, (_, i) => moment(i)),
    durations: [{ id: 'd', start: { moment: 'm1' }, end: '5/1', metadata: { title: 'Span' } }],
    relationships: [{ a: { moment: 'm2' }, b: { moment: 'm3' } }],
  });
  const size = Buffer.byteLength(JSON.stringify(original));
  let t = await store.create(owner, original);
  timelines.push(t.id);
  await pool.query("INSERT INTO oc_members(timeline_id,user_id,role) VALUES($1,$2,'contributor')", [
    t.id,
    author,
  ]);
  const snapshots = await count('SELECT count(*) AS n FROM oc_snapshots');

  // A submitted timeline is kept as rows reading through to the head, charged its changes.
  const proposed = validateDocument({
    ...original,
    title: 'Proposed',
    events: [
      ...original.events
        .filter((e) => e.id !== 'm9')
        .map((e) => (e.id === 'm4' ? moment(4, 'Edited') : e)),
      moment(400),
    ],
    relationships: [...original.relationships, { a: { moment: 'm5' }, b: { moment: 'm400' } }],
  });
  let p = await pulls.create(t.id, author, {
    title: 'Proposal',
    body: 'Changes',
    baseRevision: t.revision,
    document: proposed,
  });
  const source = async (id) =>
    (
      await pool.query(
        'SELECT timeline_id,number,kind,history_rows,snapshot_id,stored_bytes FROM oc_revisions WHERE id=$1',
        [id],
      )
    ).rows[0];
  let kept = await source(p.source_revision_id);
  assert.deepEqual(
    { ...kept, stored_bytes: undefined },
    {
      timeline_id: p.source_revision_id,
      number: '1',
      kind: 'proposal',
      history_rows: true,
      snapshot_id: null,
      stored_bytes: undefined,
    },
    'kept as rows, outside the timeline',
  );
  assert(Number(kept.stored_bytes) < size / 10, `charged its changes (${kept.stored_bytes})`);
  assert.equal(await count('SELECT count(*) AS n FROM oc_snapshots'), snapshots, 'no snapshot');
  assert.equal(
    await count(
      'SELECT count(*) AS n FROM oc_proposals WHERE id=$1 AND document IS NULL AND base_document IS NULL',
      [p.id],
    ),
    1,
    'no documents stored with the pull request',
  );
  // Its storage entry is its text alone.
  assert.equal(
    await count(
      "SELECT bytes AS n FROM oc_storage_entries WHERE kind='oc_proposals' AND entry_id=$1",
      [p.id],
    ),
    Buffer.byteLength('Proposal') + Buffer.byteLength('Changes'),
  );
  // The review summary comes from history; the document only when asked for.
  assert.equal(p.document, undefined);
  assert.deepEqual(p.changes.settings, ['title']);
  assert.deepEqual(p.changes.moments, { added: 1, removed: 1, changed: 1 });
  assert.deepEqual(p.changes.relationships, { added: 1, removed: 0 });
  assert.deepEqual(p.changes.examples.map((e) => [e.change, (e.after ?? e.before).id]).sort(), [
    ['added', 'm400'],
    ['changed', 'm4'],
    ['removed', 'm9'],
  ]);
  assert.deepEqual(normal((await pulls.document(t.id, p.id, owner)).document), normal(proposed));

  // Updating keeps another revision against the same base.
  const updated = validateDocument({
    ...proposed,
    events: proposed.events.map((e) => (e.id === 'm6' ? moment(6, 'Also edited') : e)),
  });
  p = await pulls.update(t.id, p.id, author, {
    title: p.title,
    body: p.body,
    baseRevision: p.base_revision,
    revision: p.revision,
    document: updated,
  });
  assert.deepEqual(p.changes.moments, { added: 1, removed: 1, changed: 2 });
  assert.deepEqual(normal((await pulls.document(t.id, p.id, owner)).document), normal(updated));

  // Rebasing onto a changed upstream keeps the result as rows against the new head.
  const upstream = validateDocument({ ...original, description: 'Changed upstream' });
  t = await store.save(t.id, owner, t.revision, upstream);
  p = await pulls.resolve(t.id, p.id, author, { action: 'rebase', revision: p.revision });
  kept = await source(p.source_revision_id);
  assert.equal(kept.kind, 'rebase');
  assert.equal(kept.history_rows, true);
  assert.equal(p.base_revision_id, t.head_revision_id);
  const rebased = { ...updated, description: 'Changed upstream' };
  assert.deepEqual(
    normal((await pulls.document(t.id, p.id, owner)).document),
    normal(validateDocument(rebased)),
  );
  assert.deepEqual(p.changes.settings, ['title']);

  // Merging applies it.
  p = await pulls.resolve(t.id, p.id, owner, { action: 'merge', revision: p.revision });
  assert.equal(p.status, 'merged');
  assert.deepEqual(
    normal((await store.snapshot(t.id, owner)).document),
    normal(validateDocument(rebased)),
  );
  assert.deepEqual(p.changes.moments, { added: 1, removed: 1, changed: 2 }, 'still reviewable');

  // Deleting the timeline deletes its pull requests' revisions and every row they kept.
  const detached = (
    await pool.query(
      "SELECT id FROM oc_revisions WHERE timeline_id=id AND kind IN ('proposal','rebase') AND author_id=$1",
      [author],
    )
  ).rows.map((r) => r.id);
  assert.equal(detached.length, 3);
  await store.transaction(async (c) => {
    await c.query('DELETE FROM oc_timelines WHERE id=$1', [t.id]);
    await store.removeHistory(c, t.id);
  });
  for (const table of [
    'oc_history_moments',
    'oc_history_durations',
    'oc_history_relationships',
    'oc_history_settings',
    'oc_history_moment_overrides',
    'oc_history_bases',
    'oc_revisions',
  ])
    assert.equal(
      await count(`SELECT count(*) AS n FROM ${table} WHERE timeline_id=ANY($1::uuid[])`, [
        [t.id, ...detached],
      ]),
      0,
      `nothing left in ${table}`,
    );

  // Pull requests saved with documents keep them only until migrating: their revisions hold
  // the same documents.
  let legacy = await store.create(owner, original);
  timelines.push(legacy.id);
  const legacyPull = randomUUID();
  await pool.query(
    'INSERT INTO oc_proposals(id,timeline_id,author_id,title,base_revision,base_document,document) VALUES($1,$2,$3,$4,1,$5::jsonb,$6::jsonb)',
    [legacyPull, legacy.id, owner, 'Old', JSON.stringify(original), JSON.stringify(proposed)],
  );
  await pool.query(schema);
  assert.equal(
    await count('SELECT count(*) AS n FROM oc_proposals WHERE id=$1 AND document IS NULL', [
      legacyPull,
    ]),
    1,
  );
  const old = await pulls.get(legacy.id, legacyPull, owner);
  assert.deepEqual(old.changes.moments, { added: 1, removed: 1, changed: 1 });
  assert.deepEqual(
    normal((await pulls.document(legacy.id, legacyPull, owner)).document),
    normal(proposed),
  );
  console.log(
    'PASS pull requests keep no documents: submitted timelines are kept as rows charged their changes, reviewed from history, updated, rebased and merged, and removed with their timeline.',
  );
} finally {
  for (const id of timelines) {
    await pool.query('DELETE FROM oc_timelines WHERE id=$1', [id]);
    await store.transaction((c) => store.removeHistory(c, id)).catch(() => {});
  }
  await pool.query('DELETE FROM oc_storage_entries WHERE user_id=ANY($1::uuid[])', [
    [owner, author],
  ]);
  await pool.query('DELETE FROM oc_users WHERE id=ANY($1::uuid[])', [[owner, author]]);
  await pool.end();
}
