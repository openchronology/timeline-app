// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
/**
 * Receives syslog over UDP and TCP and appends each message as a moment to the timelines
 * its routes choose, through the OpenChronology API with an API key (docs/syslog.md).
 *
 *   OCH_API_URL=https://timescale.info OCH_API_KEY=och_key_... \
 *   SYSLOG_ROUTES=./syslog-routes.json node server/syslog-receiver.mjs
 */
import { createSocket } from 'node:dgram';
import { createServer } from 'node:net';
import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import {
  compileRoutes,
  parseSyslog,
  syslogFrames,
  syslogMoment,
  MAX_MESSAGE_BYTES,
} from './syslog.mjs';
import { parseZone } from './log-time.mjs';
import { TimelineWriter, BATCH_LIMIT, temporary } from './timeline-writer.mjs';

const sleep = (ms) => new Promise((resume) => setTimeout(resume, ms));

/**
 * One queue per timeline. Moments are sent in batches through `PUT /changes` with the
 * timeline's current revision (timeline-writer.mjs); a 409 (someone else saved) refetches
 * it and resends.
 */
export class SyslogIngest {
  constructor({
    api,
    key,
    routes,
    fetcher = fetch,
    flushMs = 1000,
    queueLimit = 10000,
    log = console,
    timezone = 'UTC',
  }) {
    this.writer = new TimelineWriter({ api, key, fetcher });
    this.routes = routes;
    // Classic BSD timestamps carry no zone: read them in this one (UTC unless set).
    this.zone = parseZone(timezone);
    this.flushMs = flushMs;
    this.queueLimit = queueLimit;
    this.log = log;
    this.instance = randomBytes(4).toString('hex');
    this.sequence = 0;
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
  /** Parses, routes and queues one message; returns the timelines it went to. */
  accept(text, received = Date.now()) {
    this.stats.received++;
    let entry;
    try {
      entry = parseSyslog(text, received, { zone: this.zone });
    } catch {
      this.stats.invalid++;
      return [];
    }
    const targets = this.routes.route(entry);
    if (!targets.length) this.stats.unmatched++;
    // IDs are fixed when received, so a resent batch overwrites rather than duplicates.
    const id = `syslog:${received.toString(36)}.${this.instance}.${(this.sequence++).toString(36)}`;
    for (const timeline of targets) {
      const queue = this.queues.get(timeline);
      queue.moments.push(syslogMoment(entry, id));
      this.stats.queued++;
      if (queue.moments.length > this.queueLimit) {
        queue.moments.shift();
        this.stats.dropped++;
      }
      this.schedule(timeline, queue.moments.length >= 500 ? 0 : this.flushMs);
    }
    return targets;
  }
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
          `syslog: timeline ${timeline} unavailable (${status ?? error.message}); retrying in ${delay / 1000}s.`,
        );
      } else {
        // Permanent (no access, missing timeline, invalid moment, storage full): drop it.
        this.stats.rejected += batch.length;
        this.log.error(
          `syslog: timeline ${timeline} refused ${batch.length} moments (${status}: ${error.value?.error ?? 'request failed'}).`,
        );
      }
    } finally {
      if (delay === 0) queue.failures = 0;
      queue.busy = false;
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

/** UDP and TCP listeners feeding an ingest; resolves once both are listening. */
export async function listenSyslog(
  ingest,
  { host = '127.0.0.1', port = 5514, maxConnections = 256 } = {},
) {
  const udp = createSocket({ type: host.includes(':') ? 'udp6' : 'udp4', recvBufferSize: 1 << 20 });
  udp.on('message', (message) => {
    if (message.length <= MAX_MESSAGE_BYTES) ingest.accept(message.toString('utf8'));
    else ingest.stats.invalid++;
  });
  const tcp = createServer({ noDelay: true }, (socket) => {
    socket.setTimeout(300000, () => socket.destroy());
    const frames = syslogFrames((text) => ingest.accept(text));
    socket.on('data', (chunk) => {
      try {
        frames(chunk);
      } catch {
        ingest.stats.invalid++;
        socket.destroy();
      }
    });
    socket.on('error', () => {});
  });
  tcp.maxConnections = maxConnections;
  await Promise.all([
    new Promise((resolve, reject) => {
      udp.once('error', reject);
      udp.bind(port, host, resolve);
    }),
    new Promise((resolve, reject) => {
      tcp.once('error', reject);
      tcp.listen(port, host, resolve);
    }),
  ]);
  return {
    udp: udp.address().port,
    tcp: tcp.address().port,
    async close() {
      udp.close();
      await new Promise((resolve) => tcp.close(resolve));
    },
  };
}

export async function main(env = process.env) {
  const config = env.SYSLOG_ROUTES_JSON
    ? JSON.parse(env.SYSLOG_ROUTES_JSON)
    : JSON.parse(await readFile(env.SYSLOG_ROUTES || 'syslog-routes.json', 'utf8'));
  const ingest = new SyslogIngest({
    api: env.OCH_API_URL,
    key: env.OCH_API_KEY,
    routes: compileRoutes(config),
    flushMs: env.SYSLOG_FLUSH_MS ? Number(env.SYSLOG_FLUSH_MS) : undefined,
    queueLimit: env.SYSLOG_QUEUE_LIMIT ? Number(env.SYSLOG_QUEUE_LIMIT) : undefined,
    timezone: env.SYSLOG_TIMEZONE || 'UTC',
  });
  const listening = await listenSyslog(ingest, {
    host: env.SYSLOG_HOST || '127.0.0.1',
    port: env.SYSLOG_PORT ? Number(env.SYSLOG_PORT) : 5514,
  });
  console.log(
    `syslog: listening on ${env.SYSLOG_HOST || '127.0.0.1'} udp/${listening.udp} tcp/${listening.tcp} for ${ingest.queues.size} timeline(s).`,
  );
  const report = setInterval(() => console.log('syslog:', JSON.stringify(ingest.stats)), 60000);
  report.unref();
  for (const signal of ['SIGTERM', 'SIGINT'])
    process.once(signal, async () => {
      await listening.close();
      const drained = await ingest.drain();
      console.log(
        'syslog: stopped',
        JSON.stringify(ingest.stats),
        drained ? '' : '(queue not empty)',
      );
      process.exit(drained ? 0 : 1);
    });
}
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href)
  main().catch((error) => {
    console.error('syslog:', error.message);
    process.exit(1);
  });
