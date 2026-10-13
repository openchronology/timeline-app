// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// Saved history kept as rows (server/history.mjs): a timeline saved before keeps its old
// revisions readable and starts rows at its next save; saves are charged what they change;
// versions are immutable; deleting a timeline keeps what a fork still refers to and removes
// the rest.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import pg from 'pg';
import { PostgresStore } from '../server/store.mjs';
import { startHistory } from '../server/history.mjs';
import { Versioning } from '../server/versioning.mjs';
import { pruneHistory } from '../server/retention.mjs';
import { validateDocument } from '../dist/core.mjs';
if (!process.env.DATABASE_URL) throw new Error('Use a dedicated PostgreSQL test database.');
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL }),
  store = new PostgresStore(pool),
  versions = new Versioning(store);
const owner = randomUUID(),
  timelines = [];
const versionsOf = async (id) =>
  Number(
    (
      await pool.query(
        `SELECT (SELECT count(*) FROM oc_history_moments WHERE timeline_id=$1)
        +(SELECT count(*) FROM oc_history_durations WHERE timeline_id=$1)
        +(SELECT count(*) FROM oc_history_relationships WHERE timeline_id=$1)
        +(SELECT count(*) FROM oc_history_settings WHERE timeline_id=$1) AS n`,
        [id],
      )
    ).rows[0].n,
  );
