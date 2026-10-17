// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
/**
 * Live log streams into timelines: the queues the syslog receiver (syslog-receiver.mjs) and
 * the journald follower (journald-receiver.mjs) share. Each stream reads its own messages
 * into moments and routes them; this sends them on.
 */
import { TimelineWriter, BATCH_LIMIT, temporary } from './timeline-writer.mjs';

const sleep = (ms) => new Promise((resume) => setTimeout(resume, ms));

/**
 * One queue per timeline. Moments are sent in batches through `PUT /changes` with the
 * timeline's current revision (timeline-writer.mjs); a 409 (someone else saved) refetches
 * it and resends. A moment's ID is fixed when it is read, so a resent batch overwrites
 * rather than duplicates. Temporary failures keep the batch and back off; permanent ones
 * (no access, missing timeline, invalid moment, storage full) drop it.
 */
export class MomentIngest {
  /**
   * @param {object} options
   * @param {string} options.api the server's origin
   * @param {string} options.key an API key with timelines:write
   * @param {{timelines: string[]}} options.routes the stream's routes; `timelines` lists every
   *   timeline they can choose, each given a queue up front
   * @param {typeof fetch} [options.fetcher]
   * @param {number} [options.flushMs] how long moments wait to be batched with others
   * @param {number} [options.queueLimit] the most moments a queue holds; the oldest are dropped
   *   (and counted) beyond it
   * @param {Console} [options.log]
   * @param {string} [options.label] the prefix of its log lines
   */
  constructor({
    api,
    key,
    routes,
    fetcher = fetch,
    flushMs = 1000,
    queueLimit = 10000,
    log = console,
    label = 'log',
  }) {
    this.writer = new TimelineWriter({ api, key, fetcher });
    this.routes = routes;
    this.flushMs = flushMs;
    this.queueLimit = queueLimit;
    this.log = log;
    // How its log lines start: "syslog: …", "journald: …".
    this.label = label;
    // Counters for the stream's status output: messages received, unreadable, matching no
    // route, moments queued (once per timeline), sent, dropped from a full queue, and refused
    // by the server.
    this.stats = {
      received: 0,
      invalid: 0,
      unmatched: 0,
      queued: 0,
      sent: 0,
      dropped: 0,
      rejected: 0,
    };
    this.queues = new Map(
      routes.timelines.map((id) => [id, { moments: [], busy: false, timer: null }]),
    );
    this.closed = false;
  }
  /**
   * Queues `moment` for each of `targets` (timeline IDs its routes chose). A queue of 500 or
   * more is flushed at once; a smaller one after `flushMs`, so a trickle of messages is sent
   * in batches rather than one save each.
   * @returns {string[]} `targets`
   */
  enqueue(targets, moment) {
    if (!targets.length) this.stats.unmatched++;
    for (const timeline of targets) {
      const queue = this.queues.get(timeline);
      queue.moments.push(moment);
      this.stats.queued++;
      if (queue.moments.length > this.queueLimit) {
        queue.moments.shift();
        this.stats.dropped++;
      }
      // A full batch goes at once, unless the timeline is failing: then its backoff timer
      // stands, rather than every new message retrying a struggling server.
      this.schedule(timeline, queue.moments.length >= 500 && !queue.failures ? 0 : this.flushMs);
    }
    return targets;
  }
  /** Whether every queue is empty, with nothing being sent. */
  get idle() {
    return [...this.queues.values()].every((queue) => !queue.moments.length && !queue.busy);
  }
  /** Called after each batch is settled (sent, or refused for good); subclasses may hook it. */
  settled() {}
  /**
   * Arranges a flush of `timeline` after `delay` ms. A timer already set is kept unless the
   * new delay is 0, which replaces it; once closing (drain), every flush is immediate.
   */
  schedule(timeline, delay) {
    const queue = this.queues.get(timeline);
    if (this.closed && delay > 0) delay = 0;
    if (queue.timer !== null && delay > 0) return;
    clearTimeout(queue.timer);
    queue.timer = setTimeout(() => {
      queue.timer = null;
      void this.flush(timeline);
    }, delay);
  }
  /**
   * Sends up to BATCH_LIMIT moments from the front of `timeline`'s queue, one flush per queue
   * at a time (`busy`). A temporary failure puts the batch back at the front and backs off:
   * the server's Retry-After for a 429, else 2, 4, 8, 16, then 30 seconds. A permanent one
   * drops the batch. Whatever is left is scheduled again.
   */
  async flush(timeline) {
    const queue = this.queues.get(timeline);
    if (queue.busy || !queue.moments.length) return;
    queue.busy = true;
    const batch = queue.moments.splice(0, BATCH_LIMIT);
    let delay = 0;
    try {
      await this.writer.send(timeline, { moments: batch });
      this.stats.sent += batch.length;
    } catch (error) {
      const status = error.status;
      if (temporary(status)) {
        // Temporary: keep the batch at the front and try again later.
        queue.moments.unshift(...batch);
        while (queue.moments.length > this.queueLimit) {
          queue.moments.shift();
          this.stats.dropped++;
        }
        queue.failures = (queue.failures ?? 0) + 1;
        delay =
          status === 429 && Number(error.retryAfter) > 0
            ? Number(error.retryAfter) * 1000
            : Math.min(30000, 1000 * 2 ** Math.min(queue.failures, 5));
        this.log.warn(
          `${this.label}: timeline ${timeline} unavailable (${status ?? error.message}); retrying in ${delay / 1000}s.`,
        );
      } else {
        // Permanent (no access, missing timeline, invalid moment, storage full): drop it.
        this.stats.rejected += batch.length;
        this.log.error(
          `${this.label}: timeline ${timeline} refused ${batch.length} moments (${status}: ${error.value?.error ?? 'request failed'}).`,
        );
      }
    } finally {
      if (delay === 0) queue.failures = 0;
      queue.busy = false;
      if (delay === 0) this.settled();
      if (queue.moments.length)
        this.schedule(timeline, delay || (queue.moments.length >= 500 ? 0 : this.flushMs));
    }
  }
  /**
   * Sends everything still queued, waiting at most `timeout` milliseconds; for shutdown.
   * @returns {Promise<boolean>} whether everything was sent (or refused) in time
   */
  async drain(timeout = 10000) {
    this.closed = true;
    const until = Date.now() + timeout;
    while (Date.now() < until) {
      const pending = [...this.queues].filter(([, q]) => q.moments.length || q.busy);
      if (!pending.length) return true;
      // Batches waiting for their flush interval go now; ones backing off after a failure
      // keep their delay rather than retrying a struggling server every few milliseconds.
      for (const [timeline, queue] of pending)
        if (!queue.busy && (queue.timer === null || !queue.failures)) {
          clearTimeout(queue.timer);
          queue.timer = null;
          void this.flush(timeline);
        }
      await sleep(50);
    }
    return false;
  }
  /** Cancels the queues' timers; what is still queued is not sent. */
  close() {
    for (const queue of this.queues.values()) clearTimeout(queue.timer);
  }
}
