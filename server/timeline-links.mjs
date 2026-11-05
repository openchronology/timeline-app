// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
/**
 * Links between entities on different timelines (#422; docs/relationships.md#links-to-other-timelines).
 * A link joins a moment or duration on one timeline to one on another, or to another timeline
 * as a whole (an end of kind `timeline`, with an empty ID). It is not part of
 * either timeline's content: it lives in oc_timeline_links, apart from documents, history,
 * forks and exports. Adding or removing one needs write access to both timelines; it is
 * shown only to someone who may read both, and only while both entities exist (each read
 * looks them up, so a link whose end was deleted by a path that did not prune it is never
 * shown). Each timeline has at most `limit` links (TIMELINE_LINK_LIMIT), counting both ends.
 */
import { HttpError, restrictedTimeline } from './store.mjs';
import { indexReader, lineageOf } from './index-versions.mjs';
import { adminId } from './key-requests.mjs';
import { Q, addressedEntity } from '../dist/core.mjs';
import { entityWhen } from './library-search.mjs';

const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const entityId = /^[A-Za-z0-9_.:-]{1,128}$/;
/** A window answers at most this many arcs, as a timeline's own arcs (docs/relationships.md). */
export const LINK_ARCS = 256;

/**
 * `{moment: id}` or `{duration: id}` as {kind, id}; with `whole`, an end naming neither is the
 * timeline as a whole, {kind: 'timeline', id: ''}. HttpError 400 otherwise.
 */
export function linkEnd(value, { whole = false } = {}) {
  const keys = value && typeof value === 'object' ? Object.keys(value) : [];
  const kind = keys.find((k) => k === 'moment' || k === 'duration');
  if (!kind && whole && value && typeof value === 'object') return { kind: 'timeline', id: '' };
  if (!kind || !entityId.test(value[kind] ?? ''))
    throw new HttpError(400, 'Name a moment or duration by its ID.');
  return { kind, id: value[kind] };
}
/** A timeline's ID, checked as a UUID; HttpError 400 otherwise. */
function timelineId(value) {
  if (typeof value !== 'string' || !uuid.test(value))
    throw new HttpError(400, 'Name the other timeline by its ID.');
  return value.toLowerCase();
}

/**
 * Of timelines `ids`, those `userId` may read, by the rule of PostgresStore.access: public,
 * the owner's, an enabled administrator's, or shared with them, and not restricted by
 * moderators unless theirs or an administrator's. Comparisons are left out.
 */
export async function readableTimelines(client, ids, userId) {
  if (!ids.length) return new Set();
  const { rows } = await client.query(
    `SELECT t.id FROM oc_timelines t WHERE t.id=ANY($1::uuid[]) AND t.comparison IS NULL AND
    (t.owner_id=$2::uuid OR EXISTS(SELECT 1 FROM oc_users a WHERE a.id=$3::uuid AND a.is_admin AND NOT a.is_disabled)
      OR ((t.visibility='public' OR EXISTS(SELECT 1 FROM oc_members m WHERE m.timeline_id=t.id AND m.user_id=$2::uuid))
        AND NOT ${restrictedTimeline('t')}))`,
    [ids, userId ?? null, adminId(userId)],
  );
  return new Set(rows.map((r) => r.id));
}

/**
 * Removes the links of the timelines in `written` (client.indexWritten: a Map from timeline to
 * the `kind\0id` keys of the entities its writes removed, or null when they did not say)
 * whose entity on that timeline no longer exists. Run by PostgresStore.transaction before
 * committing any transaction that wrote a timeline's index (beginIndexWrite records them), so
 * a save, merge, restore or import that deletes an entity deletes its links with it. A sparse
 * save checks the links of what it removed; any other write, every link of the timeline (a
 * timeline without links costs one index probe).
 */