try {
  await pool.query(await readFile(new URL('../server/schema.sql', import.meta.url), 'utf8'));
  await pool.query('INSERT INTO oc_users(id,username,email_verified_at) VALUES($1,$2,now())', [
    owner,
    'history_' + owner.slice(0, 8),
  ]);
  const moment = (i, title = 'Moment ' + i) => ({
    id: 'm' + i,
    time: `${i}/1`,
    metadata: { title, description: 'Notes '.repeat(20) },
  });
  const original = validateDocument({
    format: 'openchronology',
    version: 1,
    title: 'History',
    description: '',
    events: Array.from({ length: 400 }, (_, i) => moment(i)),
    durations: [{ id: 'd', start: { moment: 'm1' }, end: '5/1', metadata: { title: 'Span' } }],
    relationships: [{ a: { moment: 'm2' }, b: { moment: 'm3' } }],
  });
  let t = await store.create(owner, original);
  timelines.push(t.id);

  // Saved before history was kept as rows: its revision is a snapshot, and it has no rows.
  const makeLegacy = (id, document) =>
    store.transaction(async (c) => {
      await c.query(
        'UPDATE oc_timelines SET head_revision_id=NULL,history_since=NULL WHERE id=$1',
        [id],
      );
      await c.query('DELETE FROM oc_revisions WHERE timeline_id=$1', [id]);
      for (const table of ['moments', 'durations', 'relationships', 'settings'])
        await c.query(`DELETE FROM oc_history_${table} WHERE timeline_id=$1`, [id]);
      const revision = await store.recordRevision(c, id, owner, document, 'save', [], null, '1');
      await c.query('UPDATE oc_timelines SET head_revision_id=$2 WHERE id=$1', [id, revision]);
    });
  await makeLegacy(t.id, original);
  t = await store.access(t.id, owner);
  const legacy = t.head_revision_id;
  assert.equal(await versionsOf(t.id), 0);

  // Its next save starts rows with one copy, and is charged for it.
  const settings = { ...original, events: [], durations: undefined, relationships: undefined };
  const edited = {
    ...original,
    events: original.events.map((e, i) => (i ? e : moment(0, 'Edited'))),
  };
  t = await store.save(t.id, owner, t.revision, undefined, {
    settings,
    changes: [{ id: 'm0', event: moment(0, 'Edited') }],
  });
  assert.equal(String(t.history_since), t.revision);
  const first = (
    await pool.query('SELECT history_rows,stored_bytes FROM oc_revisions WHERE id=$1', [
      t.head_revision_id,
    ])
  ).rows[0];
  assert.equal(first.history_rows, true);
  const whole = Buffer.byteLength(JSON.stringify(original));
  assert(
    first.stored_bytes > whole * 0.9,
    `the first save copies the timeline (${first.stored_bytes})`,
  );
  assert.equal(await versionsOf(t.id), 400 + 1 + 1 + 1);
  // Old and new revisions read back as saved.
  assert.deepEqual(await store.revisionDocument(pool, legacy), original);
  assert.deepEqual(
    await store.revisionDocument(pool, t.head_revision_id),
    validateDocument(edited),
  );

  // Later saves are charged what they change: one moment's version.
  const second = moment(1, 'Edited too');
  t = await store.save(t.id, owner, t.revision, undefined, {
    settings,
    changes: [{ id: 'm1', event: second }],
  });
  const charged = (
    await pool.query('SELECT stored_bytes FROM oc_revisions WHERE id=$1', [t.head_revision_id])
  ).rows[0].stored_bytes;
  assert(charged < Buffer.byteLength(JSON.stringify(second)) * 1.5, `one version (${charged})`);
  assert.equal(await versionsOf(t.id), 403 + 1);
  // A full save (a whole document) still writes only the differences.
  const renamed = {
    ...edited,
    title: 'Renamed',
    events: edited.events.map((e, i) => (i === 1 ? second : e)).filter((e) => e.id !== 'm399'),
  };
  t = await store.save(t.id, owner, t.revision, renamed);
  assert.equal(await versionsOf(t.id), 404 + 1, 'only the new settings version');
  assert.deepEqual(
    await store.revisionDocument(pool, t.head_revision_id),
    validateDocument(renamed),
  );

  // Pruning older revisions (as retention does) removes the versions only they saw.
  const pruned = await store.transaction((c) =>
    pruneHistory(c, t.id, new Date(Date.now() + 60000)),
  );
  assert.equal(pruned, 3, 'all but the head');
  assert.equal(await versionsOf(t.id), 399 + 1 + 1 + 1, 'the versions the head sees');
  assert.deepEqual(
    await store.revisionDocument(pool, t.head_revision_id),
    validateDocument(renamed),
  );

  // Versions are immutable once saved: only ending a current one, once.
  await assert.rejects(
    pool.query("UPDATE oc_history_moments SET event='{}'::jsonb WHERE timeline_id=$1", [t.id]),
    /immutable/,
  );

  // Migrating starts an old timeline's history at its revision, copied in the database, so
  // its next save is charged only its change; the settings match what saves write.
  let old = await store.create(owner, original);
  timelines.push(old.id);
  await makeLegacy(old.id, original);
  const oldHead = (await store.access(old.id, owner)).head_revision_id;
  assert((await store.transaction((c) => startHistory(c))) >= 1, 'the old timeline starts history');
  old = await store.access(old.id, owner);
  assert.equal(String(old.history_since), old.revision);
  assert.equal(await versionsOf(old.id), 403);
  old = await store.save(old.id, owner, old.revision, undefined, {
    settings,
    changes: [{ id: 'm5', event: moment(5, 'After migrating') }],
  });
  const after = (
    await pool.query('SELECT stored_bytes FROM oc_revisions WHERE id=$1', [old.head_revision_id])
  ).rows[0].stored_bytes;
  assert(after < 1000, `charged its change (${after})`);
  assert.equal(await versionsOf(old.id), 404, 'one new moment version, no new settings');
  assert.deepEqual(await store.revisionDocument(pool, oldHead), original);
  assert.equal(
    (await store.revisionDocument(pool, old.head_revision_id)).events[5].metadata.title,
    'After migrating',
  );

  // A fork refers to the head; deleting the timeline keeps what the fork's base sees.
  const fork = await versions.copy(t.id, owner, { revision: t.revision });
  timelines.push(fork.id);
  const base = t.head_revision_id;
  await store.transaction(async (c) => {
    await c.query('DELETE FROM oc_timelines WHERE id=$1', [t.id]);
    await store.removeHistory(c, t.id);
  });
  assert.deepEqual(await store.revisionDocument(pool, base), validateDocument(renamed));
  // The fork's base stays, with every version it sees.
  assert.equal(await versionsOf(t.id), 402);
  // Once nothing refers to it, nothing of its history is left.
  await pool.query('UPDATE oc_timelines SET fork_base_revision_id=NULL WHERE id=$1', [fork.id]);
  await pool.query('DELETE FROM oc_revision_parents WHERE parent_id=$1', [base]);
  await store.transaction((c) => store.removeHistory(c, t.id));
  assert.equal(await versionsOf(t.id), 0);
  assert.equal(
    (await pool.query('SELECT count(*) AS n FROM oc_revisions WHERE timeline_id=$1', [t.id]))
      .rows[0].n,
    '0',
  );
  console.log(
    'PASS saved history as rows: older revisions stay readable, rows start with one copy, saves are charged their changes, versions are immutable, deletion keeps what forks need.',
  );
} finally {
  for (const id of timelines) {
    await pool.query('DELETE FROM oc_timelines WHERE id=$1', [id]);
    await store.transaction((c) => store.removeHistory(c, id)).catch(() => {});
  }
  await pool.query('DELETE FROM oc_storage_entries WHERE user_id=$1', [owner]);
  await pool.query('DELETE FROM oc_users WHERE id=$1', [owner]);
  await pool.end();
}
