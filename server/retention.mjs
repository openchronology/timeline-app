// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
/**
 * Data expiration and quick deletion (#91). A timeline shown as a calendar can keep only its
 * last retention_seconds: on a schedule the server deletes older moments and durations (as
 * one save, so live viewers and history see it), and prunes history saved before then. Any
 * writer can also delete everything in a time range at once.
 */
import { Q, createDifference, validateDocument, validatePresentation } from '../dist/core.mjs';
import { HttpError } from './store.mjs';
import { pruneHistoryRows } from './history.mjs';
import { indexReader } from './index-versions.mjs';

/** Retention runs at most this often per timeline. */
export const RETENTION_EVERY = 60 * 60 * 1000;
/** Retention keeps at least an hour, and at most a thousand years. */
const SHORTEST = Q.from(3600n),
  LONGEST = Q.from(1000n * 31556952n);
/** One deletion of a range (deleteWhere) removes at most this many moments. */
const BATCH = 200000;

/**
 * A timeline's calendar, if its display is one: stored coordinates per second (`scale`) and
 * the coordinate of the Unix epoch (`origin`). Retention needs it to know what "now" is.
 */
export function calendar(presentation) {
  if (!presentation) return null;
  const p = validatePresentation(presentation);
  return p.mode === 'gregorian' ? { scale: Q.parse(p.scale), origin: Q.parse(p.origin) } : null;
}
/**
 * A retention period written in the timeline's units (`1 year`, `90 days`), in seconds, as
 * an exact rational's text (stored in oc_timelines.retention_seconds). 400 unless the
 * timeline's display is a calendar and the period is from an hour to 1,000 years.
 */
export function parseRetention(text, presentation) {
  const days = calendar(presentation);
  if (!days)
    throw new HttpError(
      400,
      'Retention needs a calendar (Gregorian) time display, so that the server knows what time it is.',
    );
  let seconds;
  try {
    seconds = createDifference(presentation).parse(String(text)).div(days.scale);
  } catch (error) {
    throw new HttpError(400, error.message);
  }
  if (seconds.compare(SHORTEST) < 0 || seconds.compare(LONGEST) > 0)
    throw new HttpError(400, 'Keep at least an hour, and at most 1,000 years.');
  return seconds.toString();
}
/** A retention period as the timeline's display writes it. */
export function printRetention(seconds, presentation) {
  const days = calendar(presentation);
  return days
    ? createDifference(presentation).print(Q.parse(seconds).mul(days.scale))
    : `${seconds} s`;
}
/**
 * The settings a save sends back unchanged: a document of timeline row `t`'s title,
 * description, presentation, plugins, tags and assets with no moments, for deleteWhere's
 * save, which changes only moments and durations.
 */
export function settings(t) {
  const document = { format: 'openchronology', version: 1, title: t.title, events: [] };
  document.description = t.description ?? '';
  for (const key of ['presentation', 'plugins', 'tags', 'image', 'assets'])
    if (t[key] !== null && t[key] !== undefined) document[key] = t[key];
  return validateDocument(document);
}
/** Moments read per walk of the moment tree when finding what to delete. */
const WALK_PAGE = 5000;
/**
 * The IDs of up to `limit` moments of timeline `t` in a range (as deleteWhere takes it), in
 * time order, walking its moment tree a page at a time from the range's start (oc_events,
 * which reads through for forks): the cost follows what is found, not the timeline. `more`
 * when the range holds more.
 */
