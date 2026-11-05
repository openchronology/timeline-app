// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// Searching every timeline's events at once (#459; server/library-search.mjs) against how
// many there are: a word on one event, a word on about a third of them (past the cap), the
// same for durations only and with a tag, signed in (the visible scope), and a late page.
// Prints one JSON line of milliseconds, the median of five runs each.
// Usage: node bench/library-search.mjs [timelines] [moments each] (default 10 and 50000).
// Needs BENCH_DATABASE_URL: a PostgreSQL database it creates and removes its own data in.
import pg from 'pg';
import { randomUUID } from 'node:crypto';
import { PostgresStore } from '../server/store.mjs';
import { searchEntities } from '../server/library-search.mjs';
import { setEntryLimit } from '../dist/core.mjs';
import { generateTimeline } from './generate.mjs';

if (!process.env.BENCH_DATABASE_URL) throw new Error('Set BENCH_DATABASE_URL.');
setEntryLimit(Infinity);
const [timelines = 10, moments = 50000] = process.argv.slice(2).map(Number);
const pool = new pg.Pool({ connectionString: process.env.BENCH_DATABASE_URL });
const store = new PostgresStore(pool);
const user = randomUUID();
const median = (values) => values.sort((a, b) => a - b)[Math.floor(values.length / 2)];
/** The median milliseconds of five calls of `action`, and what the last one returned. */
async function time(action) {
  const times = [];
  let result;
  for (let run = 0; run < 5; run++) {
    const started = performance.now();
    result = await action();
    times.push(performance.now() - started);
  }
  return [Math.round(median(times) * 10) / 10, result];
}
const ids = [];
try {
  await pool.query(
    'INSERT INTO oc_users(id,username,email_verified_at,quota_bypass,terms_version) VALUES($1,$2,now(),true,oc_policy_version())',
    [user, 'bench_' + user.slice(0, 8)],
  );
  for (let i = 0; i < timelines; i++) {
    const t = await store.create(user, generateTimeline(moments, 27 + i));
    ids.push(t.id);
    await pool.query("UPDATE oc_timelines SET visibility='public' WHERE id=$1", [t.id]);
  }
  await store.idle();
  await pool.query('ANALYZE oc_entity_search');
  const result = {
    timelines,
    events: Number((await pool.query('SELECT count(*) FROM oc_entity_search')).rows[0].count),
  };
  const run = async (name, search, who = null) => {
    const [ms, found] = await time(() => searchEntities(pool, who, search));
    result[name] = ms;
    result[name + 'Total'] = found.totalMore ? `${found.total}+` : found.total;
  };
  // A number in one moment's title (moment 12345 of each timeline, and those it begins).
  await run('rare', { search: '12345' });
  await run('common', { search: 'harbor' });
  await run('commonDurations', { search: 'harbor', kinds: ['duration'] });
  await run('commonTag', { search: 'harbor', tag: 'trade' });
  await run('commonSignedIn', { search: 'harbor', scope: 'visible' }, user);
  await run('commonPage50', { search: 'harbor', page: 50 });
  await run('twoWords', { search: 'harbor treaty' });
  console.log(JSON.stringify(result));
} finally {
  await store.idle();
  for (const id of ids) {
    await pool.query('DELETE FROM oc_timelines WHERE id=$1', [id]);
    await store.transaction((c) => store.removeHistory(c, id));
  }
  await pool.query('DELETE FROM oc_users WHERE id=$1', [user]);
  await pool.end();
}
