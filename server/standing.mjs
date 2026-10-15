// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
/**
 * Account standing and timeline popularity (#103). Each account has a standing from 0 to 1,
 * recomputed from what it has done and how long it has been around; it is used for ranking,
 * not shown to anyone but administrators.
 *
 * An account is **established** (standing above 0) when it is
 * - not suspended, not marked untrusted, and has no moderation restriction in force (#115);
 * - confirmed: a confirmed email address or a social sign-in;
 * - at least NEWCOMER_DAYS old, and either FULL_DAYS old or endorsed: starred or publicly
 *   forked by an endorser (a confirmed account FULL_DAYS old, an administrator, or one marked
 *   trusted; never itself);
 * or it is an administrator or marked trusted (standing 1).
 *
 * An established account's standing grows with its age up to FULL_DAYS, two-factor
 * authentication and its endorsers (capped). Popularity is the sum of the standings of the
 * accounts that starred or publicly forked a timeline (each counted once, never its owner), so
 * a swarm of new accounts adds nothing; trending counts those from the last TRENDING_DAYS.
 * Browsing lists public timelines of established owners (and featured ones); others stay
 * reachable by link, profile and search, where they rank after established owners' matches.
 *
 * Stars change a timeline's popularity at once; the rest (accounts ageing, forks published,
 * trending ageing out) is caught up by a sweep every quarter of an hour (startStanding).
 */
export const NEWCOMER_DAYS = 7;
export const FULL_DAYS = 30;
export const TRENDING_DAYS = 30;

/** SQL: whether account `e` (an oc_users alias) endorses what it stars or forks. */
const ENDORSER = (e) => `(NOT ${e}.is_disabled AND ${e}.trust IS DISTINCT FROM 'untrusted' AND
  (${e}.is_admin OR ${e}.trust='trusted' OR ((${e}.email_verified_at IS NOT NULL
    OR EXISTS(SELECT 1 FROM oc_identities i WHERE i.user_id=${e}.id))
  AND ${e}.created_at<=now()-interval '${FULL_DAYS} days')))`;

/**
 * SQL: each account in `$1` with its standing and endorsers, and why, as columns id, standing,
 * endorsers, confirmed, restricted; with `all`, every account (and `$1` null). A few accounts
 * look up their timelines' stars and forks; all of them, one pass over every star and fork.
 */
export function standingQuery(all = false) {
  const endorsed = all
    ? `SELECT t.owner_id AS id,count(DISTINCT x.user_id) AS endorsers FROM (
        SELECT timeline_id,user_id FROM oc_timeline_stars
        UNION ALL SELECT upstream_id,owner_id FROM oc_timelines WHERE upstream_id IS NOT NULL AND visibility='public'
      ) x JOIN oc_timelines t ON t.id=x.timeline_id AND t.visibility='public' AND t.owner_id<>x.user_id
      JOIN oc_users e ON e.id=x.user_id WHERE ${ENDORSER('e')} GROUP BY t.owner_id`
    : `SELECT t.owner_id AS id,count(DISTINCT x.id) AS endorsers FROM oc_timelines t
      CROSS JOIN LATERAL (
        SELECT s.user_id AS id FROM oc_timeline_stars s WHERE s.timeline_id=t.id
        UNION SELECT f.owner_id FROM oc_timelines f WHERE f.upstream_id=t.id AND f.visibility='public'
      ) x JOIN oc_users e ON e.id=x.id AND e.id<>t.owner_id
      WHERE t.visibility='public' AND t.owner_id=ANY($1) AND ${ENDORSER('e')}
      GROUP BY t.owner_id`;
  return `WITH target AS (
    SELECT u.*,EXISTS(SELECT 1 FROM oc_identities i WHERE i.user_id=u.id) AS social,
      EXISTS(SELECT 1 FROM oc_moderation_cases mc WHERE mc.owner_id=u.id AND mc.status='restricted') AS restricted,
      extract(epoch FROM now()-u.created_at)/86400 AS age
    FROM oc_users u WHERE ${all ? '$1::uuid[] IS NULL' : 'u.id=ANY($1)'}
  ), endorsed AS (${endorsed})
  SELECT u.id,coalesce(d.endorsers,0)::integer AS endorsers,
    u.email_verified_at IS NOT NULL OR u.social AS confirmed,u.restricted,
    (CASE
      WHEN u.is_disabled OR u.trust='untrusted' THEN 0
      WHEN u.is_admin OR u.trust='trusted' THEN 1
      WHEN NOT (u.email_verified_at IS NOT NULL OR u.social) THEN 0
      WHEN u.restricted THEN 0
      WHEN u.age<${NEWCOMER_DAYS} THEN 0
      WHEN u.age<${FULL_DAYS} AND coalesce(d.endorsers,0)=0 THEN 0
      ELSE least(1,0.4+0.4*least(u.age,${FULL_DAYS})/${FULL_DAYS}
        +CASE WHEN u.mfa_enabled THEN 0.1 ELSE 0 END+least(0.2,0.02*coalesce(d.endorsers,0)))
    END)::real AS standing
  FROM target u LEFT JOIN endorsed d USING(id)`;
}

/** The accounts `ids`' standing as it stands now, and what it rests on (see standingQuery). */
export async function standingOf(client, ids) {
  return (await client.query(standingQuery(), [ids])).rows;
}

