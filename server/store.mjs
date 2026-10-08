// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
import {
  Q,
  pluginMetadata,
  validateDocument,
  durationTree,
  durationOverview,
  fixMissingAnchors,
  coalesceGroups,
  durationGroups,
  searchRows,
  searchTerms,
  filterDocument,
  viewFilterKey,
  edgeTree,
  entityTimes,
  arcFromBand,
  relationshipKey,
  snippet,
  SEARCH_PAGE_SIZE,
} from '../dist/core.mjs';
import { randomUUID } from 'node:crypto';
import { indexedNodes } from './tree.mjs';
export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
export class PostgresStore {
  constructor(pool) {
    this.pool = pool;
  }
  async liveState(id, userId, client = this.pool) {
    const { rows } = await client.query(
      `SELECT t.id,t.revision FROM oc_timelines t
      WHERE t.id=$1 AND (t.visibility='public' OR t.owner_id=$2::uuid
      OR EXISTS(SELECT 1 FROM oc_users a WHERE a.id=$2::uuid AND a.is_admin AND NOT a.is_disabled)
      OR EXISTS(SELECT 1 FROM oc_members m WHERE m.timeline_id=t.id AND m.user_id=$2::uuid))`,
      [id, userId ?? null],
    );
    if (!rows[0]) throw new HttpError(404, 'Timeline unavailable.');
    return rows[0];
  }
  async access(id, userId, client = this.pool) {
    const { rows } = await client.query(
      `SELECT t.*,u.username AS owner,
      EXISTS(SELECT 1 FROM oc_timeline_stars s WHERE s.timeline_id=t.id AND s.user_id=$2::uuid) AS starred,
      CASE WHEN EXISTS(SELECT 1 FROM oc_users admin WHERE admin.id=$2::uuid AND admin.is_admin AND NOT admin.is_disabled) THEN 'admin' WHEN t.owner_id=$2::uuid THEN 'owner' ELSE m.role END AS role
      FROM oc_timelines t JOIN oc_users u ON u.id=t.owner_id
      LEFT JOIN oc_members m ON m.timeline_id=t.id AND m.user_id=$2::uuid WHERE t.id=$1`,
      [id, userId ?? null],
    );
    const timeline = rows[0];
    if (!timeline || (!timeline.role && timeline.visibility !== 'public'))
      throw new HttpError(404, 'Timeline unavailable. Sign in if it is private.');
    if (timeline.comparison) {
      const sources = await client.query(
        `SELECT t.id FROM oc_timelines t
        WHERE t.id=ANY($1::uuid[]) AND t.comparison IS NULL AND
        (t.visibility='public' OR t.owner_id=$2::uuid OR EXISTS(SELECT 1 FROM oc_users a WHERE a.id=$2::uuid AND a.is_admin AND NOT a.is_disabled) OR EXISTS
          (SELECT 1 FROM oc_members m WHERE m.timeline_id=t.id AND m.user_id=$2::uuid))`,
        [timeline.comparison.sources, userId ?? null],
      );
      if (sources.rows.length !== timeline.comparison.sources.length)
        throw new HttpError(404, 'A comparison source is unavailable.');
    }
    const { search_document, event_text, ...metadata } = timeline;
    return {
      ...metadata,
      canWrite:
        !timeline.comparison && ['owner', 'admin', 'writer', 'editor'].includes(timeline.role),
      canPropose:
        !timeline.comparison &&
        !!userId &&
        (['owner', 'admin', 'writer', 'editor', 'contributor'].includes(timeline.role) ||
          timeline.visibility === 'public'),
      canEdit:
        !timeline.comparison &&
        !!userId &&
        (['owner', 'admin', 'writer', 'editor', 'contributor'].includes(timeline.role) ||
          timeline.visibility === 'public'),
      canShare: ['owner', 'admin'].includes(timeline.role),
      canFork:
        !timeline.comparison &&
        !!userId &&
        (timeline.visibility === 'public' ||
          ['owner', 'admin'].includes(timeline.role) ||
          timeline.allow_private_forks),
    };
  }
  async replace(client, id, document, { touch = true } = {}) {
    document = validateDocument(document);
    if (document.comparison) {
      const parent = (
        await client.query('SELECT owner_id,visibility FROM oc_timelines WHERE id=$1', [id])
      ).rows[0];
      const sources = await client.query(
        `SELECT t.id FROM oc_timelines t
        WHERE t.id=ANY($1::uuid[]) AND t.id<>$2::uuid AND t.comparison IS NULL
        AND (t.visibility='public' OR ($3='private' AND (t.owner_id=$4::uuid OR EXISTS
          (SELECT 1 FROM oc_members m WHERE m.timeline_id=t.id AND m.user_id=$4::uuid))))`,
        [document.comparison.sources, id, parent.visibility, parent.owner_id],
      );
      if (sources.rows.length !== document.comparison.sources.length)
        throw new HttpError(
          400,
          'Comparison sources must be accessible ordinary timelines; public comparisons require public sources.',
        );
    }
    // Reject over-quota document growth before rebuilding the rational index.
    await client.query('UPDATE oc_timelines SET storage_bytes=$2 WHERE id=$1', [
      id,
      Buffer.byteLength(JSON.stringify(document)),
    ]);
    const additions = await client.query(
      `SELECT EXISTS(SELECT value FROM jsonb_array_elements_text($2::jsonb)
        EXCEPT SELECT event->>'id' FROM oc_nodes n CROSS JOIN LATERAL jsonb_array_elements(n.events) event WHERE n.timeline_id=$1) AS added`,
      [id, JSON.stringify(document.events.map((event) => event.id))],
    );
    const tree = indexedNodes(document);
    await writeNodes(client, 'oc_nodes', id, tree);
    const bands = await writeDurationNodes(client, 'oc_duration_nodes', id, document);
    await this.indexSearch(client, id, document, bands);
    await client.query('DELETE FROM oc_relationships WHERE timeline_id=$1', [id]);
    const links = document.relationships ?? [];
    const kind = (ref) => ('moment' in ref ? ['moment', ref.moment] : ['duration', ref.duration]);
    for (let offset = 0; offset < links.length; offset += 1000) {
      const params = [];
      const tuples = links.slice(offset, offset + 1000).map((r) => {
        const start = params.length;
        params.push(id, ...kind(r.a), ...kind(r.b));
        return '(' + Array.from({ length: 5 }, (_, i) => '$' + (start + i + 1)).join(',') + ')';
      });
      await client.query(
        'INSERT INTO oc_relationships(timeline_id,a_kind,a_id,b_kind,b_id) VALUES ' +
          tuples.join(','),
        params,
      );
    }
    await writeEdgeNodes(client, id, document);
    // Saved state changed: derived separation views belong to the previous revision.
    await client.query('DELETE FROM oc_views WHERE timeline_id=$1', [id]);
    await client.query(
      'UPDATE oc_timelines SET title=$2,description=$3,root=$4,event_count=$5,presentation=$6::jsonb,plugins=$7::jsonb,tags=$8,assets=$9::jsonb,event_text=$10,comparison=$11::jsonb,storage_bytes=$12,event_generation=event_generation+CASE WHEN $13 THEN 1 ELSE 0 END,updated_at=CASE WHEN $14 THEN now() ELSE updated_at END WHERE id=$1',
      [
        id,
        document.title,
        document.description,
        tree.root,
        tree.count,
        document.presentation ? JSON.stringify(document.presentation) : null,
        document.plugins === undefined ? null : JSON.stringify(document.plugins),
        document.tags ?? null,
        document.assets === undefined ? null : JSON.stringify(document.assets),
        eventSearchText(document),
        document.comparison ? JSON.stringify(document.comparison) : null,
        Buffer.byteLength(JSON.stringify(document)),
        additions.rows[0].added,
        touch,
      ],
    );
  }
  /** Rebuilds the timeline's text search rows from a complete document and its resolved bands. */
  async indexSearch(client, id, document, bands) {
    await client.query('DELETE FROM oc_entity_search WHERE timeline_id=$1', [id]);
    const rows = searchRows(document.events, bands);
    for (let offset = 0; offset < rows.length; offset += 500) {
      const params = [];
      const tuples = rows.slice(offset, offset + 500).map((row) => {
        const start = params.length;
        params.push(id, row.kind, row.id, row.first, row.last, row.title, row.body, row.tags);
        return (
          '(' +
          Array.from(
            { length: 8 },
            (_, i) =>
              '$' + (start + i + 1) + (i === 3 || i === 4 ? '::mpq' : i === 7 ? '::text[]' : ''),
          ).join(',') +
          ')'
        );
      });
      await client.query(
        'INSERT INTO oc_entity_search(timeline_id,kind,entity_id,first_time,last_time,title,body,tags) VALUES ' +
          tuples.join(','),
        params,
      );
    }
    await client.query('UPDATE oc_timelines SET search_version=1 WHERE id=$1', [id]);
  }
  async transaction(action) {
    const c = await this.pool.connect();
    try {
      await c.query('BEGIN');
      const result = await action(c);
      await c.query('COMMIT');
      return result;
    } catch (e) {
      await c.query('ROLLBACK');
      if (e.code === 'P0001' && e.message.startsWith('Account storage limit'))
        throw new HttpError(413, e.message);
      throw e;
    } finally {
      c.release();
    }
  }
  async create(userId, document) {
    document = validateDocument(document);
    const id = randomUUID();
    await this.transaction(async (c) => {
      await c.query('INSERT INTO oc_timelines(id,owner_id,title) VALUES($1,$2,$3)', [
        id,
        userId,
        document.title,
      ]);
      await this.replace(c, id, document);
      await this.checkpoint(c, id, userId, document, 'save');
    });
    return this.access(id, userId);
  }
  async save(id, userId, revision, document, patch = null) {
    return this.transaction(async (c) => {
      await c.query('SELECT id FROM oc_timelines WHERE id=$1 FOR UPDATE', [id]);
      const t = await this.access(id, userId, c);
      if (!t.canWrite) throw new HttpError(403, 'Write access is required to update upstream.');
      if (t.revision !== revision)
        throw new HttpError(
          409,
          'Someone changed this timeline. Export your edits before reloading.',
        );
      if (patch) {
        const current = await this.branchDocument(c, t);
        document = validateDocument(applyPatch(current, patch));
      }
      await this.replace(c, id, document);
      await c.query('UPDATE oc_timelines SET revision=revision+1 WHERE id=$1', [id]);
      await this.checkpoint(c, id, userId, document, 'save', [t.head_revision_id]);
      return this.access(id, userId, c);
    });
  }
  async checkpoint(client, id, userId, document, kind, parents = [], snapshotId = null) {
    const { rows } = await client.query('SELECT revision FROM oc_timelines WHERE id=$1', [id]);
    const revisionId = await this.recordRevision(
      client,
      id,
      userId,
      document,
      kind,
      parents,
      snapshotId,
      rows[0].revision,
    );
    await client.query('UPDATE oc_timelines SET head_revision_id=$2 WHERE id=$1', [id, revisionId]);
    return revisionId;
  }
  async recordRevision(
    client,
    id,
    userId,
    document,
    kind,
    parents = [],
    snapshotId = null,
    number = null,
  ) {
    const revisionId = randomUUID();
    if (!snapshotId) {
      snapshotId = randomUUID();
      const serialized = JSON.stringify(validateDocument(document));
      await client.query(
        'INSERT INTO oc_snapshots(id,document,document_bytes) VALUES($1,$2::jsonb,$3)',
        [snapshotId, serialized, Buffer.byteLength(serialized)],
      );
    }
    await client.query(
      'INSERT INTO oc_revisions(id,timeline_id,number,snapshot_id,author_id,kind) VALUES($1,$2,$3,$4,$5,$6)',
      [revisionId, id, number, snapshotId, userId, kind],
    );
    for (const [position, parent] of [...new Set(parents.filter(Boolean))].entries())
      await client.query(
        'INSERT INTO oc_revision_parents(revision_id,parent_id,position) VALUES($1,$2,$3)',
        [revisionId, parent, position],
      );
    return revisionId;
  }
  async revisionDocument(client, id) {
    const { rows } = await client.query(
      'SELECT s.document FROM oc_revisions r JOIN oc_snapshots s ON s.id=r.snapshot_id WHERE r.id=$1',
      [id],
    );
    if (!rows[0]) throw new HttpError(404, 'Saved revision unavailable.');
    return rows[0].document;
  }
  async removeHistory(client, timelineId) {
    // Keep ancestors still needed by another fork or submitted review. Other
    // timelines' private history is never exposed through the history API.
    const { rows } = await client.query(
      `WITH RECURSIVE kept(id) AS (
      SELECT r.id FROM oc_revisions r WHERE r.timeline_id=$1 AND (
        EXISTS(SELECT 1 FROM oc_timelines t WHERE t.head_revision_id=r.id OR t.fork_base_revision_id=r.id)
        OR EXISTS(SELECT 1 FROM oc_proposals p WHERE p.base_revision_id=r.id OR p.source_revision_id=r.id OR p.merged_revision_id=r.id)
        OR EXISTS(SELECT 1 FROM oc_revision_parents p JOIN oc_revisions child ON child.id=p.revision_id WHERE p.parent_id=r.id AND child.timeline_id<>$1))
      UNION SELECT p.parent_id FROM oc_revision_parents p JOIN kept k ON k.id=p.revision_id
    ) SELECT r.id,r.snapshot_id FROM oc_revisions r WHERE r.timeline_id=$1 AND r.id NOT IN (SELECT id FROM kept)`,
      [timelineId],
    );
    if (!rows.length) return;
    const ids = rows.map((r) => r.id);
    await client.query('DELETE FROM oc_revision_parents WHERE revision_id=ANY($1::uuid[])', [ids]);
    await client.query('DELETE FROM oc_revisions WHERE id=ANY($1::uuid[])', [ids]);
    await client.query(
      'DELETE FROM oc_snapshots s WHERE s.id=ANY($1::uuid[]) AND NOT EXISTS(SELECT 1 FROM oc_revisions r WHERE r.snapshot_id=s.id)',
      [rows.map((r) => r.snapshot_id)],
    );
  }
  async metadata(id, userId) {
    return this.transaction(async (c) => {
      await c.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
      const t = await this.access(id, userId, c);
      const { rows } = await c.query(
        'SELECT oc_qtext(first_time) AS first,oc_qtext(last_time) AS last FROM oc_nodes WHERE timeline_id=$1 AND id=$2',
        [id, t.root],
      );
      return { ...t, ...rows[0] };
    });
  }
  async recent(id, userId, direction = 'last') {
    if (!['last', 'first'].includes(direction))
      throw new HttpError(400, 'Invalid recent-event direction.');
    return this.transaction(async (c) => {
      await c.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
      const timeline = await this.access(id, userId, c);
      if (timeline.comparison)
        throw new HttpError(409, 'Read recent events from comparison sources.');
      const { rows } = await c.query('SELECT oc_recent_times($1,$2) AS time', [
        id,
        direction === 'first',
      ]);
      return {
        revision: timeline.revision,
        event_generation: timeline.event_generation,
        times: rows.map((row) => row.time),
      };
    });
  }
  async snapshot(id, userId) {
    return this.transaction(async (c) => {
      await c.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
      const t = await this.access(id, userId, c);
      const { rows } = await c.query('SELECT oc_events($1,NULL,NULL,NULL,NULL,200001) AS event', [
        id,
      ]);
      const durations = await this.durationDefinitions(c, id);
      const relationships = await this.relationshipList(c, id);
      return {
        timeline: t,
        document: validateDocument({
          format: 'openchronology',
          version: 1,
          title: t.title,
          description: t.description,
          ...(t.presentation ? { presentation: t.presentation } : {}),
          ...(t.plugins ? { plugins: t.plugins } : {}),
          ...(t.tags === null || t.tags === undefined ? {} : { tags: t.tags }),
          ...(t.assets ? { assets: t.assets } : {}),
          ...(t.comparison ? { comparison: t.comparison } : {}),
          events: rows.map((r) => r.event),
          ...(durations.length ? { durations } : {}),
          ...(relationships.length ? { relationships } : {}),
        }),
      };
    });
  }
  async relationshipList(client, id) {
    const { rows } = await client.query(
      'SELECT a_kind,a_id,b_kind,b_id FROM oc_relationships WHERE timeline_id=$1',
      [id],
    );
    return rows.map((r) => ({ a: { [r.a_kind]: r.a_id }, b: { [r.b_kind]: r.b_id } }));
  }
  /** Standalone duration definitions; legacy rows convert from their moments' metadata. */
  async durationDefinitions(client, id) {
    const { rows } = await client.query(
      'SELECT definition FROM oc_duration_nodes WHERE timeline_id=$1 AND definition IS NOT NULL ORDER BY definition->>\'id\' COLLATE "C"',
      [id],
    );
    return rows.map((r) => r.definition);
  }
  async branchDocument(client, timeline) {
    const { rows } = await client.query(
      'SELECT oc_events($1,NULL,NULL,NULL,NULL,200001) AS event',
      [timeline.id],
    );
    const durations = await this.durationDefinitions(client, timeline.id);
    const relationships = await this.relationshipList(client, timeline.id);
    return validateDocument({
      format: 'openchronology',
      version: 1,
      title: timeline.title,
      description: timeline.description,
      ...(timeline.presentation ? { presentation: timeline.presentation } : {}),
      ...(timeline.plugins ? { plugins: timeline.plugins } : {}),
      ...(timeline.tags == null ? {} : { tags: timeline.tags }),
      ...(timeline.assets ? { assets: timeline.assets } : {}),
      ...(timeline.comparison ? { comparison: timeline.comparison } : {}),
      events: rows.map((r) => r.event),
      ...(durations.length ? { durations } : {}),
      ...(relationships.length ? { relationships } : {}),
    });
  }
  /**
   * Returns the derived index for one side of a tag separation at the current saved revision,
   * building it from the saved document on first use. A save discards views; each timeline
   * keeps its eight most recent.
   */
  async view(id, userId, filter) {
    const key = viewFilterKey(filter);
    return this.transaction(async (c) => {
      const t = await this.access(id, userId, c);
      if (t.comparison) throw new HttpError(409, 'Comparisons cannot be separated by tags.');
      await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [
        id + '|' + t.revision + '|' + key,
      ]);
      const existing = await c.query(
        'SELECT id FROM oc_views WHERE timeline_id=$1 AND revision=$2 AND filter_key=$3',
        [id, t.revision, key],
      );
      if (existing.rows[0]) return existing.rows[0].id;
      const document = filterDocument(await this.branchDocument(c, t), filter);
      const tree = indexedNodes(document),
        viewId = randomUUID();
      await c.query(
        'INSERT INTO oc_views(id,timeline_id,revision,filter_key,root,event_count) VALUES($1,$2,$3,$4,$5,$6)',
        [viewId, id, t.revision, key, tree.root, tree.count],
      );
      await writeNodes(c, 'oc_view_nodes', viewId, tree);
      await writeDurationNodes(c, 'oc_view_duration_nodes', viewId, document);
      await c.query(
        'DELETE FROM oc_views WHERE timeline_id=$1 AND id NOT IN (SELECT id FROM oc_views WHERE timeline_id=$1 ORDER BY created_at DESC,id LIMIT 8)',
        [id],
      );
      return viewId;
    });
  }
  async query(id, userId, query) {
    // Tag separations read a derived index for the filter, built on first use.
    const view = query.filter ? await this.view(id, userId, query.filter) : null;
    const tree = view ?? id,
      names = treeNames(view);
    return this.transaction(async (c) => {
      await c.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
      const t = await this.access(id, userId, c);
      if (t.comparison)
        throw new HttpError(409, 'Query the comparison’s source timelines individually.');
      if (query.revision && query.revision !== t.revision)
        throw new HttpError(
          409,
          'The server timeline changed. Save or export your edits before reloading.',
        );
      if (
        view &&
        !(
          await c.query('SELECT 1 FROM oc_views WHERE id=$1 AND timeline_id=$2 AND revision=$3', [
            view,
            id,
            t.revision,
          ])
        ).rows.length
      )
        throw new HttpError(409, 'The server timeline changed. Separate the tags again.');
      if (query.kind === 'overview') {
        const span = Q.parse(query.upper).sub(Q.parse(query.lower));
        const minimum = span.compare(Q.zero) > 0 ? span.div(Q.from(1024n)) : Q.zero;
        const threshold =
          Q.parse(query.threshold).compare(minimum) < 0 ? minimum.toString() : query.threshold;
        const { rows } = await c.query(
          `SELECT * FROM ${names.overview}($1,$2::mpq,$3::mpq,$4::mpq)`,
          [tree, query.lower, query.upper, threshold],
        );
        // Bands are durations at least as long as the threshold; shorter ones are summarized.
        const intervals = await c.query(
          `WITH RECURSIVE visible AS (
          SELECT n.* FROM ${names.durations} n WHERE timeline_id=$1 AND id=1 AND min_time<=$3::mpq AND max_time>=$2::mpq
          UNION ALL SELECT n.* FROM visible p JOIN ${names.durations} n ON n.timeline_id=p.timeline_id AND n.id IN (p.left_id,p.right_id)
          WHERE n.min_time<=$3::mpq AND n.max_time>=$2::mpq AND NOT coalesce(n.max_extent<$4::mpq AND $4::mpq>'0'::mpq,false)
        ) SELECT band FROM visible WHERE first_time<=$3::mpq AND last_time>=$2::mpq
          AND ($4::mpq='0'::mpq OR last_time-first_time>=$4::mpq) LIMIT 257`,
          [tree, query.lower, query.upper, threshold],
        );
        // Arcs use the same pruned interval query; separation views draw none.
        const arcs = view
          ? { rows: [] }
          : await c.query(
              `WITH RECURSIVE visible AS (
          SELECT n.* FROM oc_edge_nodes n WHERE timeline_id=$1 AND id=1 AND min_time<=$3::mpq AND max_time>=$2::mpq
          UNION ALL SELECT n.* FROM visible p JOIN oc_edge_nodes n ON n.timeline_id=p.timeline_id AND n.id IN (p.left_id,p.right_id)
          WHERE n.min_time<=$3::mpq AND n.max_time>=$2::mpq AND NOT coalesce(n.max_extent<$4::mpq AND $4::mpq>'0'::mpq,false)
        ) SELECT band FROM visible WHERE first_time<=$3::mpq AND last_time>=$2::mpq
          AND ($4::mpq='0'::mpq OR last_time-first_time>=$4::mpq) LIMIT 257`,
              [id, query.lower, query.upper, threshold],
            );
        const collapsed = await c.query(
          `SELECT first_time,last_time,duration_count,band FROM ${names.durationOverview}($1,$2::mpq,$3::mpq,$4::mpq)`,
          [tree, query.lower, query.upper, threshold],
        );
        const momentGroups = rows.map((r) => ({
          first: r.first_time,
          last: r.last_time,
          count: r.event_count,
          distinct: r.distinct_count,
          ...(r.event_id
            ? {
                id: r.event_id,
                title: (r.title ?? '').slice(0, 512),
                ...((query.plugins ?? t.plugins)?.some((p) => p.enabled)
                  ? { metadata: overviewMetadata(query.plugins ?? t.plugins, r.metadata ?? {}) }
                  : {}),
              }
            : {}),
        }));
        const durationClusters = durationGroups(
          collapsed.rows.map((r) => ({
            first: r.first_time,
            last: r.last_time,
            count: r.duration_count,
            ...(r.band ? { band: r.band } : {}),
          })),
        );
        return {
          durations: intervals.rows.slice(0, 256).map((r) => r.band),
          durationsTruncated: intervals.rows.length > 256,
          edges: arcs.rows.slice(0, 256).map((r) => arcFromBand(r.band)),
          edgesTruncated: arcs.rows.length > 256,
          revision: t.revision,
          threshold,
          groups: durationClusters.length
            ? coalesceGroups([...momentGroups, ...durationClusters], Q.parse(threshold))
            : momentGroups,
          visitedNodes: rows.at(-1)?.visited_nodes ?? 0,
        };
      }
      if (query.kind === 'related') {
        // Direct links from both ends, joined to search rows for titles and times.
        const { rows } = await c.query(
          `WITH links AS (
            SELECT b_kind AS kind,b_id AS id FROM oc_relationships WHERE timeline_id=$1 AND a_kind=$2 AND a_id=$3
            UNION SELECT a_kind,a_id FROM oc_relationships WHERE timeline_id=$1 AND b_kind=$2 AND b_id=$3)
          SELECT l.kind,l.id,oc_qtext(s.first_time) AS first,oc_qtext(s.last_time) AS last,s.title
          FROM links l JOIN oc_entity_search s ON s.timeline_id=$1 AND s.kind=l.kind AND s.entity_id=l.id
          WHERE ($4::text IS NULL OR (l.kind,l.id COLLATE "C")>($4,$5 COLLATE "C"))
          ORDER BY l.kind,l.id COLLATE "C" LIMIT $6`,
          [
            id,
            query.entity.kind,
            query.entity.id,
            query.after?.kind ?? null,
            query.after?.id ?? '',
            query.limit + 1,
          ],
        );
        const page = rows.slice(0, query.limit);
        let reachable, direct;
        if (!query.after) {
          // Everything connected through any number of links (an undirected closure).
          const closure = await c.query(
            `WITH RECURSIVE reach(kind,id) AS (
              SELECT $2::text,$3::text
              UNION SELECT CASE WHEN r.a_kind=x.kind AND r.a_id=x.id THEN r.b_kind ELSE r.a_kind END,
                           CASE WHEN r.a_kind=x.kind AND r.a_id=x.id THEN r.b_id ELSE r.a_id END
              FROM reach x JOIN oc_relationships r ON r.timeline_id=$1
                AND ((r.a_kind=x.kind AND r.a_id=x.id) OR (r.b_kind=x.kind AND r.b_id=x.id)))
            SELECT count(*)-1 AS count,
              (SELECT count(*) FROM oc_relationships WHERE timeline_id=$1 AND ((a_kind=$2 AND a_id=$3) OR (b_kind=$2 AND b_id=$3))) AS direct
            FROM reach`,
            [id, query.entity.kind, query.entity.id],
          );
          reachable = Number(closure.rows[0].count);
          direct = Number(closure.rows[0].direct);
        }
        return {
          related: page.map((r) => ({
            kind: r.kind,
            id: r.id,
            first: r.first,
            last: r.last,
            title: r.title,
          })),
          next: rows.length > query.limit ? { kind: page.at(-1).kind, id: page.at(-1).id } : null,
          ...(reachable === undefined ? {} : { reachable, direct }),
          revision: t.revision,
        };
      }
      if (query.kind === 'tags') {
        const { rows } = await c.query(
          `SELECT tag,count(*) AS count FROM oc_entity_search,unnest(tags) AS tag
          WHERE timeline_id=$1 GROUP BY tag ORDER BY count(*) DESC,tag COLLATE "C" LIMIT 200`,
          [id],
        );
        return {
          tags: rows.map((r) => ({ tag: r.tag, count: Number(r.count) })),
          revision: t.revision,
        };
      }
      if (query.kind === 'search') {
        const terms = searchTerms(query.text);
        if (!terms.length)
          return { results: [], total: '0', page: query.page, revision: t.revision };
        // Terms contain only letters and digits, so they are safe tsquery prefix operands.
        const tsquery = terms.map((term) => term + ':*').join(' & ');
        const { rows } = await c.query(
          `SELECT kind,entity_id,oc_qtext(first_time) AS first,oc_qtext(last_time) AS last,title,left(body,300) AS body,count(*) OVER() AS total
          FROM oc_entity_search, to_tsquery('simple',$2) AS q
          WHERE timeline_id=$1 AND document @@ q
          ORDER BY ts_rank(document,q) DESC,first_time,kind,entity_id COLLATE "C" LIMIT $3 OFFSET $4`,
          [id, tsquery, SEARCH_PAGE_SIZE, (query.page - 1) * SEARCH_PAGE_SIZE],
        );
        return {
          results: rows.map((r) => ({
            kind: r.kind,
            id: r.entity_id,
            first: r.first,
            last: r.last,
            title: r.title,
            snippet: snippet(r.body),
          })),
          total: rows[0]?.total ?? '0',
          page: query.page,
          revision: t.revision,
        };
      }
      if (query.kind === 'durations') {
        // Durations wholly inside a summary, in start order with an exact (start, ID) cursor.
        const { rows } = await c.query(
          `SELECT band,oc_qtext(first_time) AS first FROM ${names.durations}
          WHERE timeline_id=$1 AND first_time>=$2::mpq AND last_time<=$3::mpq
          AND ($4::mpq IS NULL OR first_time>$4::mpq OR (first_time=$4::mpq AND band->>'id' COLLATE "C">$5))
          ORDER BY first_time,band->>'id' COLLATE "C" LIMIT $6`,
          [
            tree,
            query.lower,
            query.upper,
            query.after?.first ?? null,
            query.after?.id ?? '',
            query.limit + 1,
          ],
        );
        const page = rows.slice(0, query.limit);
        return {
          durations: page.map((r) => r.band),
          next:
            rows.length > query.limit
              ? { first: page.at(-1).first, id: page.at(-1).band.id }
              : null,
          revision: t.revision,
        };
      }
      if (query.kind === 'duration') {
        const { rows } = await c.query(
          "SELECT definition FROM oc_duration_nodes WHERE timeline_id=$1 AND band->>'id'=$2 AND definition IS NOT NULL LIMIT 1",
          [id, query.id],
        );
        return { duration: rows[0]?.definition ?? null, revision: t.revision };
      }
      if (query.id) {
        const { rows } = await c.query(
          `WITH RECURSIVE path AS (
          SELECT n.id,n.time,n.left_id,n.right_id FROM ${names.nodes} n JOIN ${names.roots} t ON t.id=n.timeline_id AND t.root=n.id WHERE t.id=$1
          UNION ALL SELECT n.id,n.time,n.left_id,n.right_id FROM path p JOIN ${names.nodes} n ON n.timeline_id=$1 AND n.id=CASE WHEN p.time>$2::mpq THEN p.left_id WHEN p.time<$2::mpq THEN p.right_id END
        ) SELECT event FROM path p JOIN ${names.nodes} n ON n.timeline_id=$1 AND n.id=p.id CROSS JOIN LATERAL jsonb_array_elements(n.events) event WHERE p.time=$2::mpq AND event->>'id'=$3 LIMIT 1`,
          [tree, query.lower, query.id],
        );
        return { events: rows.map((r) => r.event), next: null, revision: t.revision };
      }
      const { rows } = await c.query(
        `SELECT ${names.events}($1,$2::mpq,$3::mpq,$4::mpq,$5,$6) AS event`,
        [
          tree,
          query.lower ?? null,
          query.upper ?? null,
          query.after?.time ?? null,
          query.after?.id ?? null,
          query.limit + 1,
        ],
      );
      const events = rows.slice(0, query.limit).map((r) => r.event),
        last = events.at(-1);
      return {
        events,
        next: rows.length > query.limit ? { time: last.time, id: last.id } : null,
        revision: t.revision,
      };
    });
  }
}

