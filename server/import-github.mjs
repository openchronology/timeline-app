#!/usr/bin/env node
// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
/**
 * The och-import-github command (#538): imports repositories' issues and pull requests into
 * timelines as durations (ongoing while open), their assignments as moments, and "closes #n"
 * as links, through the OpenChronology API (docs/github.md). Running it again updates what it
 * imported before, by the same IDs the webhook receiver writes.
 *
 *   OCH_API_URL=https://timescale.info OCH_API_KEY=och_key_... GITHUB_TOKEN=github_pat_... \
 *   och-import-github --repo owner/name --timeline <uuid>
 */
import { realpathSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { TimelineWriter } from './timeline-writer.mjs';
import {
  USER_AGENT,
  closedIssues,
  closesLink,
  githubRoutes,
  isPullRequest,
  itemDuration,
  itemId,
  loadRoutes,
  repositoryName,
} from './github-source.mjs';
import {
  EVENT_KINDS,
  eventKinds,
  keeps,
  milestoneChanges,
  moveOf,
  releaseMoment,
  stintsFromMoves,
  timelineEvent,
} from './github-events.mjs';
import { relationshipKey } from '../dist/core.mjs';
import { loadConfiguration } from './env-file.mjs';

const sleep = (ms) => new Promise((resume) => setTimeout(resume, ms));
/** The longest it waits for GitHub's rate limit to reset before giving up. */
const MAX_RATE_WAIT = 15 * 60 * 1000;

/**
 * A GitHub REST client for listing: follows `Link: rel="next"` pages of 100, waits out a rate
 * limit that resets within 15 minutes, and sends the token (if any) only to the API's origin.
 */
export class GithubReader {
  constructor({ api = 'https://api.github.com', token, fetcher = fetch, log = console }) {
    if (!/^https:\/\//.test(api) && !/^http:\/\/(localhost|127\.0\.0\.1)[:/]/.test(api))
      throw new Error('GITHUB_API_URL must be an https origin.');
    this.api = api.replace(/\/+$/, '');
    this.token = token;
    this.fetcher = fetcher;
    this.log = log;
    this.requests = 0;
  }
  async get(url) {
    for (;;) {
      this.requests++;
      const response = await this.fetcher(url, {
        redirect: 'error',
        signal: AbortSignal.timeout(60000),
        headers: {
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
          'User-Agent': USER_AGENT,
          ...(this.token ? { Authorization: 'Bearer ' + this.token } : {}),
        },
      });
      const remaining = response.headers.get('x-ratelimit-remaining');
      if ((response.status === 403 || response.status === 429) && remaining === '0') {
        const reset = Number(response.headers.get('x-ratelimit-reset')) * 1000;
        const wait = Math.max(1000, reset - Date.now());
        if (!(wait <= MAX_RATE_WAIT))
          throw new Error('GitHub’s rate limit is used up; set GITHUB_TOKEN, or try again later.');
        this.log.error(`github: rate limited; waiting ${Math.ceil(wait / 1000)} s.`);
        await sleep(wait);
        continue;
      }
      if (response.status !== 200) {
        const value = await response.json().catch(() => ({}));
        throw Object.assign(
          new Error(`GitHub answered ${response.status}: ${value.message ?? url}`),
          { status: response.status },
        );
      }
      const next = /<([^>]+)>;\s*rel="next"/.exec(response.headers.get('link') ?? '')?.[1];
      return { value: await response.json(), next };
    }
  }
  /** Every item of a listing, page after page. */
  async *list(path, query = {}) {
    const url = new URL(this.api + path);
    for (const [key, value] of Object.entries({ per_page: '100', ...query }))
      if (value !== undefined) url.searchParams.set(key, value);
    let next = url.href;
    while (next) {
      // Pages come from the API itself; never follow one to another origin with the token.
      if (new URL(next).origin !== new URL(this.api).origin)
        throw new Error('GitHub pointed a page at another origin.');
      const page = await this.get(next);
      for (const item of page.value) yield item;
      next = page.next;
    }
  }
}

/**
 * Reads one repository into timeline changes: `{durations, moments, links}`. Issues and pull
 * requests updated since `since` (all of them without it), and, unless `kinds` is empty, what
 * happened to each since then, from its timeline (one listing per item): labels, milestones,
 * assignments, reviews, mentions and the rest (github-events.mjs), of the kinds in `kinds`.
 * Links (a pull request closing an issue, mentions, sub-issues) are kept when both items were
 * read, since a link to one the timeline lacks would be refused.
 */
export async function readRepository(reader, repository, { since, kinds = eventKinds() } = {}) {
  const durations = [],
    numbers = new Map();
  for await (const item of reader.list(`/repos/${repository}/issues`, {
    state: 'all',
    sort: 'created',
    direction: 'asc',
    since,
  })) {
    durations.push(itemDuration(repository, item));
    numbers.set(item.number, item);
  }
  const moments = [],
    removedMoments = [],
    links = [];
  if (kinds.size)
    for (const item of numbers.values()) {
      const moves = [];
      for await (const event of reader.list(
        `/repos/${repository}/issues/${item.number}/timeline`,
      )) {
        const move = moveOf(event);
        if (move) moves.push(move);
        const time = event.created_at ?? event.submitted_at;
        if (since && time && Date.parse(time) < Date.parse(since)) continue;
        const changes = timelineEvent(repository, item, event, kinds);
        if (!changes) continue;
        moments.push(...changes.moments);
        links.push(...changes.links);
      }
      // Its time in each board column, from all its moves (not only those since `since`).
      if (moves.length && keeps(kinds, 'in column'))
        durations.push(...stintsFromMoves(repository, item, moves));
    }
  // The repository's releases and milestones.
  if (keeps(kinds, 'released'))
    for await (const release of reader.list(`/repos/${repository}/releases`)) {
      const moment = releaseMoment(repository, release);
      if (moment && (!since || Date.parse(release.published_at) >= Date.parse(since)))
        moments.push(moment);
    }
  if (keeps(kinds, 'milestone'))
    for await (const milestone of reader.list(`/repos/${repository}/milestones`, {
      state: 'all',
    })) {
      if (since && Date.parse(milestone.updated_at) < Date.parse(since)) continue;
      const changes = milestoneChanges(repository, milestone);
      durations.push(...changes.durations);
      moments.push(...changes.moments);
      removedMoments.push(...changes.removedMoments);
    }
  for (const item of numbers.values())
    if (isPullRequest(item))
      for (const issue of closedIssues(`${item.title ?? ''}\n${item.body ?? ''}`))
        if (issue !== item.number) links.push(closesLink(repository, item.number, issue));
  // Only links between items read here, each once.
  const ids = new Set([...numbers.keys()].map((n) => itemId(repository, n)));
  const read = (ref) => ids.has(ref.duration);
  const unique = new Map(
    links.filter((l) => read(l.a) && read(l.b)).map((l) => [relationshipKey(l), l]),
  );
  return {
    durations,
    moments,
    removedMoments,
    links: [...unique.values()],
    items: numbers.size,
    open: [...numbers.values()].filter((item) => item.state !== 'closed').length,
  };
}

const USAGE = `Usage: och-import-github --repo owner/name [--repo …] (--timeline <uuid> | --config <routes.json>)
  [--since <ISO time>] [--events labels,milestones,…] [--no-events] [--dry-run]

Environment: OCH_API_URL and OCH_API_KEY (not needed for --dry-run), GITHUB_TOKEN (recommended;
needed for private repositories), GITHUB_API_URL (GitHub Enterprise; default https://api.github.com).
Kinds of event: ${Object.keys(EVENT_KINDS).join(', ')} (all by default, or the routes' "events").`;

/** The command: exit 0 imported, 1 something failed, 2 a usage error. */
export async function main(argv = process.argv.slice(2), env = process.env, out = console) {
  let options;
  try {
    options = parseArgs({
      args: argv,
      options: {
        repo: { type: 'string', multiple: true },
        timeline: { type: 'string' },
        config: { type: 'string' },
        since: { type: 'string' },
        events: { type: 'string' },
        'no-events': { type: 'boolean' },
        'dry-run': { type: 'boolean' },
        help: { type: 'boolean' },
      },
    }).values;
  } catch (error) {
    out.error(error.message + '\n' + USAGE);
    return 2;
  }
  if (options.help) {
    out.log(USAGE);
    return 0;
  }
  const repositories = options.repo ?? [];
  if (!repositories.length || !repositories.every(repositoryName)) {
    out.error('Name each repository as --repo owner/name.\n' + USAGE);
    return 2;
  }
  if (options.since !== undefined && !Number.isFinite(Date.parse(options.since))) {
    out.error('--since takes an ISO 8601 time, such as 2026-01-01.');
    return 2;
  }
  let routes;
  try {
    routes = options.timeline
      ? githubRoutes({ default: options.timeline })
      : loadRoutes({ ...env, GITHUB_ROUTES: options.config ?? env.GITHUB_ROUTES });
  } catch (error) {
    out.error(error.message);
    return 2;
  }
  let kinds;
  try {
    kinds = options['no-events']
      ? new Set()
      : options.events !== undefined
        ? eventKinds(options.events)
        : routes.kinds;
  } catch (error) {
    out.error(error.message);
    return 2;
  }
  const since = options.since ? new Date(options.since).toISOString() : undefined;
  const reader = new GithubReader({
    api: env.GITHUB_API_URL || undefined,
    token: env.GITHUB_TOKEN,
    log: out,
  });
  const writer = options['dry-run']
    ? null
    : new TimelineWriter({ api: env.OCH_API_URL, key: env.OCH_API_KEY });
  const checked = new Set();
  let failed = false;
  for (const repository of repositories) {
    const timeline = routes.route(repository);
    if (!timeline) {
      out.error(`${repository}: no route chooses a timeline for it; skipped.`);
      failed = true;
      continue;
    }
    let changes;
    try {
      changes = await readRepository(reader, repository, { since, kinds });
    } catch (error) {
      out.error(`${repository}: ${error.message}`);
      failed = true;
      continue;
    }
    const summary = `${changes.items} issues and pull requests (${changes.open} open), ${changes.durations.length - changes.items} other durations (milestones, time in columns), ${changes.moments.length} events, ${changes.links.length} links`;
    if (!writer) {
      out.log(`${repository} → ${timeline}: would import ${summary}.`);
      for (const d of changes.durations.slice(0, 3)) out.log('  ' + JSON.stringify(d));
      continue;
    }
    try {
      if (!checked.has(timeline)) {
        const { status, state } = await writer.load(timeline);
        if (!state)
          throw new Error(`timeline ${timeline} cannot be read with this key (${status})`);
        if (state.settings.presentation?.mode !== 'gregorian')
          throw new Error(
            `timeline ${timeline} needs the Gregorian time display, for open items to end "now"`,
          );
        checked.add(timeline);
      }
      await writer.send(timeline, {
        durations: changes.durations,
        moments: changes.moments,
        removedMoments: changes.removedMoments,
      });
      if (changes.links.length) await writer.send(timeline, { links: changes.links });
      out.log(`${repository} → ${timeline}: imported ${summary}.`);
    } catch (error) {
      out.error(
        `${repository}: ${error.status ? error.status + ' ' : ''}${error.value?.error ?? error.message}`,
      );
      failed = true;
    }
  }
  out.log(`GitHub requests: ${reader.requests}.`);
  return failed ? 1 : 0;
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
  main().then(
    (code) => process.exit(code),
    (error) => {
      console.error('och-import-github:', error.message);
      process.exit(1);
    },
  );
}
