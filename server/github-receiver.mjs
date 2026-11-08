// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
/**
 * Receives GitHub webhooks and keeps timelines in step with issues and pull requests (#538):
 * each delivery is checked against the webhook's secret, routed by repository, and written
 * through the OpenChronology API with an API key (docs/github.md).
 *
 *   OCH_API_URL=https://timescale.info OCH_API_KEY=och_key_... GITHUB_WEBHOOK_SECRET=... \
 *   GITHUB_ROUTES=./github-routes.json node server/github-receiver.mjs
 */
import { createServer } from 'node:http';
import { realpathSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { TimelineWriter, temporary } from './timeline-writer.mjs';
import { deliveryChanges, loadRoutes, validSignature } from './github-source.mjs';
import { loadConfiguration } from './env-file.mjs';
import { relationshipKey } from '../dist/core.mjs';

/** GitHub sends at most 25 MB a delivery. */
const MAX_BODY = 25 * 1024 * 1024;
const sleep = (ms) => new Promise((resume) => setTimeout(resume, ms));

/**
 * The changes waiting for one timeline, coalesced: the last word on each duration, moment and
 * link wins, so a burst of edits to one issue saves once.
 */
class Pending {
  durations = new Map();
  moments = new Map();
  removed = new Set();
  links = new Map();
  get size() {
    return this.durations.size + this.moments.size + this.removed.size + this.links.size;
  }
  add({ durations = [], moments = [], removed = [], links = [] }) {
    for (const d of durations) {
      this.removed.delete(d.id);
      this.durations.set(d.id, d);
    }
    for (const id of removed) {
      this.durations.delete(id);
      this.removed.add(id);
    }
    for (const m of moments) this.moments.set(m.id, m);
    for (const link of links) this.links.set(relationshipKey(link), link);
  }
}

/** Webhook deliveries into timelines: queued per timeline, sent in batches, retried. */
export class GithubIngest {
  /**
   * @param {object} options
   * @param {string} options.api the server's origin
   * @param {string} options.key an API key with timelines:write
   * @param {string} options.secret the webhook's secret
   * @param {{timelines: string[], route: (repository: string) => string|null}} options.routes
   * @param {typeof fetch} [options.fetcher]
   * @param {number} [options.flushMs] how long changes wait to be batched with others
   * @param {Console} [options.log]
   */
  constructor({ api, key, secret, routes, fetcher = fetch, flushMs = 1000, log = console }) {
    if (!secret) throw new Error('GITHUB_WEBHOOK_SECRET must be the webhook’s secret.');
    this.writer = new TimelineWriter({ api, key, fetcher });
    this.secret = secret;
    this.routes = routes;
    this.flushMs = flushMs;
    this.log = log;
    this.pending = new Map();
    this.timers = new Map();
    this.sending = new Map();
    this.stats = { deliveries: 0, rejected: 0, ignored: 0, saved: 0, failed: 0 };
  }
  /**
   * Checks that every routed timeline exists and has the Gregorian display, which ongoing
   * durations need: an item's time is Unix seconds, and an open one ends "now".
   */
  async check() {
    for (const timeline of this.routes.timelines) {
      const { status, state } = await this.writer.load(timeline);
      if (!state) throw new Error(`Timeline ${timeline} cannot be read with this key (${status}).`);
      if (state.settings.presentation?.mode !== 'gregorian')
        throw new Error(
          `Timeline ${timeline} needs the Gregorian time display (Time display), for open issues to end "now".`,
        );
    }
  }
  /**
   * Handles one delivery: its event name (`X-GitHub-Event`), signature
   * (`X-Hub-Signature-256`) and raw body. Returns the HTTP status to answer: 401 for a bad
   * signature, 400 for a body that is not JSON, otherwise 202 (queued) or 204 (not kept).
   */
  receive(event, signature, body) {
    if (!validSignature(this.secret, body, signature)) {
      this.stats.rejected++;
      return 401;
    }
    let payload;
    try {
      payload = JSON.parse(body.toString('utf8'));
    } catch {
      return 400;
    }
    this.stats.deliveries++;
    if (event === 'ping') return 204;
    const changes = deliveryChanges(event, payload);
    const timeline = changes && this.routes.route(changes.repository);
    if (!timeline) {
      this.stats.ignored++;
      return 204;
    }
    let queue = this.pending.get(timeline);
    if (!queue) this.pending.set(timeline, (queue = new Pending()));
    queue.add(changes);
    this.schedule(timeline, this.flushMs);
    return 202;
  }
  schedule(timeline, delay) {
    if (this.timers.has(timeline)) return;
    this.timers.set(
      timeline,
      setTimeout(() => {
        this.timers.delete(timeline);
        void this.flush(timeline);
      }, delay),
    );
  }
  /**
   * Sends one timeline's queue. Entities first; then the links, apart, since a link to an
   * issue the timeline does not hold is refused and must not hold the rest back. A temporary
   * failure puts the changes back (unless newer ones replaced them) and retries later; any
   * other drops them, with a log line.
   */
  async flush(timeline) {
    if (this.sending.get(timeline)) return this.sending.get(timeline);
    const queue = this.pending.get(timeline);
    if (!queue?.size) return;
    this.pending.delete(timeline);
    const run = (async () => {
      const entities = {
        moments: [...queue.moments.values()],
        durations: [...queue.durations.values()],
        removed: [...queue.removed],
      };
      try {
        if (entities.moments.length || entities.durations.length || entities.removed.length)
          await this.writer.send(timeline, entities);
        this.stats.saved += entities.moments.length + entities.durations.length;
      } catch (error) {
        return this.failed(timeline, queue, error);
      }
      const retry = new Pending();
      let lastError;
      for (const link of queue.links.values())
        try {
          await this.writer.send(timeline, { links: [link] });
        } catch (error) {
          // Refused, most often because the other end is not on this timeline: not kept.
          if (!temporary(error.status)) continue;
          retry.add({ links: [link] });
          lastError = error;
        }
      if (retry.size) this.failed(timeline, retry, lastError);
    })();
    this.sending.set(timeline, run);
    try {
      await run;
    } finally {
      this.sending.delete(timeline);
    }
    if (this.pending.get(timeline)?.size) this.schedule(timeline, this.flushMs);
  }
  failed(timeline, queue, error) {
    this.stats.failed++;
    if (!temporary(error.status)) {
      this.log.error(
        `github: dropped changes for timeline ${timeline}: ${error.status ?? ''} ${error.value?.error ?? error.message}`,
      );
      return;
    }
    // Newer changes queued meanwhile win over these.
    const newer = this.pending.get(timeline) ?? new Pending();
    const merged = new Pending();
    merged.add({
      durations: [...queue.durations.values()],
      moments: [...queue.moments.values()],
      removed: [...queue.removed],
      links: [...queue.links.values()],
    });
    merged.add({
      durations: [...newer.durations.values()],
      moments: [...newer.moments.values()],
      removed: [...newer.removed],
      links: [...newer.links.values()],
    });
    this.pending.set(timeline, merged);
    const wait = Math.min(60000, Math.max(1000, Number(error.retryAfter) * 1000 || 5000));
    this.schedule(timeline, wait);
  }
  /** Sends everything queued, for up to `ms`; whether nothing was left. */
  async drain(ms = 10000) {
    const until = Date.now() + ms;
    while (Date.now() < until) {
      for (const [timeline, timer] of this.timers) {
        clearTimeout(timer);
        this.timers.delete(timeline);
      }
      await Promise.all([...this.pending.keys()].map((t) => this.flush(t)));
      if (![...this.pending.values()].some((q) => q.size)) return true;
      await sleep(250);
    }
    return false;
  }
}

/**
 * Serves the webhook: POST with GitHub's headers at any path; anything else is 404 or 405.
 * Resolves once listening, with the port and a close function.
 */
export function listenGithub(ingest, { host = '127.0.0.1', port = 5580 } = {}) {
  const server = createServer((request, response) => {
    if (request.method !== 'POST') {
      response.writeHead(request.method === 'GET' ? 404 : 405).end();
      return;
    }
    const chunks = [];
    let size = 0;
    request.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY) {
        response.writeHead(413).end();
        request.destroy();
      } else chunks.push(chunk);
    });
    request.on('end', () => {
      if (response.writableEnded) return;
      const status = ingest.receive(
        String(request.headers['x-github-event'] ?? ''),
        request.headers['x-hub-signature-256'],
        Buffer.concat(chunks),
      );
      response.writeHead(status).end();
    });
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () =>
      resolve({
        port: server.address().port,
        close: () => new Promise((done) => server.close(() => done())),
      }),
    );
  });
}

