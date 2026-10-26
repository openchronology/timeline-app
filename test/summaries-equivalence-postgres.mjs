// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// Oracle: oc_duration_overview with start-range pruning returns exactly what the previous
// function (copied below, unchanged) returned, over random timelines, windows and thresholds,
// including indexes reshaped by incremental saves.
import pg from 'pg';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { PostgresStore } from '../server/store.mjs';
import { Q } from '../dist/core.mjs';
if (!process.env.DATABASE_URL) throw new Error('Use a dedicated PostgreSQL test database.');
// One connection, so the temporary reference function stays visible.
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
const user = randomUUID();
const created = [];
let store;
/** oc_duration_overview before start-range pruning (server/schema.sql at issue #35). */
const PREVIOUS = String.raw`
CREATE OR REPLACE FUNCTION pg_temp.oc_duration_overview_previous(tid uuid, lo mpq, hi mpq, threshold mpq)
RETURNS TABLE(first_time text,last_time text,duration_count integer,band jsonb)
LANGUAGE plpgsql AS $$
DECLARE ids integer[]; points boolean[] := ARRAY[false]; idx integer; nid integer; point boolean;
  n record; anchor mpq; finish mpq; total integer := 0; single jsonb; base mpq;
BEGIN
  IF lo IS NULL OR hi IS NULL OR threshold IS NULL OR threshold<='0'::mpq OR lo>hi THEN RETURN; END IF;
  SELECT CASE WHEN duration_root IS NULL THEN ARRAY[]::integer[] ELSE ARRAY[duration_root] END INTO ids
    FROM oc_timelines WHERE id=tid;
  ids := coalesce(ids,ARRAY[]::integer[]);
  WHILE cardinality(ids)>0 LOOP
    idx:=cardinality(ids); nid:=ids[idx]; point:=points[idx]; ids:=ids[1:idx-1]; points:=points[1:idx-1];
    SELECT d.* INTO n FROM oc_duration_nodes d WHERE d.timeline_id=tid AND d.id=nid;
    IF NOT FOUND THEN RAISE EXCEPTION 'Broken duration index'; END IF;
    IF point THEN
      IF n.last_time<lo OR n.first_time>hi OR n.last_time-n.first_time>=threshold THEN CONTINUE; END IF;
      IF anchor IS NOT NULL AND n.first_time-anchor>=threshold THEN
        first_time:=oc_qtext(anchor); last_time:=oc_qtext(finish); duration_count:=total;
        band:=CASE WHEN total=1 THEN single END; RETURN NEXT; anchor:=NULL;
      END IF;
      IF anchor IS NULL THEN anchor:=n.first_time; finish:=n.last_time; total:=0; END IF;
      IF n.last_time>finish THEN finish:=n.last_time; END IF;
      total:=total+1; single:=CASE WHEN total=1 THEN n.band END;
      CONTINUE;
    END IF;
    IF n.max_time<lo OR n.min_time>hi THEN CONTINUE; END IF;
    -- No collapsed duration below. NULL summaries (pre-migration rows) fall through and descend.
    IF n.min_extent>=threshold THEN CONTINUE; END IF;
    base:=CASE WHEN anchor IS NOT NULL AND n.min_time-anchor<threshold THEN anchor ELSE n.min_time END;
    IF n.max_extent<threshold AND n.min_time>=lo AND n.max_first<=hi AND n.max_first-base<threshold THEN
      IF anchor IS NOT NULL AND n.min_time-anchor>=threshold THEN
        first_time:=oc_qtext(anchor); last_time:=oc_qtext(finish); duration_count:=total;
        band:=CASE WHEN total=1 THEN single END; RETURN NEXT; anchor:=NULL;
      END IF;
      IF anchor IS NULL THEN anchor:=n.min_time; finish:=n.max_time; total:=0; END IF;
      IF n.max_time>finish THEN finish:=n.max_time; END IF;
      total:=total+n.subtree_count; single:=CASE WHEN total=1 THEN n.band END;
    ELSE
      IF n.right_id IS NOT NULL THEN ids:=array_append(ids,n.right_id); points:=array_append(points,false); END IF;
      ids:=array_append(ids,nid); points:=array_append(points,true);
      IF n.left_id IS NOT NULL THEN ids:=array_append(ids,n.left_id); points:=array_append(points,false); END IF;
    END IF;
  END LOOP;
  IF anchor IS NOT NULL THEN
    first_time:=oc_qtext(anchor); last_time:=oc_qtext(finish); duration_count:=total;
    band:=CASE WHEN total=1 THEN single END; RETURN NEXT;
  END IF;
END $$;`;
let seed = 35;
const random = (n) => {
  seed = (seed * 1103515245 + 12345) % 2147483648;
  return Math.floor((seed / 2147483648) * n);
};
const at = (k) => Q.from(BigInt(k), 8n).toString();
// Times far beyond float8's range, some closer together than the start key's 30 significant
// digits (oc_qkey), so only the exact comparisons tell these apart.
const HUGE = 10n ** 400n;
const time = () => {
  const roll = random(16);
  if (roll === 0) return `${1 + random(9)}123456789012345678901234567/${1 + random(7)}`;
  if (roll === 1) return Q.from(HUGE + BigInt(random(50))).toString();
  if (roll === 2) return Q.from(-HUGE - BigInt(random(50))).toString();
  if (roll === 3) return Q.from(BigInt(random(50)), HUGE).toString();
  return Q.from(BigInt(random(3300) - 300), BigInt([1, 2, 4, 8][random(4)])).toString();
};
/** Mostly short durations on a grid, some long, some anchored to moments or with huge times. */
function timeline(round) {
  const events = Array.from({ length: 30 }, (_, i) => ({
    id: 'm' + i,
    time: time(),
    metadata: { title: 'M' + i },
  }));
  const durations = Array.from({ length: 40 + random(200) }, (_, i) => {
    const k = random(26400) - 2400,
      roll = random(10);
    return {
      id: 'd' + i,
      start: roll < 7 ? at(k) : roll < 8 ? { moment: 'm' + random(30) } : time(),
      end:
        roll < 6
          ? at(k + random(120))
          : roll < 7
            ? at(k + 800 + random(20000))
            : roll < 9
              ? at(k)
              : { moment: 'm' + random(30) },
      metadata: { title: 'D' + i },
    };
  });
  return {
    format: 'openchronology',
    version: 1,
    title: 'Equivalence ' + round,
    description: '',
    events,
    durations,
  };
}
try {
  await pool.query(await readFile(new URL('../server/schema.sql', import.meta.url), 'utf8'));
  await pool.query(PREVIOUS);
  await pool.query(
    'INSERT INTO oc_users(id,username,email_verified_at,terms_version) VALUES($1,$2,now(),oc_policy_version())',
    [user, 'summaries_' + user.slice(0, 8)],
  );
  store = new PostgresStore(pool);
  let compared = 0,
    groups = 0;
  for (let round = 0; round < 8; round++) {
    const document = timeline(round);
    let t = await store.create(user, document);
    created.push(t.id);
    // Later rounds reshape the interval tree with incremental saves.
    const settings = { ...document, events: [], durations: undefined };
    for (let step = 0; step < round * 4; step++) {
      const id = 'd' + random(document.durations.length);
      const k = random(26400) - 2400;
      t = await store.save(t.id, user, t.revision, undefined, {
        settings,
        changes: [],
        durationChanges: [
          {
            id,
            duration: random(4)
              ? { id, start: at(k), end: at(k + random(200)), metadata: { title: 'S' + step } }
              : null,
          },
        ],
      });
    }
    const { rows: bands } = await pool.query(
      'SELECT oc_qtext(first_time) AS f,oc_qtext(last_time) AS l,oc_qtext(last_time-first_time) AS e FROM oc_duration_nodes WHERE timeline_id=$1 ORDER BY id',
      [t.id],
    );
    const times = bands.flatMap((b) => [b.f, b.l]),
      extents = bands.map((b) => b.e);
    const pick = (list) => list[random(list.length)];
    for (let w = 0; w < 40; w++) {
      // Window edges and thresholds often coincide with stored starts, ends and extents.
      let [a, b] = random(2) ? [pick(times), pick(times)] : [time(), time()];
      if (Q.parse(a).compare(Q.parse(b)) > 0) [a, b] = [b, a];
      const roll = random(6);
      const threshold =
        roll < 2
          ? pick(extents)
          : roll === 2
            ? Q.from(1n, BigInt(1 + random(64))).toString()
            : roll === 3
              ? `${1 + random(4000)}/1`
              : Q.parse(b)
                  .sub(Q.parse(a))
                  .div(Q.from(BigInt(1 + random(64))))
                  .toString();
      const run = async (fn) =>
        (
          await pool.query(
            `SELECT first_time,last_time,duration_count,band FROM ${fn}($1,$2::mpq,$3::mpq,$4::mpq)`,
            [t.id, a, b, threshold],
          )
        ).rows;
      const expected = await run('pg_temp.oc_duration_overview_previous');
      assert.deepEqual(
        await run('oc_duration_overview'),
        expected,
        `window ${a}..${b} threshold ${threshold}`,
      );
      compared++;
      groups += expected.length;
    }
  }
  // Starts 400 digits apart in significance share one key; groups there depend on exact
  // comparisons alone.
  const far = {
    format: 'openchronology',
    version: 1,
    title: 'Clustered',
    description: '',
    events: [],
    durations: Array.from({ length: 40 }, (_, i) => ({
      id: 'f' + i,
      start: Q.from(HUGE + BigInt(i * 2)).toString(),
      end: Q.from(HUGE + BigInt(i * 2 + (i % 5))).toString(),
      metadata: { title: 'F' + i },
    })),
  };
  const clustered = await store.create(user, far);
  created.push(clustered.id);
  for (const [lower, upper, threshold] of [
    [HUGE, HUGE + 100n, 3n],
    [HUGE + 7n, HUGE + 31n, 4n],
    [-HUGE, HUGE + 1000n, 10n],
  ]) {
    const run = async (fn) =>
      (
        await pool.query(
          `SELECT first_time,last_time,duration_count,band FROM ${fn}($1,$2::mpq,$3::mpq,$4::mpq)`,
          [clustered.id, `${lower}/1`, `${upper}/1`, `${threshold}/1`],
        )
      ).rows;
    const expected = await run('pg_temp.oc_duration_overview_previous');
    assert(expected.length > 2, 'clustered starts form several groups');
    assert.deepEqual(await run('oc_duration_overview'), expected);
    compared++;
  }
  // Starts spread over magnitudes float8 cannot hold (where every float8 approximation was
  // ±Infinity or 0) keep distinct keys, so each group's range scan reads only that group.
  const magnitudes = [
    ...Array.from({ length: 30 }, (_, i) => -900 + i * 7),
    ...Array.from({ length: 30 }, (_, i) => 400 + i * 7),
  ];
  const power = (k) => (k >= 0 ? Q.from(10n ** BigInt(k)) : Q.from(1n, 10n ** BigInt(-k)));
  // ±1, 2 and 5 times each power of ten, lasting 40 orders of magnitude less than that.
  const spread = await store.create(user, {
    format: 'openchronology',
    version: 1,
    title: 'Beyond float8',
    description: '',
    events: [],
    durations: magnitudes.flatMap((k) =>
      [1n, 2n, 5n, -1n, -2n, -5n].map((m) => {
        const start = power(k).mul(Q.from(m));
        return {
          id: `s${k}_${m}`,
          start: start.toString(),
          end: start.add(power(k - 40)).toString(),
          metadata: {},
        };
      }),
    ),
  });
  created.push(spread.id);
  const {
    rows: [keys],
  } = await pool.query(
    'SELECT count(*)::integer AS starts, count(DISTINCT first_key)::integer AS keys FROM oc_duration_nodes WHERE timeline_id=$1',
    [spread.id],
  );
  assert.equal(keys.keys, keys.starts, 'starts beyond float8 range keep distinct keys');
  for (const [lower, upper, threshold] of [
    [power(700).neg(), power(700), power(450)],
    [power(-500).neg(), power(-500), power(-750)],
    [Q.zero, power(1000), power(600)],
  ]) {
    const run = async (fn) =>
      (
        await pool.query(
          `SELECT first_time,last_time,duration_count,band FROM ${fn}($1,$2::mpq,$3::mpq,$4::mpq)`,
          [spread.id, lower.toString(), upper.toString(), threshold.toString()],
        )
      ).rows;
    const expected = await run('pg_temp.oc_duration_overview_previous');
    assert(expected.length > 2, 'spread starts form several groups');
    assert.deepEqual(await run('oc_duration_overview'), expected);
    compared++;
  }
  // Thousands of durations, five per start and one in three long, so that batch reads of
  // subtrees mixing long durations in have neighbours outside them with the same start.
  const tiedDocument = {
    format: 'openchronology',
    version: 1,
    title: 'Tied starts',
    description: '',
    events: [],
    durations: Array.from({ length: 3000 }, (_, i) => {
      const start = Math.floor(i / 5);
      return {
        id: 'd' + ((i * 7919) % 3000),
        start: `${start}/1`,
        end: random(3) ? `${start * 4 + random(8)}/4` : `${start + 50 + random(400)}/1`,
        metadata: { title: 'T' + i },
      };
    }),
  };
  const tied = await store.create(user, tiedDocument);
  created.push(tied.id);
  for (let w = 0; w < 30; w++) {
    let [a, b] = [random(700) - 50, random(700) - 50];
    if (a > b) [a, b] = [b, a];
    const threshold = Q.from(BigInt(1 + random(120)), BigInt(1 + random(3))).toString();
    const run = async (fn) =>
      (
        await pool.query(
          `SELECT first_time,last_time,duration_count,band FROM ${fn}($1,$2::mpq,$3::mpq,$4::mpq)`,
          [tied.id, `${a}/1`, `${b}/1`, threshold],
        )
      ).rows;
    const expected = await run('pg_temp.oc_duration_overview_previous');
    assert.deepEqual(
      await run('oc_duration_overview'),
      expected,
      `tied ${a}..${b} by ${threshold}`,
    );
    compared++;
    groups += expected.length;
  }
  // The key never orders two values against their exact order, and separates values that
  // differ within 30 significant digits: around powers of ten (where the exponent changes),
  // far outside float8's range, signed, and fractions with long expansions.
  const values = ['0', '1/3', '-1/3', '2/3', '-1/7', '123456789012345678901234567/7'];
  for (const k of [-10000, -400, -309, -308, -30, -1, 0, 1, 29, 30, 308, 309, 400, 10000]) {
    const p = (e) => (e >= 0 ? Q.from(10n ** BigInt(e)) : Q.from(1n, 10n ** BigInt(-e)));
    for (const v of [
      p(k),
      p(k).add(p(k - 29)),
      p(k).sub(p(k - 29)),
      p(k).add(p(k - 30)),
      p(k).sub(p(k - 400)),
    ])
      values.push(v.toString(), v.neg().toString());
  }
  for (let i = 0; i < 300; i++) values.push(time());
  const { rows: order } = await pool.query(
    `SELECT count(*) FILTER (WHERE previous_key>key AND previous<>value)::integer AS inversions,
       count(*) FILTER (WHERE previous_key=key AND previous<>value
         AND abs(value-previous)>abs(value)/'1${'0'.repeat(28)}'::mpq)::integer AS merged
     FROM (SELECT value, oc_qkey(value) AS key, lag(value) OVER w AS previous, lag(oc_qkey(value)) OVER w AS previous_key
       FROM (SELECT DISTINCT v::mpq AS value FROM unnest($1::text[]) v) x WINDOW w AS (ORDER BY value)) y`,
    [values],
  );
  assert.deepEqual(order[0], { inversions: 0, merged: 0 });
  assert.equal(compared, 356);
  assert(groups > 500, `the windows produced summaries (${groups})`);
  console.log(
    `PASS PostgreSQL duration summaries: ${compared} windows (${groups} groups) match the previous traversal.`,
  );
} finally {
  await store?.idle();
  for (const id of created) await pool.query('DELETE FROM oc_timelines WHERE id=$1', [id]);
  await pool.query('DELETE FROM oc_storage_entries WHERE user_id=$1', [user]);
  await pool.query('DELETE FROM oc_users WHERE id=$1', [user]);
  await pool.end();
}
