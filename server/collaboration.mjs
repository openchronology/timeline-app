// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
/**
 * Searching and browsing timelines (searchTimelines; docs/browsing.md), and pull requests
 * (docs/collaboration.md): proposing changes to a timeline from its editor or from a fork,
 * updating and rebasing them, merging, rejecting or closing them, and commenting on them.
 * A pull request pins two saved revisions, its base and its source, so it is reviewed and
 * merged against exactly what it was made from; which is why only timelines that keep saved
 * history take them.
 */
import { rebaseDocument, mergePatch } from './merge.mjs';
import { randomUUID } from 'node:crypto';
import { HttpError, restrictedTimeline, withoutImageCopies } from './store.mjs';
import { validateDocument, relationshipKey } from '../dist/core.mjs';
import { commonAncestor, lockTimelines, revisionId } from './versioning.mjs';
import { differences } from './history.mjs';
/** Why a timeline that keeps no saved history takes no pull requests. */
export const PULLS_UNAVAILABLE =
  'This timeline does not keep saved history, so it cannot take pull requests: they are reviewed and merged against saved revisions.';
/** Why a fork that keeps no saved history cannot propose its changes. */
export const FORK_PULLS_UNAVAILABLE =
  'This fork does not keep saved history, so it cannot propose its changes: turn on Keep saved history in its settings first.';
/**
 * A timeline search as the dashboard and API send it, checked and normalized: `search` (web
 * search syntax, up to 300 characters), `tag`, `owner` (a username), `starredBy` (a username
 * whose public favorites to list; only with the public scope), `scope` (public, mine, visible
 * or starred), `sort` (relevance by default when there is search text, else featured),
 * `page` and `limit` (up to 50). Tags are compared lower-cased and NFC-normalized, as they are
 * stored.
 * @throws {HttpError} 400 for unknown keys or values out of range
 */
export function searchInput(value = {}) {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).some(
      (k) => !['search', 'page', 'limit', 'scope', 'tag', 'owner', 'sort', 'starredBy'].includes(k),
    )
  )
    throw new HttpError(400, 'Invalid timeline search.');
  const {
    search = '',
    page = 1,
    limit = 12,
    scope = 'public',
    tag = '',
    owner = '',
    sort = typeof search === 'string' && search.trim() ? 'relevance' : 'featured',
    starredBy = '',
  } = value;
  if (
    typeof search !== 'string' ||
    search.length > 300 ||
    typeof tag !== 'string' ||
    tag.length > 64 ||
    typeof owner !== 'string' ||
    owner.length > 64 ||
    !Number.isSafeInteger(page) ||
    page < 1 ||
    page > 10000 ||
    !Number.isSafeInteger(limit) ||
    limit < 1 ||
    limit > 50 ||
    !['public', 'mine', 'visible', 'starred'].includes(scope) ||
    !['featured', 'stars', 'popularity', 'trending', 'alphabetical', 'age', 'relevance'].includes(
      sort,
    ) ||
    typeof starredBy !== 'string' ||
    starredBy.length > 64 ||
    (starredBy !== '' && scope !== 'public')
  )
    throw new HttpError(400, 'Invalid search or pagination.');
  return {
    search: search.trim(),
    tag: tag.normalize('NFC').trim().toLowerCase(),
    page,
    limit,
    scope,
    sort,
    starredBy: starredBy.normalize('NFC').trim(),
    owner: owner.normalize('NFC').trim(),
  };
}
/**
 * A page of timelines for the dashboard's browser and search (POST /api/timelines/search).
 *
 * Scopes: `public` (public timelines; with no search text, owner or starredBy this is
 * browsing, which lists only established accounts' and featured timelines, #103), `mine`
 * (the reader's own, of any visibility), `visible` (public ones plus those the reader owns or
 * is a member of) and `starred` (of those, the ones the reader starred). 401 for mine and
 * starred when signed out.
 * @param {import('pg').Pool} pool
 * @param {string|null} userId the reader
 * @param {object} value the search (searchInput)
 * @param {string[]} featured timeline ids the site features besides those flagged featured
 *   (FEATURED_TIMELINES in the environment; platform.mjs)
 * @returns {Promise<{timelines: object[], total: number, page: number, limit: number, pages: number}>}
 *   star_count and popularity come as strings (bigint and real kept exact for JSON)
 */
