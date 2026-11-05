// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
/**
 * IndexNow (#389): telling search engines that take it (Bing, Yandex, Naver, Seznam and
 * others, through api.indexnow.org) which public pages were added, changed or removed, so
 * they visit them soon rather than at their next crawl. Off unless INDEXNOW_KEY holds a key,
 * which the site serves at /<key>.txt to prove the submissions are its own.
 *
 * About once a minute the platform reads the addresses the sitemap lists (public timelines,
 * and the profiles of accounts that own one) and compares them with what it read before: a
 * timeline made public or created public, saved, renamed (both addresses), made private or
 * deleted (its old address, which was public, so engines drop it), and a profile that gains or
 * loses a public timeline. The pages of moments and durations go too (#453), for the
 * timelines whose entities the sitemap lists: those a save added, changed, removed or linked,
 * read from saved history, and all of a timeline's at an address it newly has. The addresses
 * are sent in batches, each address at most once an hour (a timeline that a log stream saves
 * all day is sent hourly), in the background, never holding up a request. A timeline that was
 * never public is never sent.
 */
import { profilePath, timelinePath } from '../dist/core.mjs';
import { differences } from './history.mjs';
import { PostgresStore } from './store.mjs';

/** A setting the server cannot start with. */
export class IndexNowError extends Error {}

/** Where submissions go: the shared endpoint, which passes them on to every participant. */
export const INDEXNOW_ENDPOINT = 'https://api.indexnow.org/indexnow';
/** The most addresses one submission may carry (the protocol's limit). */
export const BATCH_LIMIT = 10000;
/** How often the addresses are compared and the changed ones sent. */
export const POLL_INTERVAL = 60 * 1000;
/** The shortest time between two submissions of one address. */
export const RESUBMIT_AFTER = 60 * 60 * 1000;
/** How long a submission may take before it is abandoned. */
export const SUBMIT_TIMEOUT = 10 * 1000;
/** The longest wait after failed submissions, which double the wait from a minute. */
const MAX_BACKOFF = 60 * 60 * 1000;
const KEY = /^[A-Za-z0-9-]{8,128}$/;

/**
 * The IndexNow key (INDEXNOW_KEY), or null when it is not set and IndexNow is off.
 * @throws {IndexNowError} when it is not 8 to 128 letters, digits and dashes
 */
export function indexNowKey(env = process.env) {
  const key = (env.INDEXNOW_KEY ?? '').trim();
  if (!key) return null;
  if (!KEY.test(key))
    throw new IndexNowError(
      'INDEXNOW_KEY must be 8 to 128 letters, digits and dashes, such as the output of `openssl rand -hex 16`.',
    );
  return key;
}
/** The key when the request is for its file, /<key>.txt; null otherwise or when off. */
export function indexNowKeyFile(pathname, env = process.env) {
  let key = null;
  try {
    key = indexNowKey(env);
  } catch {
    // Refused at startup.
  }
  return key && pathname === `/${key}.txt` ? key : null;
}

/**
 * The most moments and durations a timeline's entity pages may list (#335):
 * SITEMAP_TIMELINE_ENTITIES, 5,000 unless set (1 to 45,000). A timeline with more moments
 * than this is left out of the entity sitemap altogether (a log import can have millions,
 * which are not pages anyone searches for one by one); one with fewer moments lists its
 * first this many entities, durations first.
 */
export function timelineEntityLimit(env = process.env) {
  const limit = Math.floor(Number(env.SITEMAP_TIMELINE_ENTITIES));
  return limit >= 1 && limit <= 45000 ? limit : 5000;
}
/**
 * SQL for whether a public timeline `t`'s moments and durations are listed (#335), with the
 * most moments a listed timeline may have as `limit` (a parameter's placeholder): without
 * sensitive-content labels (their previews show nothing of them), not a comparison (its
 * entities are its sources') or a copy still being prepared, and with at most that many
 * moments (event_count is kept on the row, so this reads no entities).
 */