export async function pruneLinks(client, written) {
  for (const [id, removed] of written) {
    // A write that names what it removed: only those entities' links, by their indexes.
    if (removed) {
      if (!removed.size) continue;
      const keys = [...removed].map((k) => k.split('\0'));
      const index = await indexReader(client, await lineageOf(client, id));
      for (const end of ['a', 'b'])
        await client.query(
          `DELETE FROM oc_timeline_links l USING unnest($2::text[],$3::text[]) k(kind,id)
          WHERE l.${end}_timeline=$1 AND l.${end}_kind=k.kind AND l.${end}_id=k.id AND NOT EXISTS
          ${index.lookup('oc_entity_search', [`l.${end}_kind`, `l.${end}_id`])}`,
          [id, keys.map((k) => k[0]), keys.map((k) => k[1])],
        );
      continue;
    }
    const { rows } = await client.query(
      `SELECT EXISTS(SELECT 1 FROM oc_timeline_links WHERE a_timeline=$1)
        OR EXISTS(SELECT 1 FROM oc_timeline_links WHERE b_timeline=$1) AS linked`,
      [id],
    );
    if (!rows[0].linked) continue;
    const index = await indexReader(client, await lineageOf(client, id));
    // Each entity end on this timeline, looked up in its index (a fork's read through); an
    // end that is the timeline as a whole lasts as long as the timeline.
    for (const end of ['a', 'b'])
      await client.query(
        `DELETE FROM oc_timeline_links l WHERE l.${end}_timeline=$1 AND l.${end}_kind<>'timeline' AND NOT EXISTS
        ${index.lookup('oc_entity_search', [`l.${end}_kind`, `l.${end}_id`])}`,
        [id],
      );
  }
}

