// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// Oracle: PostgreSQL summaries of moments and collapsed durations match the browser index.
import pg from 'pg';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { PostgresStore, convertLegacyDurations } from '../server/store.mjs';
import { Q, TimelineIndex, Viewport, validateDocument } from '../dist/core.mjs';
if (!process.env.DATABASE_URL) throw new Error('Use a dedicated PostgreSQL test database.');
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const user = randomUUID();
const created = [];
let seed = 20261008;
const random = () => {
  seed = (seed * 1103515245 + 12345) % 2147483648;
  return seed / 2147483648;
};
const shape = (frame) => ({
  groups: frame.groups.map((g) => ({
    first: g.first,
    last: g.last,
    count: g.count,
    distinct: g.distinct,
    durationCount: g.durationCount ?? '0',
    id: g.id ?? g.duration?.id ?? null,
  })),
  bands: frame.durations.map((b) => b.id).sort(),
});
try {
  await pool.query(await readFile(new URL('../server/schema.sql', import.meta.url), 'utf8'));
  await pool.query('INSERT INTO oc_users(id,username,email_verified_at) VALUES($1,$2,now())', [
    user,
    'summaries_' + user.slice(0, 8),
  ]);
  const store = new PostgresStore(pool);
  let compared = 0;
  const seen = { mixed: 0, clusters: 0, singles: 0, bands: 0 };
  for (let trial = 0; trial < 6; trial++) {
    const events = [],
      durations = [];
    const moments = 40 + Math.floor(random() * 120);
    for (let i = 0; i < moments; i++)
      events.push({
        id: 'm' + i,
        time: Q.from(BigInt(Math.floor(random() * 4000)), 8n).toString(),
        metadata: { title: 'M' + i },
      });
    for (let i = 0; i < 30 + Math.floor(random() * 150); i++) {
      const start = BigInt(Math.floor(random() * 4000));
      // Mostly short durations, some long, some anchored to moments.
      const length = BigInt(Math.floor(random() < 0.8 ? random() * 40 : random() * 2000));
      durations.push({
        id: 'd' + String(i).padStart(3, '0'),
        start:
          random() < 0.2
            ? { moment: 'm' + Math.floor(random() * moments) }
            : Q.from(start, 8n).toString(),
        end: Q.from(start + length, 8n).toString(),
        metadata: { title: 'D' + i, color: '#aa0000' },
      });
    }
    const doc = validateDocument({
      format: 'openchronology',
      version: 1,
      title: 'Summaries ' + trial,
      description: '',
      events,
      durations,
    });
    const timeline = await store.create(user, doc);
    created.push(timeline.id);
    const index = new TimelineIndex(doc);
    for (let view = 0; view < 25; view++) {
      const left = Q.from(BigInt(Math.floor(random() * 4400) - 200), 8n);
      const span = Q.from(BigInt(1 + Math.floor(random() * 4000)), 8n);
      const width = 1000,
        pixels = [4, 12, 24, 60][view % 4];
      const viewport = new Viewport(left, span);
      // The server enforces at least span/1024; use thresholds above that minimum.
      const threshold = viewport.threshold(width, pixels);
      const expected = shape(index.frame(viewport, width, pixels));
      const actual = shape(
        await store.query(timeline.id, user, {
          kind: 'overview',
          lower: viewport.left.toString(),
          upper: viewport.right.toString(),
          threshold: threshold.toString(),
        }),
      );
      assert.deepEqual(actual, expected, `trial ${trial}, view ${view}`);
      compared++;
      for (const g of expected.groups) {
        if (g.count !== '0' && g.durationCount !== '0') seen.mixed++;
        if (g.count === '0' && Number(g.durationCount) > 1) seen.clusters++;
        if (g.count === '0' && g.durationCount === '1') seen.singles++;
      }
      seen.bands += expected.bands.length;
    }
  }
  // Duration pages list durations inside a summary with an exact cursor.
  const id = created[0];
  const all = await store.query(id, user, {
    kind: 'durations',
    lower: '-1000/1',
    upper: '1000/1',
    limit: 7,
    after: null,
  });
  for (const [kind, n] of Object.entries(seen)) assert(n > 0, `The oracle exercised ${kind}.`);
  let page = all,
    listed = page.durations.length;
  while (page.next) {
    page = await store.query(id, user, {
      kind: 'durations',
      lower: '-1000/1',
      upper: '1000/1',
      limit: 7,
      after: page.next,
    });
    listed += page.durations.length;
  }
  const total = (
    await pool.query(
      "SELECT count(*) FROM oc_duration_nodes WHERE timeline_id=$1 AND first_time>='-1000/1'::mpq AND last_time<='1000/1'::mpq",
      [id],
    )
  ).rows[0].count;
  assert.equal(String(listed), total);
  // Index rows built before subtree summaries existed are rebuilt by the migration.
  await pool.query(
    'UPDATE oc_duration_nodes SET max_first=NULL,subtree_count=NULL,min_extent=NULL,max_extent=NULL WHERE timeline_id=$1',
    [id],
  );
  const client = await pool.connect();
  try {
    assert((await convertLegacyDurations(client)) >= 1);
  } finally {
    client.release();
  }
  assert.equal(
    (
      await pool.query(
        'SELECT count(*) FROM oc_duration_nodes WHERE timeline_id=$1 AND max_first IS NULL',
        [id],
      )
    ).rows[0].count,
    '0',
  );
  console.log(
    `PASS PostgreSQL summaries: ${compared} random views (${JSON.stringify(seen)}) match the browser index for moment groups, collapsed duration clusters and bands; duration pages are complete.`,
  );
} finally {
  for (const id of created) await pool.query('DELETE FROM oc_timelines WHERE id=$1', [id]);
  await pool.query('DELETE FROM oc_users WHERE id=$1', [user]);
  await pool.end();
}
