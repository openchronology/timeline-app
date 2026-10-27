// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
/**
 * Adds moments (and durations) to timelines through the API with an API key, shared by the
 * syslog receiver and the log importer. Each save sends the timeline's current revision and
 * settings to `PUT /api/timelines/<id>/changes`; a 409 (someone else saved) fetches the new
 * revision and sends again. Other failures are thrown with their status for the caller to
 * retry (429, 5xx, unreachable) or give up (anything else).
 */

/** The changes endpoint accepts at most 5000 moments and durations per save. */
export const BATCH_LIMIT = 5000;
/** Requests are limited to 16 MiB; batches stay well under it. */
export const BATCH_BYTES = 12 * 1024 * 1024;
/** An API key's shape (och_key_<id>_<secret>), checked before any request is made. */
const KEY = /^och_key_[a-f0-9]{32}_[a-f0-9]{64}$/;

/**
 * Saves adapt their size to the server (send): a save taking SLOW_SAVE ms or more, or one the
 * server stopped as too slow (503, 504), halves the next ones, down to BATCH_MIN entries; a
 * full one taking under FAST_SAVE ms lets them grow again, up to BATCH_LIMIT. A save's time
 * grows with its timeline, and the server stops any statement after 30 s.
 */
export const BATCH_MIN = 64;
export const SLOW_SAVE = 8000;
export const FAST_SAVE = 2000;
/** Statuses of a save the server gave up on as too slow: a smaller one may succeed. */
const TOO_SLOW = new Set([503, 504]);

/**
 * Whether a failed save is worth retrying later: the server unreachable (no status), a
 * conflict save could not settle, rate limiting, or a server error.
 */
export const temporary = (status) =>
  status === undefined || status === 409 || status === 429 || status >= 500;

/**
 * A client for adding entries to timelines with an API key (timelines:write). It remembers,
 * per timeline, the revision and settings to send back (`states`) and the save size that suits
 * it (`limits`).
 */
