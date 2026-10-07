// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
import { randomUUID } from 'node:crypto';
import { HttpError } from './store.mjs';
import { rebaseDocument } from './merge.mjs';
const uuid = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
export function expectedRevision(value) {
  if (
    typeof value !== 'string' ||
    !/^[1-9][0-9]{0,18}$/.test(value) ||
    BigInt(value) > 9223372036854775807n
  )
    throw new HttpError(400, 'Expected a revision string.');
  return value;
}
export function revisionId(value) {
  if (typeof value !== 'string' || !uuid.test(value))
    throw new HttpError(400, 'Expected a saved revision ID.');
  return value;
}
export async function lockTimelines(client, ids) {
  await client.query(
    'SELECT id FROM oc_timelines WHERE id=ANY($1::uuid[]) ORDER BY id FOR UPDATE',
    [[...new Set(ids)]],
  );
}
export async function commonAncestor(client, left, right) {
  const { rows } = await client.query(
    `WITH RECURSIVE
    a(id) AS (SELECT $1::uuid UNION SELECT p.parent_id FROM oc_revision_parents p JOIN a ON p.revision_id=a.id),
    b(id) AS (SELECT $2::uuid UNION SELECT p.parent_id FROM oc_revision_parents p JOIN b ON p.revision_id=b.id),
    common(id) AS (SELECT id FROM a INTERSECT SELECT id FROM b),
    older(id) AS (SELECT p.parent_id FROM oc_revision_parents p JOIN common c ON c.id=p.revision_id
      UNION SELECT p.parent_id FROM oc_revision_parents p JOIN older o ON o.id=p.revision_id)
    SELECT id FROM common WHERE id NOT IN (SELECT id FROM older) LIMIT 2`,
    [left, right],
  );
  if (rows.length !== 1)
    throw new HttpError(
      409,
      rows.length
        ? 'Multiple common ancestors need explicit reconciliation.'
        : 'These timelines have no common ancestor.',
    );
  return rows[0].id;
}
export class Versioning {
  constructor(store) {
    this.store = store;
    this.pool = store.pool;
  }
  async copy(id, userId, input, duplicate = false) {
    if (!userId) throw new HttpError(401, 'Sign in to fork a timeline.');
    if (!input || Object.keys(input).some((k) => k !== 'revision'))
      throw new HttpError(400, 'Provide the current timeline revision.');
    expectedRevision(input.revision);
    const newId = randomUUID();
    await this.store.transaction(async (c) => {
      await lockTimelines(c, [id]);
      const upstream = await this.store.access(id, userId, c);
      if (!upstream.canFork)
        throw new HttpError(403, 'The owner must enable forking for this private timeline.');
      if (upstream.revision !== input.revision)
        throw new HttpError(409, 'Timeline changed. Reload before copying.');
      const document = await this.store.revisionDocument(c, upstream.head_revision_id);
      await c.query(
        `INSERT INTO oc_timelines(id,owner_id,title,upstream_id,fork_base_revision_id,publication_restricted)
        VALUES($1,$2,$3,$4,$5,$6)`,
        [
          newId,
          userId,
          document.title,
          duplicate ? null : id,
          duplicate ? null : upstream.head_revision_id,
          upstream.visibility === 'private' || upstream.publication_restricted,
        ],
      );
      await this.store.replace(c, newId, document);
      const { rows } = await c.query('SELECT snapshot_id FROM oc_revisions WHERE id=$1', [
        upstream.head_revision_id,
      ]);
      await this.store.checkpoint(
        c,
        newId,
        userId,
        document,
        duplicate ? 'duplicate' : 'fork',
        duplicate ? [] : [upstream.head_revision_id],
        rows[0].snapshot_id,
      );
    });
    return this.store.access(newId, userId);
  }
  async sync(id, userId, input) {
    expectedRevision(input?.revision);
    return this.store.transaction(async (c) => {
      const initial = await this.store.access(id, userId, c);
      if (!initial.upstream_id)
        throw new HttpError(409, 'This timeline has no available upstream.');
      await lockTimelines(c, [id, initial.upstream_id]);
      const fork = await this.store.access(id, userId, c);
      if (!fork.canWrite) throw new HttpError(403, 'Write access to the fork is required.');
      if (fork.revision !== input.revision)
        throw new HttpError(409, 'Your fork changed. Reload before syncing.');
      if (fork.upstream_id !== initial.upstream_id)
        throw new HttpError(409, 'Upstream changed. Reload before syncing.');
      const upstream = await this.store.access(fork.upstream_id, userId, c);
      if (upstream.visibility === 'private' && fork.visibility === 'public')
        throw new HttpError(403, 'Private upstream data cannot be synced into a public fork.');
      const base = await commonAncestor(c, fork.head_revision_id, upstream.head_revision_id);
      if (base === upstream.head_revision_id) return this.store.access(id, userId, c);
      const document = rebaseDocument(
        await this.store.revisionDocument(c, base),
        await this.store.revisionDocument(c, fork.head_revision_id),
        await this.store.revisionDocument(c, upstream.head_revision_id),
      );
      await this.store.replace(c, id, document);
      await c.query(
        'UPDATE oc_timelines SET revision=revision+1,publication_restricted=publication_restricted OR $2 WHERE id=$1',
        [id, upstream.visibility === 'private' || upstream.publication_restricted],
      );
      await this.store.checkpoint(c, id, userId, document, 'sync', [
        fork.head_revision_id,
        upstream.head_revision_id,
      ]);
      return this.store.access(id, userId, c);
    });
  }
  async history(id, userId, page = 1) {
    if (!Number.isSafeInteger(page) || page < 1 || page > 10000)
      throw new HttpError(400, 'Invalid history page.');
    await this.store.access(id, userId);
    const { rows } = await this.pool.query(
      `SELECT r.id,r.number,r.kind,r.created_at,u.username AS author,
      coalesce((SELECT jsonb_agg(p.parent_id ORDER BY p.position) FROM oc_revision_parents p WHERE p.revision_id=r.id),'[]'::jsonb) AS parents
      FROM oc_revisions r LEFT JOIN oc_users u ON u.id=r.author_id
      WHERE r.timeline_id=$1 AND r.number IS NOT NULL ORDER BY r.number DESC LIMIT 21 OFFSET $2`,
      [id, (page - 1) * 20],
    );
    return { revisions: rows.slice(0, 20), page, more: rows.length > 20 };
  }
  async historical(id, savedId, userId) {
    revisionId(savedId);
    await this.store.access(id, userId);
    const { rows } = await this.pool.query(
      'SELECT id FROM oc_revisions WHERE timeline_id=$1 AND id=$2 AND number IS NOT NULL',
      [id, savedId],
    );
    if (!rows.length) throw new HttpError(404, 'Saved revision unavailable.');
    return { document: await this.store.revisionDocument(this.pool, savedId) };
  }
}
