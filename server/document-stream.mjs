// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
/**
 * Timeline documents written out a part at a time (#135): exporting a timeline or reading a
 * saved revision as JSON reads its moments, durations and relationships a page at a time, in
 * orders their indexes give, and yields the JSON text as it goes, so neither the server's
 * memory nor a single statement grows with the timeline. A stream lists the same entities as
 * the document read whole, in another order: moments by ID rather than time, durations by
 * start, relationships by their key's columns.
 */

/**
 * Relationships (a_kind, a_id, b_kind, b_id columns) in a document's order: by their key
 * (relationshipKey in src/relationships.ts), as validateDocument sorts them. No index gives
 * it: streams use the primary key's order instead.
 */
export const RELATIONSHIP_ORDER = `(CASE a_kind WHEN 'moment' THEN 'm:' ELSE 'd:' END||a_id||'~'||CASE b_kind WHEN 'moment' THEN 'm:' ELSE 'd:' END||b_id) COLLATE "C"`;
/** Rows fetched per page from a cursor. */
const PAGE = 2000;
/** About how much text is yielded at once. */
const CHUNK = 256 * 1024;

/**
 * The JSON text of a document, in parts: `settings` (its other fields, a non-empty object)
 * and then each of `parts`, [name, rows, row => value]: `rows` an async iterable of arrays of
 * rows (cursorRows, or pages read some other way), written as an array of the values they
 * give, in their order. `events` is always written; the others only when they have rows, as
 * validateDocument leaves them. `prefix` and `suffix` wrap it.
 */
export async function* documentChunks(settings, parts, { prefix = '', suffix = '' } = {}) {
  let text = prefix + JSON.stringify(settings).slice(0, -1);
  for (const [name, rows, value] of parts) {
    let count = 0;
    if (name === 'events') text += ',"events":[';
    for await (const page of rows) {
      for (const row of page) {
        if (!count && name !== 'events') text += `,"${name}":[`;
        text += (count++ ? ',' : '') + JSON.stringify(value(row));
      }
      if (text.length >= CHUNK) {
        yield text;
        text = '';
      }
    }
    if (count || name === 'events') text += ']';
  }
  yield text + '}' + suffix;
}
let cursors = 0;
/**
 * The rows of `sql` (with `params`), a page at a time through a cursor in the transaction of
 * `client`. The order should be one an index gives (or the timeline small enough to sort):
 * the first page waits for whatever the plan does before its first row, and the server stops
 * any statement after 30 s.
 */
export async function* cursorRows(client, sql, params = []) {
  const cursor = 'oc_document_' + ++cursors;
  await client.query(`DECLARE ${cursor} NO SCROLL CURSOR FOR ${sql}`, params);
  try {
    for (;;) {
      const { rows } = await client.query(`FETCH ${PAGE} FROM ${cursor}`);
      if (rows.length) yield rows;
      if (rows.length < PAGE) return;
    }
  } finally {
    await client.query(`CLOSE ${cursor}`).catch(() => {});
  }
}
/**
 * Runs `chunks(client)` (an async generator of text) in a read-only repeatable-read
 * transaction of its own on a client from `pool`, yielding what it yields: one snapshot
 * throughout. The client goes back to the pool when the generator finishes, fails or is
 * closed early (by its consumer's return()).
 */
export async function* inSnapshot(pool, chunks) {
  const client = await pool.connect();
  let failed = false;
  try {
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    yield* chunks(client);
  } catch (error) {
    failed = true;
    throw error;
  } finally {
    await client.query(failed ? 'ROLLBACK' : 'COMMIT').catch(() => (failed = true));
    client.release(failed ? true : undefined);
  }
}