export async function searchTimelines(pool, userId, value, featured = []) {
  const { search, tag, page, limit, scope, owner, sort, starredBy } = searchInput(value);
  if (['mine', 'starred'].includes(scope) && !userId)
    throw new HttpError(401, 'Sign in to see your timelines.');
  // One query for a page and its total. Parameters: $1 the mine scope, $2 search text, $3 and
  // $4 limit and offset, $5 featured ids, $6 the reader (null when signed out), $7 tag, $8 the
  // visible scope, $9 owner, $10 sort, $11 the starred scope, $12 starredBy, $13 browsing.
  //
  // `matching` is every timeline the scope and filters allow, with what ranking needs: the
  // reader's star, popularity and trending (oc_timeline_popularity, standing.mjs), whether its
  // owner is established (standing above 0 in oc_account_standing), whether it shows as
  // featured, its labels, and its text-search rank. Text search uses the generated tsvector
  // search_document (title and tags weighted A, description B, moments' text C) and its GIN
  // index oc_timelines_search; ts_rank_cd ranks by cover density. A tag filter uses the GIN
  // index oc_timelines_tags (array containment). Members see a timeline only while it is not
  // restricted by moderators; a restricted timeline is private, so the public branch never
  // shows it.
  //
  // `page` orders: featured first when sorting by featured; with search text, established
  // accounts' matches before newcomers'; then the chosen sort (rank, stars, popularity,
  // trending, title, or creation date), then the latest updated, then id so pages are
  // stable. Each CASE gives a constant for the sorts it does not apply to, so one ORDER BY
  // serves every sort.
  const { rows } = await pool.query(
    `WITH matching AS (
    SELECT t.id,t.slug,t.title,t.description,t.tags,t.visibility,t.revision,t.event_count,t.comparison,t.updated_at,t.created_at,t.star_count,u.username AS owner,
      EXISTS(SELECT 1 FROM oc_timeline_stars s WHERE s.timeline_id=t.id AND s.user_id=$6::uuid) AS starred,
      coalesce(p.popularity,0) AS popularity,coalesce(p.trending,0) AS trending,
      coalesce(a.standing,0)>0 AS established,
      -- Labelled timelines (#115) are never featured.
      ((t.featured OR t.id=ANY($5::uuid[])) AND cardinality(t.content_labels||t.moderator_labels)=0) AS featured,
      ARRAY(SELECT DISTINCT unnest(t.content_labels||t.moderator_labels)) AS labels,
      CASE WHEN $2='' THEN 0 ELSE ts_rank_cd(t.search_document,websearch_to_tsquery('english',$2)) END AS rank
    FROM oc_timelines t JOIN oc_users u ON u.id=t.owner_id
    LEFT JOIN oc_account_standing a ON a.user_id=t.owner_id
    LEFT JOIN oc_timeline_popularity p ON p.timeline_id=t.id
    WHERE (CASE WHEN $1::boolean THEN t.owner_id=$6::uuid ELSE (t.visibility='public' OR (($8::boolean OR $11::boolean) AND (t.owner_id=$6::uuid OR (EXISTS(SELECT 1 FROM oc_members m WHERE m.timeline_id=t.id AND m.user_id=$6::uuid) AND NOT ${restrictedTimeline('t')})))) END)
      AND ($2='' OR t.search_document @@ websearch_to_tsquery('english',$2))
      AND ($7='' OR t.tags @> ARRAY[$7]::text[])
      AND ($9='' OR u.username=$9)
      AND (NOT $11::boolean OR EXISTS(SELECT 1 FROM oc_timeline_stars s WHERE s.timeline_id=t.id AND s.user_id=$6::uuid))
      -- A reader's public favorites; not those of an account that may be under 18, private by
      -- default (the UK Children's Code; #166).
      AND ($12='' OR EXISTS(SELECT 1 FROM oc_timeline_stars s JOIN oc_users su ON su.id=s.user_id WHERE s.timeline_id=t.id AND su.username=$12
        AND (su.birth_year IS NULL OR extract(year FROM now())::int-su.birth_year>=18)))
      -- Browsing lists established accounts' timelines, and featured ones (#103).
      AND (NOT $13::boolean OR coalesce(a.standing,0)>0
        OR ((t.featured OR t.id=ANY($5::uuid[])) AND cardinality(t.content_labels||t.moderator_labels)=0))
      -- Readers who are not signed in, or may be under 18, browse no labelled timelines
      -- (#115); they find them by search, link or profile, behind the warning.
      AND (NOT $13::boolean OR cardinality(t.content_labels||t.moderator_labels)=0
        OR EXISTS(SELECT 1 FROM oc_users me WHERE me.id=$6::uuid
          AND (me.birth_year IS NULL OR extract(year FROM now())::int-me.birth_year>=18)))
  ), page AS (SELECT * FROM matching ORDER BY CASE WHEN $10='featured' THEN featured ELSE false END DESC,
      -- Searches find newcomers' timelines too, after established accounts' matches.
      CASE WHEN $2<>'' THEN established ELSE true END DESC,
      CASE WHEN $10='relevance' THEN rank ELSE 0 END DESC,
      CASE WHEN $10='stars' THEN star_count WHEN $10='popularity' THEN popularity
        WHEN $10='trending' THEN trending ELSE 0 END DESC,
      CASE WHEN $10='alphabetical' THEN lower(title) ELSE '' END ASC,
      CASE WHEN $10='age' THEN created_at ELSE NULL END DESC,updated_at DESC,id LIMIT $3 OFFSET $4)
  -- The total over every match, and the page as JSON without the columns only ranking needs.
  SELECT (SELECT count(*) FROM matching) AS total,coalesce((SELECT jsonb_agg((to_jsonb(page)||jsonb_build_object('star_count',page.star_count::text,'popularity',page.popularity::text))-'established'-'trending') FROM page),'[]'::jsonb) AS timelines`,
    [
      scope === 'mine',
      search,
      limit,
      (page - 1) * limit,
      featured,
      userId ?? null,
      tag,
      scope === 'visible',
      owner,
      sort,
      scope === 'starred',
      starredBy,
      // Browsing: public timelines found by neither text, owner nor a reader's favorites.
      scope === 'public' && !search && !owner && !starredBy,
    ],
  );
  const total = Number(rows[0].total);
  return { timelines: rows[0].timelines, total, page, limit, pages: Math.ceil(total / limit) };
}
/** A timeline's revision counter as a string (a positive bigint); 400 otherwise. */
const revision = (value) => {
  if (
    typeof value !== 'string' ||
    !/^[1-9][0-9]{0,18}$/.test(value) ||
    BigInt(value) > 9223372036854775807n
  )
    throw new HttpError(400, 'Expected a revision string.');
  return value;
};
/**
 * A pull request as its author sends it, checked: a title (up to 300 characters) and a
 * description (up to 20,000), and either a fork's saved revision (`sourceTimelineId` and
 * `sourceRevisionId`) or a whole `document` proposed against `baseRevision`, the timeline's
 * revision counter it was edited from. A document is validated and its image copies dropped.
 * `revision`, the pull request's own counter, is checked by update and resolve.
 * @throws {HttpError} 400
 */
