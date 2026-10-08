// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// Oracle: PostgreSQL relationship arcs, related pages and separations match the browser index.
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
let seed = 22;
const random = () => {
  seed = (seed * 1103515245 + 12345) % 2147483648;
  return seed / 2147483648;
};
const arcs = (frame) => frame.edges.map((e) => `${e.id} ${e.first} ${e.last}`).sort();
try {
  await pool.query(await readFile(new URL('../server/schema.sql', import.meta.url), 'utf8'));
  await pool.query('INSERT INTO oc_users(id,username,email_verified_at) VALUES($1,$2,now())', [
    user,
    'links_' + user.slice(0, 8),
  ]);
  const store = new PostgresStore(pool);
  const events = Array.from({ length: 150 }, (_, i) => ({
    id: 'm' + i,
    time: Q.from(BigInt(Math.floor(random() * 4000)), 4n).toString(),
    metadata: { title: 'M' + i },
  }));
  const durations = Array.from({ length: 40 }, (_, i) => {
    const start = BigInt(Math.floor(random() * 4000));
    return {
      id: 'd' + i,
      start:
        random() < 0.3
          ? { moment: 'm' + Math.floor(random() * 150) }
          : Q.from(start, 4n).toString(),
      end: Q.from(start + BigInt(Math.floor(random() * 300)), 4n).toString(),
      metadata: { title: 'D' + i },
    };
  });
  const ref = () =>
    random() < 0.8
      ? { moment: 'm' + Math.floor(random() * 150) }
      : { duration: 'd' + Math.floor(random() * 40) };
  const relationships = [];
  for (let i = 0; i < 220; i++) {
    const a = ref(),
      b = ref();
    if (JSON.stringify(a) !== JSON.stringify(b)) relationships.push({ a, b });
  }
  const doc = validateDocument({
    format: 'openchronology',
    version: 1,
    title: 'Links',
    description: '',
    events,
    durations,
    relationships,
  });
  timeline = await store.create(user, doc);
  const index = new TimelineIndex(doc);
  for (let i = 0; i < 30; i++) {
    const viewport = new Viewport(
      Q.from(BigInt(Math.floor(random() * 4400) - 200), 4n),
      Q.from(BigInt(1 + Math.floor(random() * 4000)), 4n),
    );
    const pixels = [4, 24, 80][i % 3];
    const expected = index.frame(viewport, 1000, pixels);
    const actual = await store.query(timeline.id, user, {
      kind: 'overview',
      lower: viewport.left.toString(),
      upper: viewport.right.toString(),
      threshold: viewport.threshold(1000, pixels).toString(),
    });
    assert.deepEqual(arcs(actual), arcs(expected), `view ${i}`);
    assert.equal(actual.edgesTruncated, expected.edgesTruncated);
  }
  // Related pages from both directions, with exact direct and reachable counts.
  let checked = 0;
  for (const entity of [
    { moment: 'm0' },
    { moment: 'm7' },
    { duration: 'd3' },
    { moment: 'm99' },
  ]) {
    const kind = 'moment' in entity ? 'moment' : 'duration';
    const id = entity.moment ?? entity.duration;
    const direct = [...index.relatedTo(entity)].sort();
    const listed = [];
    let page = await store.query(timeline.id, user, {
      kind: 'related',
      entity: { kind, id },
      after: null,
      limit: 3,
    });
    assert.equal(page.direct, direct.length);
    assert.equal(page.reachable, index.relatedTo(entity, Infinity).size);
    for (;;) {
      listed.push(...page.related.map((r) => (r.kind === 'moment' ? 'm:' : 'd:') + r.id));
      if (!page.next) break;
      page = await store.query(timeline.id, user, {
        kind: 'related',
        entity: { kind, id },
        after: page.next,
        limit: 3,
      });
      assert.equal(page.reachable, undefined);
    }
    assert.deepEqual(listed.sort(), direct);
    checked++;
  }
  // Separations by relationship read derived views.
  for (const depth of ['direct', 'all'])
    for (const mode of ['any', 'none']) {
      const filter = { related: { moment: 'm0' }, depth, mode };
      const page = await store.query(timeline.id, user, {
        kind: 'events',
        lower: '-10000/1',
        upper: '10000/1',
        limit: 100,
        after: null,
        filter,
      });
      const expected = new TimelineIndex(filterDocument(doc, filter)).eventsBetween(
        '-10000/1',
        '10000/1',
        100,
      );
      assert.deepEqual(
        page.events.map((e) => e.id),
        expected.map((e) => e.id),
        `${depth} ${mode}`,
      );
    }
  // Sparse saves add and remove links; deleting a moment removes its links.
  timeline = await store.save(timeline.id, user, timeline.revision, undefined, {
    settings: { ...doc, events: [], durations: undefined, relationships: undefined },
    changes: [{ id: 'm0', event: null }],
    durationChanges: [],
    relationshipChanges: [{ a: { moment: 'm1' }, b: { moment: 'm2' }, related: true }],
  });
  const links = (await store.snapshot(timeline.id, user)).document.relationships;
  assert(!links.some((r) => r.a.moment === 'm0' || r.b.moment === 'm0'));
  assert(links.some((r) => r.a.moment === 'm1' && r.b.moment === 'm2'));
  console.log(
    `PASS PostgreSQL relationships: arcs match the browser index over 30 views, ${checked} related listings with exact counts, relationship separations and sparse link edits.`,
  );
} finally {
  if (timeline) await pool.query('DELETE FROM oc_timelines WHERE id=$1', [timeline.id]);
  await pool.query('DELETE FROM oc_users WHERE id=$1', [user]);
  await pool.end();
}
