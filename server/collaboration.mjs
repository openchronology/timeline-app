// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
import { rebaseDocument } from './merge.mjs';
import { randomUUID } from 'node:crypto';
import { HttpError } from './store.mjs';
import { validateDocument } from '../dist/core.mjs';
import { commonAncestor, lockTimelines, revisionId } from './versioning.mjs';
export function searchInput(value = {}) {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).some(
      (k) => !['search', 'page', 'limit', 'scope', 'tag', 'owner'].includes(k),
    )
  )
    throw new HttpError(400, 'Invalid timeline search.');
  const { search = '', page = 1, limit = 12, scope = 'public', tag = '', owner = '' } = value;
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
    !['public', 'mine', 'visible'].includes(scope)
  )
    throw new HttpError(400, 'Invalid search or pagination.');
  return {
    search: search.trim(),
    tag: tag.normalize('NFC').trim().toLowerCase(),
    page,
    limit,
    scope,
    owner: owner.normalize('NFC').trim(),
  };
}
export async function searchTimelines(pool, userId, value, featured = []) {
  const { search, tag, page, limit, scope, owner } = searchInput(value);
  if (scope === 'mine' && !userId) throw new HttpError(401, 'Sign in to see your timelines.');
  const { rows } = await pool.query(
    `WITH matching AS (
    SELECT t.id,t.title,t.description,t.tags,t.visibility,t.revision,t.event_count,t.comparison,t.updated_at,u.username AS owner,
      (t.featured OR t.id=ANY($5::uuid[])) AS featured,
      CASE WHEN $2='' THEN 0 ELSE ts_rank_cd(t.search_document,websearch_to_tsquery('english',$2)) END AS rank
    FROM oc_timelines t JOIN oc_users u ON u.id=t.owner_id
    WHERE (CASE WHEN $1::boolean THEN t.owner_id=$6::uuid ELSE (t.visibility='public' OR ($8::boolean AND (t.owner_id=$6::uuid OR EXISTS(SELECT 1 FROM oc_members m WHERE m.timeline_id=t.id AND m.user_id=$6::uuid)))) END)
      AND ($2='' OR t.search_document @@ websearch_to_tsquery('english',$2))
      AND ($7='' OR t.tags @> ARRAY[$7]::text[])
      AND ($9='' OR u.username=$9)
  ), page AS (SELECT * FROM matching ORDER BY CASE WHEN $2='' THEN featured ELSE false END DESC,rank DESC,updated_at DESC,id LIMIT $3 OFFSET $4)
  SELECT (SELECT count(*) FROM matching) AS total,coalesce((SELECT jsonb_agg(to_jsonb(page)) FROM page),'[]'::jsonb) AS timelines`,
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
    const { rows } = await this.pool.query(
      'SELECT p.*,u.username AS author FROM oc_proposals p JOIN oc_users u ON u.id=p.author_id WHERE p.timeline_id=$1 AND p.id=$2',
      [timelineId, id],
    );
    const p = rows[0];
    if (!p) throw new HttpError(404, 'Pull request unavailable.');
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
    const baseId = await commonAncestor(client, input.sourceRevisionId, timeline.head_revision_id);
    return {
      baseId,
      sourceId: input.sourceRevisionId,
      base: await this.store.revisionDocument(client, baseId),
      document: await this.store.revisionDocument(client, input.sourceRevisionId),
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
            base: await this.store.branchDocument(c, t),
            document: input.document,
            sourceId: await this.store.recordRevision(
              c,
              timelineId,
              userId,
              input.document,
              'proposal',
              [t.head_revision_id],
            ),
          };
      await c.query(
        'INSERT INTO oc_proposals(id,timeline_id,author_id,title,body,base_revision,base_document,document,base_revision_id,source_revision_id,source_timeline_id,from_fork) VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,$9,$10,$11,$12)',
        [
          id,
          timelineId,
          userId,
          input.title,
          input.body,
          t.revision,
          JSON.stringify(pinned.base),
          JSON.stringify(pinned.document),
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
        'SELECT * FROM oc_proposals WHERE timeline_id=$1 AND id=$2 FOR UPDATE',
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
            base: p.base_document,
            document: input.document,
            sourceId: await this.store.recordRevision(
              c,
              timelineId,
              userId,
              input.document,
              'proposal',
              [p.source_revision_id ?? p.base_revision_id],
            ),
          };
      await c.query(
        'UPDATE oc_proposals SET title=$3,body=$4,document=$5::jsonb,source_revision_id=$6,base_revision_id=$7,base_document=$8::jsonb,base_revision=$9,revision=revision+1,updated_at=now() WHERE timeline_id=$1 AND id=$2',
        [
          timelineId,
          id,
          input.title,
          input.body,
          JSON.stringify(pinned.document),
          pinned.sourceId,
          pinned.baseId,
          JSON.stringify(pinned.base),
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
        'SELECT * FROM oc_proposals WHERE timeline_id=$1 AND id=$2 FOR UPDATE',
        [timelineId, id],
      );
      const p = rows[0];
      if (!p) throw new HttpError(404, 'Pull request unavailable.');
      if (p.status !== 'open' || p.revision !== value.revision)
        throw new HttpError(409, 'Pull request changed or is already closed.');
      if (value.action === 'rebase') {
        if (!t.canPropose || p.author_id !== userId)
          throw new HttpError(403, 'Only the author can rebase.');
        const upstream = await this.store.branchDocument(c, t);
        const rebased = rebaseDocument(p.base_document, p.document, upstream);
        const sourceId = await this.store.recordRevision(
          c,
          p.source_timeline_id ?? timelineId,
          userId,
          rebased,
          'rebase',
          [p.source_revision_id, t.head_revision_id],
        );
        await c.query(
          'UPDATE oc_proposals SET base_revision=$3,base_document=$4::jsonb,document=$5::jsonb,base_revision_id=$6,source_revision_id=$7,revision=revision+1,updated_at=now() WHERE timeline_id=$1 AND id=$2',
          [
            timelineId,
            id,
            t.revision,
            JSON.stringify(upstream),
            JSON.stringify(rebased),
            t.head_revision_id,
            sourceId,
          ],
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
        const document = p.from_fork
          ? rebaseDocument(p.base_document, p.document, await this.store.branchDocument(c, t))
          : validateDocument(p.document);
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
