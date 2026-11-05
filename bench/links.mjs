// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// Links between timelines (#422; server/timeline-links.mjs) against how many a timeline has:
// a comparison's arcs over the whole span and over 1% of it, a page of Related to for one
// entity linked from every moment of another timeline, a save deleting 10 linked moments
// (which prunes the timeline's links) against the same save on a timeline without links, and
// deleting a timeline with its links. Prints one JSON line of milliseconds per link count.
// Usage: node bench/links.mjs [links…] (default 1000 10000); each timeline has that many moments.
// Needs BENCH_DATABASE_URL: a PostgreSQL database it creates and removes its own data in.
import pg from 'pg';
import { randomUUID } from 'node:crypto';
import { PostgresStore } from '../server/store.mjs';
import { TimelineLinks } from '../server/timeline-links.mjs';
import { setEntryLimit } from '../dist/core.mjs';
import { generateTimeline, SPAN } from './generate.mjs';

if (!process.env.BENCH_DATABASE_URL) throw new Error('Set BENCH_DATABASE_URL.');
setEntryLimit(Infinity);
const counts = process.argv.slice(2).map(Number);
if (!counts.length) counts.push(1000, 10000);
const pool = new pg.Pool({ connectionString: process.env.BENCH_DATABASE_URL });
const store = new PostgresStore(pool),
  links = new TimelineLinks(store, { limit: Infinity });
const user = randomUUID();
const median = (values) => values.sort((a, b) => a - b)[Math.floor(values.length / 2)];
/** The median milliseconds of `runs` calls of `action` (each given its run number). */
async function time(action, runs = 5) {
  const times = [];
  for (let run = 0; run < runs; run++) {
    const started = performance.now();
    await action(run);
    times.push(performance.now() - started);
  }
  return Math.round(median(times) * 10) / 10;
}
const ids = [];
try {
  await pool.query(
    'INSERT INTO oc_users(id,username,email_verified_at,quota_bypass,terms_version) VALUES($1,$2,now(),true,oc_policy_version())',
    [user, 'bench_' + user.slice(0, 8)],
  );
  for (const count of counts) {
    const document = generateTimeline(count);
    const settings = { ...document, events: [], durations: undefined, relationships: undefined };
    const create = async () => {
      const t = await store.create(user, document);
      ids.push(t.id);
      return t;
    };
    const [a, b, hub, plain] = [await create(), await create(), await create(), await create()];
    await store.idle();
    // Moment i of one timeline linked to moment i of the other, and every moment of the hub
    // timeline to its first moment's counterpart: written directly, past any limit.
    const link = (from, to, pairs) =>
      pool.query(
        `INSERT INTO oc_timeline_links(a_timeline,a_kind,a_id,b_timeline,b_kind,b_id)
        SELECT least($1::uuid,$2::uuid),'moment',CASE WHEN $1<$2 THEN x ELSE y END,
          greatest($1::uuid,$2::uuid),'moment',CASE WHEN $1<$2 THEN y ELSE x END
        FROM unnest($3::text[],$4::text[]) p(x,y)`,
        [from, to, pairs.map((p) => p[0]), pairs.map((p) => p[1])],
      );
    const moments = document.events.map((e) => e.id);
    await link(
      a.id,
      b.id,
      moments.map((m) => [m, m]),
    );
    await link(
      hub.id,
      b.id,
      moments.map((m) => ['m0', m]),
    );
    await pool.query('ANALYZE oc_timeline_links');
    const sources = [
      { id: a.id, scale: '1', offset: '0' },
      { id: b.id, scale: '1', offset: '0' },
    ];
    const result = { links: count };
    let arcs;
    result.compareWhole = await time(async () => {
      arcs = await links.between(user, {
        sources,
        lower: '0',
        upper: String(SPAN),
        threshold: '0',
      });
    });
    result.compareWholeArcs = arcs.edges.length;
    result.compareOnePercent = await time(async () => {
      arcs = await links.between(user, {
        sources,
        lower: String(SPAN / 2),
        upper: String(SPAN / 2 + SPAN / 100),
        threshold: '0',
      });
    });
    result.compareOnePercentArcs = arcs.edges.length;
    result.relatedPage = await time(() => links.list(b.id, user, { moment: 'm0' }));
    result.hubPage = await time(() => links.list(hub.id, user, { moment: 'm0' }));
    // Ten moments deleted from each timeline, ten different ones each run.
    const saving = async (t) => {
      let current = t;
      return time(async (run) => {
        current = await store.save(current.id, user, current.revision, undefined, {
          settings,
          changes: moments.slice(1 + run * 10, 11 + run * 10).map((id) => ({ id, event: null })),
        });
      });
    };
    result.saveLinked = await saving(a);
    result.saveUnlinked = await saving(plain);
    result.linksLeft = Number(
      (
        await pool.query(
          'SELECT count(*) FROM oc_timeline_links WHERE a_timeline=$1 OR b_timeline=$1',
          [a.id],
        )
      ).rows[0].count,
    );
    await store.idle();
    const started = performance.now();
    await pool.query('DELETE FROM oc_timelines WHERE id=$1', [b.id]);
    result.deleteLinked = Math.round((performance.now() - started) * 10) / 10;
    console.log(JSON.stringify(result));
  }
} finally {
  await store.idle();
  for (const id of ids) {
    await pool.query('DELETE FROM oc_timelines WHERE id=$1', [id]);
    await store.transaction((c) => store.removeHistory(c, id));
  }
  await pool.query('DELETE FROM oc_users WHERE id=$1', [user]);
  await pool.end();
}