export const entitiesListed = (limit) => `t.content_labels='{}' AND t.moderator_labels='{}'
  AND t.comparison IS NULL AND t.preparing_revision_id IS NULL AND t.event_count <= ${limit}`;
// The addresses the sitemap lists (platform/lib/sitemap.js): every public timeline, whether
// its entities are listed, and each account that owns one and is not disabled, for its profile.
const PUBLIC_PAGES = `SELECT t.id, t.slug, u.username AS owner, u.is_disabled AS disabled, t.updated_at,
  t.head_revision_id AS head, (${entitiesListed('$1')}) AS listed
  FROM oc_timelines t JOIN oc_users u ON u.id=t.owner_id WHERE t.visibility='public'`;

/**
 * The public pages as one read sees them: each public timeline's address, last change, head
 * revision and whether its entities are listed, by id, and the profiles listed.
 * @returns {{timelines: Map<string, {path: string, owner: string, updated: number,
 *   head?: string, listed?: boolean}>, profiles: Set<string>}}
 */
export function snapshot(rows) {
  const timelines = new Map(),
    profiles = new Set();
  for (const row of rows) {
    timelines.set(row.id, {
      path: timelinePath(row),
      owner: row.owner,
      updated: new Date(row.updated_at).getTime(),
      head: row.head ?? undefined,
      listed: !!row.listed,
    });
    if (!row.disabled) profiles.add(profilePath(row.owner));
  }
  return { timelines, profiles };
}
/**
 * The paths that changed between two snapshots: timelines added, saved (a new last change or
 * head revision: a sparse save moves its last change at most once a minute), moved or
 * removed (the old and the new address), and profiles that appeared, disappeared or whose public timelines
 * were added, moved or removed.
 */
export function changedPaths(before, after) {
  const paths = new Set(),
    touched = new Set();
  for (const [id, now] of after.timelines) {
    const then = before.timelines.get(id);
    if (!then) {
      paths.add(now.path);
      touched.add(profilePath(now.owner));
    } else if (then.path !== now.path) {
      paths.add(then.path);
      paths.add(now.path);
      touched.add(profilePath(then.owner));
      touched.add(profilePath(now.owner));
    } else if (then.updated !== now.updated || then.head !== now.head) paths.add(now.path);
  }
  for (const [id, then] of before.timelines)
    if (!after.timelines.has(id)) {
      paths.add(then.path);
      touched.add(profilePath(then.owner));
    }
  // Profiles listed before or after (never a disabled account's that was not), whose listing
  // or public timelines changed.
  for (const path of new Set([...before.profiles, ...after.profiles]))
    if (touched.has(path) || before.profiles.has(path) !== after.profiles.has(path))
      paths.add(path);
  return paths;
}

/**
 * The timelines whose entity pages may have changed between two snapshots, of those whose
 * entities are listed now: `all` at an address they did not list entities at before (newly
 * public or listed, or moved), and `saved`, [id, from, to] head revisions, for the others
 * saved since.
 */
export function entityChanges(before, after) {
  const all = [],
    saved = [];
  for (const [id, now] of after.timelines) {
    if (!now.listed) continue;
    const then = before.timelines.get(id);
    if (!then?.listed || then.path !== now.path) all.push(id);
    else if (then.head && now.head && then.head !== now.head) saved.push([id, then.head, now.head]);
  }
  return { all, saved };
}
/** The page of a timeline's moment or duration, under the timeline's `path`. */
export function entityPath(path, kind, id) {
  return `${path}/${kind === 'moment' ? 'moments' : 'durations'}/${encodeURIComponent(id)}`;
}
/**
 * The moments and durations that differ between two revisions kept as rows, as
 * { kind, id }: those added, changed or removed, and both ends of each relationship added or
 * removed (their pages list what they relate to). At most `limit`; none when either revision's
 * content is not kept (a timeline that keeps no saved history, or one pruned since).
 */