/**
 * Recomputes the standing of the accounts `ids` (all when null). Returns the accounts whose
 * standing changed, so the popularity of what they starred or forked can follow.
 */
export async function refreshStanding(client, ids = null) {
  const { rows } = await client.query(
    `WITH computed AS (${standingQuery(ids === null)}),
    changed AS (
      INSERT INTO oc_account_standing(user_id,standing,endorsers)
      SELECT id,standing,endorsers FROM computed
      ON CONFLICT(user_id) DO UPDATE SET standing=excluded.standing,endorsers=excluded.endorsers,updated_at=now()
      WHERE (oc_account_standing.standing,oc_account_standing.endorsers)
        IS DISTINCT FROM (excluded.standing,excluded.endorsers)
      RETURNING user_id,standing
    ) SELECT user_id FROM changed`,
    [ids],
  );
  return rows.map((row) => row.user_id);
}

/**
 * Recomputes the popularity and trending of the timelines `ids` (when null, every timeline
 * with a star or a public fork, or a score to clear).
 */
export async function refreshPopularity(client, ids = null) {
  await client.query(
    `WITH contributions AS (
      SELECT timeline_id,user_id,min(at) AS at FROM (
        SELECT s.timeline_id,s.user_id,s.created_at AS at FROM oc_timeline_stars s
          WHERE $1::uuid[] IS NULL OR s.timeline_id=ANY($1)
        UNION ALL
        SELECT f.upstream_id,f.owner_id,f.created_at FROM oc_timelines f
          WHERE f.upstream_id IS NOT NULL AND f.visibility='public' AND ($1::uuid[] IS NULL OR f.upstream_id=ANY($1))
      ) x GROUP BY timeline_id,user_id
    ), scores AS (
      SELECT c.timeline_id AS id,sum(coalesce(a.standing,0)) AS popularity,
        sum(coalesce(a.standing,0)) FILTER (WHERE c.at>now()-interval '${TRENDING_DAYS} days') AS trending
      FROM contributions c JOIN oc_timelines t ON t.id=c.timeline_id AND t.owner_id<>c.user_id
      LEFT JOIN oc_account_standing a ON a.user_id=c.user_id
      GROUP BY c.timeline_id
    ), wanted AS (
      SELECT s.id,s.popularity,coalesce(s.trending,0) AS trending FROM scores s
      UNION ALL
      -- Scores to clear: what lost its last contribution.
      SELECT p.timeline_id,0,0 FROM oc_timeline_popularity p
      WHERE ($1::uuid[] IS NULL OR p.timeline_id=ANY($1)) AND NOT EXISTS(SELECT 1 FROM scores s WHERE s.id=p.timeline_id)
    )
    INSERT INTO oc_timeline_popularity(timeline_id,popularity,trending)
    SELECT w.id,w.popularity,w.trending FROM wanted w JOIN oc_timelines t ON t.id=w.id
    ON CONFLICT(timeline_id) DO UPDATE SET popularity=excluded.popularity,trending=excluded.trending
    WHERE (oc_timeline_popularity.popularity,oc_timeline_popularity.trending)
      IS DISTINCT FROM (excluded.popularity,excluded.trending)`,
    [ids],
  );
}

/** What the accounts `ids` starred or publicly forked: those timelines, and their owners. */
async function endorsedBy(client, ids) {
  const { rows } = await client.query(
    `SELECT s.timeline_id AS id,t.owner_id FROM oc_timeline_stars s JOIN oc_timelines t ON t.id=s.timeline_id
      WHERE s.user_id=ANY($1)
    UNION SELECT f.upstream_id,t.owner_id FROM oc_timelines f JOIN oc_timelines t ON t.id=f.upstream_id
      WHERE f.owner_id=ANY($1) AND f.visibility='public'`,
    [ids],
  );
  return rows;
}

/**
 * After the standing of the accounts `ids` may have changed (trust, suspension, moderation, a
 * star): recomputes it; for those whose standing changed, the standing of the owners they
 * endorse (one step; the sweep follows further), and the popularity of what all of these
 * starred or forked.
 */
export async function refreshAccounts(client, ids) {
  const changed = await refreshStanding(client, ids);
  if (!changed.length) return;
  const endorsed = await endorsedBy(client, changed);
  const owners = [...new Set(endorsed.map((row) => row.owner_id))].filter(
    (owner) => !changed.includes(owner),
  );
  const followed = owners.length ? await refreshStanding(client, owners) : [];
  const timelines = new Set([
    ...endorsed.map((row) => row.id),
    ...(followed.length ? await endorsedBy(client, followed) : []).map((row) => row.id),
  ]);
  if (timelines.size) await refreshPopularity(client, [...timelines]);
}

/** Every account's standing, then every timeline's popularity. */
export async function sweepStanding(pool) {
  await refreshStanding(pool);
  await refreshPopularity(pool);
}

/** Sweeps every quarter of an hour, starting shortly after startup. */
export function startStanding(pool, every = 15 * 60 * 1000, log = console) {
  const run = () =>
    sweepStanding(pool).catch((error) => log.error('Account standing failed:', error));
  const first = setTimeout(run, 5000),
    timer = setInterval(run, every);
  first.unref?.();
  timer.unref?.();
  return () => {
    clearTimeout(first);
    clearInterval(timer);
  };
}
