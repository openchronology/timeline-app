// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// Searching every timeline's moments and durations at once (#459): the Explore page's search
// beside its timelines (POST /api/timelines/entities/search), by the per-timeline search rows
// (oc_entity_search) and their text index.
import { createPresenter, matchSnippet, printEntityTime, searchTerms } from '../dist/core.mjs';
import { HttpError, restrictedTimeline } from './store.mjs';

/** A timeline ID's form. */
const UUID = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;

/** The most matches a search ranks; past it, `totalMore` says there are more (#459). */
export const ENTITY_SEARCH_CAP = 5000;
/** How many moments and durations a page of results has unless asked otherwise. */
export const ENTITY_PAGE_SIZE = 20;

/**
 * A search's input, made safe, or 400: `search` (text, required), `kinds` (moments,
 * durations or both, the default), `tag`, `scope` (`public`, `visible`, `mine` or `writable`;
 * see searchEntities), `owner` (one account's timelines), `page`, `limit` (at most 50),
 * `linkable` and `exclude` (a timeline ID).
 */
export function entitySearchInput(value = {}) {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).some(
      (k) =>
        ![
          'search',
          'kinds',
          'tag',
          'scope',
          'owner',
          'page',
          'limit',
          'linkable',
          'exclude',
        ].includes(k),
    )
  )
    throw new HttpError(400, 'Invalid search.');
  const {
    search = '',
    kinds = ['moment', 'duration'],
    tag = '',
    scope = 'public',
    owner = '',
    page = 1,
    limit = ENTITY_PAGE_SIZE,
    linkable = false,
    exclude = null,
  } = value;
  if (
    typeof search !== 'string' ||
    search.length > 300 ||
    !Array.isArray(kinds) ||
    !kinds.length ||
    kinds.some((k) => !['moment', 'duration'].includes(k)) ||
    typeof tag !== 'string' ||
    tag.length > 64 ||
    typeof owner !== 'string' ||
    owner.length > 64 ||
    !['public', 'visible', 'mine', 'writable'].includes(scope) ||
    !Number.isSafeInteger(page) ||
    page < 1 ||
    page > 10000 ||
    !Number.isSafeInteger(limit) ||
    limit < 1 ||
    limit > 50 ||
    typeof linkable !== 'boolean' ||
    (exclude !== null && (typeof exclude !== 'string' || !UUID.test(exclude)))
  )
    throw new HttpError(400, 'Invalid search or pagination.');
  return {
    terms: searchTerms(search),
    kinds: [...new Set(kinds)],
    tag: tag.normalize('NFC').trim().toLowerCase(),
    scope,
    owner: owner.normalize('NFC').trim(),
    page,
    limit,
    linkable,
    exclude,
  };
}

/**
 * An entity's time as its timeline shows times (`presentation`), each written alone at its own
 * precision (printEntityTime): a moment's, or a duration's start and end; its exact
 * coordinates if the presentation cannot be read.
 */
export function entityWhen(presentation, { kind, first, last }) {
  let presenter = null;
  try {
    presenter = createPresenter(presentation ?? undefined);
  } catch {}
  return printEntityTime(
    presenter,
    kind === 'duration' ? { start: first, end: last } : { time: first },
  );
}
/**
 * A page of the moments and durations matching a search, across every timeline the reader
 * may search (#459): `{ entities, total, totalMore?, page, limit, pages }`.
 *
 * Scopes: `public` (public timelines), `visible` (those, and the ones the reader owns or is a
 * member of, unless moderators restricted it), `mine` (the reader's own) and `writable` (those
 * the reader may save, to link to: their own and those shared with them as a writer, unless
 * restricted; #422); 401 signed out for the last two. `linkable` leaves out timelines at the
 * link limit (`linkLimit`), and `exclude` one timeline (the one linking).
 * Never comparisons, whose entities are their sources', or copies still being prepared. The
 * moments and durations of labelled timelines (#115) only for signed-in adults.
 *
 * Matching is the per-timeline search's (store.mjs): every word as a prefix, against the
 * title (weighted most) and notes. The rows searched are each timeline's own
 * (oc_entity_search), not hidden: a fork that reads through to its source shows only what it
 * changed, the rest being found on the source.
 *
 * Cost: the text index (oc_entity_search_document, or for durations alone
 * oc_entity_search_durations) finds every match, which is cheap; of them, at most
 * ENTITY_SEARCH_CAP from timelines the reader may search are read, ranked and counted
 * (`totalMore` when there were more), so a common word reads that many rows, not every
 * match (docs/benchmarks.md). They are ordered as timeline searches are (#103):
 * established accounts' first, then by rank, then by timeline and time. Only the page's
 * rows are read whole.
 *
 * Each result: `kind`, `id`, `title`, `snippet` (its notes where the search first matches them,
 * or their start), `first` and `last`
 * (exact times), `when` (its time, or a duration's start and end, as its timeline shows
 * times), `tags`, and its `timeline` (`id`, `title`, `slug`, `owner`).
 * @param {import('pg').Pool} pool
 * @param {string|null} userId the reader
 * @param {object} value the search (entitySearchInput)
 * @param {{linkLimit?: number}} [options] the most links a timeline may have (limits.mjs)
 */