async function momentsIn(pool, t, { lower, upper, before }, limit, walk = WALK_PAGE) {
  const ids = [];
  const end = before === null ? null : Q.parse(before);
  let after = null;
  for (;;) {
    // One more than still wanted, to learn whether the range holds more.
    const page = Math.min(walk, limit - ids.length + 1);
    // oc_events (schema.sql) walks the moment tree from (after time, after id) onwards,
    // reading through a fork to its base, and returns at most `page` moments in time order
    // within [lower, upper]; with `before`, up to it, the exclusive end checked below.
    const { rows } = await pool.query(
      `SELECT e->>'id' AS id,e->>'time' AS time FROM oc_events($1,$2::mpq,$3::mpq,$4::mpq,$5,$6) e`,
      [t.id, lower, upper ?? before, after?.time ?? null, after?.id ?? null, page],
    );
    for (const row of rows) {
      if (end && Q.parse(row.time).compare(end) >= 0) return { ids, more: false };
      if (ids.length === limit) return { ids, more: true };
      ids.push(row.id);
    }
    if (rows.length < page) return { ids, more: false };
    after = rows.at(-1);
  }
}
/**
 * Deletes the timeline's moments in a range (`lower` and `upper` inclusive, either open when
 * null; `before` exclusive) and its durations lying wholly inside it, as one save by `userId`
 * at `revision`: at most `limit` of each (the first moments in time order), `more` when the
 * range holds more (`walk`: the moments read per walk of the moment tree; `analyses`: see
 * PostgresStore.transaction). Durations that followed a deleted moment keep its time; links of deleted
 * entities go. What to delete is found through the timeline's trees and indexes, at a cost
 * that follows it. Returns what was deleted and the timeline afterwards.
 */
export async function deleteWhere(
  store,
  t,
  userId,
  revision,
  { lower = null, upper = null, before = null },
  { limit = BATCH, walk = WALK_PAGE, analyses = null } = {},
) {
  if (t.comparison) throw new HttpError(409, 'Delete moments in comparison sources instead.');
  const index = await indexReader(store.pool, t);
  const range = { lower, upper, before };
  // Durations wholly inside start inside it: found through their start index (first_key,
  // which orders as their start does). first_key is oc_qkey of the start, a B-tree-sized key
  // that truncation never puts out of order, so the first_key bounds narrow the index scan
  // and the exact first_time and last_time comparisons settle each row. A duration lies
  // inside when it starts at or after `lower` and ends by `upper` (or before `before`).
  // Rows with no definition are legacy link rows awaiting conversion, not durations. index()
  // reads the duration tree through a fork's lineage (index-versions.mjs). One row more than
  // `limit` tells whether more remain.
  const [moments, durations] = await Promise.all([
    momentsIn(store.pool, t, range, limit, walk),
    store.pool.query(
      `SELECT band->>'id' AS id FROM ${index('oc_duration_nodes')} x
      WHERE definition IS NOT NULL
      AND ($2::mpq IS NULL OR (first_key>=oc_qkey($2::mpq) AND first_time>=$2::mpq))
      AND ($3::mpq IS NULL OR (first_key<=oc_qkey($3::mpq) AND last_time<=$3::mpq))
      AND ($4::mpq IS NULL OR (first_key<=oc_qkey($4::mpq) AND last_time<$4::mpq))
      ORDER BY first_key LIMIT $5`,
      [t.id, lower, upper, before, limit + 1],
    ),
  ]);
  const durationIds = durations.rows.slice(0, limit).map((r) => r.id);
  const removed = { moments: moments.ids.length, durations: durationIds.length };
  const more = moments.more || durations.rows.length > limit;
  if (!removed.moments && !removed.durations)
    return { removed, more, timeline: await store.metadata(t.id, userId) };
  await store.save(
    t.id,
    userId,
    revision,
    null,
    {
      settings: settings(t),
      changes: moments.ids.map((id) => ({ id, event: null })),
      durationChanges: durationIds.map((id) => ({ id, duration: null })),
      relationshipChanges: [],
    },
    { analyses },
  );
  return { removed, more, timeline: await store.metadata(t.id, userId) };
}
/**
 * Removes the timeline's saved revisions from before `before`, apart from what is still
 * needed: the head, revisions forks, proposals or other timelines refer to (with their
 * ancestry), revisions copies read through to, and the revisions newer ones are stored
 * against (a patch replays its first parent, back to a snapshot; revisions kept as rows
 * need none). Returns how many revisions went.
 *
 * Runs in the caller's transaction; deletes revisions, their parent links, snapshots no
 * revision uses any more, and versions kept as rows no remaining revision sees.
 * @param {import('pg').PoolClient} client
 * @param {string} timelineId
 * @param {Date} before the start of the retention window
 * @returns {Promise<number>}
 */
