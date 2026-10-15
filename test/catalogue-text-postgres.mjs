// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// A timeline's catalogue text (event_text, searched by the catalogue): duration then moment
// titles and notes, durations in start order (then ID), moments in time order (then ID, "C"
// order), each moment followed by its stacked entries, each part at most 4096 characters and
// the whole at most 1 MiB. The database builds it after saves (oc_event_text, read in order
// and stopped once full, #135); a whole document written builds the same in Node
// (eventSearchText). Both, and a fork's, must equal the reference below.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import pg from 'pg';
import { PostgresStore } from '../server/store.mjs';
import { Versioning } from '../server/versioning.mjs';
import { Q, validateDocument } from '../dist/core.mjs';
if (!process.env.DATABASE_URL) throw new Error('Use a dedicated PostgreSQL test database.');
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL }),
  store = new PostgresStore(pool),
  versions = new Versioning(store);
const owner = randomUUID(),
  timelines = [];
const LIMIT = 1048576;
const byText = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
/** The catalogue text of a validated document, as documented above. */
function reference(document) {
  const parts = [];
  const add = (m) => {
    for (const key of ['title', 'description'])
      if (typeof m?.[key] === 'string') parts.push(m[key].slice(0, 4096));
  };
  const start = (d) => {
    if (typeof d.start === 'string') return Q.parse(d.start);
    return Q.parse(document.events.find((e) => e.id === d.start.moment).time);
  };
  for (const d of [...(document.durations ?? [])].sort(
    (a, b) => start(a).compare(start(b)) || byText(a.id, b.id),
  ))
    add(d.metadata);
  for (const e of [...document.events].sort(
    (a, b) => Q.parse(a.time).compare(Q.parse(b.time)) || byText(a.id, b.id),
  )) {
    add(e.metadata);
    for (const value of Object.values(e.metadata))
      if (Array.isArray(value)) for (const entry of value) add(entry?.metadata);
  }
  return parts.join(' ').slice(0, LIMIT);
}
const stored = async (id) =>
  (await pool.query('SELECT event_text FROM oc_timelines WHERE id=$1', [id])).rows[0].event_text;
const built = async (id) =>
  (await pool.query('SELECT oc_event_text($1) AS text', [id])).rows[0].text;
const document = (events, durations = []) =>
  validateDocument({
    format: 'openchronology',
    version: 1,
    title: 'Catalogue',
    description: '',
    events,
    ...(durations.length ? { durations } : {}),
  });
try {
  await pool.query(await readFile(new URL('../server/schema.sql', import.meta.url), 'utf8'));
  await pool.query('INSERT INTO oc_users(id,username,quota_bypass) VALUES($1,$2,true)', [
    owner,
    'catalogue_' + owner.slice(0, 8),
  ]);
  // Shared times, IDs whose "C" order differs from other collations, stacked entries, parts
  // longer than 4096 characters.
  const ids = ['b', 'B', 'a', 'A', '_x', 'm-1', 'm.2', 'Z9'];
  const small = document(
    ids.flatMap((id, i) => [
      {
        id: id + 'early',
        time: `${(i % 3) + 1}/2`,
        metadata: {
          title: 'Early ' + id,
          description: i === 2 ? 'long '.repeat(1000) : 'notes ' + id,
          ...(i === 4 ? { entries: [{ metadata: { title: 'Stacked ' + id } }, {}] } : {}),
        },
      },
      { id: id + 'late', time: `${100 - i}/1`, metadata: { title: 'Late ' + id } },
    ]),
    [
      { id: 'dB', start: '5/1', end: '9/1', metadata: { title: 'Span B', description: 'x' } },
      { id: 'da', start: '5/1', end: '6/1', metadata: { title: 'Span a' } },
      { id: 'dz', start: { moment: 'aearly' }, end: '2/1', metadata: { title: 'Span z' } },
      { id: 'd0', start: '200/1', end: '300/1', metadata: { title: 'x'.repeat(5000) } },
    ],
  );
  let t = await store.create(owner, small);
  timelines.push(t.id);
  const expected = reference(small);
  assert.equal(await stored(t.id), expected, 'written from the document');
  assert.equal(await built(t.id), expected, 'built in the database');
  // A fork builds the same through its levels; both follow incremental saves.
  const fork = await versions.copy(t.id, owner, { revision: t.revision });
  timelines.push(fork.id);
  assert.equal(await built(fork.id), expected, 'a fork');
  const settings = { ...small, events: [], durations: undefined };
  t = await store.save(t.id, owner, t.revision, undefined, {
    settings,
    changes: [
      { id: 'new', event: { id: 'new', time: '0/1', metadata: { title: 'Newest first' } } },
      { id: 'blate', event: null },
    ],
  });
  await store.idle();
  const changed = reference((await store.snapshot(t.id, owner)).document);
  assert(changed.startsWith('Span z Span B x Span a xxx'), changed.slice(0, 40));
  assert.equal(await stored(t.id), changed, 'refreshed after a save');
  assert.equal(await built(fork.id), expected, 'the fork is unchanged');

  // Read a page of moments at a time: across pages, including moments sharing a time
  // across a page's end.
  const paged = document(
    Array.from({ length: 2500 }, (_, i) => ({
      id: 'p' + ((i * 7919) % 2500),
      time: `${Math.floor(i / 7)}/1`,
      metadata: { title: 'Paged ' + i },
    })),
  );
  const pages = await store.create(owner, paged);
  timelines.push(pages.id);
  assert.equal(await built(pages.id), reference(paged));
  assert.equal(await stored(pages.id), reference(paged));
  assert.equal((await built(pages.id)).split('Paged').length - 1, 2500);

  // Past 1 MiB, the text stops: moments that fill it, and durations alone that fill it.
  const big = document(
    Array.from({ length: 300 }, (_, i) => ({
      id: 'm' + String(i).padStart(3, '0'),
      time: `${i}/1`,
      metadata: { title: String(i).repeat(5000), description: 'd'.repeat(4100) },
    })),
  );
  const full = await store.create(owner, big);
  timelines.push(full.id);
  assert.equal(reference(big).length, LIMIT);
  assert.equal(await stored(full.id), reference(big));
  assert.equal(await built(full.id), reference(big));
  const spans = document(
    [{ id: 'm', time: '0/1', metadata: { title: 'Moment' } }],
    Array.from({ length: 150 }, (_, i) => ({
      id: 'd' + i,
      start: `${150 - i}/1`,
      end: '1000/1',
      metadata: { title: String(i).repeat(5000), description: 'e'.repeat(4000) },
    })),
  );
  const durations = await store.create(owner, spans);
  timelines.push(durations.id);
  assert(!reference(spans).includes('Moment'));
  assert.equal(await stored(durations.id), reference(spans));
  assert.equal(await built(durations.id), reference(spans));
  // An empty timeline has none.
  const empty = await store.create(owner, document([]));
  timelines.push(empty.id);
  assert.equal(await built(empty.id), '');
  console.log(
    'PASS catalogue text: durations by start then moments by time, stacked entries, parts and the whole capped, the same built in the database (stopping once full), from a document and through a fork.',
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
