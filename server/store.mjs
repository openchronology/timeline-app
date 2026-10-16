// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
import { compareLimit } from './limits.mjs';
import {
  Q,
  pluginMetadata,
  validateDocument,
  durationTree,
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
  BUILTIN_PLUGINS,
  contentLabels,
  validSlug,
  RESERVED_NAMES,
  SLUG_RULE,
  TIMELINE_UUID,
} from '../dist/core.mjs';
import { randomUUID } from 'node:crypto';
import { pluginCompiler } from './plugin-sandbox.mjs';
import { indexedNodes } from './tree.mjs';
import { cursorRows, documentChunks, inSnapshot, RELATIONSHIP_ORDER } from './document-stream.mjs';
import { MOMENT_TREE, INTERVAL_TREE, intervalPayload, upsertRows } from './avl.mjs';
import { applyIncrementally, incremental, slicePatch, timelineSettings } from './incremental.mjs';
import { rebaseSave } from './save-merge.mjs';
import {
  beginIndexWrite,
  copyLevel,
  indexReader,
  lineageOf,
  INDEX_LEVELS,
  VERSIONED_TABLES,
} from './index-versions.mjs';
import {
  recordHistory,
  recordDetached,
  recordDetachedPatch,
  endHistory,
  historyDocument,
  historyParts,
  pruneHistoryRows,
  settingsOf,
} from './history.mjs';
/**
 * The largest whole document stored (pull requests keep them), as JSON. PostgreSQL stores it
 * as jsonb, whose arrays hold at most 268,435,455 bytes and take 1.2 to 1.3 times the size
 * of the JSON.
 */
export const SNAPSHOT_BYTES = 200_000_000;
/**
 * `document` without copies of its images (its `assets`), as the server keeps timelines: it
 * links to images where their owners host them, and stores no copies of them (#109). Copies
 * are for the files people export.
 */
export function withoutImageCopies(document) {
  if (!document || document.assets === undefined) return document;
  const { assets: _copies, ...rest } = document;
  return rest;
}
/**
 * SQL: whether timeline `t` (a table alias) is restricted by a moderation decision (#115;
 * moderation.mjs). Only its owner and administrators then see it.
 */
export const restrictedTimeline = (t) =>
  `EXISTS(SELECT 1 FROM oc_moderation_cases mc WHERE mc.target_kind='timeline' AND mc.target_id=${t}.id::text AND mc.status='restricted')`;
/**
 * A whole document as JSON to store, refused with a reason rather than by the database when
 * it is too large (TIMELINE_ENTRY_LIMIT=unlimited reaches that).
 */
export function documentJson(document) {
  const serialized = JSON.stringify(document);
  if (Buffer.byteLength(serialized) > SNAPSHOT_BYTES)
    throw new HttpError(
      413,
      'Pull requests store whole timelines, and this one is too large (over 200 MB). Split it into several timelines.',
    );
  return serialized;
}
export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
/** Why a past revision of a timeline that keeps no saved history cannot be read. */
export const HISTORY_OFF =
  'This revision is not kept: the timeline does not keep saved history, so only its latest revision can be read.';
/**
 * The revisions of timeline $1 whose content others still read, with what reading them
 * needs: those copies' history reads through to, those forks were made from or other
 * timelines' heads are, those pull requests refer to, and the earlier revisions a patch among
 * them is stored against. Turning saved history off keeps their content.
 */
const STILL_READ = `WITH RECURSIVE still_read(id) AS (
  SELECT r.id FROM oc_revisions r WHERE r.timeline_id=$1 AND (
    EXISTS(SELECT 1 FROM oc_history_bases b WHERE b.base_revision_id=r.id)
    OR EXISTS(SELECT 1 FROM oc_timelines t WHERE t.fork_base_revision_id=r.id OR (t.head_revision_id=r.id AND t.id<>$1))
    OR EXISTS(SELECT 1 FROM oc_proposals p
      WHERE p.base_revision_id=r.id OR p.source_revision_id=r.id OR p.merged_revision_id=r.id))
  UNION SELECT p.parent_id FROM still_read k JOIN oc_revisions c ON c.id=k.id
    JOIN oc_revision_parents p ON p.revision_id=k.id AND p.position=0 WHERE c.patch IS NOT NULL
)`;
/**
 * The timeline row's columns except the catalogue search text and vector (up to a megabyte
 * each), which access checks never need. Read once per process.
 */
let columnList = null;
function timelineColumns(client) {
  columnList ??= client
    .query(
      `SELECT string_agg('t.'||quote_ident(column_name),',' ORDER BY ordinal_position) AS list
      FROM information_schema.columns WHERE table_schema=current_schema() AND table_name='oc_timelines'
      AND column_name NOT IN ('event_text','search_document')`,
    )
    .then(({ rows }) => rows[0].list)
    .catch((error) => {
      columnList = null;
      throw error;
    });
  return columnList;
}
/** Every moment of a timeline (read by `rows`, its indexReader) in index order: time, then ID. */
async function allEvents(client, rows, id) {
  const { rows: events } = await client.query(
    `SELECT event FROM ${rows('oc_moments', '$1', { scan: true })} x ORDER BY time,id COLLATE "C"`,
    [id],
  );
  return events.map((r) => r.event);
}
/** The tables holding a timeline's index. */
const INDEX_TABLES = VERSIONED_TABLES;
/** Their retired versions (index-versions.mjs). */
const RETIRED_TABLES = INDEX_TABLES.map((table) => table + '_retired');
/** The tables whose statistics large writes leave behind. */
const ANALYZED_TABLES = [...INDEX_TABLES, ...RETIRED_TABLES];
/** The timeline's own columns that describe its index (as replace writes them). */
const TIMELINE_INDEX = [
  'title',
  'description',
  'presentation',
  'plugins',
  'tags',
  'assets',
  'comparison',
  'root',
  'event_count',
  'duration_root',
  'edge_root',
  'index_version',
  'search_version',
  'event_text',
  'event_text_stale',
];
const copied = new Map();
/** A table's columns a copy of its rows writes (all but the timeline, its version and generated ones). */
async function copiedColumns(client, table) {
  if (!copied.has(table)) {
    const columns = await client.query(
      `SELECT column_name FROM information_schema.columns WHERE table_schema=current_schema()
      AND table_name=$1 AND column_name NOT IN ('timeline_id','since') AND is_generated='NEVER'
      ORDER BY ordinal_position`,
      [table],
    );
    copied.set(table, { columns: columns.rows.map((r) => r.column_name).join(',') });
  }
  return copied.get(table);
}
/** Rows compaction copies per statement, so no statement grows with the timeline. */
const COPY_PAGE = 50000;
/**
 * The share of what a fork reads that it must have rewritten (its own moment rows, against
 * its moments) for it to be compacted: copying the rest is then cheaper than reading
 * through to it, and it releases the versions its levels keep for it.
 */
const COMPACT_SHARE = 0.5;
/** How many moments and durations to copy make a fork worth preparing after answering. */
const PREPARE_AFTER = 20000;
/** How many moments and durations written in one go make their statistics worth refreshing. */
const ANALYZE_AFTER = 20000;
/**
 * How many index rows retired, or entities a fork changed, in one transaction make the
 * statistics worth refreshing. Until they count a timeline's retired rows or a fork's own,
 * a lookup by key can take any index that starts with the timeline and read all of them.
 */