export async function pruneHistory(client, timelineId, before) {
  // Two recursive CTEs:
  //   shared: this timeline's revisions something else refers to (another timeline's head,
  //     any fork's base, a pull request's base, source or merge, or a revision of another
  //     timeline that has it as a parent), and all their ancestors, followed through
  //     oc_revision_parents;
  //   needed: those, plus revisions inside the window, revisions copies read through to
  //     (oc_history_bases), and the head; then, for each needed revision stored as a patch,
  //     its first parent (position 0, the one a patch replays), back to a snapshot.
  // What is left of this timeline's revisions from before the window goes.
  const { rows } = await client.query(
    `WITH RECURSIVE shared(id) AS (
      SELECT r.id FROM oc_revisions r WHERE r.timeline_id=$1 AND (
        EXISTS(SELECT 1 FROM oc_timelines t WHERE t.fork_base_revision_id=r.id)
        OR r.id IN (SELECT head_revision_id FROM oc_timelines WHERE id<>$1)
        OR EXISTS(SELECT 1 FROM oc_proposals p WHERE p.base_revision_id=r.id OR p.source_revision_id=r.id OR p.merged_revision_id=r.id)
        OR EXISTS(SELECT 1 FROM oc_revision_parents p JOIN oc_revisions child ON child.id=p.revision_id
          WHERE p.parent_id=r.id AND child.timeline_id<>$1))
      UNION SELECT p.parent_id FROM oc_revision_parents p JOIN shared s ON s.id=p.revision_id
    ), needed(id) AS (
      SELECT r.id FROM oc_revisions r WHERE r.timeline_id=$1 AND (r.created_at>=$2
        OR r.id IN (SELECT id FROM shared)
        OR EXISTS(SELECT 1 FROM oc_history_bases b WHERE b.base_revision_id=r.id)
        OR r.id=(SELECT head_revision_id FROM oc_timelines WHERE id=$1))
      UNION SELECT p.parent_id FROM needed n JOIN oc_revisions c ON c.id=n.id
        JOIN oc_revision_parents p ON p.revision_id=n.id AND p.position=0 WHERE c.patch IS NOT NULL
    ) SELECT r.id,r.snapshot_id FROM oc_revisions r WHERE r.timeline_id=$1 AND r.created_at<$2
      AND r.id NOT IN (SELECT id FROM needed)`,
    [timelineId, before],
  );
  if (!rows.length) return 0;
  const ids = rows.map((r) => r.id);
  // Newer revisions keep no link to the history they were made from once it is gone.
  await client.query(
    'DELETE FROM oc_revision_parents WHERE revision_id=ANY($1::uuid[]) OR parent_id=ANY($1::uuid[])',
    [ids],
  );
  await client.query('DELETE FROM oc_revisions WHERE id=ANY($1::uuid[])', [ids]);
  // The snapshots of the deleted revisions, unless a remaining revision still uses one.
  await client.query(
    'DELETE FROM oc_snapshots s WHERE s.id=ANY($1::uuid[]) AND NOT EXISTS(SELECT 1 FROM oc_revisions r WHERE r.snapshot_id=s.id)',
    [rows.map((r) => r.snapshot_id).filter(Boolean)],
  );
  // Versions kept as rows that no remaining revision sees.
  await pruneHistoryRows(client, timelineId);
  return ids.length;
}
/** How many moments (and durations) one save of retention deletes. */
export const RETENTION_SAVE = 5000;
/** How long one run of retention keeps deleting from a timeline; the next run continues. */
const RETENTION_BUDGET = 10 * 60 * 1000;
/**
 * Applies a timeline's retention at `now` (ms): prunes history saved before the retention
 * window, then deletes moments and durations from before it as saves by the owner, each of
 * at most `save` (RETENTION_SAVE) and a transaction of its own, so saves to the timeline
 * meanwhile wait for one of them at most. A save that lost a race with another is tried again.
 */
