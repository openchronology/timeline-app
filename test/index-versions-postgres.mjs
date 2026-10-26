// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// Oracle for versioned index rows (#145, server/index-versions.mjs): after random saves
// (sparse and whole-document), a timeline's index as it was at a pinned clock is exactly the
// index at that time, for each of several pins; timelines nothing pins never retire a row;
// and index writes outside a clock fail instead of recording no version.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import pg from 'pg';
import { PostgresStore, applyPatch } from '../server/store.mjs';
import { VERSIONED_TABLES, indexAtSql } from '../server/index-versions.mjs';
import { validateDocument } from '../dist/core.mjs';
import { randomEdits } from './random-edits.mjs';
if (!process.env.DATABASE_URL) throw new Error('Use a dedicated PostgreSQL test database.');
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL }),
  store = new PostgresStore(pool);
const user = randomUUID(),
  created = [];
const { randomDocument, randomPatch } = randomEdits(57);
/** A timeline's live index rows of a table, without their version, as JSON text. */
const live = async (table, id) =>
  (
    await pool.query(
      `SELECT (to_jsonb(x)-'since'-'timeline_id')::text AS row FROM ${table} x WHERE timeline_id=$1`,
      [id],
    )
  ).rows
    .map((r) => r.row)
    .sort();
/** The same rows as they were at clock `clock`, from live and retired rows. */
const at = async (table, id, clock) =>
  (await pool.query(`SELECT row::text FROM (${indexAtSql(table)}) v`, [id, clock])).rows
    .map((r) => r.row)
    .sort();
const index = async (id) =>
  Object.fromEntries(
    await Promise.all(VERSIONED_TABLES.map(async (table) => [table, await live(table, id)])),
  );
const retired = async (id) => {
  let count = 0;
  for (const table of VERSIONED_TABLES)
    count += Number(
      (await pool.query(`SELECT count(*) AS n FROM ${table}_retired WHERE timeline_id=$1`, [id]))
        .rows[0].n,
    );
  return count;
};
const clockOf = async (id) =>
  (await pool.query('SELECT index_clock::text AS c FROM oc_timelines WHERE id=$1', [id])).rows[0].c;
try {
  await pool.query(await readFile(new URL('../server/schema.sql', import.meta.url), 'utf8'));
  await pool.query(
    'INSERT INTO oc_users(id,username,email_verified_at,terms_version) VALUES($1,$2,now(),oc_policy_version())',
    [user, 'versions_' + user.slice(0, 8)],
  );
  /** A random save to `entry` (sparse, or every ninth a whole document). */
  let step = 0;
  async function save(entry) {
    const patch = randomPatch(entry.document, ++step);
    let next;
    try {
      next = validateDocument(applyPatch(entry.document, patch));
    } catch {
      return;
    }
    entry.timeline =
      step % 9 === 0
        ? await store.save(entry.timeline.id, user, entry.timeline.revision, next)
        : await store.save(entry.timeline.id, user, entry.timeline.revision, undefined, patch);
    entry.document = next;
  }
  const pinned = { document: randomDocument('Pinned') };
  pinned.timeline = await store.create(user, pinned.document);
  created.push(pinned.timeline.id);
  const free = { document: randomDocument('Never pinned') };
  free.timeline = await store.create(user, free.document);
  created.push(free.timeline.id);
  // Every row records the clock that wrote it.
  const { rows: unversioned } = await pool.query(
    `SELECT count(*) AS n FROM oc_moments WHERE timeline_id=$1 AND since IS DISTINCT FROM $2`,
    [pinned.timeline.id, await clockOf(pinned.timeline.id)],
  );
  assert.equal(unversioned[0].n, '0');

  // Pins taken along the way, each with the index as it was then; both timelines saved in
  // turn, so retiring follows the timeline written, not the transaction.
  const pins = [];
  for (let round = 1; round <= 60; round++) {
    if (round % 20 === 10) {
      const clock = await clockOf(pinned.timeline.id);
      await pool.query('UPDATE oc_timelines SET index_pinned=$2 WHERE id=$1', [
        pinned.timeline.id,
        clock,
      ]);
      pins.push({ clock, index: await index(pinned.timeline.id) });
    }
    await save(pinned);
    await save(free);
    if (round % 10 === 0 || round === 60)
      for (const pin of pins)
        for (const table of VERSIONED_TABLES)
          assert.deepEqual(
            await at(table, pinned.timeline.id, pin.clock),
            pin.index[table],
            `${table} at clock ${pin.clock}, round ${round}`,
          );
  }
  assert.equal(pins.length, 3);
  assert((await retired(pinned.timeline.id)) > 0, 'pinned rows were retired');
  assert.equal(await retired(free.timeline.id), 0, 'nothing pinned, nothing retired');
  // The current index is the live rows, as before.
  assert.deepEqual(
    (await store.snapshot(pinned.timeline.id, user)).document.events.length,
    pinned.document.events.length,
  );

  // Writing the index outside a clock fails rather than recording no version.
  await assert.rejects(
    pool.query(
      "INSERT INTO oc_moments(timeline_id,id,time,event) VALUES($1,'stray','1/1','{}'::jsonb)",
      [free.timeline.id],
    ),
    // No clock set, or one reset when its transaction ended.
    /oc\.clock|type bigint/,
  );
  // Deleting a timeline deletes its retired rows.
  await store.transaction(async (c) => {
    await c.query('DELETE FROM oc_timelines WHERE id=$1', [pinned.timeline.id]);
    await store.removeHistory(c, pinned.timeline.id);
  });
  assert.equal(await retired(pinned.timeline.id), 0);
  console.log(
    `PASS index versions: after ${step} random saves, the index at each of ${pins.length} pinned clocks reads back exactly; unpinned timelines retire nothing; writes need a clock.`,
  );
} finally {
  await store.idle();
  for (const id of created) {
    await pool.query('DELETE FROM oc_timelines WHERE id=$1', [id]);
    await store.transaction((c) => store.removeHistory(c, id)).catch(() => {});
  }
  await pool.query('DELETE FROM oc_storage_entries WHERE user_id=$1', [user]);
  await pool.query('DELETE FROM oc_users WHERE id=$1', [user]);
  await pool.end();
}