export async function changedEntities(client, from, to, limit) {
  const found = new Map();
  const add = (kind, id) => found.size < limit && found.set(`${kind}\0${id}`, { kind, id });
  const pages = await differences(client, from, to);
  if (!pages) return [];
  for await (const page of pages) {
    for (const change of page)
      if (change.kind === 'moments') add('moment', change.key);
      else if (change.kind === 'durations') add('duration', change.key);
      else if (change.kind === 'relationships') {
        add(change.key.a_kind, change.key.a_id);
        add(change.key.b_kind, change.key.b_id);
      }
    if (found.size >= limit) break;
  }
  return [...found.values()];
}

/**
 * Submits a site's changed public pages to IndexNow. `poll` compares the public pages with the
 * last read and queues what changed; `flush` sends what is queued and due. The first poll
 * only takes the baseline. Not shared between processes: each platform process that has the
 * key keeps its own (one process is usual).
 */
export class IndexNow {
  /**
   * @param {import('pg').Pool} pool
   * @param {{origin: string, key: string, fetch?: typeof fetch, log?: Console,
   *   endpoint?: string, now?: () => number}} options `fetch` is replaced in tests, which
   *   never reach the network
   */
  constructor(pool, { origin, key, fetch = globalThis.fetch, log = console, endpoint, now }) {
    this.pool = pool;
    this.origin = origin.replace(/\/+$/, '');
    this.key = key;
    this.fetch = fetch;
    this.log = log;
    this.endpoint = endpoint ?? INDEXNOW_ENDPOINT;
    this.now = now ?? Date.now;
    this.store = new PostgresStore(pool);
    /** The last snapshot, or null before the first poll. */
    this.known = null;
    /** The last link change read (oc_link_changes; #422), or null before the first poll. */
    this.linkMark = null;
    /** Paths waiting to be sent, in the order they changed. */
    this.pending = new Set();
    /** When each recently sent path was sent. */
    this.sent = new Map();
    this.backoff = 0;
    this.retryAt = 0;
  }
  /**
   * Reads the public pages and queues those that changed since the last poll, with the
   * pages of the moments and durations that changed in timelines whose entities are listed,
   * and the pages of both ends of links between timelines added or removed since (#422).
   */
  async poll() {
    const limit = timelineEntityLimit();
    const { rows } = await this.pool.query(PUBLIC_PAGES, [limit]);
    const next = snapshot(rows);
    const links = await this.pool.query(
      `SELECT id::text,timeline_id,kind,entity_id FROM oc_link_changes
      WHERE $1::bigint IS NULL OR id>$1 ORDER BY id DESC LIMIT 10000`,
      [this.linkMark],
    );
    if (this.known) {
      for (const path of changedPaths(this.known, next)) this.pending.add(path);
      await this.queueEntities(entityChanges(this.known, next), next, limit);
      // A whole timeline's end is its own page, which lists the links to it; an entity's,
      // its page where the timeline's entities are listed.
      for (const change of [...links.rows].reverse()) {
        const timeline = next.timelines.get(change.timeline_id);
        if (!timeline) continue;
        if (change.kind === 'timeline') this.pending.add(timeline.path);
        else if (timeline.listed)
          this.pending.add(entityPath(timeline.path, change.kind, change.entity_id));
      }
    }
    // The newest change read (the first, newest first); past 10,000, the older are skipped.
    this.linkMark = links.rows.length
      ? links.rows.reduce((a, r) => (BigInt(r.id) > BigInt(a) ? r.id : a), '0')
      : (this.linkMark ?? '0');
    this.known = next;
  }
  /** Queues the entity pages of `changes` (see entityChanges), at most `limit` a timeline. */
  async queueEntities({ all, saved }, next, limit) {
    const queue = (id, entities) => {
      for (const entity of entities)
        this.pending.add(entityPath(next.timelines.get(id).path, entity.kind, entity.id));
    };
    for (const id of all)
      queue(
        id,
        // Gone, private or being prepared since the read: its next poll sees that.
        await this.store.entityKeys(id, limit).catch((error) => {
          if (error.status === 404 || error.status === 409) return [];
          throw error;
        }),
      );
    if (!saved.length) return;
    const client = await this.pool.connect();
    try {
      for (const [id, from, to] of saved) queue(id, await changedEntities(client, from, to, limit));
    } finally {
      client.release();
    }
  }
  /**
   * Sends the queued paths that are due, in batches of at most BATCH_LIMIT: a path sent less
   * than RESUBMIT_AFTER ago waits. A submission that fails for a reason that may pass (no
   * answer, 429 or a server error) is tried again after a wait that doubles; one refused for
   * good (a bad key, addresses of another host) is logged and dropped.
   * @returns {Promise<string[]>} the addresses accepted
   */
  async flush() {
    const now = this.now();
    for (const [path, at] of this.sent) if (now - at >= RESUBMIT_AFTER) this.sent.delete(path);
    if (now < this.retryAt) return [];
    const due = [...this.pending].filter((path) => !this.sent.has(path));
    const accepted = [];
    for (let i = 0; i < due.length; i += BATCH_LIMIT) {
      const batch = due.slice(i, i + BATCH_LIMIT);
      const outcome = await this.submit(batch.map((path) => this.origin + path));
      if (outcome === 'retry') {
        this.backoff = Math.min(MAX_BACKOFF, this.backoff ? this.backoff * 2 : POLL_INTERVAL);
        this.retryAt = this.now() + this.backoff;
        break;
      }
      this.backoff = 0;
      for (const path of batch) {
        this.pending.delete(path);
        if (outcome === 'sent') {
          this.sent.set(path, now);
          accepted.push(this.origin + path);
        }
      }
    }
    return accepted;
  }
  /** One submission: 'sent', 'dropped' or 'retry'. */
  async submit(urlList) {
    const { host } = new URL(this.origin);
    try {
      const response = await this.fetch(this.endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json; charset=utf-8' },
        body: JSON.stringify({
          host,
          key: this.key,
          keyLocation: `${this.origin}/${this.key}.txt`,
          urlList,
        }),
        signal: AbortSignal.timeout(SUBMIT_TIMEOUT),
      });
      await response.body?.cancel?.();
      if (response.ok) {
        this.log.info?.(`IndexNow: submitted ${urlList.length} address(es).`);
        return 'sent';
      }
      if (response.status === 429 || response.status >= 500) {
        this.log.warn(`IndexNow: answered ${response.status}; trying again later.`);
        return 'retry';
      }
      this.log.error(
        `IndexNow: refused ${urlList.length} address(es) with ${response.status}; check INDEXNOW_KEY and APP_ORIGIN.`,
      );
      return 'dropped';
    } catch (error) {
      this.log.warn(`IndexNow: no answer (${error.message}); trying again later.`);
      return 'retry';
    }
  }
  /** A poll then a flush; errors are logged, never thrown. */
  async run() {
    try {
      await this.poll();
      await this.flush();
    } catch (error) {
      this.log.error('IndexNow failed:', error);
    }
  }
}

