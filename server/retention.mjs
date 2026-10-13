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

/** Retention runs at most this often per timeline. */
export const RETENTION_EVERY = 60 * 60 * 1000;
/** Retention keeps at least an hour, and at most a thousand years. */
const SHORTEST = Q.from(3600n),
  LONGEST = Q.from(1000n * 31556952n);
/** One save removes at most this many moments; a run continues where it stopped. */
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
/** A retention period written in the timeline's units (`1 year`, `90 days`), in seconds. */
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
/** The settings a save sends back unchanged. */
function settings(t) {
  const document = { format: 'openchronology', version: 1, title: t.title, events: [] };
  document.description = t.description ?? '';
  for (const key of ['presentation', 'plugins', 'tags', 'assets'])
    if (t[key] !== null && t[key] !== undefined) document[key] = t[key];
  return validateDocument(document);
}
/**
 * Deletes the timeline's moments in a range (`lower` and `upper` inclusive, either open when
 * null; `before` exclusive) and its durations lying wholly inside it, as one save by `userId`
 * at `revision`. Durations that followed a deleted moment keep its time; links of deleted
 * entities go. Returns what was deleted and the timeline afterwards.
 */
export async function deleteWhere(
  store,
  t,
  userId,
  revision,
  { lower = null, upper = null, before = null },
) {
  if (t.comparison) throw new HttpError(409, 'Delete moments in comparison sources instead.');
  const [moments, durations] = await Promise.all([
    store.pool.query(
      `SELECT id FROM oc_moments WHERE timeline_id=$1 AND ($2::mpq IS NULL OR time>=$2::mpq)
      AND ($3::mpq IS NULL OR time<=$3::mpq) AND ($4::mpq IS NULL OR time<$4::mpq) LIMIT $5`,
      [t.id, lower, upper, before, BATCH],
    ),
    store.pool.query(
      `SELECT DISTINCT band->>'id' AS id FROM oc_duration_nodes WHERE timeline_id=$1
      AND definition IS NOT NULL AND ($2::mpq IS NULL OR (band->>'first')::mpq>=$2::mpq)
      AND ($3::mpq IS NULL OR (band->>'last')::mpq<=$3::mpq)
      AND ($4::mpq IS NULL OR (band->>'last')::mpq<$4::mpq)`,
      [t.id, lower, upper, before],
    ),
  ]);
  const removed = { moments: moments.rows.length, durations: durations.rows.length };
  if (!removed.moments && !removed.durations)
    return { removed, timeline: await store.metadata(t.id, userId) };
  await store.save(t.id, userId, revision, null, {
    settings: settings(t),
    changes: moments.rows.map(({ id }) => ({ id, event: null })),
    durationChanges: durations.rows.map(({ id }) => ({ id, duration: null })),
    relationshipChanges: [],
  });
  return { removed, more: removed.moments === BATCH, timeline: await store.metadata(t.id, userId) };
}
/**
 * Removes the timeline's saved revisions from before `before`, apart from what is still
 * needed: the head, revisions forks, proposals or other timelines refer to (with their
 * ancestry), revisions copies read through to, and the revisions newer ones are stored
 * against (a patch replays its first parent, back to a snapshot; revisions kept as rows
 * need none). Returns how many revisions went.
 */
export async function pruneHistory(client, timelineId, before) {
  const { rows } = await client.query(
    `WITH RECURSIVE shared(id) AS (
      SELECT r.id FROM oc_revisions r WHERE r.timeline_id=$1 AND (
        EXISTS(SELECT 1 FROM oc_timelines t
          WHERE (t.head_revision_id=r.id AND t.id<>$1) OR t.fork_base_revision_id=r.id)
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
  await client.query(
    'DELETE FROM oc_snapshots s WHERE s.id=ANY($1::uuid[]) AND NOT EXISTS(SELECT 1 FROM oc_revisions r WHERE r.snapshot_id=s.id)',
    [rows.map((r) => r.snapshot_id).filter(Boolean)],
  );
  // Versions kept as rows that no remaining revision sees.
  await pruneHistoryRows(client, timelineId);
  return ids.length;
}
/**
 * Applies a timeline's retention at `now` (ms): prunes history saved before the retention
 * window, then deletes moments and durations from before it as a save by the owner.
 */
export async function expire(store, id, now = Date.now()) {
  const t = (await store.pool.query('SELECT * FROM oc_timelines WHERE id=$1', [id])).rows[0];
  if (!t?.retention_seconds || t.comparison) return null;
  const result = { history: 0, moments: 0, durations: 0 };
  try {
    const days = calendar(t.presentation);
    if (days) {
      const seconds = Q.parse(t.retention_seconds);
      const since = new Date(now - seconds.toApproximateNumber() * 1000);
      result.history = await store.transaction((c) => pruneHistory(c, id, since));
      const cutoff = days.origin.add(Q.from(BigInt(now), 1000n).sub(seconds).mul(days.scale));
      const { removed } = await deleteWhere(store, t, t.owner_id, String(t.revision), {
        before: cutoff.toString(),
      });
      Object.assign(result, removed);
    }
  } finally {
    // Tried, whatever happened: the next run is due in an hour.
    await store.pool.query(
      'UPDATE oc_timelines SET retention_applied_at=now(),retention_removed=$2 WHERE id=$1',
      [id, result.moments + result.durations],
    );
  }
  return result;
}
/** Applies retention to the timelines due for it; one server process at a time. */
export async function expireDue(store, now = Date.now(), log = console) {
  const client = await store.pool.connect();
  try {
    const { rows } = await client.query(
      "SELECT pg_try_advisory_lock(hashtextextended('oc-retention',0)) AS locked",
    );
    if (!rows[0].locked) return;
    try {
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
/** Runs retention every quarter of an hour, starting shortly after startup. */
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