export async function expire(store, id, now = Date.now(), { save = RETENTION_SAVE } = {}) {
  const read = async () =>
    (await store.pool.query('SELECT * FROM oc_timelines WHERE id=$1', [id])).rows[0];
  let t = await read();
  // No retention set, the timeline gone, or a comparison (which holds no moments of its own).
  if (!t?.retention_seconds || t.comparison) return null;
  const result = { history: 0, moments: 0, durations: 0 };
  try {
    const days = calendar(t.presentation);
    if (days) {
      const seconds = Q.parse(t.retention_seconds);
      const since = new Date(now - seconds.toApproximateNumber() * 1000);
      result.history = await store.transaction((c) => pruneHistory(c, id, since));
      // The window's start in the timeline's own coordinates: origin + (now − retention) ×
      // scale, with now in seconds as an exact rational (milliseconds over 1000).
      const cutoff = days.origin
        .add(Q.from(BigInt(now), 1000n).sub(seconds).mul(days.scale))
        .toString();
      const started = Date.now();
      // The statistics refreshes its saves ask for run once, after the last.
      const analyses = new Set();
      for (let conflicts = 0; Date.now() - started < RETENTION_BUDGET;) {
        let deleted;
        try {
          deleted = await deleteWhere(
            store,
            t,
            t.owner_id,
            String(t.revision),
            { before: cutoff },
            { limit: save, analyses },
          );
        } catch (error) {
          // Someone saved meanwhile: read the timeline again and continue.
          if (error.status !== 409 || ++conflicts > 10) throw error;
          t = await read();
          continue;
        }
        result.moments += deleted.removed.moments;
        result.durations += deleted.removed.durations;
        if (!deleted.more) break;
        t = await read();
      }
      if (analyses.size) await store.analyze([...analyses]);
    }
  } finally {
    // Tried, whatever happened: the next run is due in an hour. retention_removed (what the
    // last run deleted) is reported with the timeline's retention setting.
    await store.pool.query(
      'UPDATE oc_timelines SET retention_applied_at=now(),retention_removed=$2 WHERE id=$1',
      [id, result.moments + result.durations],
    );
  }
  return result;
}
/**
 * Applies retention to the timelines due for it (up to 100 a run, those waiting longest
 * first); one server process at a time. A timeline's failure is logged and the rest go on.
 */
export async function expireDue(store, now = Date.now(), log = console) {
  const client = await store.pool.connect();
  try {
    // A session-level advisory lock, tried without waiting: held on this connection for the
    // whole run (across the many transactions expire makes on other connections) and
    // released below. Another process already running retention holds it, and this one
    // skips the run.
    const { rows } = await client.query(
      "SELECT pg_try_advisory_lock(hashtextextended('oc-retention',0)) AS locked",
    );
    if (!rows[0].locked) return;
    try {
      // Timelines with retention never applied, or last applied over RETENTION_EVERY ago.
      const due = await client.query(
        `SELECT id FROM oc_timelines WHERE retention_seconds IS NOT NULL
        AND (retention_applied_at IS NULL OR retention_applied_at<now()-$1::interval)
        ORDER BY retention_applied_at NULLS FIRST LIMIT 100`,
        [`${RETENTION_EVERY / 1000} seconds`],
      );
      for (const { id } of due.rows)
        await expire(store, id, now).catch((error) =>
          log.error(`Retention of timeline ${id} failed:`, error),
        );
    } finally {
      await client.query("SELECT pg_advisory_unlock(hashtextextended('oc-retention',0))");
    }
  } finally {
    client.release();
  }
}
/**
 * Runs retention every quarter of an hour, starting 30 seconds after startup (platform.mjs).
 * The timers are unref'd so they never keep the process alive.
 * @returns {() => void} stops the runs
 */
export function startRetention(store, every = 15 * 60 * 1000, log = console) {
  const run = () =>
    expireDue(store, Date.now(), log).catch((error) => log.error('Retention failed:', error));
  const first = setTimeout(run, 30000),
    timer = setInterval(run, every);
  first.unref?.();
  timer.unref?.();
  return () => {
    clearTimeout(first);
    clearInterval(timer);
  };
}
