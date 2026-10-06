import { pluginMetadata } from '../dist/core.mjs';
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
  async access(id, userId, client = this.pool) {
    const { rows } = await client.query(
      `SELECT t.*,u.username AS owner,
      CASE WHEN t.owner_id=$2::uuid THEN 'owner' ELSE m.role END AS role
      FROM oc_timelines t JOIN oc_users u ON u.id=t.owner_id
      LEFT JOIN oc_members m ON m.timeline_id=t.id AND m.user_id=$2::uuid WHERE t.id=$1`,
      [id, userId ?? null],
    );
    const timeline = rows[0];
    if (!timeline || (!timeline.role && timeline.visibility !== 'public'))
      throw new HttpError(404, 'Timeline unavailable. Sign in if it is private.');
    return {
      ...timeline,
      canEdit: ['owner', 'editor'].includes(timeline.role),
      canShare: timeline.role === 'owner',
    };
  }
  async replace(client, id, document) {
    const tree = indexedNodes(document);
    await client.query('DELETE FROM oc_nodes WHERE timeline_id=$1', [id]);
    // Batched inserts keep write round trips bounded; mpq keys never enter a B-tree.
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
        'INSERT INTO oc_nodes(timeline_id,id,time,first_time,last_time,left_id,right_id,first_id,bucket_count,event_count,distinct_count,events) VALUES ' +
          tuples.join(','),
        parameters,
      );
    }
    await client.query(
      'UPDATE oc_timelines SET title=$2,description=$3,root=$4,event_count=$5,presentation=$6::jsonb,plugins=$7::jsonb,updated_at=now() WHERE id=$1',
      [
        id,
        document.title,
        document.description,
        tree.root,
        tree.count,
        document.presentation ? JSON.stringify(document.presentation) : null,
        document.plugins === undefined ? null : JSON.stringify(document.plugins),
      ],
    );
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
      throw e;
    } finally {
      c.release();
    }
  }
  async create(userId, document) {
    const id = randomUUID();
    await this.transaction(async (c) => {
      await c.query('INSERT INTO oc_timelines(id,owner_id,title) VALUES($1,$2,$3)', [
        id,
        userId,
        document.title,
      ]);
      await this.replace(c, id, document);
    });
    return this.access(id, userId);
  }
  async save(id, userId, revision, document) {
    return this.transaction(async (c) => {
      await c.query('SELECT id FROM oc_timelines WHERE id=$1 FOR UPDATE', [id]);
      const t = await this.access(id, userId, c);
      if (!t.canEdit) throw new HttpError(403, 'Editor access is required.');
      if (t.revision !== revision)
        throw new HttpError(
          409,
          'Someone changed this timeline. Export your edits before reloading.',
        );
      await this.replace(c, id, document);
      await c.query('UPDATE oc_timelines SET revision=revision+1 WHERE id=$1', [id]);
      return this.access(id, userId, c);
    });
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
  async snapshot(id, userId) {
    return this.transaction(async (c) => {
      await c.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
      const t = await this.access(id, userId, c);
      const { rows } = await c.query('SELECT oc_events($1,NULL,NULL,NULL,NULL,200001) AS event', [
        id,
      ]);
      return {
        timeline: t,
        document: {
          format: 'openchronology',
          version: 1,
          title: t.title,
          description: t.description,
          ...(t.presentation ? { presentation: t.presentation } : {}),
          ...(t.plugins ? { plugins: t.plugins } : {}),
          events: rows.map((r) => r.event),
        },
      };
    });
  }
  async query(id, userId, query) {
    return this.transaction(async (c) => {
      await c.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
      const t = await this.access(id, userId, c);
      if (query.kind === 'overview') {
        const { rows } = await c.query('SELECT * FROM oc_overview_v2($1,$2::mpq,$3::mpq,$4::mpq)', [
          id,
          query.lower,
          query.upper,
          query.threshold,
        ]);
        return {
          revision: t.revision,
          groups: rows.map((r) => ({
            first: r.first_time,
            last: r.last_time,
            count: r.event_count,
            distinct: r.distinct_count,
            ...(r.event_id
              ? {
                  id: r.event_id,
                  title: r.title ?? '',
                  ...(t.plugins?.some((p) => p.enabled)
                    ? { metadata: pluginMetadata(t.plugins, r.metadata ?? {}) }
                    : {}),
                }
              : {}),
          })),
          visitedNodes: rows.at(-1)?.visited_nodes ?? 0,
        };
      }
      const { rows } = await c.query(
        'SELECT oc_events($1,$2::mpq,$3::mpq,$4::mpq,$5,$6) AS event',
        [
          id,
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
