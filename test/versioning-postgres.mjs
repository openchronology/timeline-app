// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// Versioning against PostgreSQL (npm run test:versioning:postgres): immutable history, forks and
// copies, pinned proposals, sync, merge ancestry, conflicts, privacy and upstream deletion.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import pg from 'pg';
import { PostgresStore } from '../server/store.mjs';
import { Versioning, commonAncestor } from '../server/versioning.mjs';
import { Collaboration } from '../server/collaboration.mjs';
import {
  demo,
  validateDocument,
  PLUGIN_EXAMPLE,
  validatePluginManifest,
  DEFAULT_PRESENTATION,
  CUSTOM_EXAMPLE,
} from '../dist/core.mjs';
if (!process.env.DATABASE_URL) throw new Error('Use a dedicated PostgreSQL test database.');
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL }),
  store = new PostgresStore(pool),
  versions = new Versioning(store),
  pulls = new Collaboration(store);
const users = [randomUUID(), randomUUID(), randomUUID()],
  timelines = [];
const [owner, contributor, reader] = users;
async function rejected(fn, status) {
  await assert.rejects(fn, (e) => e.status === status);
}
try {
  const schema = await readFile(new URL('../server/schema.sql', import.meta.url), 'utf8');
  await pool.query(schema);
  await pool.query(schema);
  for (const [i, id] of users.entries())
    await pool.query('INSERT INTO oc_users(id,username) VALUES($1,$2)', [
      id,
      'version_' + id.slice(0, 8) + '_' + i,
    ]);
  const doc = validateDocument({
    ...demo(),
    title: 'Fork fixture',
    tags: ['ancestry'],
    plugins: [{ manifest: validatePluginManifest(PLUGIN_EXAMPLE), enabled: true }],
    // No image copies: the server keeps links, not copies (#109; image-links-postgres.mjs).
    presentation: { ...DEFAULT_PRESENTATION, mode: 'custom', source: CUSTOM_EXAMPLE },
  });
  const legacyId = randomUUID(),
    legacyPull = randomUUID();
  timelines.push(legacyId);
  await pool.query('INSERT INTO oc_timelines(id,owner_id,title) VALUES($1,$2,$3)', [
    legacyId,
    owner,
    doc.title,
  ]);
  await store.transaction((c) => store.replace(c, legacyId, doc));
  await pool.query(
    'INSERT INTO oc_proposals(id,timeline_id,author_id,title,base_revision,base_document,document) VALUES($1,$2,$3,$4,1,$5::jsonb,$5::jsonb)',
    [legacyPull, legacyId, owner, 'Old review', JSON.stringify(doc)],
  );
  await pool.query(schema);
  await pool.query(schema);
  assert.equal((await store.access(legacyId, owner)).head_revision_id, legacyId);
  assert.deepEqual((await versions.historical(legacyId, legacyId, owner)).document, doc);
  assert((await pulls.get(legacyId, legacyPull, owner)).source_revision_id);
  // A copy of a head saved as a document (not kept as rows) rebuilds its index from it.
  const legacyCopy = await versions.copy(
    legacyId,
    owner,
    { revision: (await store.access(legacyId, owner)).revision },
    true,
  );
  timelines.push(legacyCopy.id);
  assert.deepEqual((await store.snapshot(legacyCopy.id, owner)).document, doc);
  let upstream = await store.create(owner, doc);
  timelines.push(upstream.id);
  await pool.query("INSERT INTO oc_members(timeline_id,user_id,role) VALUES($1,$2,'viewer')", [
    upstream.id,
    reader,
  ]);
  await rejected(() => versions.copy(upstream.id, reader, { revision: upstream.revision }), 403);
  await rejected(() => versions.copy(upstream.id, null, { revision: upstream.revision }), 401);
  await pool.query('UPDATE oc_timelines SET allow_private_forks=true WHERE id=$1', [upstream.id]);
  const privateFork = await versions.copy(upstream.id, reader, { revision: upstream.revision });
  timelines.push(privateFork.id);
  assert(privateFork.publication_restricted);
  assert.equal(privateFork.visibility, 'private');
  assert.equal(privateFork.role, 'owner');
  assert(!(await store.access(upstream.id, reader)).canPropose);
  await pool.query("UPDATE oc_timelines SET visibility='public' WHERE id=$1", [upstream.id]);
  upstream = await store.access(upstream.id, owner);
  let fork = await versions.copy(upstream.id, contributor, { revision: upstream.revision });
  timelines.push(fork.id);
  assert.equal(fork.upstream_id, upstream.id);
  assert.equal(fork.fork_base_revision_id, upstream.head_revision_id);
  assert.equal(fork.visibility, 'private');
  assert(!fork.publication_restricted);
  assert.deepEqual(
    (await store.snapshot(fork.id, contributor)).document,
    (await store.snapshot(upstream.id, owner)).document,
  );
  assert.equal(
    (await pool.query('SELECT count(*) AS n FROM oc_members WHERE timeline_id=$1', [fork.id]))
      .rows[0].n,
    '0',
  );
  // The fork's history is kept as rows that read through to the upstream's, not a copy.
  assert.deepEqual(
    (
      await pool.query(
        `SELECT r.history_rows,b.base_revision_id,
        (SELECT count(*) FROM oc_history_moments WHERE timeline_id=r.timeline_id)::int AS moments
        FROM oc_revisions r JOIN oc_history_bases b ON b.timeline_id=r.timeline_id WHERE r.id=$1`,
        [fork.head_revision_id],
      )
    ).rows[0],
    { history_rows: true, base_revision_id: upstream.head_revision_id, moments: 0 },
  );
  const duplicate = await versions.copy(
    upstream.id,
    contributor,
    { revision: upstream.revision },
    true,
  );
  timelines.push(duplicate.id);
  assert.equal(duplicate.upstream_id, null);
  assert.equal((await versions.history(duplicate.id, contributor)).revisions[0].parents.length, 0);
  const originalFork = fork.head_revision_id;
  const changed = validateDocument({
    ...doc,
    events: doc.events.map((e, i) =>
      i === 0 ? { ...e, metadata: { ...e.metadata, title: 'Fork change' } } : e,
    ),
  });
  // Changed twice, so the fork has a version of its own that ended.
  const briefly = validateDocument({
    ...changed,
    events: changed.events.map((e, i) => (i === 0 ? { ...e, metadata: { title: 'Briefly' } } : e)),
  });
  fork = await store.save(fork.id, contributor, fork.revision, briefly);
  fork = await store.save(fork.id, contributor, fork.revision, changed);
  assert.notEqual(fork.head_revision_id, originalFork);
  assert.deepEqual((await versions.historical(fork.id, originalFork, contributor)).document, doc);
  // Saved versions cannot be rewritten, nor ended again.
  await assert.rejects(
    pool.query(
      `UPDATE oc_history_moments SET event='{}'::jsonb WHERE timeline_id=$1 AND since=(SELECT number FROM oc_revisions WHERE id=$2)`,
      [fork.id, fork.head_revision_id],
    ),
    /immutable/,
  );
  await assert.rejects(
    pool.query(
      'UPDATE oc_history_moments SET until=until+1 WHERE timeline_id=$1 AND until IS NOT NULL',
      [fork.id],
    ),
    /immutable/,
  );
  await assert.rejects(
    pool.query("UPDATE oc_revisions SET kind='save' WHERE id=$1", [originalFork]),
    /immutable/,
  );
  // Nor can what it reads through to, or where it keeps its own versions.
  await assert.rejects(
    pool.query('UPDATE oc_history_bases SET base_revision_id=$2 WHERE timeline_id=$1', [
      fork.id,
      originalFork,
    ]),
    /immutable/,
  );
  await assert.rejects(
    pool.query('UPDATE oc_history_moment_overrides SET since=since+1 WHERE timeline_id=$1', [
      fork.id,
    ]),
    /immutable/,
  );
  let proposal = await pulls.create(upstream.id, contributor, {
    title: 'From saved fork',
    body: 'Pinned changes',
    sourceTimelineId: fork.id,
    sourceRevisionId: fork.head_revision_id,
  });
  const submitted = proposal.source_revision_id;
  const later = validateDocument({ ...changed, title: 'Later title' });
  fork = await store.save(fork.id, contributor, fork.revision, later);
  proposal = await pulls.get(upstream.id, proposal.id, owner);
  assert.equal(proposal.source_revision_id, submitted);
  // A pull request carries a summary of its changes, not documents; its proposed timeline
  // is read when asked for.
  assert.equal(proposal.document, undefined);
  assert.equal(proposal.base_document, undefined);
  assert.deepEqual(proposal.changes.moments, { added: 0, removed: 0, changed: 1 });
  assert.deepEqual(proposal.changes.settings, []);
  assert.equal(proposal.changes.examples[0].after.metadata.title, 'Fork change');
  assert.equal(proposal.changes.examples[0].before.metadata.title, doc.events[0].metadata.title);
  assert.equal((await pulls.document(upstream.id, proposal.id, owner)).document.title, doc.title);
  await rejected(
    () =>
      pulls.update(upstream.id, proposal.id, owner, {
        title: proposal.title,
        body: proposal.body,
        revision: proposal.revision,
        sourceTimelineId: fork.id,
        sourceRevisionId: fork.head_revision_id,
      }),
    403,
  );
  proposal = await pulls.update(upstream.id, proposal.id, contributor, {
    title: proposal.title,
    body: proposal.body,
    revision: proposal.revision,
    sourceTimelineId: fork.id,
    sourceRevisionId: fork.head_revision_id,
  });
  assert.equal(proposal.source_revision_id, fork.head_revision_id);
  const upstreamDoc = validateDocument({ ...doc, description: 'Independent upstream change' });
  upstream = await store.save(upstream.id, owner, upstream.revision, upstreamDoc);
  await rejected(
    () =>
      pulls.resolve(upstream.id, proposal.id, contributor, {
        action: 'merge',
        revision: proposal.revision,
      }),
    403,
  );
  const merged = await pulls.resolve(upstream.id, proposal.id, owner, {
    action: 'merge',
    revision: proposal.revision,
  });
  assert.equal(merged.status, 'merged');
  assert(merged.merged_revision_id);
  const current = await store.snapshot(upstream.id, owner);
  assert.equal(current.document.title, 'Later title');
  assert.equal(current.document.description, upstreamDoc.description);
  const mergeHistory = await versions.history(upstream.id, owner);
  assert.deepEqual(mergeHistory.revisions[0].parents, [
    upstream.head_revision_id,
    fork.head_revision_id,
  ]);
  assert.equal(
    await commonAncestor(pool, current.timeline.head_revision_id, fork.head_revision_id),
    fork.head_revision_id,
  );
  await rejected(() => versions.historical(upstream.id, fork.head_revision_id, null), 404);
  // Repeated contributions must use the latest common ancestor, not the original fork point.
  fork = await versions.sync(fork.id, contributor, { revision: fork.revision });
  assert.equal(
    (await store.snapshot(fork.id, contributor)).document.description,
    upstreamDoc.description,
  );
  const synced = fork.head_revision_id;
  fork = await versions.sync(fork.id, contributor, { revision: fork.revision });
  assert.equal(fork.head_revision_id, synced);
  const nextDoc = validateDocument({ ...current.document, description: 'Second contribution' });
  fork = await store.save(fork.id, contributor, fork.revision, nextDoc);
  const second = await pulls.create(upstream.id, contributor, {
    title: 'Second round',
    body: '',
    sourceTimelineId: fork.id,
    sourceRevisionId: fork.head_revision_id,
  });
  assert.equal(second.base_revision_id, current.timeline.head_revision_id);
  assert.equal((await store.revisionDocument(pool, second.base_revision_id)).title, 'Later title');
  assert.deepEqual(second.changes.settings, ['description']);
  // Conflicting edits roll back index, head, and history together.
  upstream = await store.access(upstream.id, owner);
  upstream = await store.save(upstream.id, owner, upstream.revision, {
    ...current.document,
    description: 'Different change',
  });
  const before = (await versions.history(fork.id, contributor)).revisions.length;
  await assert.rejects(
    versions.sync(fork.id, contributor, { revision: fork.revision }),
    (e) => e.status === 409 && e.conflicts.includes('description'),
  );
  assert.equal((await store.access(fork.id, contributor)).head_revision_id, fork.head_revision_id);
  assert.equal((await versions.history(fork.id, contributor)).revisions.length, before);
  await rejected(() => store.save(fork.id, contributor, '1', nextDoc), 409);
  // Public readers see only the submitted document, not the fork or its private history.
  await rejected(() => versions.history(fork.id, null), 404);
  assert.equal((await pulls.get(upstream.id, second.id, null)).source, null);
  await pool.query("UPDATE oc_timelines SET visibility='private' WHERE id=$1", [upstream.id]);
  await rejected(() => versions.sync(fork.id, contributor, { revision: fork.revision }), 404);
  assert.equal((await store.access(fork.id, contributor)).role, 'owner');
  // Deleting upstream preserves the independently owned fork and its saved ancestry.
  await store.transaction(async (c) => {
    await c.query('DELETE FROM oc_timelines WHERE id=$1', [upstream.id]);
    await store.removeHistory(c, upstream.id);
  });
  fork = await store.access(fork.id, contributor);
  assert.equal(fork.upstream_id, null);
  assert.equal(
    (await versions.historical(fork.id, originalFork, contributor)).document.title,
    doc.title,
  );
  assert.equal(
    (
      await pool.query('SELECT id FROM oc_revisions WHERE id=$1', [
        current.timeline.head_revision_id,
      ])
    ).rows.length,
    1,
  );
  const raced = await Promise.allSettled([
    store.save(duplicate.id, contributor, duplicate.revision, {
      ...doc,
      title: 'First concurrent save',
    }),
    store.save(duplicate.id, contributor, duplicate.revision, {
      ...doc,
      title: 'Second concurrent save',
    }),
  ]);
  assert.equal(raced.filter((r) => r.status === 'fulfilled').length, 1);
  assert.equal(raced.find((r) => r.status === 'rejected').reason.status, 409);
  assert.equal((await versions.history(duplicate.id, contributor)).revisions.length, 2);
  console.log(
    'PASS immutable PostgreSQL history, private/public forks, independent copies, pinned proposals, explicit updates, merge ancestry, repeated sync, conflict rollback, privacy and upstream deletion.',
  );
} finally {
  for (const id of timelines.reverse())
    await store.transaction(async (c) => {
      await c.query('DELETE FROM oc_timelines WHERE id=$1', [id]);
      await store.removeHistory(c, id);
    });
  for (const id of users) await pool.query('DELETE FROM oc_users WHERE id=$1', [id]);
  await pool.end();
}
