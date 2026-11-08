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
  isPullRequest,
  itemDuration,
  itemId,
  entityId,
  parseRepository,
  repositoryName,
} from './github-source.mjs';
import { forgejoTimelineEvent } from './forgejo-source.mjs';
import {
  EVENT_KINDS,
  branchMoment,
  commitLinks,
  commitMoment,
  eventKinds,
  forkMoment,
  keeps,
  selectKinds,
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
  /**
   * @param {object} options `api` (its origin and path, such as https://api.github.com or
   *   https://codeberg.org/api/v1), `token`, `scheme` (the Authorization scheme: `Bearer`, or
   *   `token` for Forgejo), `pageSize` (`[parameter, value]`: GitHub's `per_page` 100,
   *   Forgejo's `limit` 50), `fetcher` and `log`
   */
  constructor({
    api = 'https://api.github.com',
    token,
    scheme = 'Bearer',
    pageSize = ['per_page', '100'],
    fetcher = fetch,
    log = console,
  }) {
    if (!/^https:\/\//.test(api) && !/^http:\/\/(localhost|127\.0\.0\.1)[:/]/.test(api))
      throw new Error('GITHUB_API_URL must be an https origin.');
    this.api = api.replace(/\/+$/, '');
    this.token = token;
    this.scheme = scheme;
    this.pageSize = pageSize;
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
          ...(this.token ? { Authorization: `${this.scheme} ${this.token}` } : {}),
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
    for (const [key, value] of Object.entries({ [this.pageSize[0]]: this.pageSize[1], ...query }))
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

/** The kinds that need each item read (its duration, or what its timeline says). */
const ITEM_KINDS = [
  'items',
  'assignments',
  'labels',
  'state',
  'renames',
  'reviews',
  'mentions',
  'relations',
  'status',
  'other',
];

/**
 * Reads one repository into timeline changes, `{durations, moments, removedMoments, links}`,
 * of the kinds in `kinds` (github-events.mjs EVENT_KINDS), since `since` when given:
 * - items: issues and pull requests updated since then, as durations; from each one's
 *   timeline, what happened to it (labels, assignments, reviews, mentions …), and its time in
 *   board columns;
 * - commits: each branch's commits, as moments tagged with the branch they were made on: the
 *   default branch first, then each other branch until it meets history already read, so a
 *   commit merged elsewhere keeps the branch it began on;
 * - branches: when each other branch began, at its first commit of its own;
 * - forks, releases and milestones.
 * Links (closing, mentions, sub-issues, commits naming items) are kept when both ends were
 * read, since a link to an entity the timeline lacks would be refused.
 */
export async function readRepository(reader, repository, { since, kinds = eventKinds() } = {}) {
  // The API names a repository by its path on its own host; Forgejo's timelines are translated
  // into GitHub's shapes (forgejo-source.mjs).
  const { platform, host, path } = parseRepository(repository);
  const forgejo = platform === 'forgejo';
  const translate = forgejo ? (event) => forgejoTimelineEvent(event, host) : (event) => event;
  const after = (time) => !since || (time && Date.parse(time) >= Date.parse(since));
  const durations = [],
    moments = [],
    removedMoments = [],
    links = [],
    numbers = new Map();
  if (ITEM_KINDS.some((kind) => kinds.has(kind)))
    for await (const item of reader.list(`/repos/${path}/issues`, {
      state: 'all',
      sort: 'created',
      direction: 'asc',
      since,
    })) {
      if (keeps(kinds, 'item')) durations.push(itemDuration(repository, item));
      numbers.set(item.number, item);
    }
  if (ITEM_KINDS.slice(1).some((kind) => kinds.has(kind)))
    for (const item of numbers.values()) {
      const moves = [];
      for await (const entry of reader.list(`/repos/${path}/issues/${item.number}/timeline`)) {
        const event = translate(entry);
        if (!event) continue;
        const move = moveOf(event);
        if (move) moves.push(move);
        if (!after(event.created_at ?? event.submitted_at)) continue;
        const changes = timelineEvent(repository, item, event, kinds);
        if (!changes) continue;
        moments.push(...changes.moments);
        links.push(...changes.links);
      }
      // Its time in each board column, from all its moves (not only those since `since`).
      if (moves.length && keeps(kinds, 'in column'))
        durations.push(...stintsFromMoves(repository, item, moves));
    }
  // Commits, branch by branch: the default branch's first.
  const commitIds = new Set();
  if (keeps(kinds, 'commit') || keeps(kinds, 'branch')) {
    const repo = await reader.get(`${reader.api}/repos/${path}`);
    const main = repo.value.default_branch;
    const branches = [{ name: main }];
    for await (const branch of reader.list(`/repos/${path}/branches`))
      if (branch.name !== main)
        branches.push({ name: branch.name, head: branch.commit?.sha ?? branch.commit?.id });
    const seen = new Set();
    for (const { name: branch, head } of branches) {
      // A branch whose last commit was read with an earlier one (merged, or not moved on)
      // has nothing of its own.
      if (head && seen.has(head)) continue;
      let first = null;
      for await (const entry of reader.list(`/repos/${path}/commits`, {
        sha: branch,
        since,
        // Forgejo would otherwise add each commit's files and verification, at a cost.
        ...(forgejo ? { stat: 'false', verification: 'false', files: 'false' } : {}),
      })) {
        // The rest of this branch's history was read with an earlier one.
        if (seen.has(entry.sha)) break;
        seen.add(entry.sha);
        const commit = {
          sha: entry.sha,
          message: entry.commit?.message,
          time: entry.commit?.author?.date ?? entry.created,
          url: entry.html_url,
          login: entry.author?.login ?? null,
        };
        if (!commit.time || !after(commit.time)) continue;
        if (keeps(kinds, 'commit')) {
          moments.push(commitMoment(repository, commit, branch));
          commitIds.add(entityId(repository, 'commit', commit.sha));
          links.push(...commitLinks(repository, commit));
        }
        if (!first || Date.parse(commit.time) < Date.parse(first.time)) first = commit;
      }
      if (branch !== main && first && keeps(kinds, 'branch'))
        moments.push(
          branchMoment(repository, branch, {
            verb: 'branch',
            time: first.time,
            person: first.login,
          }),
        );
    }
  }
  if (keeps(kinds, 'forked'))
    for await (const fork of reader.list(`/repos/${path}/forks`))
      if (after(fork.created_at)) moments.push(forkMoment(repository, fork));
  if (keeps(kinds, 'released'))
    for await (const release of reader.list(`/repos/${path}/releases`)) {
      const moment = releaseMoment(repository, release);
      if (moment && after(release.published_at)) moments.push(moment);
    }
  if (keeps(kinds, 'milestone'))
    for await (const milestone of reader.list(`/repos/${path}/milestones`, { state: 'all' })) {
      if (!after(milestone.updated_at)) continue;
      const changes = milestoneChanges(repository, milestone);
      durations.push(...changes.durations);
      moments.push(...changes.moments);
      removedMoments.push(...changes.removedMoments);
    }
  if (keeps(kinds, 'item'))
    for (const item of numbers.values())
      if (isPullRequest(item))
        for (const issue of closedIssues(`${item.title ?? ''}\n${item.body ?? ''}`))
          if (issue !== item.number) links.push(closesLink(repository, item.number, issue));
  // Only links between entities written here, each once.
  const ids = keeps(kinds, 'item')
    ? new Set([...numbers.keys()].map((n) => itemId(repository, n)))
    : new Set();
  const written = (ref) => ('duration' in ref ? ids.has(ref.duration) : commitIds.has(ref.moment));
  const unique = new Map(
    links.filter((l) => written(l.a) && written(l.b)).map((l) => [relationshipKey(l), l]),
  );
  return {
    durations,
    moments,
    removedMoments,
    links: [...unique.values()],
    items: keeps(kinds, 'item') ? numbers.size : 0,
    open: keeps(kinds, 'item')
      ? [...numbers.values()].filter((item) => item.state !== 'closed').length
      : 0,
    commits: commitIds.size,
  };
}

const USAGE = `Usage: och-import-github --repo <repository> --timeline <uuid>
  [--only <kinds>] [--except <kinds>] [--since <ISO time>] [--dry-run]

Imports one repository into one timeline. A repository is owner/name on github.com, or
<platform>:<host>/<path> elsewhere, such as forgejo:codeberg.org/acme/app.
Kinds: ${Object.keys(EVENT_KINDS).join(', ')}. All by default; --only commits imports just
those, --except forks,branches everything else.

Environment: OCH_API_URL and OCH_API_KEY (not needed for --dry-run); GITHUB_TOKEN, or
FORGEJO_TOKEN for Forgejo and Gitea (recommended; needed for private repositories);
GITHUB_API_URL (GitHub Enterprise; default https://api.github.com).`;

/** The command: exit 0 imported, 1 something failed, 2 a usage error. */
export async function main(argv = process.argv.slice(2), env = process.env, out = console) {
  let options;
  try {
    options = parseArgs({
      args: argv,
      options: {
        repo: { type: 'string', multiple: true },
        timeline: { type: 'string', multiple: true },
        only: { type: 'string' },
        except: { type: 'string' },
        since: { type: 'string' },
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
  // One repository, into one timeline.
  if ((options.repo?.length ?? 0) > 1 || (options.timeline?.length ?? 0) > 1) {
    out.error('Import one repository into one timeline at a time.\n' + USAGE);
    return 2;
  }
  const repository = options.repo?.[0];
  if (!repositoryName(repository)) {
    out.error(
      'Name one repository: --repo owner/name, or --repo forgejo:<host>/owner/name.\n' + USAGE,
    );
    return 2;
  }
  const timeline = String(options.timeline?.[0] ?? '').toLowerCase();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(timeline)) {
    out.error('Name the timeline to import into: --timeline <uuid>.\n' + USAGE);
    return 2;
  }
  if (options.since !== undefined && !Number.isFinite(Date.parse(options.since))) {
    out.error('--since takes an ISO 8601 time, such as 2026-01-01.');
    return 2;
  }
  let kinds;
  try {
    kinds = selectKinds({ only: options.only, except: options.except });
  } catch (error) {
    out.error(error.message);
    return 2;
  }
  if (!kinds.size) {
    out.error('Nothing is left to import: --except leaves out every kind.');
    return 2;
  }
  const since = options.since ? new Date(options.since).toISOString() : undefined;
  // The platform's API, token and paging.
  const { platform, host, public: isPublic } = parseRepository(repository);
  const reader =
    platform === 'forgejo'
      ? new GithubReader({
          api: `https://${host}/api/v1`,
          token: env.FORGEJO_TOKEN,
          scheme: 'token',
          pageSize: ['limit', '50'],
          log: out,
        })
      : new GithubReader({
          api: isPublic ? env.GITHUB_API_URL || undefined : `https://${host}/api/v3`,
          token: env.GITHUB_TOKEN,
          log: out,
        });
  let writer = null;
  if (!options['dry-run'])
    try {
      writer = new TimelineWriter({ api: env.OCH_API_URL, key: env.OCH_API_KEY });
    } catch (error) {
      out.error(error.message);
      return 2;
    }
  let changes;
  try {
    if (writer) {
      // Before reading GitHub: that the timeline can take what it reads.
      const { status, state } = await writer.load(timeline);
      if (!state) throw new Error(`timeline ${timeline} cannot be read with this key (${status})`);
      if (state.settings.presentation?.mode !== 'gregorian')
        throw new Error(
          `timeline ${timeline} needs the Gregorian time display, for open items to end "now"`,
        );
    }
    changes = await readRepository(reader, repository, { since, kinds });
  } catch (error) {
    out.error(`${repository}: ${error.message}`);
    return 1;
  }
  const summary = [
    `${changes.items} issues and pull requests (${changes.open} open)`,
    `${changes.commits} commits`,
    `${changes.moments.length - changes.commits} other events`,
    `${changes.durations.length - changes.items} other durations`,
    `${changes.links.length} links`,
  ].join(', ');
  out.log(`Requests: ${reader.requests}.`);
  if (!writer) {
    out.log(`${repository} → ${timeline}: would import ${summary}.`);
    for (const d of [...changes.durations, ...changes.moments].slice(0, 3))
      out.log('  ' + JSON.stringify(d));
    return 0;
  }
  try {
    await writer.send(timeline, {
      durations: changes.durations,
      moments: changes.moments,
      removedMoments: changes.removedMoments,
    });
    if (changes.links.length) await writer.send(timeline, { links: changes.links });
    out.log(`${repository} → ${timeline}: imported ${summary}.`);
    return 0;
  } catch (error) {
    out.error(
      `${repository}: ${error.status ? error.status + ' ' : ''}${error.value?.error ?? error.message}`,
    );
    return 1;
  }
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
