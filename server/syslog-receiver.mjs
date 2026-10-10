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

/** The changes endpoint accepts at most 5000 moments per save. */
const BATCH_LIMIT = 5000;
const sleep = (ms) => new Promise((resume) => setTimeout(resume, ms));

/**
 * One queue per timeline. Moments are sent in batches through `PUT /changes` with the
 * timeline's current revision; a 409 (someone else saved) refetches it and resends.
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
  }) {
    if (!/^https?:\/\//.test(api ?? '')) throw new Error('OCH_API_URL must be an http(s) origin.');
    if (!/^och_key_[a-f0-9]{32}_[a-f0-9]{64}$/.test(key ?? ''))
      throw new Error('OCH_API_KEY must be an OpenChronology API key (och_key_...).');
    this.api = api.replace(/\/+$/, '');
    this.key = key;
    this.routes = routes;
    this.fetcher = fetcher;
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
      routes.timelines.map((id) => [id, { moments: [], state: null, busy: false, timer: null }]),
    );
    this.closed = false;
  }
  /** Parses, routes and queues one message; returns the timelines it went to. */
  accept(text, received = Date.now()) {
    this.stats.received++;
    let entry;
    try {
      entry = parseSyslog(text, received);
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
  async request(path, options = {}) {
    const response = await this.fetcher(this.api + '/api/' + path, {
      ...options,
      redirect: 'error',
      signal: AbortSignal.timeout(30000),
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
    for (const key of ['title', 'description', 'presentation', 'plugins', 'tags', 'assets'])
      if (value[key] !== null && value[key] !== undefined) settings[key] = value[key];
    return { status, state: { revision: value.revision, settings } };
  }
  async flush(timeline) {
    const queue = this.queues.get(timeline);
    if (queue.busy || !queue.moments.length) return;
    queue.busy = true;
    const batch = queue.moments.splice(0, BATCH_LIMIT);
    let delay = 0;
    try {
      for (let attempt = 0; ; attempt++) {
        if (!queue.state) {
          const loaded = await this.load(timeline);
          if (!loaded.state) throw Object.assign(new Error('load'), loaded);
          queue.state = loaded.state;
        }
        const { status, value, retryAfter } = await this.request(`timelines/${timeline}/changes`, {
          method: 'PUT',
          body: JSON.stringify({
            revision: queue.state.revision,
            settings: queue.state.settings,
            changes: batch.map((event) => ({ id: event.id, event })),
          }),
        });
        if (status === 200) {
          queue.state.revision = value.revision;
          this.stats.sent += batch.length;
          break;
        }
        // Someone else saved: fetch the new revision (and settings) and send again.
        if (status === 409 && attempt < 5) {
          queue.state = null;
          continue;
        }
        throw Object.assign(new Error('save'), { status, value, retryAfter });
      }
    } catch (error) {
      const status = error.status;
      if (status === 429 || status === 409 || status === undefined || status >= 500) {
        // Temporary: keep the batch at the front and try again later.
        queue.moments.unshift(...batch);
        while (queue.moments.length > this.queueLimit) {
          queue.moments.shift();
          this.stats.dropped++;
        }
        queue.state = null;
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