export class TimelineLinks {
  /** `store` is the PostgresStore; `limit` how many links a timeline may have (Infinity for none). */
  constructor(store, { limit }) {
    this.store = store;
    this.limit = limit;
  }
  /**
   * Looks entities up on timeline `id`, in transaction `c`: a Map from `kind:id` to its
   * title and first time (a moment's time, a duration's start) for those that exist. The
   * timeline as a whole (`timeline:`) is its title, without times.
   */
  async entities(c, id, ends) {
    const found = new Map();
    if (ends.some((e) => e.kind === 'timeline')) {
      const { rows } = await c.query('SELECT title FROM oc_timelines WHERE id=$1', [id]);
      if (rows[0]) found.set('timeline:', { title: rows[0].title, first: null, last: null });
      ends = ends.filter((e) => e.kind !== 'timeline');
    }
    if (!ends.length) return found;
    const index = await indexReader(c, await lineageOf(c, id));
    const { rows } = await c.query(
      `SELECT k.kind,k.id,e.title,oc_qtext(e.first_time) AS first,oc_qtext(e.last_time) AS last
      FROM unnest($2::text[],$3::text[]) k(kind,id)
      CROSS JOIN LATERAL ${index.lookup('oc_entity_search', ['k.kind', 'k.id'])} e`,
      [id, ends.map((e) => e.kind), ends.map((e) => e.id)],
    );
    for (const r of rows)
      found.set(`${r.kind}:${r.id}`, { title: r.title, first: r.first, last: r.last });
    return found;
  }
  /**
   * Adds a link from `from` ({moment|duration: id}) on timeline `id` to `to` (`timeline`, and
   * a moment or duration on it, or neither for the timeline as a whole). Needs write access to both (HttpError 403, or 404 for one `userId` may not
   * see); both entities must exist (404). Refused past either timeline's limit (409).
   * Adding a link that exists answers it again. Returns the link as `list` gives it.
   */
  async create(id, userId, from, to) {
    const own = linkEnd(from),
      other = { ...linkEnd(to, { whole: true }), timeline: timelineId(to?.timeline) };
    if (other.timeline === id)
      throw new HttpError(400, 'Link entities on the same timeline as a relationship.');
    return this.store.transaction(async (c) => {
      // Both rows locked in a fixed order, so two links added at once to either timeline
      // count each other, and two people linking the same pair never deadlock.
      await c.query('SELECT id FROM oc_timelines WHERE id=ANY($1::uuid[]) ORDER BY id FOR UPDATE', [
        [id, other.timeline],
      ]);
      for (const t of [id, other.timeline]) {
        const access = await this.store.access(t, userId, c);
        if (!access.canWrite)
          throw new HttpError(403, 'Linking needs write access to both timelines.');
      }
      const [mine, theirs] = await Promise.all([
        this.entities(c, id, [own]),
        this.entities(c, other.timeline, [other]),
      ]);
      if (!mine.size || !theirs.size)
        throw new HttpError(404, 'That moment or duration no longer exists.');
      const [a, b] =
        id < other.timeline ? [{ ...own, timeline: id }, other] : [other, { ...own, timeline: id }];
      const existing = await c.query(
        `SELECT id::text FROM oc_timeline_links WHERE a_timeline=$1 AND a_kind=$2 AND a_id=$3
        AND b_timeline=$4 AND b_kind=$5 AND b_id=$6`,
        [a.timeline, a.kind, a.id, b.timeline, b.kind, b.id],
      );
      let linkId = existing.rows[0]?.id;
      if (!linkId) {
        if (Number.isFinite(this.limit))
          for (const t of [id, other.timeline]) {
            const count = await this.count(c, t);
            if (count >= this.limit)
              throw new HttpError(
                409,
                `A timeline may have at most ${this.limit.toLocaleString('en-US')} links to other timelines, and ${t === id ? 'this one' : 'the other one'} has ${count.toLocaleString('en-US')}. Remove some first.`,
              );
          }
        linkId = (
          await c.query(
            `INSERT INTO oc_timeline_links(a_timeline,a_kind,a_id,b_timeline,b_kind,b_id,created_by)
            VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id::text`,
            [a.timeline, a.kind, a.id, b.timeline, b.kind, b.id, userId],
          )
        ).rows[0].id;
        await this.changed(c, [id, other.timeline], [a, b]);
      }
      const page = await this.page(c, id, userId, own, { id: linkId, only: true });
      return page.links[0];
    });
  }
  /** How many links timeline `id` has, from either end (both indexes lead with the timeline). */
  async count(c, id) {
    const { rows } = await c.query(
      `SELECT (SELECT count(*) FROM oc_timeline_links WHERE a_timeline=$1)
        +(SELECT count(*) FROM oc_timeline_links WHERE b_timeline=$1) AS count`,
      [id],
    );
    return Number(rows[0].count);
  }
  /**
   * Advances the timelines' link generation, which live updates announce, and records the
   * link's `ends` ({timeline, kind, id}) in oc_link_changes, from which IndexNow sends their
   * pages (each lists its links). Changes older than a day are dropped.
   */
  async changed(c, ids, ends) {
    await c.query(
      'UPDATE oc_timelines SET link_generation=link_generation+1 WHERE id=ANY($1::uuid[])',
      [ids],
    );
    await c.query(
      `INSERT INTO oc_link_changes(timeline_id,kind,entity_id)
      SELECT * FROM unnest($1::uuid[],$2::text[],$3::text[])`,
      [ends.map((e) => e.timeline), ends.map((e) => e.kind), ends.map((e) => e.id)],
    );
    await c.query("DELETE FROM oc_link_changes WHERE changed_at<now()-interval '1 day'");
  }
  /**
   * Removes link `linkId` from timeline `id` (one of its ends). Needs write access to both
   * timelines (403); a link that is gone, or not one of this timeline's, is 404.
   */
  async remove(id, userId, linkId) {
    if (typeof linkId !== 'string' || !/^\d{1,18}$/.test(linkId))
      throw new HttpError(400, 'Name the link by its ID.');
    return this.store.transaction(async (c) => {
      const { rows } = await c.query(
        `SELECT a_timeline,a_kind,a_id,b_timeline,b_kind,b_id FROM oc_timeline_links
        WHERE id=$1 AND (a_timeline=$2 OR b_timeline=$2)`,
        [linkId, id],
      );
      if (!rows[0]) throw new HttpError(404, 'That link no longer exists.');
      const ends = [rows[0].a_timeline, rows[0].b_timeline];
      await c.query('SELECT id FROM oc_timelines WHERE id=ANY($1::uuid[]) ORDER BY id FOR UPDATE', [
        ends,
      ]);
      for (const t of ends) {
        const access = await this.store.access(t, userId, c);
        if (!access.canWrite)
          throw new HttpError(403, 'Removing a link needs write access to both timelines.');
      }
      const removed = await c.query('DELETE FROM oc_timeline_links WHERE id=$1', [linkId]);
      const r = rows[0];
      if (removed.rowCount)
        await this.changed(c, ends, [
          { timeline: r.a_timeline, kind: r.a_kind, id: r.a_id },
          { timeline: r.b_timeline, kind: r.b_kind, id: r.b_id },
        ]);
      return { removed: linkId };
    });
  }
  /**
   * What a pasted page address names (#422; addressedEntity), for timeline `id` to link to or
   * relate: `{ timeline: {id, title, owner, slug}, entity: {kind, id, title, first, last,
   * when} | null, same, canWrite, full }`. `same` is timeline `id` itself (whose entities are
   * related, not linked), `canWrite` whether `userId` may save it, `full` whether it has as
   * many links as it may. 400 for an address that names no timeline on this site (`origin`),
   * 404 for a timeline `userId` may not read or an entity it lacks (read through a fork's
   * source, as links are).
   */
  async resolve(id, userId, address, origin) {
    if (typeof address !== 'string' || address.length > 4096)
      throw new HttpError(400, 'Give the address of a timeline, moment or duration.');
    const named = addressedEntity(address, origin);
    if (!named)
      throw new HttpError(
        400,
        'That isn’t the address of a timeline, moment or duration on this site.',
      );
    const target =
      named.timeline.id ?? (await this.store.addressed(named.timeline.owner, named.timeline.name));
    if (!target) throw new HttpError(404, 'There is no timeline at that address.');
    return this.store.transaction(async (c) => {
      await c.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
      await this.store.access(id, userId, c);
      const access = await this.store.access(target, userId, c);
      const { rows } = await c.query(
        `SELECT t.id,t.title,t.slug,t.presentation,t.link_count,u.username AS owner
        FROM oc_timelines t JOIN oc_users u ON u.id=t.owner_id WHERE t.id=$1`,
        [target],
      );
      const t = rows[0];
      let entity = null;
      if (named.entity) {
        const found = (await this.entities(c, target, [named.entity])).get(
          `${named.entity.kind}:${named.entity.id}`,
        );
        if (!found)
          throw new HttpError(
            404,
            `That ${named.entity.kind} isn’t on ${t.title || 'the timeline'} any more.`,
          );
        entity = {
          ...named.entity,
          title: found.title,
          first: found.first,
          last: found.last,
          when: entityWhen(t.presentation, { kind: named.entity.kind, ...found }),
        };
      }
      return {
        timeline: { id: t.id, title: t.title, owner: t.owner, slug: t.slug ?? null },
        entity,
        same: t.id === id,
        canWrite: !!access.canWrite,
        full: t.link_count >= this.limit,
      };
    });
  }
  /**
   * The links of entity `entity` ({moment|duration: id}, or `{}` for the links to timeline
   * `id` as a whole) on timeline `id` that `userId` may see, `limit` at a time in link order after `after` (a link ID): each with the other
   * timeline (ID, title, owner) and entity (kind, ID, title, times), and `next`, the cursor
   * of the page after it (null at the end). 404 when `userId` may not read timeline `id`.
   */
  async list(id, userId, entity, { after = null, limit = 25 } = {}) {
    const own = linkEnd(entity, { whole: true });
    if (after !== null && (typeof after !== 'string' || !/^\d{1,18}$/.test(after)))
      throw new HttpError(400, 'A page of links starts after a link ID.');
    if (!Number.isInteger(limit) || limit < 1 || limit > 100)
      throw new HttpError(400, 'Ask for 1 to 100 links at a time.');
    return this.store.transaction(async (c) => {
      await c.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
      await this.store.access(id, userId, c);
      return this.page(c, id, userId, own, { after, limit });
    });
  }
  /**
   * A page of `own`'s links on timeline `id` (or, with `only`, link `id` alone), keeping those
   * whose other timeline `userId` may read and whose entities both exist. Reads candidates in
   * batches until the page is full, as links it may not show are skipped.
   */
  async page(c, id, userId, own, { after = null, limit = 1, id: only = null }) {
    const links = [];
    if (!(await this.entities(c, id, [own])).size) return { links, next: null };
    // One more than the page, to tell whether another follows.
    const batch = Math.min(200, Math.max(limit + 1, 25));
    let cursor = after;
    while (links.length <= limit) {
      const { rows } = await c.query(
        `SELECT id::text,other,kind,eid FROM (
          SELECT id,b_timeline AS other,b_kind AS kind,b_id AS eid FROM oc_timeline_links
          WHERE a_timeline=$1 AND a_kind=$2 AND a_id=$3
          UNION ALL SELECT id,a_timeline,a_kind,a_id FROM oc_timeline_links
          WHERE b_timeline=$1 AND b_kind=$2 AND b_id=$3) l
        WHERE ($4::bigint IS NULL OR id>$4) AND ($5::bigint IS NULL OR id=$5)
        ORDER BY id LIMIT $6`,
        [id, own.kind, own.id, cursor, only, batch],
      );
      if (!rows.length) break;
      cursor = rows.at(-1).id;
      const readable = await readableTimelines(c, [...new Set(rows.map((r) => r.other))], userId);
      const byTimeline = new Map();
      for (const r of rows)
        if (readable.has(r.other)) byTimeline.set(r.other, [...(byTimeline.get(r.other) ?? []), r]);
      const found = new Map();
      for (const [timeline, list] of byTimeline)
        found.set(
          timeline,
          await this.entities(
            c,
            timeline,
            list.map((r) => ({ kind: r.kind, id: r.eid })),
          ),
        );
      const timelines = new Map(
        byTimeline.size
          ? (
              await c.query(
                `SELECT t.id,t.title,t.slug,u.username AS owner FROM oc_timelines t
                JOIN oc_users u ON u.id=t.owner_id WHERE t.id=ANY($1::uuid[])`,
                [[...byTimeline.keys()]],
              )
            ).rows.map((t) => [t.id, t])
          : [],
      );
      for (const r of rows) {
        const entity = found.get(r.other)?.get(`${r.kind}:${r.eid}`);
        if (!entity) continue;
        const t = timelines.get(r.other);
        links.push({
          id: r.id,
          timeline: { id: r.other, title: t.title, owner: t.owner, slug: t.slug ?? null },
          kind: r.kind,
          entity: r.eid,
          title: entity.title,
          first: entity.first,
          last: entity.last,
        });
      }
      if (rows.length < batch) break;
    }
    const page = links.slice(0, limit);
    return { links: page, next: links.length > limit ? page.at(-1).id : null };
  }
  /**
   * Arcs between the timelines of a comparison (#422): every link between entities of two of `sources`
   * ({id, scale, offset}, at most eight timelines `userId` may read; 404 otherwise) crossing
   * the shared window lower…upper and at least `threshold` long there, each end's time
   * mapped by its timeline's `× scale + offset`. At most LINK_ARCS, with `edgesTruncated`
   * when more cross it. Each arc names its ends' timelines (`aKey`, `bKey`) and titles.
   */
  async between(userId, { sources, lower, upper, threshold }) {
    if (!Array.isArray(sources) || sources.length < 2 || sources.length > 8)
      throw new HttpError(400, 'Name two to eight timelines.');
    const parsed = sources.map((s) => {
      let scale, offset;
      try {
        scale = Q.parse(String(s?.scale ?? '1'));
        offset = Q.parse(String(s?.offset ?? '0'));
      } catch {
        throw new HttpError(400, 'A scale and offset are exact numbers.');
      }
      if (scale.compare(Q.zero) <= 0) throw new HttpError(400, 'A scale is positive.');
      return { id: timelineId(s?.id), scale: scale.toString(), offset: offset.toString() };
    });
    if (new Set(parsed.map((s) => s.id)).size !== parsed.length)
      throw new HttpError(400, 'Name each timeline once.');
    let window;
    try {
      window = {
        lower: Q.parse(String(lower)).toString(),
        upper: Q.parse(String(upper)).toString(),
        threshold: Q.parse(String(threshold ?? '0')).toString(),
      };
    } catch {
      throw new HttpError(400, 'A window is two exact times and a threshold.');
    }
    return this.store.transaction(async (c) => {
      await c.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
      const readable = await readableTimelines(
        c,
        parsed.map((s) => s.id),
        userId,
      );
      if (readable.size !== parsed.length)
        throw new HttpError(404, 'A timeline of this comparison is unavailable.');
      const readers = new Map();
      for (const s of parsed) readers.set(s.id, await indexReader(c, await lineageOf(c, s.id)));
      const ordered = [...parsed].sort((x, y) => (x.id < y.id ? -1 : 1));
      const edges = [];
      let truncated = false;
      for (let i = 0; i < ordered.length; i++)
        for (let j = i + 1; j < ordered.length; j++) {
          const a = ordered[i],
            b = ordered[j];
          if (edges.length > LINK_ARCS) {
            truncated = true;
            break;
          }
          // Each end looked up in its timeline's index, its time mapped onto the shared axis;
          // kept when the arc between them crosses the window and spans the threshold.
          const { rows } = await c.query(
            `SELECT id,a_kind,a_id,b_kind,b_id,oc_qtext(at) AS a_time,oc_qtext(bt) AS b_time,a_title,b_title
            FROM (SELECT l.id,l.a_kind,l.a_id,l.b_kind,l.b_id,ea.title AS a_title,eb.title AS b_title,
                ea.first_time*$3::mpq+$4::mpq AS at,eb.first_time*$5::mpq+$6::mpq AS bt
              FROM oc_timeline_links l
              CROSS JOIN LATERAL ${readers.get(a.id).lookup('oc_entity_search', ['l.a_kind', 'l.a_id'], '$1')} ea
              CROSS JOIN LATERAL ${readers.get(b.id).lookup('oc_entity_search', ['l.b_kind', 'l.b_id'], '$2')} eb
              WHERE l.a_timeline=$1 AND l.b_timeline=$2 AND l.a_kind<>'timeline' AND l.b_kind<>'timeline') x
            WHERE least(at,bt)<=$8::mpq AND greatest(at,bt)>=$7::mpq
              AND (at-bt>=$9::mpq OR bt-at>=$9::mpq)
            ORDER BY id LIMIT $10`,
            [
              a.id,
              b.id,
              a.scale,
              a.offset,
              b.scale,
              b.offset,
              window.lower,
              window.upper,
              window.threshold,
              LINK_ARCS + 1 - edges.length,
            ],
          );
          for (const r of rows) {
            const [first, last] =
              Q.parse(r.a_time).compare(Q.parse(r.b_time)) <= 0
                ? [r.a_time, r.b_time]
                : [r.b_time, r.a_time];
            edges.push({
              id: 'link:' + r.id,
              a: { [r.a_kind]: r.a_id },
              b: { [r.b_kind]: r.b_id },
              aKey: a.id,
              bKey: b.id,
              aTime: r.a_time,
              bTime: r.b_time,
              first,
              last,
              aTitle: r.a_title,
              bTitle: r.b_title,
            });
          }
        }
      if (edges.length > LINK_ARCS) truncated = true;
      return { edges: edges.slice(0, LINK_ARCS), edgesTruncated: truncated };
    });
  }
}
