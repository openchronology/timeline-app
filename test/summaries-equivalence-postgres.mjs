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
// Beyond float8's range, approximations saturate to ±Infinity (or 0 for tiny values) and tie,
// so only the exact comparisons tell these apart.
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
  await pool.query('INSERT INTO oc_users(id,username,email_verified_at) VALUES($1,$2,now())', [
    user,
    'summaries_' + user.slice(0, 8),
  ]);
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
  // Every start beyond float8's range has the same approximation (Infinity); groups there
  // depend on exact comparisons alone.
  const far = {
    format: 'openchronology',
    version: 1,
    title: 'Saturated',
    description: '',
    events: [],
    durations: Array.from({ length: 40 }, (_, i) => ({
      id: 'f' + i,
      start: Q.from(HUGE + BigInt(i * 2)).toString(),
      end: Q.from(HUGE + BigInt(i * 2 + (i % 5))).toString(),
      metadata: { title: 'F' + i },
    })),
  };
  const saturated = await store.create(user, far);
  created.push(saturated.id);
  for (const [lower, upper, threshold] of [
    [HUGE, HUGE + 100n, 3n],
    [HUGE + 7n, HUGE + 31n, 4n],
    [-HUGE, HUGE + 1000n, 10n],
  ]) {
    const run = async (fn) =>
      (
        await pool.query(
          `SELECT first_time,last_time,duration_count,band FROM ${fn}($1,$2::mpq,$3::mpq,$4::mpq)`,
          [saturated.id, `${lower}/1`, `${upper}/1`, `${threshold}/1`],
        )
      ).rows;
    const expected = await run('pg_temp.oc_duration_overview_previous');
    assert(expected.length > 2, 'saturated starts form several groups');
    assert.deepEqual(await run('oc_duration_overview'), expected);
    compared++;
  }
  assert.equal(compared, 323);
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
