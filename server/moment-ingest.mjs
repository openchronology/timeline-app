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
  /** Queues `moment` for each of `targets` (timeline IDs its routes chose). */
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
      this.schedule(timeline, queue.moments.length >= 500 ? 0 : this.flushMs);
    }
    return targets;
  }
  /** Whether every queue is empty, with nothing being sent. */
  get idle() {
    return [...this.queues.values()].every((queue) => !queue.moments.length && !queue.busy);
  }
  /** Called after each batch is settled (sent, or refused for good); subclasses may hook it. */
  settled() {}
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
  /** Sends everything still queued, waiting at most `timeout` milliseconds. */
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
  close() {
    for (const queue of this.queues.values()) clearTimeout(queue.timer);
  }
}