/** Whether an origin is this machine (localhost or a loopback address). */
export function localOrigin(origin) {
  const host = new URL(origin).hostname.replace(/^\[|\]$/g, '');
  return (
    host === 'localhost' || host.endsWith('.localhost') || /^127\./.test(host) || host === '::1'
  );
}
/**
 * Starts IndexNow in the background, as retention and standing run: a poll and flush every
 * POLL_INTERVAL, the first (the baseline) a few seconds after startup, never two at once;
 * not at all for an origin on this machine (localOrigin).
 * @returns {() => void} stops it
 */
export function startIndexNow(pool, options, every = POLL_INTERVAL) {
  // Engines could not read a key file on this machine's own address, and tests' servers are
  // there: nothing is sent for them.
  if (localOrigin(options.origin)) {
    (options.log ?? console).warn(
      'IndexNow is off: APP_ORIGIN is this machine, which search engines cannot reach.',
    );
    return () => {};
  }
  const indexNow = new IndexNow(pool, options);
  let running = null;
  const run = () => {
    running ??= indexNow.run().finally(() => (running = null));
  };
  const first = setTimeout(run, 5000),
    timer = setInterval(run, every);
  first.unref?.();
  timer.unref?.();
  return () => {
    clearTimeout(first);
    clearInterval(timer);
  };
}
