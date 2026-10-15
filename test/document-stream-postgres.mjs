// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// Documents written a part at a time (server/document-stream.mjs, #135): a timeline's JSON
// (`{timeline, document}`, or the document alone as an .ochx) and a saved revision's, read
// a page at a time from one snapshot, must parse to what reading them whole gives (the same
// entities, in their indexes' order):
// for a timeline, a fork reading through to it, an empty timeline and a comparison; for
// revisions kept as rows (a fork's too), one stored as a document before that, and the head
// of a timeline keeping no saved history. A revision that is not kept fails before anything
// is written, and a stream closed early gives its connection back.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import pg from 'pg';
import { PostgresStore } from '../server/store.mjs';
import { Versioning } from '../server/versioning.mjs';
import { validateDocument } from '../dist/core.mjs';
import { generateTimeline } from '../bench/generate.mjs';
if (!process.env.DATABASE_URL) throw new Error('Use a dedicated PostgreSQL test database.');
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL }),
  store = new PostgresStore(pool),
  versions = new Versioning(store);
const owner = randomUUID(),
  timelines = [];
/** The text of a stream, and how many parts it came in. */
async function collect(chunks) {
  let text = '',
    parts = 0;
  for await (const part of chunks) {
    text += part;
    parts++;
  }
  return { value: JSON.parse(text), parts };
}
/** As JSON would send it (dates as text). */
const sent = (value) => JSON.parse(JSON.stringify(value));
const byText = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const link = (r) => JSON.stringify([r.a, r.b]);
/**
 * A document with its entities in one order: streams list them in their indexes' orders
 * rather than a document's.
 */
const normal = (d) => ({
  ...d,
  events: [...d.events].sort((a, b) => byText(a.id, b.id)),
  ...(d.durations ? { durations: [...d.durations].sort((a, b) => byText(a.id, b.id)) } : {}),
  ...(d.relationships
    ? { relationships: [...d.relationships].sort((a, b) => byText(link(a), link(b))) }
    : {}),
});
const wrapped = ({ document, ...rest }) => ({ ...rest, document: normal(document) });
/** The timeline streamed whole and alone equals snapshot. */
async function checkLive(name, id) {
  const whole = sent(await store.snapshot(id, owner));
  const streamed = await collect(store.snapshotChunks(id, owner));
  assert.deepEqual(wrapped(streamed.value), wrapped(whole), `${name}: {timeline, document}`);
  assert.deepEqual(
    normal((await collect(store.snapshotChunks(id, owner, { documentOnly: true }))).value),
    normal(whole.document),
    `${name}: the document alone`,
  );
  return streamed.parts;
}
/** A revision streamed equals it read whole. */
async function checkRevision(name, id, savedId) {
  const whole = sent(await versions.historical(id, savedId, owner));
  assert.deepEqual(
    wrapped((await collect(store.revisionChunks(id, savedId, owner))).value),
    wrapped(whole),
    `${name}: {document}`,
  );
  assert.deepEqual(
    normal((await collect(store.revisionChunks(id, savedId, owner, { documentOnly: true }))).value),
    normal(whole.document),
    `${name}: the document alone`,
  );
}
try {
  await pool.query(await readFile(new URL('../server/schema.sql', import.meta.url), 'utf8'));
  await pool.query('INSERT INTO oc_users(id,username,quota_bypass) VALUES($1,$2,true)', [
    owner,
    'stream_' + owner.slice(0, 8),
  ]);
  // Large enough for several pages of each cursor and several parts of text.
  const document = generateTimeline(6000);
  let t = await store.create(owner, document);
  timelines.push(t.id);
  const created = t.head_revision_id;
  assert((await checkLive('timeline', t.id)) > 3, 'written in several parts');
  const settings = { ...document, events: [], durations: undefined, relationships: undefined };
  t = await store.save(t.id, owner, t.revision, undefined, {
    settings: { ...settings, title: 'Streamed' },
    changes: [
      { id: document.events[3].id, event: null },
      { id: 'new', event: { id: 'new', time: '5/1', metadata: { title: 'New' } } },
    ],
    durationChanges: [{ id: document.durations[0].id, duration: null }],
  });
  await checkLive('after a save', t.id);
  await checkRevision('revision kept as rows', t.id, created);
  await checkRevision('head kept as rows', t.id, t.head_revision_id);

  // A fork reads through to its source; its revisions read through to its source's.
  let fork = await versions.copy(t.id, owner, { revision: t.revision });
  timelines.push(fork.id);
  fork = await store.save(fork.id, owner, fork.revision, undefined, {
    settings,
    changes: [{ id: document.events[10].id, event: null }],
  });
  await checkLive('fork', fork.id);
  await checkRevision('fork revision', fork.id, fork.head_revision_id);

  // A revision stored as a document, from before history was kept as rows.
  const legacy = await store.transaction((c) =>
    store.recordRevision(c, t.id, owner, validateDocument(document), 'save', [], null, '999999'),
  );
  await checkRevision('revision stored as a document', t.id, legacy);

  // The head of a timeline keeping no saved history is its live document; a past revision
  // is not kept, and fails before anything is written.
  await store.transaction(async (c) => {
    await c.query('SELECT 1 FROM oc_timelines WHERE id=$1 FOR UPDATE', [fork.id]);
    await store.stopHistory(c, fork.id);
  });
  fork = await store.save(fork.id, owner, fork.revision, undefined, {
    settings,
    changes: [{ id: document.events[11].id, event: null }],
  });
  await checkRevision('head without saved history', fork.id, fork.head_revision_id);
  const { rows: past } = await pool.query(
    'SELECT id FROM oc_revisions WHERE timeline_id=$1 AND number IS NOT NULL AND id<>$2 LIMIT 1',
    [fork.id, fork.head_revision_id],
  );
  const refused = store.revisionChunks(fork.id, past[0].id, owner);
  await assert.rejects(refused.next(), (e) => e.status === 409);
  await assert.rejects(store.snapshotChunks(randomUUID(), owner).next(), (e) => e.status === 404);

  // An empty timeline, and a comparison (which stores no moments).
  const empty = await store.create(owner, { ...settings, title: 'Empty' });
  timelines.push(empty.id);
  await checkLive('empty timeline', empty.id);
  const comparison = await store.create(
    owner,
    validateDocument({
      ...settings,
      title: 'Compared',
      comparison: { sources: [t.id, empty.id], combined: false },
    }),
  );
  timelines.push(comparison.id);
  await checkLive('comparison', comparison.id);

  // Closed after its first part, a stream gives its connection back.
  const idle = () => pool.totalCount - pool.idleCount;
  const before = idle();
  const early = store.snapshotChunks(t.id, owner);
  await early.next();
  assert.equal(idle(), before + 1, 'holds a connection while open');
  await early.return();
  assert.equal(idle(), before, 'gives it back when closed');
  console.log(
    'PASS document streams: timelines (forks, empty, comparisons) and saved revisions (kept as rows, stored as documents, heads without history) stream to what reading them whole gives, unavailable ones fail first, and closed streams release their connection.',
  );
} finally {
  await store.idle();
  for (const id of timelines.reverse())
    await store.transaction(async (c) => {
      await c.query('DELETE FROM oc_timelines WHERE id=$1', [id]);
      await store.removeHistory(c, id);
    });
  await pool.query('DELETE FROM oc_storage_entries WHERE user_id=$1', [owner]);
  await pool.query('DELETE FROM oc_users WHERE id=$1', [owner]);
  await pool.end();
}
