// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// Oracle: tag-separation views in PostgreSQL match the browser index of the filtered document.
import pg from 'pg';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { PostgresStore } from '../server/store.mjs';
import { Q, TimelineIndex, Viewport, validateDocument, filterDocument } from '../dist/core.mjs';
if (!process.env.DATABASE_URL) throw new Error('Use a dedicated PostgreSQL test database.');
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const user = randomUUID();
let timeline;
let seed = 26;
const random = () => {
  seed = (seed * 1103515245 + 12345) % 2147483648;
  return seed / 2147483648;
};
const TAGS = ['war', 'trade', 'art', 'science'];
const someTags = () => TAGS.filter(() => random() < 0.3);
const shape = (frame) => ({
  groups: frame.groups.map((g) => ({
    first: g.first,
    last: g.last,
    count: g.count,
    distinct: g.distinct,
    durationCount: g.durationCount ?? '0',
    id: g.id ?? g.duration?.id ?? null,
  })),
  bands: frame.durations.map((b) => `${b.id} ${b.first} ${b.last}`).sort(),
});
try {
  await pool.query(await readFile(new URL('../server/schema.sql', import.meta.url), 'utf8'));
  await pool.query('INSERT INTO oc_users(id,username,email_verified_at) VALUES($1,$2,now())', [
    user,
    'views_' + user.slice(0, 8),
  ]);
  const store = new PostgresStore(pool);
  const events = Array.from({ length: 300 }, (_, i) => ({
    id: 'm' + i,
    time: Q.from(BigInt(Math.floor(random() * 4000)), 4n).toString(),
    metadata: { title: 'M' + i, tags: someTags() },
  }));
  // Durations that follow moments on the other side of a separation keep their placement.
  const durations = Array.from({ length: 120 }, (_, i) => {
    const start = BigInt(Math.floor(random() * 4000));
    return {
      id: 'd' + String(i).padStart(3, '0'),
      start:
        random() < 0.4
          ? { moment: 'm' + Math.floor(random() * 300) }
          : Q.from(start, 4n).toString(),
      end: Q.from(
        start + BigInt(Math.floor(random() < 0.7 ? random() * 30 : random() * 1500)),
        4n,
      ).toString(),
      metadata: { title: 'D' + i, tags: someTags() },
    };
  });
  const doc = validateDocument({
    format: 'openchronology',
    version: 1,
    title: 'Views',
    description: '',
    events,
    durations,
  });
  timeline = await store.create(user, doc);
  const { tags } = await store.query(timeline.id, user, { kind: 'tags' });
  const expectedTags = new Map();
  for (const entity of [...doc.events, ...doc.durations])
    for (const tag of entity.metadata.tags ?? [])
      expectedTags.set(tag, (expectedTags.get(tag) ?? 0) + 1);
  assert.deepEqual(
    Object.fromEntries(tags.map((t) => [t.tag, t.count])),
    Object.fromEntries(expectedTags),
  );
  let compared = 0;
  for (const selection of [['war'], ['trade', 'art'], TAGS])
    for (const mode of ['any', 'none']) {
      const filter = { tags: selection, mode };
      const index = new TimelineIndex(filterDocument(doc, filter));
      for (let view = 0; view < 8; view++) {
        const viewport = new Viewport(
          Q.from(BigInt(Math.floor(random() * 4400) - 200), 4n),
          Q.from(BigInt(1 + Math.floor(random() * 4000)), 4n),
        );
        const pixels = [4, 24, 60][view % 3];
        const expected = shape(index.frame(viewport, 1000, pixels));
        const actual = shape(
          await store.query(timeline.id, user, {
            kind: 'overview',
            lower: viewport.left.toString(),
            upper: viewport.right.toString(),
            threshold: viewport.threshold(1000, pixels).toString(),
            filter,
          }),
        );
        assert.deepEqual(actual, expected, `${mode} ${selection} view ${view}`);
        compared++;
      }
      // Event pages and duration pages read the same view.
      const page = await store.query(timeline.id, user, {
        kind: 'events',
        lower: '0/1',
        upper: '1000/1',
        limit: 100,
        after: null,
        filter,
      });
      assert.deepEqual(
        page.events.map((e) => e.id),
        index.eventsBetween('0/1', '1000/1', 100).map((e) => e.id),
      );
      const spans = await store.query(timeline.id, user, {
        kind: 'durations',
        lower: '-10000/1',
        upper: '10000/1',
        limit: 100,
        after: null,
        filter,
      });
      assert.equal(spans.durations.length, Math.min(100, index.durations.size));
    }
  // Repeated separations reuse cached views; a save discards them (after it commits).
  const count = async () =>
    (await pool.query('SELECT count(*) FROM oc_views WHERE timeline_id=$1', [timeline.id])).rows[0]
      .count;
  assert.equal(await count(), '6');
  await store.query(timeline.id, user, {
    kind: 'overview',
    lower: '0/1',
    upper: '1/1',
    threshold: '1/1024',
    filter: { tags: ['war'], mode: 'any' },
  });
  assert.equal(await count(), '6');
  timeline = await store.save(timeline.id, user, timeline.revision, undefined, {
    settings: { ...doc, events: [], durations: undefined },
    changes: [{ id: 'm0', event: { ...doc.events[0], metadata: { title: 'M0', tags: ['war'] } } }],
  });
  await store.idle();
  assert.equal(await count(), '0');
  const fresh = await store.query(timeline.id, user, {
    kind: 'events',
    id: 'm0',
    lower: doc.events[0].time,
    limit: 1,
    after: null,
    filter: { tags: ['war'], mode: 'any' },
  });
  assert.equal(fresh.events[0].id, 'm0');
  console.log(
    `PASS PostgreSQL tag views: ${compared} random views of six separations match the browser index; pages, tag counts, caching and invalidation on save.`,
  );
} finally {
  if (timeline) await pool.query('DELETE FROM oc_timelines WHERE id=$1', [timeline.id]);
  await pool.query('DELETE FROM oc_users WHERE id=$1', [user]);
  await pool.end();
}