function proposalInput(value) {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).some(
      (k) =>
        ![
          'title',
          'body',
          'baseRevision',
          'document',
          'revision',
          'sourceTimelineId',
          'sourceRevisionId',
        ].includes(k),
    )
  )
    throw new HttpError(400, 'Invalid pull request.');
  if (
    typeof value.title !== 'string' ||
    !value.title.trim() ||
    value.title.length > 300 ||
    typeof value.body !== 'string' ||
    value.body.length > 20000
  )
    throw new HttpError(400, 'Provide a title and a description of at most 20,000 characters.');
  let document;
  if (value.sourceTimelineId !== undefined) {
    revisionId(value.sourceTimelineId);
    revisionId(value.sourceRevisionId);
    if (value.document !== undefined || value.baseRevision !== undefined)
      throw new HttpError(
        400,
        'Fork proposals use a saved source revision, not a supplied document.',
      );
    return { ...value, title: value.title.trim() };
  }
  try {
    // Images are linked, not copied, on the server (#109).
    document = withoutImageCopies(validateDocument(value.document));
  } catch (error) {
    throw new HttpError(400, error.message);
  }
  return {
    ...value,
    title: value.title.trim(),
    document,
    baseRevision: revision(value.baseRevision),
  };
}
/** A pull request's columns: its base and source are revisions, read when needed. */
const PROPOSAL = `p.id,p.timeline_id,p.author_id,p.title,p.body,p.status,p.base_revision,p.revision,
p.created_at,p.updated_at,p.resolved_by,p.merged_revision,p.base_revision_id,p.source_revision_id,
p.source_timeline_id,p.merged_revision_id,p.from_fork`;
/** How many changed moments of each kind a pull request's summary shows. */
const EXAMPLES = 30;
/**
 * What differs between two whole documents, in the pages `differences` (history.mjs) gives:
 * for revisions saved before history was kept as rows.
 */
