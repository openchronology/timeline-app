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
import { readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { TimelineWriter, temporary } from './timeline-writer.mjs';
import { deliveryChanges, loadRoutes, validSignature } from './github-source.mjs';
import { StintTracker, keeps, projectStatusChange } from './github-events.mjs';
import { forgejoDelivery, validForgejoSignature } from './forgejo-source.mjs';
import { gitlabDeliveryChanges, validGitlabToken } from './gitlab-source.mjs';
import { BoardTracker, cardChanges, cardDiff, cardRemoval } from './board-source.mjs';
import {
  actionEvents,
  readTrelloCard,
  trelloCard,
  validTrelloSignature,
} from './trello-source.mjs';
import { jiraDelivery, validJiraSignature } from './jira-source.mjs';
import { openprojectDelivery, validOpenProjectSignature } from './openproject-source.mjs';
import { boardClient, readBoard } from './board-import.mjs';
import { projectDateChange } from './github-projects.mjs';
import { dirname, join } from 'node:path';

/** A delivery's JSON body, or null when it is not JSON. */
function parse(body) {
  try {
    return JSON.parse(body.toString('utf8'));
  } catch {
    return null;
  }
}
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
  removedMoments = new Set();
  links = new Map();
  get size() {
    return (
      this.durations.size +
      this.moments.size +
      this.removed.size +
      this.removedMoments.size +
      this.links.size
    );
  }
  add({ durations = [], moments = [], removed = [], removedMoments = [], links = [] }) {
    for (const d of durations) {
      this.removed.delete(d.id);
      this.durations.set(d.id, d);
    }
    for (const id of removed) {
      this.durations.delete(id);
      this.removed.add(id);
    }
    for (const m of moments) {
      this.removedMoments.delete(m.id);
      this.moments.set(m.id, m);
    }
    for (const id of removedMoments) {
      this.moments.delete(id);
      this.removedMoments.add(id);
    }
    for (const link of links) this.links.set(relationshipKey(link), link);
  }
  /** Its contents, as `add` takes them. */
  get changes() {
    return {
      durations: [...this.durations.values()],
      moments: [...this.moments.values()],
      removed: [...this.removed],
      removedMoments: [...this.removedMoments],
      links: [...this.links.values()],
    };
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
   * @param {string} [options.token] a GitHub token, to name the issues of project status
   *   changes (deliveries give node IDs only); without one those are not recorded
   * @param {string} [options.githubApi] GitHub's API origin (GitHub Enterprise)
   * @param {StintTracker} [options.stints] each item's open column stints (see github-events.mjs)
   */
  constructor({
    api,
    key,
    secret,
    secrets = {},
    routes,
    fetcher = fetch,
    flushMs = 1000,
    log = console,
    token,
    githubApi = 'https://api.github.com',
    stints = new StintTracker(),
    boards = {},
    tracker = new BoardTracker(),
  }) {
    if (
      !secret &&
      !secrets.forgejo &&
      !secrets.gitlab &&
      !boards.trello &&
      !boards.jira &&
      !boards.openproject &&
      !boards.planner
    )
      throw new Error(
        'Set the webhook’s secret: GITHUB_WEBHOOK_SECRET for GitHub, FORGEJO_WEBHOOK_SECRET for Forgejo or Gitea, GITLAB_WEBHOOK_TOKEN for GitLab, or a board’s (docs/boards.md).',
      );
    // Boards and plans (docs/boards.md): `trello` {secret, callbackUrl, reader}, `jira`
    // {secret, startField}, `openproject` {secret, host}, `planner` a Graph reader.
    this.boards = boards;
    // Each card's last reading and column, for its stints and for comparing readings.
    this.tracker = tracker;
    this.writer = new TimelineWriter({ api, key, fetcher });
    this.secret = secret;
    // Other platforms' webhook secrets: `forgejo`.
    this.secrets = secrets;
    this.routes = routes;
    this.fetcher = fetcher;
    this.token = token;
    this.githubApi = githubApi;
    this.resolving = new Set();
    this.stints = stints;
    this.flushMs = flushMs;
    this.log = log;
    this.pending = new Map();
    this.timers = new Map();
    this.sending = new Map();
    this.stats = { deliveries: 0, rejected: 0, ignored: 0, saved: 0, failed: 0 };
  }
  /** A board's changes, queued on the timeline its route names; whether one did. */
  queueBoard(route, reference, source, card, { events, at, removed = false }) {
    if (!route) return false;
    if (removed) {
      this.tracker.forget(reference, card.key);
      return keeps(this.routes.kinds, 'item')
        ? this.queue({ timeline: route.timeline, ...cardRemoval(reference, card) })
        : false;
    }
    const kinds = this.routes.kinds;
    const changes = cardChanges(reference, source, { ...card, events }, kinds, { stints: false });
    const stints = this.tracker.observe(reference, source, card, at);
    if (keeps(kinds, 'in column')) changes.durations.push(...stints);
    return this.queue({ timeline: route.timeline, ...changes });
  }
  /**
   * A Trello delivery: its action's card is read again (deliveries carry only what changed),
   * then queued with the action's events. 202, or 204 for an action on no card or board
   * routed.
   */
  trello(payload) {
    const action = payload?.action;
    const board = action?.data?.board ?? payload?.model;
    const cardId = action?.data?.card?.id;
    const trello = this.boards.trello;
    const route = board && this.routes.routeBoard('trello', null, [board.id, board.shortLink]);
    if (!cardId || !route) return 204;
    const reference = `trello:${board.id}`;
    const source = { platform: 'trello', name: board.name ?? null };
    const events = actionEvents(action);
    if (action.type === 'deleteCard') {
      this.queueBoard(route, reference, source, { key: cardId }, { removed: true });
      return 202;
    }
    if (!events.length || !trello.reader) return 204;
    const resolving = readTrelloCard(trello.reader, cardId)
      .then((raw) => {
        const lists = new Map(raw.list ? [[raw.idList, raw.list.name]] : []);
        const card = trelloCard(raw, {
          board: { shortLink: board.shortLink },
          lists,
          actions: [action],
          done: route.done,
        });
        // The card's done time is when this action finished it, if it did.
        const before = this.tracker.get(reference, card.key);
        if (card.done && before?.done) card.done = before.done;
        if (
          !this.queueBoard(route, reference, source, card, { events: card.events, at: action.date })
        )
          this.stats.ignored++;
      })
      .catch((error) => this.log.error('trello: a card:', error.message))
      .finally(() => this.resolving.delete(resolving));
    this.resolving.add(resolving);
    return 202;
  }
  /** A Jira delivery: its issue as it is now, with its changelog's events. */
  jira(payload) {
    const delivery = jiraDelivery(payload, { startField: this.boards.jira?.startField });
    if (!delivery) return 204;
    const route = this.routes.routeBoard('jira', delivery.host, [delivery.project]);
    const reference = `jira:${delivery.host}/${delivery.project}`;
    const source = {
      platform: 'jira',
      name: payload.issue.fields?.project?.name ?? delivery.project,
    };
    const at = new Date(Number(payload.timestamp) || Date.now()).toISOString();
    return this.queueBoard(route, reference, source, delivery.card, {
      events: delivery.card.events,
      at,
      removed: delivery.deleted,
    })
      ? 202
      : 204;
  }
  /** An OpenProject delivery: the work package now, compared with its last reading. */
  openproject(payload) {
    const host = this.boards.openproject?.host;
    const delivery = host ? openprojectDelivery(host, payload) : null;
    if (!delivery?.project) return 204;
    const route = this.routes.routeBoard('openproject', host, [delivery.project]);
    const reference = `openproject:${host}/${delivery.project}`;
    const source = {
      platform: 'openproject',
      name: payload.work_package._embedded?.project?.name ?? delivery.project,
    };
    const at = payload.work_package.updatedAt ?? new Date().toISOString();
    const events = [
      ...delivery.card.events,
      ...cardDiff(this.tracker.get(reference, delivery.card.key), delivery.card, at, delivery.by),
    ];
    return this.queueBoard(route, reference, source, delivery.card, { events, at }) ? 202 : 204;
  }
  /**
   * Reads each routed Planner plan, as a poll: the first reading writes every task; later ones
   * what changed since (moves between buckets and other changes dated now, assignments and
   * completion as Planner dates them), and remove tasks no longer there.
   */
  async pollPlanner(now = () => new Date().toISOString()) {
    const reader = this.boards.planner;
    if (!reader) return;
    for (const plan of this.routes.boards.filter((b) => b.platform === 'planner')) {
      try {
        const read = await readBoard(reader, plan.reference);
        const route = { timeline: plan.timeline };
        const at = now();
        const seen = new Set();
        let queued = 0;
        for (const card of read.cards) {
          seen.add(card.key);
          const before = this.tracker.get(read.reference, card.key);
          // Planner dates assignments and completion; the rest is dated by this reading.
          const events = before
            ? [
                ...cardDiff(before, card, at).filter(
                  (e) => e.verb !== 'assigned' && e.verb !== 'completed',
                ),
                ...card.events.filter(
                  (e) =>
                    (e.verb === 'assigned' && !before.assignees.includes(e.subject)) ||
                    (e.verb === 'completed' && !before.done),
                ),
              ]
            : card.events;
          if (before && !events.length && this.tracker.same(read.reference, card)) continue;
          if (this.queueBoard(route, read.reference, read.source, card, { events, at })) queued++;
        }
        for (const key of this.tracker.keys(read.reference))
          if (!seen.has(key))
            this.queueBoard(route, read.reference, read.source, { key }, { removed: true });
        if (queued) this.log.log?.(`planner: ${queued} tasks changed in "${read.board.name}".`);
      } catch (error) {
        this.log.error(`planner: ${plan.reference}: ${error.message}`);
      }
    }
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
    if (!this.secret || !validSignature(this.secret, body, signature)) {
      this.stats.rejected++;
      return 401;
    }
    const payload = parse(body);
    if (!payload) return 400;
    this.stats.deliveries++;
    if (event === 'ping') return 204;
    return this.handle(event, payload);
  }
  /**
   * A delivery from any platform, told apart by its headers (lower-case names, as Node gives
   * them): GitHub's (`x-github-event`), Forgejo's and Gitea's (`x-forgejo-event`,
   * `x-gitea-event`) or GitLab's (`x-gitlab-event`), each checked against its own secret.
   * 400 for anything else.
   */
  receiveFrom(headers, body) {
    if (headers['x-github-event'])
      return this.receive(String(headers['x-github-event']), headers['x-hub-signature-256'], body);
    const forgejo = headers['x-forgejo-event'] ?? headers['x-gitea-event'];
    if (forgejo) {
      const signature = headers['x-forgejo-signature'] ?? headers['x-gitea-signature'];
      if (!this.secrets.forgejo || !validForgejoSignature(this.secrets.forgejo, body, signature)) {
        this.stats.rejected++;
        return 401;
      }
      const payload = parse(body);
      if (!payload) return 400;
      this.stats.deliveries++;
      const delivery = forgejoDelivery(
        String(forgejo),
        headers['x-forgejo-event-type'] ?? headers['x-gitea-event-type'],
        payload,
      );
      if (!delivery) {
        this.stats.ignored++;
        return 204;
      }
      return this.handle(delivery.event, delivery.payload);
    }
    if (headers['x-trello-webhook'] !== undefined) {
      const trello = this.boards.trello;
      if (
        !trello ||
        !validTrelloSignature(trello.secret, trello.callbackUrl, body, headers['x-trello-webhook'])
      ) {
        this.stats.rejected++;
        return 401;
      }
      return this.board(body, (payload) => this.trello(payload));
    }
    if (headers['x-op-signature'] !== undefined) {
      const op = this.boards.openproject;
      if (!op || !validOpenProjectSignature(op.secret, body, headers['x-op-signature'])) {
        this.stats.rejected++;
        return 401;
      }
      return this.board(body, (payload) => this.openproject(payload));
    }
    if (
      headers['x-atlassian-webhook-identifier'] !== undefined ||
      headers['x-hub-signature'] !== undefined
    ) {
      const jira = this.boards.jira;
      if (!jira || !validJiraSignature(jira.secret, body, headers['x-hub-signature'])) {
        this.stats.rejected++;
        return 401;
      }
      return this.board(body, (payload) => this.jira(payload));
    }
    const gitlab = headers['x-gitlab-event'];
    if (gitlab) {
      if (
        !this.secrets.gitlab ||
        !validGitlabToken(this.secrets.gitlab, headers['x-gitlab-token'])
      ) {
        this.stats.rejected++;
        return 401;
      }
      const payload = parse(body);
      if (!payload) return 400;
      this.stats.deliveries++;
      // GitLab's deliveries carry their changes: mapped straight to timeline changes.
      let queued = false;
      for (const change of gitlabDeliveryChanges(String(gitlab), payload, this.routes.kinds))
        queued = this.queue(change) || queued;
      if (!queued) this.stats.ignored++;
      return queued ? 202 : 204;
    }
    return 400;
  }
  /** A board's checked delivery: 400 when it is not JSON, else what `handle` answers. */
  board(body, handle) {
    const payload = parse(body);
    if (!payload) return 400;
    this.stats.deliveries++;
    const status = handle(payload);
    if (status === 204) this.stats.ignored++;
    return status;
  }
  /** A checked delivery, in GitHub's shape: queued (202) or not kept (204). */
  handle(event, payload) {
    if (
      event === 'projects_v2_item' &&
      String(payload?.changes?.field_value?.field_type ?? '').toLowerCase() === 'date'
    ) {
      // A roadmap's date changed: the item's plan on that project, read again.
      if (!this.token || !keeps(this.routes.kinds, 'planned')) {
        this.stats.ignored++;
        return 204;
      }
      const resolving = projectDateChange(payload, this.token, this.fetcher, this.githubApi)
        .then((change) => {
          if (!change || !this.queue(change)) this.stats.ignored++;
        })
        .catch((error) => this.log.error('github: a project date change:', error.message))
        .finally(() => this.resolving.delete(resolving));
      this.resolving.add(resolving);
      return 202;
    }
    if (event === 'projects_v2_item') {
      // A board's status change names its issue by node ID: resolved, then queued.
      if (!this.token || !keeps(this.routes.kinds, 'moved')) {
        this.stats.ignored++;
        return 204;
      }
      const resolving = projectStatusChange(payload, this.token, this.fetcher, this.githubApi)
        .then((change) => {
          if (!change) return void this.stats.ignored++;
          // The time in the column it left ends, and the one in the column it entered starts.
          const { move, ...moment } = change;
          const durations = keeps(this.routes.kinds, 'in column')
            ? this.stints.move(change.repository, move.item, move)
            : [];
          if (!this.queue({ ...moment, durations })) this.stats.ignored++;
        })
        .catch((error) => this.log.error('github: a project status change:', error.message))
        .finally(() => this.resolving.delete(resolving));
      this.resolving.add(resolving);
      return 202;
    }
    let queued = false;
    for (const change of deliveryChanges(event, payload, this.routes.kinds))
      queued = this.queue(change) || queued;
    // A closed item's time in its board's columns ends when it closed.
    const item = payload.issue ?? payload.pull_request;
    if (
      payload.action === 'closed' &&
      item?.number &&
      payload.repository?.full_name &&
      keeps(this.routes.kinds, 'in column')
    ) {
      const ended = this.stints.close(
        payload.repository.full_name,
        item,
        (item.merged ? item.merged_at : item.closed_at) ?? item.updated_at,
      );
      if (ended.length)
        queued =
          this.queue({ repository: payload.repository.full_name, durations: ended }) || queued;
    }
    if (!queued) {
      this.stats.ignored++;
      return 204;
    }
    return 202;
  }
  /** Queues one repository's changes on its timeline; whether a route chose one. */
  queue(changes) {
    const timeline = changes.timeline ?? this.routes.route(changes.repository);
    if (!timeline) return false;
    let queue = this.pending.get(timeline);
    if (!queue) this.pending.set(timeline, (queue = new Pending()));
    queue.add(changes);
    this.schedule(timeline, this.flushMs);
    return true;
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
      const { links: _, ...entities } = queue.changes;
      try {
        if (Object.values(entities).some((list) => list.length))
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
    merged.add(queue.changes);
    merged.add(newer.changes);
    this.pending.set(timeline, merged);
    const wait = Math.min(60000, Math.max(1000, Number(error.retryAfter) * 1000 || 5000));
    this.schedule(timeline, wait);
  }
  /** Sends everything queued, for up to `ms`; whether nothing was left. */
  async drain(ms = 10000) {
    const until = Date.now() + ms;
    await Promise.all([...this.resolving]);
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
 * Serves the webhook: POST with a platform's headers at any path; HEAD is answered 200, as
 * Trello checks a webhook's address before creating it; anything else is 404 or 405.
 * Resolves once listening, with the port and a close function.
 */
export function listenGithub(ingest, { host = '127.0.0.1', port = 5580 } = {}) {
  const server = createServer((request, response) => {
    if (request.method === 'HEAD') {
      response.writeHead(200).end();
      return;
    }
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
      const status = ingest.receiveFrom(request.headers, Buffer.concat(chunks));
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

/** A JSON state file's reading and writing: an unreadable one is empty. */
const stateFile = {
  read: (file) => {
    try {
      return JSON.parse(readFileSync(file, 'utf8'));
    } catch {
      return {};
    }
  },
  write: (file, value) => writeFileSync(file, JSON.stringify(value)),
};

/**
 * The boards' settings from the environment (docs/boards.md), each only when configured:
 * Trello's app secret and callback URL (and key and token, to read a delivery's card), Jira's
 * webhook secret, OpenProject's webhook secret and host, and Planner's app credentials.
 */
export function boardSettings(env, routes) {
  const boards = {};
  if (env.TRELLO_SECRET && env.TRELLO_CALLBACK_URL)
    boards.trello = {
      secret: env.TRELLO_SECRET,
      callbackUrl: env.TRELLO_CALLBACK_URL,
      reader: env.TRELLO_KEY && env.TRELLO_TOKEN ? boardClient('trello:x', env) : null,
    };
  if (env.JIRA_WEBHOOK_SECRET)
    boards.jira = {
      secret: env.JIRA_WEBHOOK_SECRET,
      // Deliveries carry fields by ID: the start date's, such as customfield_10015.
      startField: env.JIRA_START_FIELD
        ? { id: env.JIRA_START_FIELD, name: env.JIRA_START_FIELD_NAME || 'Start date' }
        : undefined,
    };
  if (env.OPENPROJECT_WEBHOOK_SECRET) {
    const host =
      env.OPENPROJECT_HOST || routes.boards.find((b) => b.platform === 'openproject')?.host || null;
    if (host) boards.openproject = { secret: env.OPENPROJECT_WEBHOOK_SECRET, host };
  }
  const plan = routes.boards.find((b) => b.platform === 'planner');
  if (plan && env.PLANNER_TENANT && env.PLANNER_CLIENT_ID && env.PLANNER_CLIENT_SECRET)
    boards.planner = boardClient(plan.reference, env);
  return boards;
}

/**
 * Runs the receiver from the environment: OCH_API_URL, OCH_API_KEY, GITHUB_WEBHOOK_SECRET,
 * GITHUB_ROUTES (or GITHUB_ROUTES_JSON), GITHUB_HOST and GITHUB_PORT (default
 * 127.0.0.1:5580) and GITHUB_FLUSH_MS. Logs its counters every minute; on SIGTERM or SIGINT
 * it stops listening, sends what is queued (up to ten seconds) and exits 1 if anything was
 * left.
 */
export async function main(env = process.env) {
  const routes = loadRoutes(env);
  const ingest = new GithubIngest({
    api: env.OCH_API_URL,
    key: env.OCH_API_KEY,
    secret: env.GITHUB_WEBHOOK_SECRET || undefined,
    secrets: {
      forgejo: env.FORGEJO_WEBHOOK_SECRET || undefined,
      gitlab: env.GITLAB_WEBHOOK_TOKEN || undefined,
    },
    routes,
    flushMs: env.GITHUB_FLUSH_MS ? Number(env.GITHUB_FLUSH_MS) : undefined,
    token: env.GITHUB_TOKEN || undefined,
    githubApi: env.GITHUB_API_URL || undefined,
    // Open column stints survive a restart when GITHUB_STATE names a file for them.
    stints: new StintTracker(env.GITHUB_STATE || undefined, stateFile),
    boards: boardSettings(env, routes),
    // Each card's last reading, beside GITHUB_STATE unless BOARD_STATE names a file.
    tracker: new BoardTracker(
      env.BOARD_STATE ||
        (env.GITHUB_STATE ? join(dirname(env.GITHUB_STATE), 'boards.json') : undefined),
      stateFile,
    ),
  });
  await ingest.check();
  // Planner sends no webhooks: its plans are read every PLANNER_POLL_MINUTES (default 5).
  if (ingest.boards.planner && ingest.routes.boards.some((b) => b.platform === 'planner')) {
    const minutes = Math.max(1, Number(env.PLANNER_POLL_MINUTES) || 5);
    let polling = null;
    const poll = () => (polling ??= ingest.pollPlanner().finally(() => (polling = null)));
    void poll();
    setInterval(poll, minutes * 60000).unref();
  }
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