const ANALYZE_VERSIONS_AFTER = 1000;
/** The scripts of the plugins every build includes: compiled by its tests, not again here. */
const BUILTIN_SCRIPTS = new Set(BUILTIN_PLUGINS.map((p) => p.source).filter(Boolean));
export class PostgresStore {
  /**
   * `compareLimits` caps saved comparisons by their owner's account (limits.mjs). `compiler`
   * compiles the plugin scripts timelines are given (plugin-sandbox.mjs).
   */
  constructor(pool, { compareLimits = null, compiler = null } = {}) {
    this.pool = pool;
    this.compareLimits = compareLimits;
    this.compiler = compiler;
  }
  /**
   * Refuses (HTTP 400) installed plugins `plugins` whose scripts do not compile, compiling
   * them in the sandbox (#157): only scripts that are new, that is neither the built-in
   * plugins' nor those of `current` (the plugins the timeline has now), so most saves compile
   * nothing. The server never runs them.
   */
  async checkScripts(plugins, current = null) {
    const known = new Set((current ?? []).map((p) => p?.manifest?.source));
    for (const { manifest } of plugins ?? []) {
      const source = manifest.source;
      if (source === undefined || BUILTIN_SCRIPTS.has(source) || known.has(source)) continue;
      try {
        await (this.compiler ??= pluginCompiler()).check(source);
      } catch (error) {
        throw new HttpError(
          400,
          `The plugin “${manifest.name}” does not compile: ${error.message}`,
        );
      }
    }
  }
  async liveState(id, userId, client = this.pool) {
    const { rows } = await client.query(
      `SELECT t.id,t.revision FROM oc_timelines t
      WHERE t.id=$1 AND (t.visibility='public' OR t.owner_id=$2::uuid
      OR EXISTS(SELECT 1 FROM oc_users a WHERE a.id=$2::uuid AND a.is_admin AND NOT a.is_disabled)
      OR (EXISTS(SELECT 1 FROM oc_members m WHERE m.timeline_id=t.id AND m.user_id=$2::uuid)
        AND NOT ${restrictedTimeline('t')}))`,
      [id, userId ?? null],
    );
    if (!rows[0]) throw new HttpError(404, 'Timeline unavailable.');
    return rows[0];
  }
  /**
   * The ID of the timeline at `/<owner>/<name>` (#148): by its slug, its ID or a slug it had
   * before; null when there is none. It says nothing of who may open it: its pages check.
   */
  async addressed(owner, name) {
    const { rows } = TIMELINE_UUID.test(name)
      ? await this.pool.query(
          'SELECT t.id FROM oc_timelines t JOIN oc_users u ON u.id=t.owner_id WHERE u.username=$1 AND t.id=$2',
          [owner, name],
        )
      : await this.pool.query(
          `SELECT t.id FROM oc_timelines t JOIN oc_users u ON u.id=t.owner_id WHERE u.username=$1 AND t.slug=$2
          UNION ALL SELECT f.timeline_id FROM oc_timeline_former_slugs f JOIN oc_users u ON u.id=f.owner_id
          WHERE u.username=$1 AND f.slug=$2 LIMIT 1`,
          [owner, name],
        );
    return rows[0]?.id ?? null;
  }
  /**
   * Gives timeline `t` (as access returned it, locked) the address `/<owner>/<slug>`, or none
   * when `slug` is null. Its former slug keeps leading to it until another of its owner's
   * timelines takes it.
   */
  async setSlug(c, t, slug) {
    if (slug === (t.slug ?? null)) return;
    if (slug !== null && !validSlug(slug)) throw new HttpError(400, SLUG_RULE);
    if (slug !== null && RESERVED_NAMES.has(t.owner))
      throw new HttpError(
        409,
        `@${t.owner} is also one of the site's own addresses, so its timelines are at /timelines/<id>.`,
      );
    if (slug !== null)
      await c.query('DELETE FROM oc_timeline_former_slugs WHERE owner_id=$1 AND slug=$2', [
        t.owner_id,
        slug,
      ]);
    if (t.slug)
      await c.query(
        'INSERT INTO oc_timeline_former_slugs(owner_id,slug,timeline_id) VALUES($1,$2,$3) ON CONFLICT(owner_id,slug) DO UPDATE SET timeline_id=excluded.timeline_id',
        [t.owner_id, t.slug, t.id],
      );
    try {
      await c.query('UPDATE oc_timelines SET slug=$2 WHERE id=$1', [t.id, slug]);
    } catch (error) {
      if (error.code !== '23505') throw error;
      throw new HttpError(409, `Another timeline of @${t.owner} is at /${t.owner}/${slug}.`);
    }
  }
  /**
   * The timeline as `userId` may see it, with their permissions; 404 when they may not. A
   * copy whose index is still being prepared (see prepare) answers 409 unless `preparing`:
   * only its metadata, sharing, settings and deletion are available until then.
   */
  async access(id, userId, client = this.pool, { preparing = false } = {}) {
    const columns = await timelineColumns(client);
    const { rows } = await client.query(
      `SELECT ${columns},u.username AS owner,
      EXISTS(SELECT 1 FROM oc_timeline_stars s WHERE s.timeline_id=t.id AND s.user_id=$2::uuid) AS starred,
      CASE WHEN EXISTS(SELECT 1 FROM oc_users admin WHERE admin.id=$2::uuid AND admin.is_admin AND NOT admin.is_disabled) THEN 'admin' WHEN t.owner_id=$2::uuid THEN 'owner' ELSE m.role END AS role,
      (SELECT jsonb_build_object('case',mc.id,'reason',mc.reason,'decided_at',mc.decided_at,
        'appealed_at',mc.appealed_at,'appeal_outcome',mc.appeal_outcome)
        FROM oc_moderation_cases mc WHERE mc.target_kind='timeline' AND mc.target_id=t.id::text
        AND mc.status='restricted') AS moderation
      FROM oc_timelines t JOIN oc_users u ON u.id=t.owner_id
      LEFT JOIN oc_members m ON m.timeline_id=t.id AND m.user_id=$2::uuid WHERE t.id=$1`,
      [id, userId ?? null],
    );
    const timeline = rows[0];
    // A timeline restricted by moderators (#115) is seen only by its owner and administrators.
    if (
      !timeline ||
      (!timeline.role && timeline.visibility !== 'public') ||
      (timeline.moderation && !['owner', 'admin'].includes(timeline.role))
    )
      throw new HttpError(404, 'Timeline unavailable. Sign in if it is private.');
    if (timeline.comparison) {
      const sources = await client.query(
        `SELECT t.id FROM oc_timelines t
        WHERE t.id=ANY($1::uuid[]) AND t.comparison IS NULL AND
        (t.owner_id=$2::uuid OR EXISTS(SELECT 1 FROM oc_users a WHERE a.id=$2::uuid AND a.is_admin AND NOT a.is_disabled)
          OR ((t.visibility='public' OR EXISTS(SELECT 1 FROM oc_members m WHERE m.timeline_id=t.id AND m.user_id=$2::uuid))
            AND NOT ${restrictedTimeline('t')}))`,
        [timeline.comparison.sources, userId ?? null],
      );
      if (sources.rows.length !== timeline.comparison.sources.length)
        throw new HttpError(404, 'A comparison source is unavailable.');
    }
    if (timeline.preparing_revision_id && !preparing)
      throw new HttpError(
        409,
        'This copy is still being prepared. It opens as soon as it is ready; try again shortly.',
      );
    const { search_document, event_text, ...metadata } = timeline;
    return {
      preparing: !!timeline.preparing_revision_id,
      ...metadata,
      // Its sensitive-content labels (#115): its owner's and moderators'.
      labels: contentLabels([
        ...(timeline.content_labels ?? []),
        ...(timeline.moderator_labels ?? []),
      ]),
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
  /**
   * How many moments and durations timeline `from`'s index holds, if it can be copied or
   * shared as it stands (shareIndex): null for a comparison (its sources are
   * checked for the new owner when rebuilt) or an index a startup repair still has to rebuild.
   */
  async copyable(client, from) {
    const rows = await indexReader(client, await lineageOf(client, from));
    const { rows: found } = await client.query(
      `SELECT event_count+coalesce((SELECT n.subtree_count
        FROM ${rows.lookup('oc_duration_nodes', ['t.duration_root'])} n),0) AS entities
      FROM oc_timelines t WHERE id=$1 AND comparison IS NULL AND index_version>=2 AND search_version>=1
      AND NOT EXISTS(SELECT 1 FROM ${rows('oc_duration_nodes', '$1', { scan: true })} n
        WHERE n.definition IS NULL OR n.max_first IS NULL)`,
      [from],
    );
    return found[0] ? Number(found[0].entities) : null;
  }
  /**
   * Gives timeline `to` (just created, empty) the index of timeline `from` as it stands, its
   * head revision `revisionId`, by reading through to it (index-versions.mjs): `from` is
   * pinned at its clock, so it keeps the versions `to` sees as it changes, and `to` reads
   * `from`'s levels after it. Nothing is copied, so it is ready at once whatever its size.
   * Charged like a copy. One that would read through more levels than a fork may
   * (this.indexLevels, INDEX_LEVELS) copies what it reads of the nearest ones instead
   * (takeLevels), so it costs what `from` has changed rather than its whole index: now, or
   * for many rows (PREPARE_AFTER) after answering, while it is marked as being prepared. The
   * pin keeps `from` as forked meanwhile, whatever happens to it. Returns false, doing
   * nothing, when the index cannot be shared (it is not copyable).
   */
  async shareIndex(client, from, to, revisionId) {
    if ((await this.copyable(client, from)) === null) return false;
    await client.query(
      'UPDATE oc_timelines SET index_pinned=greatest(index_pinned,index_clock) WHERE id=$1',
      [from],
    );
    const { rows } = await client.query(
      `UPDATE oc_timelines t SET index_bases=array_prepend(s.id,s.index_bases),
      index_clocks=array_prepend(s.index_clock,s.index_clocks),storage_bytes=s.storage_bytes,
      ${TIMELINE_INDEX.map((c) => `${c}=s.${c}`)} FROM oc_timelines s WHERE t.id=$2 AND s.id=$1
      RETURNING cardinality(t.index_bases) AS depth`,
      [from, to],
    );
    if (rows[0].depth <= this.levels()) return true;
    // What it copies is mostly `from`'s own rows, counted up to what is enough.
    const { rows: own } = await client.query(
      `SELECT (SELECT count(*) FROM (SELECT 1 FROM oc_moments WHERE timeline_id=$1 LIMIT $2) m)
        +(SELECT count(*) FROM (SELECT 1 FROM oc_duration_nodes WHERE timeline_id=$1 LIMIT $2) d) AS n`,
      [from, PREPARE_AFTER],
    );
    if (Number(own[0].n) < PREPARE_AFTER) {
      await this.takeLevels(client, to);
      return true;
    }
    await client.query('UPDATE oc_timelines SET preparing_revision_id=$2 WHERE id=$1', [
      to,
      revisionId,
    ]);
    client.afterCommit = () => this.prepare(to);
    return true;
  }
  /** How many levels a fork reads through at most (INDEX_LEVELS, unless a test sets fewer). */
  levels() {
    return this.indexLevels ?? INDEX_LEVELS;
  }
  /**
   * Has timeline `id` (locked) read through to no more levels than a fork may: it copies what
   * it reads of its nearest levels into rows of its own (copyLevel) and releases them. One
   * left reading through to nothing has its index whole and drops its hidden rows.
   */
  async takeLevels(client, id) {
    const { index_bases: bases, index_clocks: clocks } = await lineageOf(client, id);
    const taken = bases.length - this.levels();
    if (taken <= 0) return;
    await beginIndexWrite(client, id);
    let entities = 0;
    for (let level = 0; level < taken; level++) {
      const copied = await copyLevel(client, id, bases[level], clocks[level]);
      entities += copied.oc_moments + copied.oc_duration_nodes;
    }
    if (taken === bases.length)
      for (const table of INDEX_TABLES)
        await client.query(`DELETE FROM ${table} WHERE timeline_id=$1 AND hidden`, [id]);
    await client.query(
      'UPDATE oc_timelines SET index_bases=index_bases[$2:],index_clocks=index_clocks[$2:] WHERE id=$1',
      [id, taken + 1],
    );
    await client.query('SELECT oc_release_index($1::uuid[],$2::bigint[])', [
      bases.slice(0, taken),
      clocks.slice(0, taken),
    ]);
    // Rows of its own the statistics have yet to count, as after a large save to a fork (in
    // the live tables only: it retired nothing).
    if (entities >= ANALYZE_VERSIONS_AFTER) client.analyze ||= INDEX_TABLES;
  }
  /**
   * Prepares a copy left for later (shareIndex), outside the request that made it, in one
   * transaction: a crash leaves nothing behind, and the next start tries again
   * (prepareStale). Each copy is prepared once at a time, across server processes too.
   * Resolves when done.
   */
  prepare(id) {
    this.preparing ??= new Map();
    if (!this.preparing.has(id))
      this.preparing.set(
        id,
        this.prepareNow(id)
          .catch((error) => {
            if (!this.pool.ending) console.error('Preparing a copy failed:', error);
          })
          .finally(() => this.preparing.delete(id)),
      );
    return this.preparing.get(id);
  }
  async prepareNow(id) {
    await this.transaction(async (c) => {
      const { rows } = await c.query(
        `SELECT preparing_revision_id AS base,cardinality(index_bases) AS depth FROM oc_timelines
        WHERE id=$1 AND preparing_revision_id IS NOT NULL FOR UPDATE SKIP LOCKED`,
        [id],
      );
      // Ready, deleted, or being prepared elsewhere.
      if (!rows[0]) return;
      if (rows[0].depth > this.levels()) await this.takeLevels(c, id);
      // A copy left by an earlier version, its index not yet written: rebuilt from the
      // revision it copies.
      else
        await this.replace(c, id, await this.revisionDocument(c, rows[0].base), { touch: false });
      await c.query('UPDATE oc_timelines SET preparing_revision_id=NULL WHERE id=$1', [id]);
      c.afterCommit = () => this.refreshText(id);
    });
  }
  /**
   * Compacts fork `id` in the background once it has rewritten most of what it reads
   * (COMPACT_SHARE), or whatever it has when `force`: it then holds its whole index, reads
   * through to nothing, and releases the versions its levels keep for it (oc_release_index).
   * Checked after its saves; one compaction of a timeline at a time. Resolves when done.
   */
  compact(id, { force = false } = {}) {
    this.compacting ??= new Map();
    if (!this.compacting.has(id))
      this.compacting.set(
        id,
        (async () => {
          if (!force && !(await this.diverged(id))) return;
          while (!(await this.compactStep(id)));
        })()
          .catch((error) => {
            if (!this.pool.ending) console.error('Compacting a fork failed:', error);
          })
          .finally(() => this.compacting.delete(id)),
      );
    return this.compacting.get(id);
  }
  /** Whether fork `id` has rewritten at least COMPACT_SHARE of what it reads. */
  async diverged(id) {
    const { rows } = await this.pool.query(
      "SELECT event_count FROM oc_timelines WHERE id=$1 AND index_bases<>'{}'",
      [id],
    );
    if (!rows[0]) return false;
    const enough = Math.max(1, Math.ceil(Number(rows[0].event_count) * COMPACT_SHARE));
    // Counted up to what is enough, so a fork with few rows of its own costs little.
    const { rows: own } = await this.pool.query(
      'SELECT count(*) AS n FROM (SELECT 1 FROM oc_moments WHERE timeline_id=$1 LIMIT $2) x',
      [id, enough],
    );
    return Number(own[0].n) >= enough;
  }
  /**
   * One step of compacting fork `id`, in a transaction of its own (the fork is locked only
   * that long): a page of the rows it reads through to, per table, copied into rows of its
   * own. They are the same rows, so it reads the same meanwhile, and the next step reads
   * through to the rest only. Once none is left, its hidden rows and its lineage go and what
   * it read is released. Returns whether it is done.
   */
  async compactStep(id) {
    return this.transaction(async (c) => {
      const { rows } = await c.query(
        'SELECT id,index_bases,index_clocks FROM oc_timelines WHERE id=$1 FOR UPDATE',
        [id],
      );
      if (!rows[0]?.index_bases.length) return true;
      await beginIndexWrite(c, id);
      const index = await indexReader(c, rows[0]);
      for (const table of INDEX_TABLES) {
        const { columns } = await copiedColumns(c, table);
        const { rowCount } = await c.query(
          `INSERT INTO ${table}(timeline_id,${columns}) SELECT $1,${columns}
          FROM ${index(table)} x WHERE x.timeline_id<>$1 LIMIT ${this.compactPage ?? COPY_PAGE}`,
          [id],
        );
        if (rowCount) return false;
      }
      for (const table of INDEX_TABLES)
        await c.query(`DELETE FROM ${table} WHERE timeline_id=$1 AND hidden`, [id]);
      await c.query("UPDATE oc_timelines SET index_bases='{}',index_clocks='{}' WHERE id=$1", [id]);
      await c.query('SELECT oc_release_index($1::uuid[],$2::bigint[])', [
        rows[0].index_bases,
        rows[0].index_clocks,
      ]);
      // Its own rows are now all of it, which the statistics have yet to count.
      c.analyze = true;
      return true;
    });
  }
  /** Prepares, one at a time, copies left unprepared (for example by a restart). */
  async prepareStale() {
    const { rows } = await this.pool.query(
      'SELECT id FROM oc_timelines WHERE preparing_revision_id IS NOT NULL',
    );
    for (const { id } of rows) await this.prepare(id);
  }
  /**
   * Writes timeline `id`'s index whole from `document`, telling `progress` (if given) each
   * stage of REBUILD_STAGES as it starts.
   */
  async replace(client, id, document, { touch = true, progress } = {}) {
    const stage = (done, rebuilding) => progress?.({ rebuilding, done, total: REBUILD_STAGES });
    document = withoutImageCopies(validateDocument(document));
    if (document.comparison) {
      const parent = (
        await client.query(
          'SELECT t.owner_id,t.visibility,u.is_admin FROM oc_timelines t JOIN oc_users u ON u.id=t.owner_id WHERE t.id=$1',
          [id],
        )
      ).rows[0];
      const limit =
        this.compareLimits && compareLimit(this.compareLimits, { isAdmin: parent.is_admin });
      if (limit && document.comparison.sources.length > limit)
        throw new HttpError(400, `This account can compare at most ${limit} timelines.`);
      const sources = await client.query(
        `SELECT t.id FROM oc_timelines t
        WHERE t.id=ANY($1::uuid[]) AND t.id<>$2::uuid AND t.comparison IS NULL
        AND (t.visibility='public' OR ($3='private' AND (t.owner_id=$4::uuid OR (EXISTS
          (SELECT 1 FROM oc_members m WHERE m.timeline_id=t.id AND m.user_id=$4::uuid)
          AND NOT ${restrictedTimeline('t')}))))`,
        [document.comparison.sources, id, parent.visibility, parent.owner_id],
      );
      if (sources.rows.length !== document.comparison.sources.length)
        throw new HttpError(
          400,
          'Comparison sources must be accessible ordinary timelines; public comparisons require public sources.',
        );
    }
    // Index writes record the clock of their transaction (index-versions.mjs), so replace
    // runs inside one.
    await beginIndexWrite(client, id);
    const lineage = await lineageOf(client, id);
    const rows = await indexReader(client, lineage);
    // Reject over-quota document growth before rebuilding the rational index.
    await client.query('UPDATE oc_timelines SET storage_bytes=$2 WHERE id=$1', [
      id,
      Buffer.byteLength(JSON.stringify(document)),
    ]);
    const additions = await client.query(
      `SELECT EXISTS(SELECT value FROM jsonb_array_elements_text($2::jsonb)
        EXCEPT SELECT id FROM ${rows('oc_moments', '$1', { scan: true })} x) AS added`,
      [id, JSON.stringify(document.events.map((event) => event.id))],
    );
    // A fork's index written whole is its own: it reads through to nothing from now on.
    if (rows.depth)
      await client.query("UPDATE oc_timelines SET index_bases='{}',index_clocks='{}' WHERE id=$1", [
        id,
      ]);
    // A timeline this large written in one go leaves the planner's statistics behind.
    if (document.events.length + (document.durations?.length ?? 0) >= ANALYZE_AFTER)
      client.analyze = true;
    const tree = indexedNodes(document);
    stage(1, 'writing moments');
    await writeMoments(client, 'oc_moments', id, document.events);
    stage(2, 'ordering moments');
    await writeNodes(client, 'oc_nodes', id, tree);
    stage(3, 'placing durations');
    const durations = await writeDurationNodes(client, 'oc_duration_nodes', id, document);
    const bands = durations.bands;
    stage(4, 'indexing for search');
    await this.indexSearch(client, id, document, bands);
    stage(5, 'linking relationships');
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
    const edges = await writeEdgeNodes(client, id, document);
    // What it read through to may be deleted, and now kept for nothing.
    if (rows.depth)
      await client.query('SELECT oc_release_index($1::uuid[],$2::bigint[])', [
        lineage.index_bases,
        lineage.index_clocks,
      ]);
    // Saved state changed: derived separation views belong to the previous revision.
    await client.query('DELETE FROM oc_views WHERE timeline_id=$1', [id]);
    await client.query(
      'UPDATE oc_timelines SET title=$2,description=$3,root=$4,event_count=$5,presentation=$6::jsonb,plugins=$7::jsonb,tags=$8,assets=$9::jsonb,event_text=$10,comparison=$11::jsonb,storage_bytes=$12,event_generation=event_generation+CASE WHEN $13 THEN 1 ELSE 0 END,updated_at=CASE WHEN $14 THEN now() ELSE updated_at END,duration_root=$15,edge_root=$16,index_version=2,event_text_stale=false WHERE id=$1',
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
        eventSearchText(document, bands, tree),
        document.comparison ? JSON.stringify(document.comparison) : null,
        Buffer.byteLength(JSON.stringify(document)),
        additions.rows[0].added,
        touch,
        durations.root,
        edges.root,
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
  /**
   * Runs `action(c)` in a transaction. `analyses`, when given, collects the statistics
   * refreshes its writes ask for instead of running them before returning, for a caller
   * making many writes in a row to run once (see analyze).
   */
  async transaction(action, { analyses = null } = {}) {
    const c = await this.pool.connect();
    c.afterCommit = null;
    c.analyze = false;
    c.indexWrites = false;
    c.compact = null;
    try {
      await c.query('BEGIN');
      const result = await action(c);
      if (c.indexWrites && !c.analyze) {
        const { rows } = await c.query(
          "SELECT coalesce(nullif(current_setting('oc.retired',true),''),'0')::bigint AS retired",
        );
        if (Number(rows[0].retired) >= ANALYZE_VERSIONS_AFTER) c.analyze = RETIRED_TABLES;
      }
      await c.query('COMMIT');
      c.afterCommit?.();
      if (c.compact) this.compact(c.compact);
      // Before answering, so the next request plans with the written timeline counted.
      const tables = c.analyze === true ? ANALYZED_TABLES : c.analyze;
      if (tables && analyses) for (const table of tables) analyses.add(table);
      else if (tables) await this.analyze(tables);
      return result;
    } catch (e) {
      await c.query('ROLLBACK');
      if (e.code === 'P0001' && e.message.startsWith('Account storage limit'))
        throw new HttpError(413, e.message);
      throw e;
    } finally {
      c.afterCommit = null;
      c.release();
    }
  }
  /**
   * Rebuilds the catalogue text (event_text) after incremental saves, outside the save's
   * transaction; rapid saves to one timeline coalesce into one more rebuild. Also drops
   * separation views of earlier revisions.
   */
  refreshText(id) {
    this.refreshing ??= new Map();
    const running = this.refreshing.get(id);
    if (running) {
      running.again = true;
      return running.done;
    }
    const entry = { again: false };
    entry.done = (async () => {
      try {
        this.refreshCost ??= new Map();
        do {
          entry.again = false;
          // Saves in quick succession share one rebuild. Large timelines, whose rebuild takes
          // longer, wait proportionally longer so continuous editing leaves the database free.
          const delay = Math.max(this.textDelay ?? 1000, 3 * (this.refreshCost.get(id) ?? 0));
          await new Promise((resolve) => setTimeout(resolve, delay));
          if (this.pool.ending) break;
          // The text is built in the database without locking the timeline; the update below
          // applies only if no save committed meanwhile (that save's own refresh runs next), and
          // rewrites event_text (recomputing the catalogue vector) only when the text changed.
          const started = Date.now();
          const { rows } = await this.pool.query(
            `SELECT t.revision,x.text,t.event_text IS NOT DISTINCT FROM x.text AS same FROM oc_timelines t
            CROSS JOIN LATERAL (SELECT oc_event_text(t.id) AS text) x WHERE t.id=$1 AND t.event_text_stale`,
            [id],
          );
          if (!rows[0]) continue;
          await this.pool.query(
            rows[0].same
              ? 'UPDATE oc_timelines SET event_text_stale=false WHERE id=$1 AND revision=$2'
              : 'UPDATE oc_timelines SET event_text=$3,event_text_stale=false WHERE id=$1 AND revision=$2',
            rows[0].same ? [id, rows[0].revision] : [id, rows[0].revision, rows[0].text],
          );
          if (this.refreshCost.size > 10000) this.refreshCost.clear();
          this.refreshCost.set(id, Date.now() - started);
          await this.pool.query('DELETE FROM oc_views WHERE timeline_id=$1 AND revision<>$2', [
            id,
            rows[0].revision,
          ]);
        } while (entry.again);
      } catch (error) {
        if (!this.pool.ending) console.error('Catalogue text refresh failed:', error);
      } finally {
        this.refreshing.delete(id);
        // A save that arrived after the last round started its own.
        if (entry.again && !this.pool.ending) this.refreshText(id);
      }
    })();
    this.refreshing.set(id, entry);
    return entry.done;
  }
  /**
   * Refreshes the statistics of the timelines' index tables (`tables`: by default all of them
   * and their retired versions), after a commit that wrote a large timeline in one go
   * (replace), many versions forks read (ANALYZE_VERSIONS_AFTER), or a large save to a fork:
   * until then the planner counts those rows as none, so it may read a key through any index
   * starting with the timeline and filter every row (the save path's lookups only stay one
   * per key). ANALYZE runs after the writing transaction, which would otherwise hold its lock
   * until committing; writes in quick succession share one more run.
   */
  analyze(tables = ANALYZED_TABLES) {
    if (this.analyzing) {
      for (const table of tables) this.analyzing.next.add(table);
      return this.analyzing.done;
    }
    const entry = { next: new Set(tables) };
    entry.done = (async () => {
      try {
        while (entry.next.size && !this.pool.ending) {
          const now = [...entry.next];
          entry.next.clear();
          await this.pool.query(`ANALYZE ${now.join(',')}`);
        }
      } catch (error) {
        if (!this.pool.ending) console.error('Refreshing statistics failed:', error);
      } finally {
        this.analyzing = null;
      }
    })();
    this.analyzing = entry;
    return entry.done;
  }
  /** Refreshes catalogue text left stale (for example by a restart) and waits for pending refreshes. */
  async refreshStale() {
    const { rows } = await this.pool.query('SELECT id FROM oc_timelines WHERE event_text_stale');
    await Promise.all(rows.map((r) => this.refreshText(r.id)));
    await this.idle();
  }
  /** Resolves once no catalogue refresh is pending. */
  async idle() {
    while (this.refreshing?.size || this.analyzing || this.preparing?.size || this.compacting?.size)
      await Promise.all([
        ...[...(this.refreshing?.values() ?? [])].map((e) => e.done),
        ...(this.preparing?.values() ?? []),
        ...(this.compacting?.values() ?? []),
        this.analyzing?.done,
      ]);
  }
  async create(userId, document) {
    document = withoutImageCopies(validateDocument(document));
    await this.checkScripts(document.plugins);
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
  /**
   * Saves `document`, or `patch` (applied in place when it can be), at `revision`.
   * `analyses`: see transaction.
   */
  /**
   * Saves `document`, or `patch` onto the current revision. `progress`, if given, is told as
   * a large patch is applied in place (see saveIncrementally), or as the timeline is rebuilt
   * with it instead (`{ rebuilding: stage, done, total }`; see replace).
   */
  async save(id, userId, revision, document, patch = null, { analyses = null, progress } = {}) {
    return this.transaction(
      async (c) => {
        await c.query('SELECT id FROM oc_timelines WHERE id=$1 FOR UPDATE', [id]);
        const t = await this.access(id, userId, c);
        if (!t.canWrite) throw new HttpError(403, 'Write access is required to update upstream.');
        // Edits made on an earlier revision: merged onto this one when the editor says what
        // it saw (#165; save-merge.mjs), else refused. With what it saw, they are checked
        // even on this revision: an editor following the latest revision keeps edits made
        // before it moved, which others may have changed since.
        if (t.revision !== revision && !patch?.base)
          throw new HttpError(
            409,
            'Someone changed this timeline. Export your edits before reloading.',
          );
        if (patch?.base) patch = await rebaseSave(c, t, patch);
        await this.checkScripts(patch ? patch.settings.plugins : document.plugins, t.plugins);
        if (patch && incremental(t, patch)) {
          // Sparse saves update the stored index in place and record only the patch.
          await this.saveIncrementally(c, t, userId, patch, 'save', [t.head_revision_id], {
            progress,
          });
          c.afterCommit = () => this.refreshText(id);
          return this.access(id, userId, c);
        }
        if (patch) {
          progress?.({ rebuilding: 'reading it', done: 0, total: REBUILD_STAGES });
          const current = await this.branchDocument(c, t);
          document = validateDocument(applyPatch(current, patch));
        }
        await this.replace(c, id, document, { progress });
        await c.query('UPDATE oc_timelines SET revision=revision+1 WHERE id=$1', [id]);
        progress?.({ rebuilding: 'recording the version', done: 6, total: REBUILD_STAGES });
        await this.checkpoint(c, id, userId, document, 'save', [t.head_revision_id]);
        return this.access(id, userId, c);
      },
      { analyses },
    );
  }
  /**
   * Records the timeline's current state (just written from `document`) as its next numbered
   * revision, kept as rows (history.mjs), or without its content when the timeline keeps no
   * saved history.
   */
  async checkpoint(client, id, userId, document, kind, parents = []) {
    const { rows } = await client.query(
      'SELECT revision,storage_bytes,keep_history FROM oc_timelines WHERE id=$1',
      [id],
    );
    const kept = rows[0].keep_history;
    const stored = kept
      ? await recordHistory(client, id, rows[0].revision, settingsOf(document))
      : null;
    const revisionId = await this.recordRows(client, id, userId, kind, parents, {
      number: rows[0].revision,
      documentBytes: rows[0].storage_bytes,
      stored,
      kept,
    });
    await client.query('UPDATE oc_timelines SET head_revision_id=$2 WHERE id=$1', [id, revisionId]);
    return revisionId;
  }
  /** Whether revision `id`'s document can be read (see revisionDocument). */
  async readable(client, id) {
    const { rows } = await client.query(
      `SELECT 1 FROM oc_revisions r WHERE r.id=$1 AND (num_nonnulls(r.snapshot_id,r.patch)+r.history_rows::int>0
        OR EXISTS(SELECT 1 FROM oc_timelines t WHERE t.id=r.timeline_id AND t.head_revision_id=r.id))`,
      [id],
    );
    return rows.length > 0;
  }
  /**
   * The storage turning timeline `id`'s saved history off would free: what its revisions are
   * charged, apart from those whose content others still read (STILL_READ).
   */
  async historyBytes(client, id) {
    const { rows } = await client.query(
      `${STILL_READ} SELECT coalesce(sum(e.bytes),0) AS bytes FROM oc_revisions r
      JOIN oc_storage_entries e ON e.kind='oc_revisions' AND e.entry_id=r.id::text
      WHERE r.timeline_id=$1 AND r.id NOT IN (SELECT id FROM still_read)`,
      [id],
    );
    return Number(rows[0].bytes);
  }
  /**
   * Stops keeping timeline `id`'s saved history (locked by the caller): its revisions keep
   * their place (author, time, parents) but forget their content and are refunded it, apart
   * from those others still read (STILL_READ); the versions only forgotten revisions saw go.
   * Its later saves record no content. Its head is read from its live index from then on.
   */
  async stopHistory(client, id) {
    const { rows } = await client.query(
      'SELECT revision FROM oc_timelines WHERE id=$1 AND keep_history',
      [id],
    );
    if (!rows[0]) return;
    const { rows: forgotten } = await client.query(
      `${STILL_READ} SELECT r.id,r.snapshot_id FROM oc_revisions r WHERE r.timeline_id=$1
      AND r.id NOT IN (SELECT id FROM still_read)
      AND num_nonnulls(r.snapshot_id,r.patch)+r.history_rows::int>0`,
      [id],
    );
    await client.query(
      `UPDATE oc_revisions SET history_rows=false,stored_bytes=NULL,snapshot_id=NULL,patch=NULL
      WHERE id=ANY($1::uuid[])`,
      [forgotten.map((r) => r.id)],
    );
    await client.query(
      'DELETE FROM oc_snapshots s WHERE s.id=ANY($1::uuid[]) AND NOT EXISTS(SELECT 1 FROM oc_revisions r WHERE r.snapshot_id=s.id)',
      [forgotten.map((r) => r.snapshot_id).filter(Boolean)],
    );
    // The versions only forgotten revisions saw go; those kept revisions still see end after
    // the latest revision, so nothing later sees them.
    const released = await pruneHistoryRows(client, id);
    await endHistory(client, id, (BigInt(rows[0].revision) + 1n).toString());
    if (
      released &&
      !(await client.query('SELECT 1 FROM oc_timelines WHERE id=$1', [released])).rows.length
    )
      await this.removeHistory(client, released);
    await client.query(
      'UPDATE oc_timelines SET keep_history=false,history_since=NULL WHERE id=$1',
      [id],
    );
  }
  /**
   * Starts keeping timeline `id`'s saved history again (locked by the caller), from its
   * current state: recorded as a new revision by `userId` ('baseline'), with one copy of that
   * state made in the database and charged to it. Earlier revisions stay as they were.
   */
  async startHistory(client, id, userId) {
    const { rows } = await client.query(
      `UPDATE oc_timelines SET keep_history=true,revision=revision+1 WHERE id=$1 AND NOT keep_history
      RETURNING *`,
      [id],
    );
    const t = rows[0];
    if (!t) return;
    // A copy whose kept revisions still read through to its base compares what it holds
    // with what it reads there (as a save of the whole timeline does); otherwise its state
    // is copied as it is.
    const { rows: base } = await client.query(
      'SELECT 1 FROM oc_history_bases WHERE timeline_id=$1',
      [id],
    );
    if (base.length)
      await client.query('UPDATE oc_timelines SET history_since=$2 WHERE id=$1', [id, t.revision]);
    const stored = await recordHistory(client, id, t.revision, settingsOf(timelineSettings(t)));
    const revisionId = await this.recordRows(client, id, userId, 'baseline', [t.head_revision_id], {
      number: t.revision,
      documentBytes: t.storage_bytes,
      stored,
    });
    await client.query('UPDATE oc_timelines SET head_revision_id=$2 WHERE id=$1', [id, revisionId]);
  }
  /**
   * A revision outside a timeline's numbered history (a pull request's source or a rebase of
   * one, a validated document), with `parents`: kept as rows that read through to `baseId` and charged what
   * `document` changes from it, or, when that base is not kept as rows, stored as a document
   * of `timelineId`.
   */
  async recordDetached(client, timelineId, userId, document, kind, parents, baseId) {
    const revisionId = randomUUID();
    const stored = await recordDetached(client, revisionId, baseId, document);
    if (stored === null)
      return this.recordRevision(client, timelineId, userId, document, kind, parents);
    await client.query(
      `INSERT INTO oc_revisions(id,timeline_id,number,author_id,kind,history_rows,document_bytes,stored_bytes)
      VALUES($1,$1,1,$2,$3,true,$4,$5)`,
      [revisionId, userId, kind, Buffer.byteLength(JSON.stringify(document)), stored],
    );
    for (const [position, parent] of [...new Set(parents.filter(Boolean))].entries())
      await client.query(
        'INSERT INTO oc_revision_parents(revision_id,parent_id,position) VALUES($1,$2,$3)',
        [revisionId, parent, position],
      );
    return revisionId;
  }
  /**
   * Like recordDetached, a revision that is `baseId` (the head of `t`) changed by a merge's
   * patch (merge.mjs), kept as rows and charged what the patch changes.
   */
  async recordDetachedPatch(client, t, userId, patch, kind, parents, baseId) {
    const revisionId = randomUUID();
    const stored = await recordDetachedPatch(client, revisionId, baseId, patch);
    await client.query(
      `INSERT INTO oc_revisions(id,timeline_id,number,author_id,kind,history_rows,document_bytes,stored_bytes)
      VALUES($1,$1,1,$2,$3,true,$4,$5)`,
      [revisionId, userId, kind, t.storage_bytes, stored],
    );
    for (const [position, parent] of [...new Set(parents.filter(Boolean))].entries())
      await client.query(
        'INSERT INTO oc_revision_parents(revision_id,parent_id,position) VALUES($1,$2,$3)',
        [revisionId, parent, position],
      );
    return revisionId;
  }
  /**
   * Applies a merge's patch (merge.mjs) to timeline `t` (locked by the caller) as its next
   * revision, of `kind` with `parents`: in place like a sparse save when it is small enough,
   * otherwise rebuilt from the patched document. Returns the revision's ID.
   */
  async applyMerge(client, t, userId, patch, kind, parents) {
    if (incremental(t, patch)) {
      const revisionId = await this.saveIncrementally(client, t, userId, patch, kind, parents);
      client.afterCommit = () => this.refreshText(t.id);
      return revisionId;
    }
    const document = validateDocument(applyPatch(await this.branchDocument(client, t), patch));
    await this.replace(client, t.id, document);
    await client.query('UPDATE oc_timelines SET revision=revision+1 WHERE id=$1', [t.id]);
    return this.checkpoint(client, t.id, userId, document, kind, parents);
  }
  /**
   * A numbered revision kept as rows, charged the bytes of the versions it wrote; or, not
   * `kept` (a timeline that keeps no saved history), one without content, charged nothing.
   */
  async recordRows(
    client,
    id,
    userId,
    kind,
    parents,
    { number, documentBytes, stored, kept = true },
  ) {
    const revisionId = randomUUID();
    await client.query(
      `INSERT INTO oc_revisions(id,timeline_id,number,author_id,kind,history_rows,document_bytes,stored_bytes)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,
      [revisionId, id, number, userId, kind, kept, documentBytes, kept ? stored : null],
    );
    for (const [position, parent] of [...new Set(parents.filter(Boolean))].entries())
      await client.query(
        'INSERT INTO oc_revision_parents(revision_id,parent_id,position) VALUES($1,$2,$3)',
        [revisionId, parent, position],
      );
    return revisionId;
  }
  /**
   * Applies a sparse save in place and records, as rows, the versions of what it changed:
   * its cost follows the change, not the timeline's size. The timeline row is updated once
   * and its indexed columns stay unchanged (updated_at advances at most once a minute), so
   * the update stays in place (HOT) and the catalogue's GIN index is not touched.
   */
  async saveIncrementally(
    client,
    t,
    userId,
    patch,
    kind = 'save',
    parents = [t.head_revision_id],
    { progress } = {},
  ) {
    // A large patch is applied a slice at a time, each to the timeline as the last left it,
    // so no statement grows with the patch; it is still one revision.
    const touched = { moments: [], durations: [], relationships: [] };
    let current = t,
      added = false,
      applied;
    const slices = slicePatch(patch, this.patchSlice);
    // Told how many changes are applied so far, of how many (`progress`).
    const total = slices.reduce(
      (n, s) => n + s.changes.length + s.durationChanges.length + s.relationshipChanges.length,
      0,
    );
    let done = 0;
    progress?.({ done, total });
    for (const [i, slice] of slices.entries()) {
      applied = await applyIncrementally(client, current, slice);
      done +=
        slice.changes.length + slice.durationChanges.length + slice.relationshipChanges.length;
      progress?.({ done, total });
      added ||= applied.added;
      for (const name of Object.keys(touched)) touched[name].push(...applied.touched[name]);
      if (i < slices.length - 1) {
        await client.query(
          `UPDATE oc_timelines SET ${applied.assignments.map(([column, , cast], j) => `${column}=$${j + 2}${cast ?? ''}`)} WHERE id=$1`,
          [t.id, ...applied.assignments.map(([, value]) => value)],
        );
        current = (await client.query('SELECT * FROM oc_timelines WHERE id=$1', [t.id])).rows[0];
      }
    }
    const { assignments, settings, storage } = applied;
    if (t.index_bases?.length) {
      if (patch.changes.length + (patch.durationChanges?.length ?? 0) >= ANALYZE_VERSIONS_AFTER)
        client.analyze = true;
      // A fork that has rewritten most of what it reads is compacted (see compact).
      client.compact = t.id;
    }
    const number = (BigInt(t.revision) + 1n).toString();
    const kept = t.keep_history !== false;
    const stored = kept ? await recordHistory(client, t.id, number, settings, touched) : null;
    const revisionId = await this.recordRows(client, t.id, userId, kind, parents, {
      number,
      documentBytes: storage,
      stored,
      kept,
    });
    const fixed = 4;
    await client.query(
      `UPDATE oc_timelines SET revision=revision+1,head_revision_id=$2,
      event_generation=event_generation+$3,event_text_stale=true,
      updated_at=CASE WHEN updated_at<now()-interval '1 minute' THEN now() ELSE updated_at END,
      ${assignments.map(([column, , cast], i) => `${column}=$${fixed + i}${cast ?? ''}`).join(',')}
      WHERE id=$1`,
      [t.id, revisionId, added ? 1 : 0, ...assignments.map(([, value]) => value)],
    );
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
    let size = null;
    if (!snapshotId) {
      snapshotId = randomUUID();
      const serialized = documentJson(validateDocument(document));
      size = Buffer.byteLength(serialized);
      await client.query(
        'INSERT INTO oc_snapshots(id,document,document_bytes) VALUES($1,$2::jsonb,$3)',
        [snapshotId, serialized, size],
      );
    }
    await client.query(
      'INSERT INTO oc_revisions(id,timeline_id,number,snapshot_id,author_id,kind,document_bytes) VALUES($1,$2,$3,$4,$5,$6,coalesce($7,(SELECT document_bytes FROM oc_snapshots WHERE id=$4)))',
      [revisionId, id, number, snapshotId, userId, kind, size],
    );
    for (const [position, parent] of [...new Set(parents.filter(Boolean))].entries())
      await client.query(
        'INSERT INTO oc_revision_parents(revision_id,parent_id,position) VALUES($1,$2,$3)',
        [revisionId, parent, position],
      );
    return revisionId;
  }
  /**
   * A saved revision's document: read from rows (history.mjs), or its snapshot, or the
   * nearest snapshot with later patches replayed. A revision whose content is not kept (its
   * timeline keeps no saved history) is read from its timeline's live index while it is the
   * head, and is otherwise unavailable (HttpError 409, HISTORY_OFF).
   */
  async revisionDocument(client, id) {
    const kept = await client.query(
      `SELECT r.timeline_id,r.number,r.history_rows,
      num_nonnulls(r.snapshot_id,r.patch)+r.history_rows::int=0 AS forgotten,
      (SELECT t.id FROM oc_timelines t WHERE t.id=r.timeline_id AND t.head_revision_id=r.id) AS head_of
      FROM oc_revisions r WHERE r.id=$1`,
      [id],
    );
    if (kept.rows[0]?.forgotten) {
      if (!kept.rows[0].head_of) throw new HttpError(409, HISTORY_OFF);
      const { rows } = await client.query('SELECT * FROM oc_timelines WHERE id=$1', [
        kept.rows[0].head_of,
      ]);
      return this.branchDocument(client, rows[0]);
    }
    if (kept.rows[0]?.history_rows) {
      const document = await historyDocument(client, kept.rows[0].timeline_id, kept.rows[0].number);
      if (!document) throw new HttpError(404, 'Saved revision unavailable.');
      return document;
    }
    const { rows } = await client.query(
      `WITH RECURSIVE chain(id,depth,snapshot_id,patch) AS (
        SELECT r.id,0,r.snapshot_id,r.patch FROM oc_revisions r WHERE r.id=$1
        UNION ALL SELECT r.id,c.depth+1,r.snapshot_id,r.patch FROM chain c
        JOIN oc_revision_parents p ON p.revision_id=c.id AND p.position=0
        JOIN oc_revisions r ON r.id=p.parent_id WHERE c.snapshot_id IS NULL
      ) SELECT c.depth,c.patch,s.document FROM chain c LEFT JOIN oc_snapshots s ON s.id=c.snapshot_id ORDER BY c.depth DESC`,
      [id],
    );
    if (!rows.length || !rows[0].document) throw new HttpError(404, 'Saved revision unavailable.');
    if (rows.length === 1) return rows[0].document;
    return replayPatches(
      rows[0].document,
      rows.slice(1).map((r) => r.patch),
    );
  }
  async removeHistory(client, timelineId) {
    // Once a timeline is deleted, so are its pull requests: the revisions they kept outside
    // any timeline's history (their own ID as timeline), reading through to its revisions,
    // go first, with their links to other revisions.
    if (!(await client.query('SELECT 1 FROM oc_timelines WHERE id=$1', [timelineId])).rows.length) {
      const { rows: detached } = await client.query(
        `SELECT d.id FROM oc_revisions d JOIN oc_history_bases b ON b.timeline_id=d.id
        JOIN oc_revisions r ON r.id=b.base_revision_id
        WHERE d.timeline_id=d.id AND r.timeline_id=$1 AND NOT EXISTS(SELECT 1 FROM oc_proposals p
          WHERE p.base_revision_id=d.id OR p.source_revision_id=d.id OR p.merged_revision_id=d.id)`,
        [timelineId],
      );
      const ids = detached.map((row) => row.id);
      if (ids.length) {
        await client.query(
          'DELETE FROM oc_revision_parents WHERE revision_id=ANY($1::uuid[]) OR parent_id=ANY($1::uuid[])',
          [ids],
        );
        await client.query('DELETE FROM oc_revisions WHERE id=ANY($1::uuid[])', [ids]);
        for (const id of ids) await pruneHistoryRows(client, id);
      }
    }
    // Keep ancestors still needed by another fork or submitted review, and the revisions
    // copies read through to. Other timelines' private history is never exposed through
    // the history API.
    const { rows } = await client.query(
      `WITH RECURSIVE kept(id) AS (
      SELECT r.id FROM oc_revisions r WHERE r.timeline_id=$1 AND (
        EXISTS(SELECT 1 FROM oc_timelines t WHERE t.head_revision_id=r.id OR t.fork_base_revision_id=r.id)
        OR EXISTS(SELECT 1 FROM oc_proposals p WHERE p.base_revision_id=r.id OR p.source_revision_id=r.id OR p.merged_revision_id=r.id)
        OR EXISTS(SELECT 1 FROM oc_revision_parents p JOIN oc_revisions child ON child.id=p.revision_id WHERE p.parent_id=r.id AND child.timeline_id<>$1))
      UNION SELECT p.parent_id FROM oc_revision_parents p JOIN kept k ON k.id=p.revision_id
    ) SELECT r.id,r.snapshot_id FROM oc_revisions r WHERE r.timeline_id=$1 AND r.id NOT IN (SELECT id FROM kept)
      AND NOT EXISTS(SELECT 1 FROM oc_history_bases b WHERE b.base_revision_id=r.id)`,
      [timelineId],
    );
    const ids = rows.map((r) => r.id);
    if (ids.length) {
      // A kept revision a copy reads through to keeps no link to removed parents.
      await client.query(
        'DELETE FROM oc_revision_parents WHERE revision_id=ANY($1::uuid[]) OR parent_id=ANY($1::uuid[])',
        [ids],
      );
      await client.query('DELETE FROM oc_revisions WHERE id=ANY($1::uuid[])', [ids]);
      await client.query(
        'DELETE FROM oc_snapshots s WHERE s.id=ANY($1::uuid[]) AND NOT EXISTS(SELECT 1 FROM oc_revisions r WHERE r.snapshot_id=s.id)',
        [rows.map((r) => r.snapshot_id)],
      );
    }
    // Versions only the removed revisions saw go with them. Once a copy's history is gone,
    // a deleted timeline it read through to may have nothing else keeping its own.
    const released = await pruneHistoryRows(client, timelineId);
    if (
      released &&
      !(await client.query('SELECT 1 FROM oc_timelines WHERE id=$1', [released])).rows.length
    )
      await this.removeHistory(client, released);
  }
  async metadata(id, userId) {
    return this.transaction(async (c) => {
      await c.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
      // A copy being prepared has metadata (without bounds), so its page can wait for it.
      const t = await this.access(id, userId, c, { preparing: true });
      const nodes = (await indexReader(c, t))('oc_nodes');
      const { rows } = await c.query(
        `SELECT oc_qtext(first_time) AS first,oc_qtext(last_time) AS last FROM ${nodes} x WHERE x.id=$2`,
        [id, t.root],
      );
      return { ...t, ...rows[0] };
    });
  }
  async recent(id, userId, direction = 'last') {
    if (!['last', 'first'].includes(direction))
      throw new HttpError(400, 'Choose the first or last moments.');
    return this.transaction(async (c) => {
      await c.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
      const timeline = await this.access(id, userId, c);
      if (timeline.comparison)
        throw new HttpError(409, 'Read recent moments from comparison sources.');
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
      const rows = await indexReader(c, t);
      const events = await allEvents(c, rows, id);
      const durations = await this.durationDefinitions(c, rows, id);
      const relationships = await this.relationshipList(c, rows, id);
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
          events,
          ...(durations.length ? { durations } : {}),
          ...(relationships.length ? { relationships } : {}),
        }),
      };
    });
  }
  /**
   * The timeline as `userId` may see it, as JSON text a part at a time from one snapshot
   * (document-stream.mjs): `{timeline, document}` as snapshot gives it, or with `documentOnly`
   * the document alone (an .ochx file). Access is checked before anything is yielded.
   */
  snapshotChunks(id, userId, { documentOnly = false } = {}) {
    const store = this;
    return inSnapshot(this.pool, async function* (c) {
      const t = await store.access(id, userId, c);
      yield* store.liveChunks(c, t, documentOnly ? {} : { timeline: t });
    });
  }
  /**
   * The live document of timeline `t` as documentChunks writes it, in the transaction of
   * `client`; wrapped as `{timeline, document}` when `timeline` is given.
   */
  async *liveChunks(client, t, { timeline } = {}) {
    const rows = await indexReader(client, t);
    const relationship = (r) => ({ a: { [r.a_kind]: r.a_id }, b: { [r.b_kind]: r.b_id } });
    yield* documentChunks(
      {
        format: 'openchronology',
        version: 1,
        title: t.title,
        description: t.description,
        ...(t.presentation ? { presentation: t.presentation } : {}),
        ...(t.plugins ? { plugins: t.plugins } : {}),
        ...(t.tags === null || t.tags === undefined ? {} : { tags: t.tags }),
        ...(t.assets ? { assets: t.assets } : {}),
        ...(t.comparison ? { comparison: t.comparison } : {}),
      },
      [
        // In the orders their indexes give (sorting a large timeline's moments by time
        // would take longer than a statement may).
        [
          'events',
          cursorRows(
            client,
            `SELECT event FROM ${rows('oc_moments', '$1', { scan: true })} x ORDER BY id`,
            [t.id],
          ),
          (r) => r.event,
        ],
        [
          'durations',
          cursorRows(
            client,
            `SELECT definition FROM ${rows('oc_duration_nodes', '$1', { scan: true })} x
            WHERE definition IS NOT NULL ORDER BY first_key,first_time,band->>'id' COLLATE "C"`,
            [t.id],
          ),
          (r) => r.definition,
        ],
        [
          'relationships',
          cursorRows(
            client,
            `SELECT a_kind,a_id,b_kind,b_id FROM ${rows('oc_relationships', '$1', { scan: true })} x
            ORDER BY a_kind,a_id,b_kind,b_id`,
            [t.id],
          ),
          relationship,
        ],
      ],
      timeline
        ? { prefix: `{"timeline":${JSON.stringify(timeline)},"document":`, suffix: '}' }
        : {},
    );
  }
  /**
   * Saved revision `savedId` of timeline `id`, as `userId` may see it, as JSON text a part at
   * a time from one snapshot: `{document}`, or with `documentOnly` the document alone. One
   * kept as rows is read through cursors; the head of a timeline keeping no saved history is
   * its live document; others (stored as documents before history was kept as rows) are
   * read whole. Unavailable ones fail before anything is yielded (revisionDocument).
   */
  revisionChunks(id, savedId, userId, { documentOnly = false } = {}) {
    const store = this;
    return inSnapshot(this.pool, async function* (c) {
      const t = await store.access(id, userId, c);
      const { rows } = await c.query(
        `SELECT r.number,r.history_rows,t.head_revision_id=r.id AND
        num_nonnulls(r.snapshot_id,r.patch)+r.history_rows::int=0 AS live
        FROM oc_revisions r JOIN oc_timelines t ON t.id=r.timeline_id
        WHERE r.timeline_id=$1 AND r.id=$2 AND r.number IS NOT NULL`,
        [id, savedId],
      );
      if (!rows[0]) throw new HttpError(404, 'Saved revision unavailable.');
      const wrap = documentOnly ? {} : { prefix: '{"document":', suffix: '}' };
      const parts =
        rows[0].history_rows && (await historyParts(c, id, rows[0].number, { stream: true }));
      if (parts)
        yield* documentChunks(
          parts.settings,
          parts.parts.map(([name, sql, value]) => [name, cursorRows(c, sql), value]),
          wrap,
        );
      else if (rows[0].live) {
        if (!documentOnly) yield '{"document":';
        yield* store.liveChunks(c, t);
        if (!documentOnly) yield '}';
      } else {
        const document = JSON.stringify(await store.revisionDocument(c, savedId));
        yield documentOnly ? document : `{"document":${document}}`;
      }
    });
  }
  /** The timeline's links (read by `rows`, its indexReader), in a document's order. */
  async relationshipList(client, rows, id) {
    const { rows: links } = await client.query(
      `SELECT a_kind,a_id,b_kind,b_id FROM ${rows('oc_relationships', '$1', { scan: true })} x
      ORDER BY ${RELATIONSHIP_ORDER}`,
      [id],
    );
    return links.map((r) => ({ a: { [r.a_kind]: r.a_id }, b: { [r.b_kind]: r.b_id } }));
  }
  /** Standalone duration definitions; legacy rows convert from their moments' metadata. */
  async durationDefinitions(client, rows, id) {
    const { rows: found } = await client.query(
      `SELECT definition FROM ${rows('oc_duration_nodes', '$1', { scan: true })} x WHERE definition IS NOT NULL ORDER BY definition->>'id' COLLATE "C"`,
      [id],
    );
    return found.map((r) => r.definition);
  }
  async branchDocument(client, timeline) {
    const rows = await indexReader(client, timeline);
    const events = await allEvents(client, rows, timeline.id);
    const durations = await this.durationDefinitions(client, rows, timeline.id);
    const relationships = await this.relationshipList(client, rows, timeline.id);
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
      events,
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
      await writeMoments(c, 'oc_view_moments', viewId, document.events);
      await writeNodes(c, 'oc_view_nodes', viewId, tree);
      const durations = await writeDurationNodes(c, 'oc_view_duration_nodes', viewId, document);
      await c.query('UPDATE oc_views SET duration_root=$2 WHERE id=$1', [viewId, durations.root]);
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
      // The rows of the queried tree: the view's, or the timeline's (a fork's read through).
      const index = await indexReader(c, t);
      const from = (name) =>
        view ? `(SELECT * FROM ${names[name]} WHERE timeline_id=$1)` : index(names[name]);
      /**
       * An interval tree's nodes `table` from its root (column `root` of `roots`) down its
       * pruned paths (`prune`, SQL on node `n`): joined by ID, or for a fork read through,
       * looked up node by node (a join would read every node it sees at every step).
       */
      const walk = (table, roots, root, prune) =>
        view || !index.depth
          ? `WITH RECURSIVE visible AS (
            SELECT n.* FROM ${table} n JOIN ${roots} t ON t.id=n.timeline_id AND t.${root}=n.id
            WHERE n.timeline_id=$1 AND ${prune}
            UNION ALL SELECT n.* FROM visible p JOIN ${table} n ON n.timeline_id=$1 AND n.id IN (p.left_id,p.right_id)
            WHERE ${prune} AND NOT coalesce(n.max_extent<$4::mpq AND $4::mpq>'0'::mpq,false))`
          : `WITH RECURSIVE visible AS (
            SELECT n.* FROM ${roots} t CROSS JOIN LATERAL ${index.lookup(table, [`t.${root}`])} n
            WHERE t.id=$1 AND ${prune}
            UNION ALL SELECT n.* FROM visible p CROSS JOIN LATERAL unnest(ARRAY[p.left_id,p.right_id]) c(id)
            CROSS JOIN LATERAL ${index.lookup(table, ['c.id'])} n
            WHERE ${prune} AND NOT coalesce(n.max_extent<$4::mpq AND $4::mpq>'0'::mpq,false))`;
      const pruned = 'n.min_time<=$3::mpq AND n.max_time>=$2::mpq';
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
          `${walk(names.durations, names.roots, 'duration_root', pruned)} SELECT band FROM visible WHERE first_time<=$3::mpq AND last_time>=$2::mpq
          AND ($4::mpq='0'::mpq OR last_time-first_time>=$4::mpq) LIMIT 257`,
          [tree, query.lower, query.upper, threshold],
        );
        // Arcs use the same pruned interval query; separation views draw none.
        const arcs = view
          ? { rows: [] }
          : await c.query(
              `${walk('oc_edge_nodes', 'oc_timelines', 'edge_root', pruned)} SELECT band FROM visible WHERE first_time<=$3::mpq AND last_time>=$2::mpq
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
            SELECT b_kind AS kind,b_id AS id FROM ${index('oc_relationships')} r WHERE a_kind=$2 AND a_id=$3
            UNION SELECT a_kind,a_id FROM ${index('oc_relationships')} r WHERE b_kind=$2 AND b_id=$3)
          SELECT l.kind,l.id,oc_qtext(s.first_time) AS first,oc_qtext(s.last_time) AS last,s.title
          FROM links l JOIN ${index('oc_entity_search')} s ON s.kind=l.kind AND s.entity_id=l.id
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
              FROM reach x JOIN ${index('oc_relationships')} r
                ON (r.a_kind=x.kind AND r.a_id=x.id) OR (r.b_kind=x.kind AND r.b_id=x.id))
            SELECT count(*)-1 AS count,
              (SELECT count(*) FROM ${index('oc_relationships')} r WHERE (a_kind=$2 AND a_id=$3) OR (b_kind=$2 AND b_id=$3)) AS direct
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
          // Entities with the same tags are counted together, then each tag of those.
          `SELECT tag,sum(g.n)::bigint AS count FROM (SELECT s.tags,count(*) AS n
            FROM ${index('oc_entity_search', '$1', { scan: true })} s GROUP BY s.tags) g,unnest(g.tags) AS tag
          GROUP BY tag ORDER BY sum(g.n) DESC,tag COLLATE "C" LIMIT 200`,
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
        // Every match is ranked and counted, but only the page's are read whole: carrying
        // each match's text and times to the count would spill to disk past a few thousand.
        const { rows } = await c.query(
          `SELECT p.kind,p.entity_id,oc_qtext(e.first_time) AS first,oc_qtext(e.last_time) AS last,
            e.title,left(e.body,300) AS body,p.total
          FROM (SELECT kind,entity_id,first_time,rank,count(*) OVER() AS total FROM (
              SELECT s.kind,s.entity_id,s.first_time,ts_rank(s.document,q) AS rank
              FROM ${index('oc_entity_search', '$1', { scan: true })} s, to_tsquery('simple',$2) AS q
              WHERE s.document @@ q AND ($5::text IS NULL OR s.kind=$5)) m
            ORDER BY rank DESC,first_time,kind,entity_id COLLATE "C" LIMIT $3 OFFSET $4) p
          CROSS JOIN LATERAL ${index.lookup('oc_entity_search', ['p.kind', 'p.entity_id'])} e
          ORDER BY p.rank DESC,p.first_time,p.kind,p.entity_id COLLATE "C"`,
          [id, tsquery, SEARCH_PAGE_SIZE, (query.page - 1) * SEARCH_PAGE_SIZE, query.only ?? null],
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
          `SELECT band,oc_qtext(first_time) AS first FROM ${from('durations')} x
          WHERE first_time>=$2::mpq AND last_time<=$3::mpq
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
          `SELECT definition,band FROM ${index('oc_duration_nodes')} x WHERE band->>'id'=$2 AND definition IS NOT NULL LIMIT 1`,
          [id, query.id],
        );
        return {
          duration: rows[0]?.definition ?? null,
          band: rows[0]?.band ?? null,
          revision: t.revision,
        };
      }
      // A moment by its ID alone, for links to it.
      if (query.kind === 'moment') {
        const { rows } = await c.query(`SELECT event FROM ${from('moments')} x WHERE id=$2`, [
          tree,
          query.id,
        ]);
        return { event: rows[0]?.event ?? null, revision: t.revision };
      }
      if (query.id) {
        const { rows } = await c.query(
          `SELECT event FROM ${from('moments')} x WHERE id=$3 AND time=$2::mpq`,
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
/** Writes moment rows (the tree's nodes refer to them by ID). */
/** Stages of rebuilding a timeline with a save (store.save, replace), for its progress. */
const REBUILD_STAGES = 7;
async function writeMoments(client, table, id, events) {
  await client.query(`DELETE FROM ${table} WHERE timeline_id=$1`, [id]);
  await upsertRows(
    client,
    table,
    ['timeline_id', 'id', 'time', 'event'],
    { time: '::mpq', event: '::jsonb' },
    events.map((e) => [id, e.id, e.time, JSON.stringify(e)]),
    false,
  );
}
/** Writes a balanced moment tree; batched inserts bound round trips and mpq keys stay out of B-trees. */
async function writeNodes(client, table, id, tree) {
  await client.query(`DELETE FROM ${table} WHERE timeline_id=$1`, [id]);
  await upsertRows(
    client,
    table,
    MOMENT_TREE.columns,
    MOMENT_TREE.casts,
    tree.nodes.map((n) => MOMENT_TREE.encode(id, n)),
    false,
  );
}
/** Writes the augmented duration interval tree; returns its root and resolved bands in tree order. */
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
/** Writes an augmented interval tree (durations or arcs); returns its root and bands in tree order. */
async function writeIntervalNodes(client, table, id, root) {
  await client.query(`DELETE FROM ${table} WHERE timeline_id=$1`, [id]);
  const rows = [];
  function flatten(node) {
    if (!node) return null;
    const row = {
      id: rows.length + 1,
      ...intervalPayload(node.band),
      min: node.min.toString(),
      max: node.max.toString(),
      maxFirst: node.maxFirst.toString(),
      count: node.count,
      minExtent: node.minExtent.toString(),
      maxExtent: node.maxExtent.toString(),
      source: node.band,
    };
    rows.push(row);
    row.left = flatten(node.left);
    row.right = flatten(node.right);
    const height = (ordinal) => (ordinal === null ? 0 : rows[ordinal - 1].height);
    row.height = 1 + Math.max(height(row.left), height(row.right));
    return row.id;
  }
  flatten(root);
  await upsertRows(
    client,
    table,
    INTERVAL_TREE.columns,
    INTERVAL_TREE.casts,
    rows.map((row) => INTERVAL_TREE.encode(id, row)),
    false,
  );
  return { root: rows.length ? 1 : null, bands: rows.map((row) => row.source) };
}
/** Main index objects, or the derived view tables and generated functions for a filter. */
function treeNames(view) {
  return view
    ? {
        nodes: 'oc_view_nodes',
        moments: 'oc_view_moments',
        durations: 'oc_view_duration_nodes',
        overview: 'oc_view_overview',
        events: 'oc_view_events',
        durationOverview: 'oc_view_duration_overview',
        roots: 'oc_views',
      }
    : {
        nodes: 'oc_nodes',
        moments: 'oc_moments',
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
    await beginIndexWrite(client, timeline.id);
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
/**
 * Releases the versions and pins nothing reads any more (oc_release_index), one timeline
 * at a time: earlier versions kept them after a fork was deleted. Returns how many
 * timelines it looked at.
 */
/**
 * Removes the copies of images earlier releases stored with timelines (#109): from timelines,
 * their saved history (settings, revision patches and snapshots), and pull requests. The
 * server links to images and stores no copies of them. Saved history is otherwise immutable;
 * this purge is its one exception, made once by the migration (with the server stopped),
 * like a takedown. A timeline's storage shrinks by what its copies took; what saved history
 * was charged stays. Returns how many rows it changed.
 */
export async function releaseImageCopies(client) {
  const { rows } = await client.query(
    `SELECT EXISTS(SELECT 1 FROM oc_timelines WHERE assets IS NOT NULL)
      OR EXISTS(SELECT 1 FROM oc_history_settings WHERE settings ? 'assets')
      OR EXISTS(SELECT 1 FROM oc_revisions WHERE patch->'settings' ? 'assets')
      OR EXISTS(SELECT 1 FROM oc_snapshots WHERE document ? 'assets')
      OR EXISTS(SELECT 1 FROM oc_proposals WHERE document ? 'assets' OR base_document ? 'assets') AS found`,
  );
  if (!rows[0].found) return 0;
  let changed = (
    await client.query(
      `UPDATE oc_timelines SET storage_bytes=greatest(0,storage_bytes-octet_length(assets::text)),
      assets=NULL WHERE assets IS NOT NULL`,
    )
  ).rowCount;
  changed += (
    await client.query(
      `UPDATE oc_proposals SET document=document-'assets',base_document=base_document-'assets'
      WHERE document ? 'assets' OR base_document ? 'assets'`,
    )
  ).rowCount;
  for (const [table, trigger, update] of [
    [
      'oc_history_settings',
      'oc_history_immutable',
      "UPDATE oc_history_settings SET settings=settings-'assets' WHERE settings ? 'assets'",
    ],
    [
      'oc_revisions',
      'oc_revision_immutable',
      `UPDATE oc_revisions SET patch=jsonb_set(patch,'{settings}',(patch->'settings')-'assets')
      WHERE patch->'settings' ? 'assets'`,
    ],
    [
      'oc_snapshots',
      'oc_snapshot_immutable',
      "UPDATE oc_snapshots SET document=document-'assets' WHERE document ? 'assets'",
    ],
  ]) {
    await client.query(`ALTER TABLE ${table} DISABLE TRIGGER ${trigger}`);
    try {
      changed += (await client.query(update)).rowCount;
    } finally {
      await client.query(`ALTER TABLE ${table} ENABLE TRIGGER ${trigger}`);
    }
  }
  return changed;
}
export async function releaseIndexes(client) {
  const { rows } = await client.query(
    `SELECT id FROM oc_timelines WHERE index_pinned IS NOT NULL
    UNION SELECT DISTINCT b FROM oc_timelines t,unnest(t.index_bases) b
    WHERE NOT EXISTS(SELECT 1 FROM oc_timelines s WHERE s.id=b)`,
  );
  for (const { id } of rows) await client.query('SELECT oc_release_index(ARRAY[$1::uuid])', [id]);
  return rows.length;
}
/** Rebuilds indexes stored before persistent AVL trees (index_version 2). */
export async function rebuildIndexes(client) {
  const store = new PostgresStore(null);
  const { rows } = await client.query(
    'SELECT t.* FROM oc_timelines t WHERE t.index_version<2 AND t.comparison IS NULL',
  );
  for (const timeline of rows)
    await store.replace(client, timeline.id, await store.branchDocument(client, timeline), {
      touch: false,
    });
  await client.query('UPDATE oc_timelines SET index_version=2 WHERE comparison IS NOT NULL');
  return rows.length;
}
/**
 * Replays recorded patches onto a snapshot in one pass. Settings come from the latest patch
 * that changed them. Events end in time order (then ID), like a document read from the index.
 */
export function replayPatches(snapshot, patches) {
  const start = validateDocument(snapshot);
  let settings = settingsOf(start);
  const events = new Map(start.events.map((e) => [e.id, e]));
  const durations = new Map((start.durations ?? []).map((d) => [d.id, d]));
  const links = new Map((start.relationships ?? []).map((r) => [relationshipKey(r), r]));
  // Each step has applyPatch's semantics, touching only what the patch names, except that
  // deletions rescan the durations and links that might refer to the deleted entities.
  for (const patch of patches) {
    if (patch.settings) settings = patch.settings;
    const lastTimes = new Map();
    let deletions = false;
    for (const change of patch.changes) {
      const previous = events.get(change.id);
      if (previous) lastTimes.set(change.id, previous.time);
      if (change.event) events.set(change.id, change.event);
      else deletions = events.delete(change.id) || deletions;
    }
    const changed = [];
    for (const change of patch.durationChanges ?? []) {
      if (change.duration) {
        durations.set(change.id, change.duration);
        changed.push(change.duration);
      } else deletions = durations.delete(change.id) || deletions;
    }
    const fixed = fixMissingAnchors(
      deletions ? [...durations.values()] : changed,
      (moment) => events.has(moment),
      (moment) => lastTimes.get(moment),
    );
    for (const d of fixed) durations.set(d.id, d);
    const touched = [];
    for (const change of patch.relationshipChanges ?? []) {
      const relationship = { a: change.a, b: change.b },
        key = relationshipKey(relationship);
      if (change.related) {
        links.set(key, relationship);
        touched.push(key);
      } else links.delete(key);
    }
    const exists = (ref) =>
      'moment' in ref ? events.has(ref.moment) : durations.has(ref.duration);
    for (const key of deletions ? [...links.keys()] : touched) {
      const r = links.get(key);
      if (r && !(exists(r.a) && exists(r.b))) links.delete(key);
    }
  }
  const times = new Map([...events.values()].map((e) => [e.id, Q.parse(e.time)]));
  const order = [...events.values()].sort(
    (a, b) => times.get(a.id).compare(times.get(b.id)) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );
  return validateDocument({
    ...settings,
    events: order,
    ...(durations.size ? { durations: [...durations.values()] } : {}),
    ...(links.size ? { relationships: [...links.values()] } : {}),
  });
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
/**
 * A document's catalogue text, as oc_event_text in schema.sql builds it from the index:
 * durations (their resolved `bands`) by start, then ID ("C" order), then moments in time
 * order, then ID ("C" order), as `tree` (indexedNodes) holds them.
 */
function eventSearchText(document, bands, tree) {
  const text = [];
  let length = 0;
  const byId = new Map((document.durations ?? []).map((d) => [d.id, d]));
  const starts = [...bands]
    .map((band) => ({ band, first: Q.parse(band.first) }))
    .sort((a, b) => a.first.compare(b.first) || (a.band.id < b.band.id ? -1 : 1));
  for (const duration of starts.map(({ band }) => byId.get(band.id)).filter(Boolean))
    for (const key of ['title', 'description']) {
      if (typeof duration.metadata[key] === 'string') {
        const part = duration.metadata[key].slice(0, 4096);
        text.push(part);
        length += part.length;
      }
      if (length >= 1048576) return text.join(' ').slice(0, 1048576);
    }
  const events = [...tree.nodes]
    .sort((a, b) => a.id - b.id)
    .flatMap((n) => [...n.events].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)));
  for (const event of events) {
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