async function* documentDifferences(before, after) {
  const settings = (d) => {
    const { events, durations, relationships, ...rest } = d;
    return rest;
  };
  if (JSON.stringify(settings(before)) !== JSON.stringify(settings(after)))
    yield [{ kind: 'settings', key: null, before: settings(before), after: settings(after) }];
  const kinds = {
    moments: (d) => d.events.map((e) => [e.id, e]),
    durations: (d) => (d.durations ?? []).map((x) => [x.id, x]),
    relationships: (d) => (d.relationships ?? []).map((r) => [relationshipKey(r), true]),
  };
  for (const [kind, entries] of Object.entries(kinds)) {
    const [a, b] = [new Map(entries(before)), new Map(entries(after))];
    const page = [];
    for (const key of new Set([...a.keys(), ...b.keys()]))
      if (JSON.stringify(a.get(key)) !== JSON.stringify(b.get(key)))
        page.push({ kind, key, before: a.get(key) ?? null, after: b.get(key) ?? null });
    if (page.length) yield page;
  }
}
/**
 * Pull requests on a timeline (oc_proposals) and their comments (oc_proposal_comments). Each
 * pull request carries a revision counter of its own (`revision`), sent back by clients on
 * every change, so a change made from a stale view is refused (409) instead of overwriting
 * another. `store` (store.mjs) gives access checks, transactions and revision storage.
 */