export async function searchEntities(pool, userId, value, { linkLimit } = {}) {
  const { terms, kinds, tag, scope, owner, page, limit, linkable, exclude } =
    entitySearchInput(value);
  if (['mine', 'writable'].includes(scope) && !userId)
    throw new HttpError(401, 'Sign in to see your timelines.');
  if (!terms.length) return { entities: [], total: 0, page, limit, pages: 0 };
  // Terms hold only letters and digits, so they are safe tsquery prefix operands.
  const query = terms.map((term) => term + ':*').join(' & ');
  // $1 the query, $2 kinds, $3 tag, $4 scope, $5 the reader, $6 owner, $7 the cap, $8 limit,
  // $9 offset, $10 the link limit (null: any), $11 a timeline to leave out. `matching` is at most the cap's matches the reader may search, in no order
  // (the index's), counted for the total; `page` orders them and takes the page, whose rows
  // are then read by their key.
  const { rows } = await pool.query(
    `WITH matching AS (
      SELECT s.timeline_id,s.kind,s.entity_id,s.first_time,s.rank,
        coalesce(a.standing,0)>0 AS established
      -- The text index's matches, found once (OFFSET 0 keeps the planner from searching it
      -- again for each timeline), streamed through the timelines they may come from.
      FROM (SELECT x.timeline_id,x.kind,x.entity_id,x.first_time,
          ts_rank(x.document,to_tsquery('simple',$1)) AS rank
        FROM oc_entity_search x
        WHERE x.document @@ to_tsquery('simple',$1) AND NOT x.hidden AND x.kind=ANY($2::text[])${
          // Written out, so the planner may use the durations' own index.
          kinds.length === 1 ? ` AND x.kind='${kinds[0]}'` : ''
        }
          AND ($3='' OR x.tags @> ARRAY[$3]::text[])
        OFFSET 0) s
      JOIN oc_timelines t ON t.id=s.timeline_id
      JOIN oc_users u ON u.id=t.owner_id
      LEFT JOIN oc_account_standing a ON a.user_id=t.owner_id
      WHERE t.comparison IS NULL AND t.preparing_revision_id IS NULL
        AND CASE $4 WHEN 'mine' THEN t.owner_id=$5::uuid
          WHEN 'writable' THEN t.owner_id=$5::uuid
            OR (EXISTS(SELECT 1 FROM oc_members m WHERE m.timeline_id=t.id AND m.user_id=$5::uuid
                AND m.role IN ('writer','editor'))
              AND NOT ${restrictedTimeline('t')})
          WHEN 'visible' THEN t.visibility='public' OR t.owner_id=$5::uuid
            OR (EXISTS(SELECT 1 FROM oc_members m WHERE m.timeline_id=t.id AND m.user_id=$5::uuid)
              AND NOT ${restrictedTimeline('t')})
          ELSE t.visibility='public' END
        AND ($6='' OR u.username=$6)
        AND ($10::int IS NULL OR t.link_count<$10::int)
        AND ($11::uuid IS NULL OR t.id<>$11::uuid)
        -- Labelled timelines' entities (#115), only for signed-in adults.
        AND (cardinality(t.content_labels||t.moderator_labels)=0
          OR EXISTS(SELECT 1 FROM oc_users me WHERE me.id=$5::uuid
            AND (me.birth_year IS NULL OR extract(year FROM now())::int-me.birth_year>=18)))
      LIMIT $7
    ), page AS (
      SELECT *,row_number() OVER (ORDER BY established DESC,rank DESC,timeline_id,first_time,
        kind,entity_id COLLATE "C") AS n
      FROM matching ORDER BY n LIMIT $8 OFFSET $9
    )
    SELECT (SELECT count(*) FROM matching) AS total,coalesce((SELECT jsonb_agg(jsonb_build_object(
        'kind',p.kind,'id',p.entity_id,'first',oc_qtext(s.first_time),'last',oc_qtext(s.last_time),
        'title',s.title,'body',left(s.body,20000),'tags',s.tags,
        'timeline',jsonb_build_object('id',t.id,'title',t.title,'slug',t.slug,
          'owner',u.username),'presentation',t.presentation) ORDER BY p.n)
      FROM page p
      JOIN oc_entity_search s ON s.timeline_id=p.timeline_id AND s.kind=p.kind AND s.entity_id=p.entity_id
      JOIN oc_timelines t ON t.id=p.timeline_id JOIN oc_users u ON u.id=t.owner_id),'[]'::jsonb) AS entities`,
    [
      query,
      kinds,
      tag,
      scope,
      userId ?? null,
      owner,
      ENTITY_SEARCH_CAP + 1,
      limit,
      (page - 1) * limit,
      linkable && Number.isFinite(linkLimit) ? linkLimit : null,
      exclude,
    ],
  );
  let total = Number(rows[0].total);
  const more = total > ENTITY_SEARCH_CAP;
  if (more) total = ENTITY_SEARCH_CAP;
  return {
    entities: rows[0].entities.map(({ body, presentation, ...entity }) => ({
      ...entity,
      snippet: matchSnippet(body, terms),
      when: entityWhen(presentation, entity),
    })),
    total,
    ...(more ? { totalMore: true } : {}),
    page,
    limit,
    pages: Math.ceil(total / limit),
  };
}
