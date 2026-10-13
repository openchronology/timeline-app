// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
import { rebaseDocument } from './merge.mjs';
import { randomUUID } from 'node:crypto';
import { HttpError } from './store.mjs';
import { validateDocument, relationshipKey } from '../dist/core.mjs';
import { commonAncestor, lockTimelines, revisionId } from './versioning.mjs';
import { differences } from './history.mjs';
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
    !['featured', 'stars', 'popularity', 'alphabetical', 'age', 'relevance'].includes(sort) ||
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
export async function searchTimelines(pool, userId, value, featured = []) {
  const { search, tag, page, limit, scope, owner, sort, starredBy } = searchInput(value);
  if (['mine', 'starred'].includes(scope) && !userId)
    throw new HttpError(401, 'Sign in to see your timelines.');
  const { rows } = await pool.query(
    `WITH matching AS (
    SELECT t.id,t.title,t.description,t.tags,t.visibility,t.revision,t.event_count,t.comparison,t.updated_at,t.created_at,t.star_count,u.username AS owner,
      EXISTS(SELECT 1 FROM oc_timeline_stars s WHERE s.timeline_id=t.id AND s.user_id=$6::uuid) AS starred,
      t.star_count+(SELECT count(*) FROM oc_timelines f WHERE f.upstream_id=t.id AND f.visibility='public') AS popularity,
      (t.featured OR t.id=ANY($5::uuid[])) AS featured,
      CASE WHEN $2='' THEN 0 ELSE ts_rank_cd(t.search_document,websearch_to_tsquery('english',$2)) END AS rank
    FROM oc_timelines t JOIN oc_users u ON u.id=t.owner_id
    WHERE (CASE WHEN $1::boolean THEN t.owner_id=$6::uuid ELSE (t.visibility='public' OR (($8::boolean OR $11::boolean) AND (t.owner_id=$6::uuid OR EXISTS(SELECT 1 FROM oc_members m WHERE m.timeline_id=t.id AND m.user_id=$6::uuid)))) END)
      AND ($2='' OR t.search_document @@ websearch_to_tsquery('english',$2))
      AND ($7='' OR t.tags @> ARRAY[$7]::text[])
      AND ($9='' OR u.username=$9)
      AND (NOT $11::boolean OR EXISTS(SELECT 1 FROM oc_timeline_stars s WHERE s.timeline_id=t.id AND s.user_id=$6::uuid))
      AND ($12='' OR EXISTS(SELECT 1 FROM oc_timeline_stars s JOIN oc_users su ON su.id=s.user_id WHERE s.timeline_id=t.id AND su.username=$12))
  ), page AS (SELECT * FROM matching ORDER BY CASE WHEN $10='featured' THEN featured ELSE false END DESC,
      CASE WHEN $10='relevance' THEN rank ELSE 0 END DESC,
      CASE WHEN $10='stars' THEN star_count WHEN $10='popularity' THEN popularity ELSE 0 END DESC,
      CASE WHEN $10='alphabetical' THEN lower(title) ELSE '' END ASC,
      CASE WHEN $10='age' THEN created_at ELSE NULL END DESC,updated_at DESC,id LIMIT $3 OFFSET $4)
  SELECT (SELECT count(*) FROM matching) AS total,coalesce((SELECT jsonb_agg(to_jsonb(page)||jsonb_build_object('star_count',page.star_count::text,'popularity',page.popularity::text)) FROM page),'[]'::jsonb) AS timelines`,
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
    ],
  );
  const total = Number(rows[0].total);
  return { timelines: rows[0].timelines, total, page, limit, pages: Math.ceil(total / limit) };
}
const revision = (value) => {
  if (
    typeof value !== 'string' ||
    !/^[1-9][0-9]{0,18}$/.test(value) ||
    BigInt(value) > 9223372036854775807n
  )
    throw new HttpError(400, 'Expected a revision string.');
  return value;
};
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
    document = validateDocument(value.document);
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
export class Collaboration {
  constructor(store) {
    this.store = store;
    this.pool = store.pool;
  }
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
    const { rows } = await this.pool.query(
      `WITH matching AS (SELECT p.id,p.title,p.status,p.base_revision,p.revision,p.created_at,p.updated_at,u.username AS author FROM oc_proposals p JOIN oc_users u ON u.id=p.author_id WHERE p.timeline_id=$1), page AS (SELECT * FROM matching ORDER BY created_at DESC,id LIMIT $2 OFFSET $3) SELECT (SELECT count(*) FROM matching) AS total,coalesce((SELECT jsonb_agg(to_jsonb(page)) FROM page),'[]'::jsonb) AS proposals`,
      [timelineId, limit, (page - 1) * limit],
    );
    const total = Number(rows[0].total);
    return { proposals: rows[0].proposals, total, page, pages: Math.ceil(total / limit) };
  }
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
   * Computed from saved history, so it costs what changed, not the timeline's size.
   */
  async changes(baseId, sourceId) {
    const summary = {
      settings: [],
      moments: { added: 0, removed: 0, changed: 0 },
      durations: { added: 0, removed: 0, changed: 0 },
      relationships: { added: 0, removed: 0 },
      examples: [],
    };
    const pages =
      (await differences(this.pool, baseId, sourceId)) ??
      documentDifferences(
        await this.store.revisionDocument(this.pool, baseId),
        await this.store.revisionDocument(this.pool, sourceId),
      );
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
  async forkInput(client, timeline, userId, input) {
    const source = await this.store.access(input.sourceTimelineId, userId, client);
    if (!source.canWrite) throw new HttpError(403, 'Write access to the source fork is required.');
    if (source.upstream_id !== timeline.id)
      throw new HttpError(400, 'Choose a fork of this upstream timeline.');
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
  async create(timelineId, userId, value) {
    const input = proposalInput(value),
      id = randomUUID();
    await this.store.transaction(async (c) => {
      await lockTimelines(c, [
        timelineId,
        ...(input.sourceTimelineId ? [input.sourceTimelineId] : []),
      ]);
      const t = await this.store.access(timelineId, userId, c);
      if (!t.canPropose) throw new HttpError(403, 'Contributor access is required.');
      if (!input.sourceTimelineId && t.revision !== input.baseRevision)
        throw new HttpError(
          409,
          'Upstream changed. Reload the latest timeline before starting a pull request.',
        );
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
  async update(timelineId, id, userId, value) {
    const input = proposalInput(value);
    revision(input.revision);
    await this.store.transaction(async (c) => {
      await lockTimelines(c, [
        timelineId,
        ...(input.sourceTimelineId ? [input.sourceTimelineId] : []),
      ]);
      const t = await this.store.access(timelineId, userId, c);
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
  async resolve(timelineId, id, userId, value) {
    if (!value || !['merge', 'reject', 'close', 'rebase'].includes(value.action))
      throw new HttpError(400, 'Choose merge, reject, close, or rebase.');
    revision(value.revision);
    await this.store.transaction(async (c) => {
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
        const rebased = rebaseDocument(
          await this.store.revisionDocument(c, p.base_revision_id),
          await this.store.revisionDocument(c, p.source_revision_id),
          await this.store.branchDocument(c, t),
        );
        const sourceId = await this.store.recordDetached(
          c,
          p.source_timeline_id ?? timelineId,
          userId,
          rebased,
          'rebase',
          [p.source_revision_id, t.head_revision_id],
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
        const source = await this.store.revisionDocument(c, p.source_revision_id);
        const document = p.from_fork
          ? rebaseDocument(
              await this.store.revisionDocument(c, p.base_revision_id),
              source,
              await this.store.branchDocument(c, t),
            )
          : validateDocument(source);
        await this.store.replace(c, timelineId, document);
        await c.query('UPDATE oc_timelines SET revision=revision+1 WHERE id=$1', [timelineId]);
        mergedRevision = (BigInt(t.revision) + 1n).toString();
        mergedId = await this.store.checkpoint(c, timelineId, userId, document, 'merge', [
          t.head_revision_id,
          p.source_revision_id,
        ]);
      }
      const status = { merge: 'merged', reject: 'rejected', close: 'closed' }[value.action];
      await c.query(
        'UPDATE oc_proposals SET status=$3,resolved_by=$4,merged_revision=$5,merged_revision_id=$6,revision=revision+1,updated_at=now() WHERE timeline_id=$1 AND id=$2',
        [timelineId, id, status, userId, mergedRevision, mergedId],
      );
    });
    return this.get(timelineId, id, userId);
  }
  async comments(timelineId, id, userId, after = '0') {
    await this.get(timelineId, id, userId);
    if (typeof after !== 'string' || !/^[0-9]{1,18}$/.test(after))
      throw new HttpError(400, 'Invalid comment cursor.');
    const { rows } = await this.pool.query(
      'SELECT c.id,c.body,c.created_at,u.username AS author FROM oc_proposal_comments c JOIN oc_users u ON u.id=c.author_id WHERE c.proposal_id=$1 AND c.id>$2 ORDER BY c.id LIMIT 51',
      [id, after],
    );
    return { comments: rows.slice(0, 50), next: rows.length > 50 ? rows[49].id : null };
  }
  async comment(timelineId, id, userId, value) {
    if (typeof value?.body !== 'string' || !value.body.trim() || value.body.length > 20000)
      throw new HttpError(400, 'Comment must contain 1–20,000 characters.');
    return this.store.transaction(async (c) => {
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
export { rebaseDocument } from './merge.mjs';