/**
 * Durations used to live in their start moment's metadata. Rebuilding the current index
 * from the converted document stores standalone definitions; saved history is immutable and
 * converts when read. Returns the number of converted timelines.
 */
/** Writes a balanced moment tree; batched inserts bound round trips and mpq keys stay out of B-trees. */
async function writeNodes(client, table, id, tree) {
  await client.query(`DELETE FROM ${table} WHERE timeline_id=$1`, [id]);
  for (let offset = 0; offset < tree.nodes.length; offset += 250) {
    const chunk = tree.nodes.slice(offset, offset + 250),
      parameters = [];
    const tuples = chunk.map((n) => {
      const start = parameters.length;
      parameters.push(
        id,
        n.id,
        n.time,
        n.first,
        n.last,
        n.left,
        n.right,
        n.firstId,
        n.bucketCount,
        n.count,
        n.distinct,
        JSON.stringify(n.events),
      );
      return (
        '(' +
        Array.from(
          { length: 12 },
          (_, i) =>
            '$' +
            (start + i + 1) +
            (i === 2 || i === 3 || i === 4 ? '::mpq' : i === 11 ? '::jsonb' : ''),
        ).join(',') +
        ')'
      );
    });
    await client.query(
      `INSERT INTO ${table}(timeline_id,id,time,first_time,last_time,left_id,right_id,first_id,bucket_count,event_count,distinct_count,events) VALUES ` +
        tuples.join(','),
      parameters,
    );
  }
}
/** Writes the augmented duration interval tree; returns resolved bands in tree order. */
async function writeDurationNodes(client, table, id, document) {
  const times = new Map(document.events.map((e) => [e.id, e.time]));
  return writeIntervalNodes(
    client,
    table,
    id,
    durationTree(document.durations ?? [], (moment) => times.get(moment)),
  );
}
/** Relationship arcs placed between their endpoints' times. */
async function writeEdgeNodes(client, id, document) {
  const times = new Map(document.events.map((e) => [e.id, e.time]));
  const places = entityTimes(document.events, document.durations ?? [], (m) => times.get(m));
  return writeIntervalNodes(
    client,
    'oc_edge_nodes',
    id,
    edgeTree(document.relationships ?? [], (key) => places.get(key)),
  );
}
/** Writes an augmented interval tree (durations or arcs); returns bands in tree order. */
async function writeIntervalNodes(client, table, id, root) {
  await client.query(`DELETE FROM ${table} WHERE timeline_id=$1`, [id]);
  const intervals = [];
  function flatten(node) {
    if (!node) return null;
    const ordinal = intervals.length + 1;
    const row = { ordinal, node };
    intervals.push(row);
    row.left = flatten(node.left);
    row.right = flatten(node.right);
    return ordinal;
  }
  flatten(root);
  for (let offset = 0; offset < intervals.length; offset += 250) {
    const params = [];
    const tuples = intervals.slice(offset, offset + 250).map(({ ordinal, node, left, right }) => {
      const start = params.length;
      params.push(
        id,
        ordinal,
        left,
        right,
        node.min.toString(),
        node.max.toString(),
        node.band.first,
        node.band.last,
        JSON.stringify({ ...node.band, metadata: durationOverview(node.band.metadata) }),
        JSON.stringify({
          id: node.band.id,
          start: node.band.start,
          end: node.band.end,
          metadata: node.band.metadata,
        }),
        node.maxFirst.toString(),
        node.count,
        node.minExtent.toString(),
        node.maxExtent.toString(),
      );
      return (
        '(' +
        Array.from(
          { length: 14 },
          (_, i) =>
            '$' +
            (start + i + 1) +
            ((i >= 4 && i <= 7) || i === 10 || i === 12 || i === 13
              ? '::mpq'
              : i === 8 || i === 9
                ? '::jsonb'
                : ''),
        ).join(',') +
        ')'
      );
    });
    await client.query(
      `INSERT INTO ${table}(timeline_id,id,left_id,right_id,min_time,max_time,first_time,last_time,band,definition,max_first,subtree_count,min_extent,max_extent) VALUES ` +
        tuples.join(','),
      params,
    );
  }
  return intervals.map(({ node }) => node.band);
}
/** Main index objects, or the derived view tables and generated functions for a filter. */
function treeNames(view) {
  return view
    ? {
        nodes: 'oc_view_nodes',
        durations: 'oc_view_duration_nodes',
        overview: 'oc_view_overview',
        events: 'oc_view_events',
        durationOverview: 'oc_view_duration_overview',
        roots: 'oc_views',
      }
    : {
        nodes: 'oc_nodes',
        durations: 'oc_duration_nodes',
        overview: 'oc_overview_v2',
        events: 'oc_events',
        durationOverview: 'oc_duration_overview',
        roots: 'oc_timelines',
      };
}
/** Builds search rows for timelines saved before entity search existed. */
export async function backfillEntitySearch(client) {
  const store = new PostgresStore(null);
  const { rows } = await client.query(
    'SELECT t.* FROM oc_timelines t WHERE t.search_version<1 AND t.comparison IS NULL',
  );
  for (const timeline of rows) {
    const document = await store.branchDocument(client, timeline);
    const times = new Map(document.events.map((e) => [e.id, e.time]));
    const bands = [];
    const walk = (node) => {
      if (!node) return;
      bands.push(node.band);
      walk(node.left);
      walk(node.right);
    };
    walk(durationTree(document.durations ?? [], (moment) => times.get(moment)));
    await store.indexSearch(client, timeline.id, document, bands);
  }
  return rows.length;
}
export async function convertLegacyDurations(client) {
  const store = new PostgresStore(null);
  const { rows } = await client.query(
    'SELECT t.* FROM oc_timelines t WHERE EXISTS(SELECT 1 FROM oc_duration_nodes n WHERE n.timeline_id=t.id AND (n.definition IS NULL OR n.max_first IS NULL))',
  );
  for (const timeline of rows)
    await store.replace(client, timeline.id, await store.branchDocument(client, timeline), {
      touch: false,
    });
  return rows.length;
}
/** Applies sparse moment and duration edits to the current saved document. */
export function applyPatch(current, patch) {
  const events = new Map(current.events.map((e) => [e.id, e]));
  const lastTimes = new Map(current.events.map((e) => [e.id, e.time]));
  for (const change of patch.changes) {
    if (change.event) events.set(change.id, change.event);
    else events.delete(change.id);
  }
  const durations = new Map((current.durations ?? []).map((d) => [d.id, d]));
  for (const change of patch.durationChanges ?? []) {
    if (change.duration) durations.set(change.id, change.duration);
    else durations.delete(change.id);
  }
  // Durations following a deleted moment keep its last saved time.
  const fixed = fixMissingAnchors(
    [...durations.values()],
    (moment) => events.has(moment),
    (moment) => lastTimes.get(moment),
  );
  const links = new Map((current.relationships ?? []).map((r) => [relationshipKey(r), r]));
  for (const change of patch.relationshipChanges ?? []) {
    const relationship = { a: change.a, b: change.b };
    if (change.related) links.set(relationshipKey(relationship), relationship);
    else links.delete(relationshipKey(relationship));
  }
  // Deleting an entity removes its links.
  const exists = (ref) => ('moment' in ref ? events.has(ref.moment) : durations.has(ref.duration));
  const relationships = [...links.values()].filter((r) => exists(r.a) && exists(r.b));
  return {
    ...patch.settings,
    events: [...events.values()],
    ...(fixed.length ? { durations: fixed } : {}),
    ...(relationships.length ? { relationships } : {}),
  };
}
function eventSearchText(document) {
  const text = [];
  let length = 0;
  for (const duration of document.durations ?? [])
    for (const key of ['title', 'description']) {
      if (typeof duration.metadata[key] === 'string') {
        const part = duration.metadata[key].slice(0, 4096);
        text.push(part);
        length += part.length;
      }
      if (length >= 1048576) return text.join(' ').slice(0, 1048576);
    }
  for (const event of document.events) {
    const metadata = [
      event.metadata,
      ...Object.values(event.metadata)
        .filter(Array.isArray)
        .flatMap((entries) => entries.map((e) => e?.metadata ?? {})),
    ];
    for (const m of metadata)
      for (const key of ['title', 'description']) {
        if (typeof m[key] === 'string') {
          const part = m[key].slice(0, 4096);
          text.push(part);
          length += part.length;
        }
        if (length >= 1048576) return text.join(' ').slice(0, 1048576);
      }
  }
  return text.join(' ');
}

// Inspector metadata is fetched separately. Oversized stack/custom fields are not viewport payloads.
function overviewMetadata(plugins, metadata) {
  const projected = pluginMetadata(plugins, metadata);
  return JSON.stringify(projected).length <= 2048 ? projected : {};
}