/**
 * Runs the receiver from the environment: OCH_API_URL, OCH_API_KEY, GITHUB_WEBHOOK_SECRET,
 * GITHUB_ROUTES (or GITHUB_ROUTES_JSON), GITHUB_HOST and GITHUB_PORT (default
 * 127.0.0.1:5580) and GITHUB_FLUSH_MS. Logs its counters every minute; on SIGTERM or SIGINT
 * it stops listening, sends what is queued (up to ten seconds) and exits 1 if anything was
 * left.
 */
export async function main(env = process.env) {
  const ingest = new GithubIngest({
    api: env.OCH_API_URL,
    key: env.OCH_API_KEY,
    secret: env.GITHUB_WEBHOOK_SECRET,
    routes: loadRoutes(env),
    flushMs: env.GITHUB_FLUSH_MS ? Number(env.GITHUB_FLUSH_MS) : undefined,
  });
  await ingest.check();
  const listening = await listenGithub(ingest, {
    host: env.GITHUB_HOST || '127.0.0.1',
    port: env.GITHUB_PORT ? Number(env.GITHUB_PORT) : 5580,
  });
  console.log(
    `github: listening on ${env.GITHUB_HOST || '127.0.0.1'}:${listening.port} for ${ingest.routes.timelines.length} timeline(s).`,
  );
  const report = setInterval(() => console.log('github:', JSON.stringify(ingest.stats)), 60000);
  report.unref();
  for (const signal of ['SIGTERM', 'SIGINT'])
    process.once(signal, async () => {
      await listening.close();
      const drained = await ingest.drain();
      console.log(
        'github: stopped',
        JSON.stringify(ingest.stats),
        drained ? '' : '(queue not empty)',
      );
      process.exit(drained ? 0 : 1);
    });
}
const invoked = (() => {
  try {
    return process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href;
  } catch {
    return false;
  }
})();
if (invoked) {
  loadConfiguration();
  main().catch((error) => {
    console.error('github:', error.message);
    process.exit(1);
  });
}