export class TimelineWriter {
  /**
   * @param {object} options
   * @param {string} options.api the server's origin (OCH_API_URL)
   * @param {string} options.key the API key (OCH_API_KEY)
   * @param {typeof fetch} [options.fetcher] for tests
   * @param {() => number} [options.now] a millisecond clock, for timing saves
   * @throws {Error} for an origin that is not http(s) or a malformed key
   */
  constructor({ api, key, fetcher = fetch, now = () => performance.now() }) {
    if (!/^https?:\/\//.test(api ?? '')) throw new Error('OCH_API_URL must be an http(s) origin.');
    if (!KEY.test(key ?? ''))
      throw new Error('OCH_API_KEY must be an OpenChronology API key (och_key_...).');
    this.api = api.replace(/\/+$/, '');
    this.key = key;
    this.fetcher = fetcher;
    this.now = now;
    this.states = new Map();
    this.limits = new Map();
  }
  /** The most entries one save to `timeline` carries now (see SLOW_SAVE). */
  limit(timeline) {
    return this.limits.get(timeline) ?? BATCH_LIMIT;
  }
  /**
   * One API request to `/api/<path>` with the key: redirects refused (a key is never sent on
   * to another host), a 60-second timeout. Never throws for an HTTP status; a body that is
   * not JSON reads as {}. Network failures and timeouts throw.
   * @returns {Promise<{status: number, value: object, retryAfter: string|null|undefined}>}
   */
  async request(path, options = {}) {
    const response = await this.fetcher(this.api + '/api/' + path, {
      ...options,
      redirect: 'error',
      signal: AbortSignal.timeout(60000),
      headers: {
        Authorization: 'Bearer ' + this.key,
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      },
    });
    const value = await response.json().catch(() => ({}));
    return { status: response.status, value, retryAfter: response.headers?.get?.('retry-after') };
  }
  /** The timeline's revision and settings, which a save must send back unchanged. */
  async load(timeline) {
    const { status, value } = await this.request('timelines/' + timeline);
    if (status !== 200) return { status, value };
    const settings = { format: 'openchronology', version: 1 };
    for (const key of [
      'title',
      'description',
      'presentation',
      'plugins',
      'tags',
      'image',
      'assets',
    ])
      if (value[key] !== null && value[key] !== undefined) settings[key] = value[key];
    return {
      status,
      state: {
        revision: value.revision,
        settings,
        // Its size, which decides how large a save the server applies in place.
        eventCount: Number(value.event_count ?? 0),
        storageBytes: Number(value.storage_bytes ?? 0),
        // Whether it keeps saved history at all, and whether as rows yet (its first save
        // starts them).
        keepHistory: value.keep_history !== false,
        history: value.history_since !== null && value.history_since !== undefined,
      },
    };
  }
  /** The timeline's moment count and document size as last seen (loading it if needed). */
  async size(timeline) {
    let state = this.states.get(timeline);
    if (!state) {
      const loaded = await this.load(timeline);
      if (!loaded.state) throw Object.assign(new Error('load'), loaded);
      state = loaded.state;
      this.states.set(timeline, state);
    }
    return {
      count: state.eventCount,
      bytes: state.storageBytes,
      history: state.history,
      keepHistory: state.keepHistory,
    };
  }
  /** Forgets a timeline's revision, so the next save fetches it again. */
  forget(timeline) {
    this.states.delete(timeline);
  }
  /**
   * Saves one batch, in saves of at most limit(timeline) entries each, moments before
   * durations (which may name them): a save the server stops as too slow is sent again
   * halved. Resolves with the last save's answer when all are saved; otherwise throws an
   * error carrying `status` (none when the server could not be reached), the response
   * `value` and `retryAfter`. Saves already made stay (sending them again overwrites them
   * with the same).
   */
  async send(timeline, { moments = [], durations = [] }) {
    const items = [
      ...moments.map((event) => ({ event })),
      ...durations.map((duration) => ({ duration })),
    ];
    let offset = 0,
      value;
    do {
      const size = Math.min(this.limit(timeline), items.length - offset);
      const part = items.slice(offset, offset + size);
      const started = this.now();
      try {
        value = await this.save(timeline, {
          moments: part.filter((p) => p.event).map((p) => p.event),
          durations: part.filter((p) => p.duration).map((p) => p.duration),
        });
      } catch (error) {
        if (!TOO_SLOW.has(error.status) || size <= BATCH_MIN) throw error;
        this.limits.set(timeline, Math.max(BATCH_MIN, Math.floor(size / 2)));
        continue;
      }
      const took = this.now() - started;
      if (took >= SLOW_SAVE) this.limits.set(timeline, Math.max(BATCH_MIN, Math.floor(size / 2)));
      else if (took < FAST_SAVE && size >= this.limit(timeline))
        this.limits.set(timeline, Math.min(BATCH_LIMIT, Math.ceil(size * 1.5)));
      offset += size;
    } while (offset < items.length);
    return value;
  }
  /** One save (see send). */
  async save(timeline, { moments, durations }) {
    for (let attempt = 0; ; attempt++) {
      let state = this.states.get(timeline);
      if (!state) {
        const loaded = await this.load(timeline);
        if (!loaded.state) throw Object.assign(new Error('load'), loaded);
        state = loaded.state;
        this.states.set(timeline, state);
      }
      const { status, value, retryAfter } = await this.request(`timelines/${timeline}/changes`, {
        method: 'PUT',
        body: JSON.stringify({
          revision: state.revision,
          settings: state.settings,
          changes: moments.map((event) => ({ id: event.id, event })),
          ...(durations.length
            ? { durationChanges: durations.map((duration) => ({ id: duration.id, duration })) }
            : {}),
        }),
      });
      // Saved: the answer carries the new revision, so the next save needs no reload.
      if (status === 200) {
        state.revision = value.revision;
        state.eventCount = Number(value.event_count ?? state.eventCount + moments.length);
        state.storageBytes = Number(value.storage_bytes ?? state.storageBytes);
        return value;
      }
      this.forget(timeline);
      // Someone else saved: fetch the new revision (and settings) and send again.
      if (status === 409 && attempt < 5) continue;
      throw Object.assign(new Error('save'), { status, value, retryAfter });
    }
  }
  /** The key owner's storage use and quota (`GET /api/timelines/usage`), or null if unknown. */
  async usage() {
    const { status, value } = await this.request('timelines/usage');
    return status === 200 ? value : null;
  }
}