export class Collaboration {
  constructor(store) {
    this.store = store;
    this.pool = store.pool;
  }
  /**
   * A page of the timeline's pull requests, newest first: `{page, limit}` (up to 50). 404
   * unless `userId` may see the timeline.
   * @returns {Promise<{proposals: object[], total: number, page: number, pages: number}>}
   */
  async list(timelineId, userId, value = {}) {
    if (
      !value ||
      typeof value !== 'object' ||
      Array.isArray(value) ||
      Object.keys(value).some((k) => !['page', 'limit'].includes(k))
    )
      throw new HttpError(400, 'Invalid pagination.');
    const { page = 1, limit = 12 } = value;
    if (
      !Number.isSafeInteger(page) ||
      page < 1 ||
      page > 10000 ||
      !Number.isSafeInteger(limit) ||
      limit < 1 ||
      limit > 50
    )
      throw new HttpError(400, 'Invalid pagination.');
    await this.store.access(timelineId, userId);
    // The timeline's pull requests with their authors' usernames; a page of them, newest
    // first (id breaks ties), and the total, in one round trip.
    const { rows } = await this.pool.query(
      `WITH matching AS (SELECT p.id,p.title,p.status,p.base_revision,p.revision,p.created_at,p.updated_at,u.username AS author FROM oc_proposals p JOIN oc_users u ON u.id=p.author_id WHERE p.timeline_id=$1), page AS (SELECT * FROM matching ORDER BY created_at DESC,id LIMIT $2 OFFSET $3) SELECT (SELECT count(*) FROM matching) AS total,coalesce((SELECT jsonb_agg(to_jsonb(page)) FROM page),'[]'::jsonb) AS proposals`,
      [timelineId, limit, (page - 1) * limit],
    );
    const total = Number(rows[0].total);
    return { proposals: rows[0].proposals, total, page, pages: Math.ceil(total / limit) };
  }
  /**
   * Pull request `id` with its summary of changes and what `userId` may do with it: merge
   * (write access, while open), update (its author, with contributor access), close (its
   * author or a writer). A fork's pull request names its source timeline when the reader may
   * see it (null otherwise). 404 unless the reader may see the timeline.
   */
  async get(timelineId, id, userId) {
    const t = await this.store.access(timelineId, userId);
    const p = await this.proposal(timelineId, id);
    let source = null;
    if (p.source_timeline_id) {
      try {
        source = await this.store.access(p.source_timeline_id, userId);
      } catch (e) {
        if (e.status !== 404) throw e;
      }
    }
    return {
      ...p,
      changes: await this.changes(p.base_revision_id, p.source_revision_id),
      canMerge: t.canWrite && p.status === 'open',
      canUpdate: !!t.canPropose && p.author_id === userId && p.status === 'open',
      canClose: p.status === 'open' && (t.canWrite || p.author_id === userId),
      upstreamRevision: t.revision,
      source: source
        ? {
            id: source.id,
            title: source.title,
            head_revision_id: source.head_revision_id,
            canWrite: source.canWrite,
          }
        : null,
    };
  }
  /** Pull request `id` on the timeline, with its author's username; 404 when there is none. */
  async proposal(timelineId, id) {
    const { rows } = await this.pool.query(
      `SELECT ${PROPOSAL},u.username AS author FROM oc_proposals p JOIN oc_users u ON u.id=p.author_id
      WHERE p.timeline_id=$1 AND p.id=$2`,
      [timelineId, id],
    );
    if (!rows[0]) throw new HttpError(404, 'Pull request unavailable.');
    return rows[0];
  }
  /** The pull request's proposed timeline, as a whole document (to view, edit or export). */
  async document(timelineId, id, userId) {
    await this.store.access(timelineId, userId);
    const p = await this.proposal(timelineId, id);
    return { document: await this.store.revisionDocument(this.pool, p.source_revision_id) };
  }
  /**
   * What a pull request changes from its base: the settings that differ, how many moments,
   * durations and relationships it adds, removes and changes, and the first moments of each.
   * Computed from saved history, so it costs what changed, not the timeline's size. When
   * either revision is no longer kept (its timeline stopped keeping saved history), nothing is
   * counted and `unavailable` says why.
   */
  async changes(baseId, sourceId) {
    const summary = {
      settings: [],
      moments: { added: 0, removed: 0, changed: 0 },
      durations: { added: 0, removed: 0, changed: 0 },
      relationships: { added: 0, removed: 0 },
      examples: [],
    };
    let pages = await differences(this.pool, baseId, sourceId);
    if (!pages)
      try {
        pages = documentDifferences(
          await this.store.revisionDocument(this.pool, baseId),
          await this.store.revisionDocument(this.pool, sourceId),
        );
      } catch (error) {
        if (error.status !== 409) throw error;
        return { ...summary, unavailable: error.message };
      }
    const shown = { added: 0, removed: 0, changed: 0 };
    for await (const page of pages)
      for (const { kind, before, after } of page) {
        if (kind === 'settings') {
          for (const key of new Set([...Object.keys(before), ...Object.keys(after)]))
            if (JSON.stringify(before[key]) !== JSON.stringify(after[key]))
              summary.settings.push(key);
          continue;
        }
        const change = before === null ? 'added' : after === null ? 'removed' : 'changed';
        summary[kind][change]++;
        if (kind === 'moments' && shown[change]++ < EXAMPLES)
          summary.examples.push({ change, before, after });
      }
    return summary;
  }
  /**
   * The revisions a fork's pull request pins: its source, a saved (numbered) revision of the
   * fork, and its base, the latest revision the fork and the upstream `timeline` have in
   * common (commonAncestor walks oc_revision_parents from both). Refused unless `userId` may
   * write the fork, the fork keeps saved history and is a fork of this timeline.
   * @returns {Promise<{baseId: string, sourceId: string}>}
   */
  async forkInput(client, timeline, userId, input) {
    const source = await this.store.access(input.sourceTimelineId, userId, client);
    if (!source.canWrite) throw new HttpError(403, 'Write access to the source fork is required.');
    if (!source.keep_history) throw new HttpError(409, FORK_PULLS_UNAVAILABLE);
    if (source.upstream_id !== timeline.id)
      throw new HttpError(400, 'Choose a fork of this upstream timeline.');
    // A saved revision of the fork: in its history and numbered (not a detached revision,
    // such as another pull request's source).
    const { rows } = await client.query(
      'SELECT id FROM oc_revisions WHERE id=$1 AND timeline_id=$2 AND number IS NOT NULL',
      [input.sourceRevisionId, source.id],
    );
    if (!rows.length) throw new HttpError(404, 'Saved fork revision unavailable.');
    return {
      baseId: await commonAncestor(client, input.sourceRevisionId, timeline.head_revision_id),
      sourceId: input.sourceRevisionId,
    };
  }
  /**
   * Opens a pull request on `timelineId` by `userId` (contributor access), from a document
   * edited at the timeline's current revision or from a fork's saved revision. A document is
   * saved as a detached revision (store.recordDetached: outside the numbered history, its
   * parent the head) and the head becomes its base. Refused when the timeline keeps no saved
   * history, the document was edited from an older revision (409), or the author has 100
   * open pull requests on it.
   * @returns the new pull request, as get gives it
   */
  async create(timelineId, userId, value) {
    const input = proposalInput(value),
      id = randomUUID();
    await this.store.transaction(async (c) => {
      // Lock the timeline and the fork (FOR UPDATE, in id order so two transactions locking
      // both cannot deadlock), so neither's head moves while the pull request is pinned.
      await lockTimelines(c, [
        timelineId,
        ...(input.sourceTimelineId ? [input.sourceTimelineId] : []),
      ]);
      const t = await this.store.access(timelineId, userId, c);
      if (!t.canPropose) throw new HttpError(403, 'Contributor access is required.');
      if (input.document) await this.store.checkScripts(input.document.plugins, t.plugins);
      // A pull request is reviewed and merged against the revisions it was made from.
      if (!t.keep_history) throw new HttpError(409, PULLS_UNAVAILABLE);
      if (!input.sourceTimelineId && t.revision !== input.baseRevision)
        throw new HttpError(
          409,
          'Upstream changed. Reload the latest timeline before starting a pull request.',
        );
      // The author's open pull requests on this timeline, capped at 100; the timeline lock
      // keeps two at once from both passing the count.
      const { rows } = await c.query(
        "SELECT count(*) AS count FROM oc_proposals WHERE timeline_id=$1 AND author_id=$2 AND status='open'",
        [timelineId, userId],
      );
      if (Number(rows[0].count) >= 100)
        throw new HttpError(
          409,
          'Close an existing pull request before opening another (100 open requests).',
        );
      const pinned = input.sourceTimelineId
        ? await this.forkInput(c, t, userId, input)
        : {
            baseId: t.head_revision_id,
            sourceId: await this.store.recordDetached(
              c,
              timelineId,
              userId,
              input.document,
              'proposal',
              [t.head_revision_id],
              t.head_revision_id,
            ),
          };
      await c.query(
        'INSERT INTO oc_proposals(id,timeline_id,author_id,title,body,base_revision,base_revision_id,source_revision_id,source_timeline_id,from_fork) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',
        [
          id,
          timelineId,
          userId,
          input.title,
          input.body,
          t.revision,
          pinned.baseId,
          pinned.sourceId,
          input.sourceTimelineId ?? null,
          !!input.sourceTimelineId,
        ],
      );
    });
    return this.get(timelineId, id, userId);
  }
  /**
   * Replaces pull request `id`'s title, description and proposed changes; its author only,
   * while it is open, and only from its current `revision` (409 otherwise). A document
   * proposal keeps its base (rebase moves it) and saves the new document as a detached
   * revision whose parent is the previous source; a fork's proposal re-pins to a newer saved
   * revision of the same fork, with a fresh common ancestor as its base.
   * @returns the pull request, as get gives it
   */
  async update(timelineId, id, userId, value) {
    const input = proposalInput(value);
    revision(input.revision);
    await this.store.transaction(async (c) => {
      await lockTimelines(c, [
        timelineId,
        ...(input.sourceTimelineId ? [input.sourceTimelineId] : []),
      ]);
      const t = await this.store.access(timelineId, userId, c);
      if (input.document) await this.store.checkScripts(input.document.plugins, t.plugins);
      // The pull request, locked so its revision check and update are one step.
      const { rows } = await c.query(
        `SELECT ${PROPOSAL} FROM oc_proposals p WHERE p.timeline_id=$1 AND p.id=$2 FOR UPDATE`,
        [timelineId, id],
      );
      const p = rows[0];
      if (!p) throw new HttpError(404, 'Pull request unavailable.');
      if (!t.canPropose || p.author_id !== userId)
        throw new HttpError(
          403,
          'Only the author with contributor access can update this proposal.',
        );
      if (p.status !== 'open' || p.revision !== input.revision)
        throw new HttpError(409, 'Pull request changed or is closed.');
      if (
        !!input.sourceTimelineId !== !!p.from_fork ||
        (p.from_fork && input.sourceTimelineId !== p.source_timeline_id)
      )
        throw new HttpError(
          400,
          'The proposal source cannot be replaced with a different timeline.',
        );
      if (!p.from_fork && input.baseRevision !== p.base_revision)
        throw new HttpError(409, 'Use the rebase action to change the base revision.');
      const pinned = p.from_fork
        ? await this.forkInput(c, t, userId, input)
        : {
            baseId: p.base_revision_id,
            sourceId: await this.store.recordDetached(
              c,
              timelineId,
              userId,
              input.document,
              'proposal',
              [p.source_revision_id ?? p.base_revision_id],
              p.base_revision_id,
            ),
          };
      // Re-pins the revisions and bumps the pull request's own counter. A fork's proposal
      // records the upstream revision counter it now stands on.
      await c.query(
        'UPDATE oc_proposals SET title=$3,body=$4,source_revision_id=$5,base_revision_id=$6,base_revision=$7,revision=revision+1,updated_at=now() WHERE timeline_id=$1 AND id=$2',
        [
          timelineId,
          id,
          input.title,
          input.body,
          pinned.sourceId,
          pinned.baseId,
          p.from_fork ? t.revision : p.base_revision,
        ],
      );
    });
    return this.get(timelineId, id, userId);
  }
  /**
   * Acts on open pull request `id`, from its current `revision` (409 otherwise):
   * - `rebase` (its author): moves its base to the timeline's head, merging its changes into
   *   the head entity by entity, saved as a new detached revision with both as parents.
   * - `merge` (write access): applies its changes to the timeline as a new save whose parents
   *   are the head and the source. A document proposal must be based on the current revision
   *   (the author rebases first); a fork's is merged against its common ancestor.
   * - `reject` (write access) or `close` (write access, or its author): closes it unmerged.
   * The timeline is locked for the whole transaction, so a merge and a save cannot interleave.
   * @returns the pull request, as get gives it
   */
  async resolve(timelineId, id, userId, value) {
    if (!value || !['merge', 'reject', 'close', 'rebase'].includes(value.action))
      throw new HttpError(400, 'Choose merge, reject, close, or rebase.');
    revision(value.revision);
    await this.store.transaction(async (c) => {
      // The timeline first, then the pull request, the order every writer here locks them in.
      await c.query('SELECT id FROM oc_timelines WHERE id=$1 FOR UPDATE', [timelineId]);
      const t = await this.store.access(timelineId, userId, c);
      const { rows } = await c.query(
        `SELECT ${PROPOSAL} FROM oc_proposals p WHERE p.timeline_id=$1 AND p.id=$2 FOR UPDATE`,
        [timelineId, id],
      );
      const p = rows[0];
      if (!p) throw new HttpError(404, 'Pull request unavailable.');
      if (p.status !== 'open' || p.revision !== value.revision)
        throw new HttpError(409, 'Pull request changed or is already closed.');
      if (value.action === 'rebase') {
        if (!t.canPropose || p.author_id !== userId)
          throw new HttpError(403, 'Only the author can rebase.');
        const parents = [p.source_revision_id, t.head_revision_id];
        // The proposal's changes merged into upstream's head, entity by entity, and kept as
        // that head changed; or, from revisions saved before history was kept as rows, as
        // merged documents.
        const patch = await mergePatch(c, timelineId, {
          baseId: p.base_revision_id,
          otherId: p.source_revision_id,
          headId: t.head_revision_id,
        });
        const sourceId = patch
          ? await this.store.recordDetachedPatch(
              c,
              t,
              userId,
              patch,
              'rebase',
              parents,
              t.head_revision_id,
            )
          : await this.store.recordDetached(
              c,
              p.source_timeline_id ?? timelineId,
              userId,
              rebaseDocument(
                await this.store.revisionDocument(c, p.base_revision_id),
                await this.store.revisionDocument(c, p.source_revision_id),
                await this.store.branchDocument(c, t),
              ),
              'rebase',
              parents,
              t.head_revision_id,
            );
        await c.query(
          'UPDATE oc_proposals SET base_revision=$3,base_revision_id=$4,source_revision_id=$5,revision=revision+1,updated_at=now() WHERE timeline_id=$1 AND id=$2',
          [timelineId, id, t.revision, t.head_revision_id, sourceId],
        );
        return;
      }
      if (!t.canWrite && !(value.action === 'close' && p.author_id === userId))
        throw new HttpError(403, 'Write access is required to merge or reject.');
      let mergedRevision = null;
      let mergedId = null;
      if (value.action === 'merge') {
        if (!p.from_fork && t.revision !== p.base_revision)
          throw new HttpError(409, 'Upstream changed. The author must rebase before merging.');
        const parents = [t.head_revision_id, p.source_revision_id];
        // What the proposal changed, merged into upstream entity by entity and applied as a
        // save; or, from revisions saved before history was kept as rows, as documents.
        const patch = await mergePatch(c, timelineId, {
          baseId: p.base_revision_id,
          otherId: p.source_revision_id,
          headId: t.head_revision_id,
        });
        if (patch) mergedId = await this.store.applyMerge(c, t, userId, patch, 'merge', parents);
        else {
          const source = await this.store.revisionDocument(c, p.source_revision_id);
          const document = p.from_fork
            ? rebaseDocument(
                await this.store.revisionDocument(c, p.base_revision_id),
                source,
                await this.store.branchDocument(c, t),
              )
            : validateDocument(source);
          // Revisions saved as whole documents: replace the timeline's content, bump its
          // revision counter as a save does, and record the result as a merge checkpoint.
          await this.store.replace(c, timelineId, document);
          await c.query('UPDATE oc_timelines SET revision=revision+1 WHERE id=$1', [timelineId]);
          mergedId = await this.store.checkpoint(c, timelineId, userId, document, 'merge', parents);
        }
        mergedRevision = (BigInt(t.revision) + 1n).toString();
      }
      const status = { merge: 'merged', reject: 'rejected', close: 'closed' }[value.action];
      // Closes the pull request, recording who resolved it and, for a merge, the timeline
      // revision and saved revision it produced.
      await c.query(
        'UPDATE oc_proposals SET status=$3,resolved_by=$4,merged_revision=$5,merged_revision_id=$6,revision=revision+1,updated_at=now() WHERE timeline_id=$1 AND id=$2',
        [timelineId, id, status, userId, mergedRevision, mergedId],
      );
    });
    return this.get(timelineId, id, userId);
  }
  /**
   * Comments on pull request `id`, oldest first, fifty at a time after comment id `after` (a
   * keyset cursor: ids only grow). `next` is the cursor for the next page, or null. 404 unless
   * `userId` may see the timeline and the pull request.
   * @returns {Promise<{comments: object[], next: string|null}>}
   */
  async comments(timelineId, id, userId, after = '0') {
    await this.get(timelineId, id, userId);
    if (typeof after !== 'string' || !/^[0-9]{1,18}$/.test(after))
      throw new HttpError(400, 'Invalid comment cursor.');
    const { rows } = await this.pool.query(
      // A comment moderators restricted (#115) keeps its place, without its text: the LEFT
      // JOIN finds a restricted case on it, if any. Fetches 51 rows to learn whether another
      // page follows without counting.
      `SELECT c.id,CASE WHEN mc.id IS NULL THEN c.body ELSE '' END AS body,mc.id IS NOT NULL AS removed,
      c.created_at,u.username AS author,c.author_id=$3::uuid AS mine FROM oc_proposal_comments c JOIN oc_users u ON u.id=c.author_id
      LEFT JOIN oc_moderation_cases mc ON mc.target_kind='comment' AND mc.target_id=c.id::text AND mc.status='restricted'
      WHERE c.proposal_id=$1 AND c.id>$2 ORDER BY c.id LIMIT 51`,
      [id, after, userId ?? null],
    );
    return { comments: rows.slice(0, 50), next: rows.length > 50 ? rows[49].id : null };
  }
  /** Deletes comment `commentId` on pull request `id`: its author may, at any time (#166). */
  async deleteComment(timelineId, id, commentId, userId) {
    if (!userId) throw new HttpError(401, 'Sign in to delete your comments.');
    await this.get(timelineId, id, userId);
    const { rowCount } = await this.pool.query(
      'DELETE FROM oc_proposal_comments WHERE id=$1 AND proposal_id=$2 AND author_id=$3',
      [commentId, id, userId],
    );
    if (!rowCount) throw new HttpError(404, 'You have no such comment here.');
    return { ok: true };
  }
  /**
   * Adds `userId`'s comment (1 to 20,000 characters, trimmed) to pull request `id`. Anyone who
   * may see the timeline may comment; http.mjs requires a signed-in account, applies a rate
   * limit and, when needed, the human-verification challenge first.
   * @returns {Promise<{id: string}>} the new comment's id (a bigint, as a string)
   */
  async comment(timelineId, id, userId, value) {
    if (typeof value?.body !== 'string' || !value.body.trim() || value.body.length > 20000)
      throw new HttpError(400, 'Comment must contain 1–20,000 characters.');
    return this.store.transaction(async (c) => {
      // Locks the timeline, so a comment is not added while it is being deleted.
      await c.query('SELECT id FROM oc_timelines WHERE id=$1 FOR UPDATE', [timelineId]);
      await this.store.access(timelineId, userId, c);
      const { rows } = await c.query('SELECT id FROM oc_proposals WHERE timeline_id=$1 AND id=$2', [
        timelineId,
        id,
      ]);
      if (!rows.length) throw new HttpError(404, 'Pull request unavailable.');
      const result = await c.query(
        'INSERT INTO oc_proposal_comments(proposal_id,author_id,body) VALUES($1,$2,$3) RETURNING id',
        [id, userId, value.body.trim()],
      );
      return { id: result.rows[0].id };
    });
  }
}
/** Re-exported from merge.mjs for callers (and tests) that import it from here. */
export { rebaseDocument } from './merge.mjs';
