// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
/**
 * GitHub as a source of timeline events (#538), without I/O: issues and pull requests become
 * durations (ongoing while open), assignments become moments, and "closes #n" in a pull
 * request becomes a link. Shared by the webhook receiver (github-receiver.mjs) and the
 * importer (import-github.mjs), so a webhook delivery and an import of the same item write
 * the same entities with the same IDs, and either overwrites the other.
 */
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { readFileSync } from 'node:fs';
import {
  deliveryMoments,
  eventKinds,
  keeps,
  mentionChanges,
  subIssueChanges,
  timelineEvent,
} from './github-events.mjs';

/** The User-Agent GitHub requires of API clients: the project, never a person. */
export const USER_AGENT =
  'OpenChronology-github-source/1.0 (https://github.com/openchronology/timeline-app)';
/** The most characters of an issue's text a duration keeps as its notes. */
export const NOTES_LIMIT = 4000;
const ID = /^[A-Za-z0-9_.:-]{1,128}$/;
const REPOSITORY = /^[A-Za-z0-9_.-]{1,100}\/[A-Za-z0-9_.-]{1,100}$/;

/** Whether `name` is a repository's full name, `owner/name`. */
export const repositoryName = (name) => typeof name === 'string' && REPOSITORY.test(name);

/**
 * An entity ID derived from its source, so redelivered webhooks and repeated imports update
 * rather than duplicate: `gh:<owner>:<repo>:<rest>`, or with the repository hashed when that
 * would pass the 128 characters IDs may have.
 */
export function entityId(repository, ...rest) {
  const plain = ['gh', ...repository.split('/'), ...rest].join(':');
  if (ID.test(plain)) return plain;
  const hash = createHash('sha256').update(repository.toLowerCase()).digest('hex').slice(0, 24);
  return ['gh', hash, ...rest].join(':');
}
/** An item's duration ID: issues and pull requests share their repository's numbers. */
export const itemId = (repository, number) => entityId(repository, String(number));

/** A GitHub timestamp (ISO 8601, whole seconds) as a stored Gregorian coordinate: Unix seconds. */
export function seconds(timestamp) {
  const ms = Date.parse(timestamp);
  if (!Number.isFinite(ms)) throw new Error(`Not a GitHub time: ${timestamp}`);
  return String(Math.floor(ms / 1000));
}

/** A tag as entity tags allow it: lower case, no commas or control characters, 64 at most. */
function tag(text) {
  return String(text)
    .normalize('NFC')
    .replace(/[\x00-\x1f\x7f,]/g, ' ')
    .trim()
    .toLowerCase()
    .slice(0, 64)
    .trim();
}

/** Room in a tag's 64 characters for a repository, leaving `#` and a nine-digit number. */
const TAG_ROOM = 64 - 1 - 9;
/**
 * A repository's tag, `github/<owner>/<name>`, as GitHub writes a reference to it. A name too
 * long for tags is shortened to a hash of it, the same every time for the same repository.
 */
export function repositoryTag(repository) {
  const name = repository.toLowerCase();
  return 'github/'.length + name.length <= TAG_ROOM
    ? 'github/' + name
    : 'github/' + createHash('sha256').update(name).digest('hex').slice(0, 16);
}
/** An item's tag, `github/<owner>/<name>#<number>`: the item's duration and its moments carry it. */
export const itemTag = (repository, number) => repositoryTag(repository) + '#' + number;
/** A person's tag, `github/<login>` (a login has at most 39 characters). */
export const personTag = (login) => tag('github/' + login);

/** Whether a GitHub issue (from the REST API or a webhook) is a pull request. */
export const isPullRequest = (item) => !!item.pull_request || 'merged_at' in item;

/**
 * The duration of an issue or pull request in `repository`: from when it was opened, until it
 * was closed (or merged), or ongoing while it is open. Its title carries its number; its notes
 * the start of its text and its address. Its tags: `github`, the repository's
 * (`github/<owner>/<name>`), its own (`github/<owner>/<name>#<n>`), the kind, the state,
 * `assigned` and each assignee's (`github/<login>`) while it has any, the labels and the
 * milestone. Its own come first, so the 40 an entity may carry never leave them out.
 */
export function itemDuration(repository, item) {
  const pull = isPullRequest(item);
  const merged = item.merged_at ?? item.pull_request?.merged_at ?? null;
  const closed = item.state === 'closed';
  const body = typeof item.body === 'string' ? item.body : '';
  const notes =
    (body.length > NOTES_LIMIT ? body.slice(0, NOTES_LIMIT) + '…' : body) +
    (item.html_url ? (body ? '\n\n' : '') + item.html_url : '');
  const assignees = item.assignees ?? (item.assignee ? [item.assignee] : []);
  const tags = [
    'github',
    repositoryTag(repository),
    itemTag(repository, item.number),
    pull ? 'pull request' : 'issue',
    'state:' + (merged ? 'merged' : closed ? 'closed' : 'open'),
    ...(assignees.length ? ['assigned'] : []),
    ...assignees.map((user) => personTag(user.login)),
    ...(item.labels ?? []).map((label) => 'label:' + (label.name ?? label)),
    ...(item.milestone?.title ? ['milestone:' + item.milestone.title] : []),
  ]
    .map(tag)
    .filter(Boolean);
  return {
    id: itemId(repository, item.number),
    start: seconds(item.created_at),
    end:
      closed && (merged ?? item.closed_at) ? seconds(merged ?? item.closed_at) : { ongoing: true },
    metadata: {
      title: `#${item.number} ${item.title ?? ''}`.trim().slice(0, 300),
      ...(notes ? { description: notes } : {}),
      ...(item.html_url ? { url: item.html_url } : {}),
      tags: [...new Set(tags)].slice(0, 40),
    },
  };
}

/**
 * The moment of an assignment or unassignment (`action`) of `assignee` to the item at `time`,
 * as github-events.mjs builds every event's moment.
 */
export function assignmentMoment(repository, item, { action, assignee, time }) {
  return timelineEvent(repository, item, { event: action, assignee, created_at: time }).moments[0];
}

/**
 * The issues a pull request closes when merged, from its text: "closes", "fixes" or
 * "resolves" (and their other tenses) followed by `#n` in its own repository.
 */
export function closedIssues(text) {
  const numbers = new Set();
  for (const match of String(text ?? '').matchAll(
    /\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\s*:?\s+#(\d{1,9})\b/gi,
  ))
    numbers.add(Number(match[1]));
  return [...numbers];
}
/** The link between a pull request and an issue it closes, as a relationship change. */
export const closesLink = (repository, pull, issue) => ({
  a: { duration: itemId(repository, pull) },
  b: { duration: itemId(repository, issue) },
  related: true,
});

/**
 * Checks a delivery's `X-Hub-Signature-256` (`sha256=<hex HMAC of the body>`) with the
 * webhook's secret, in constant time.
 */
export function validSignature(secret, body, header) {
  if (typeof header !== 'string' || !header.startsWith('sha256=')) return false;
  const expected = createHmac('sha256', secret).update(body).digest();
  const given = Buffer.from(header.slice(7), 'hex');
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/**
 * Routing rules: which timeline each repository's events go to.
 * `{"routes": [{"repository": "owner/name" | "owner/*", "timeline": "<uuid>"}, …],
 *   "default": "<uuid>"}`. The first rule that matches wins; then `default`; else the event
 * is not kept. Names compare without regard to case, as GitHub's do. `"events": ["labels",
 * …]` records only those kinds of event as moments (all of them without it).
 */
export function githubRoutes(config) {
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!config || typeof config !== 'object') throw new Error('The routes must be a JSON object.');
  const routes = (config.routes ?? []).map((route, i) => {
    if (
      typeof route?.repository !== 'string' ||
      !/^[A-Za-z0-9_.-]{1,100}\/(\*|[A-Za-z0-9_.-]{1,100})$/.test(route.repository) ||
      !uuid.test(route.timeline ?? '')
    )
      throw new Error(
        `Route ${i + 1} needs a repository ("owner/name" or "owner/*") and a timeline ID.`,
      );
    const [owner, name] = route.repository.toLowerCase().split('/');
    return { owner, name, timeline: route.timeline.toLowerCase() };
  });
  if (config.default !== undefined && !uuid.test(config.default))
    throw new Error('The default timeline must be a timeline ID.');
  const fallback = config.default?.toLowerCase() ?? null;
  return {
    timelines: [...new Set([...routes.map((r) => r.timeline), ...(fallback ? [fallback] : [])])],
    // The kinds of event recorded as moments (github-events.mjs EVENT_KINDS): all, unless
    // `events` lists some.
    kinds: eventKinds(config.events),
    route(repository) {
      const [owner, name] = repository.toLowerCase().split('/');
      return (
        routes.find((r) => r.owner === owner && (r.name === '*' || r.name === name))?.timeline ??
        fallback
      );
    },
  };
}
/** Routes from a file (`GITHUB_ROUTES`) or inline JSON (`GITHUB_ROUTES_JSON`). */
export function loadRoutes(env = process.env) {
  const text =
    env.GITHUB_ROUTES_JSON ?? readFileSync(env.GITHUB_ROUTES ?? 'github-routes.json', 'utf8');
  return githubRoutes(JSON.parse(text));
}

/**
 * What one webhook delivery changes, as a list of `{repository, durations, moments, removed,
 * links}` (usually one; a mention or a sub-issue may touch another repository's items), of
 * the kinds of event in `kinds` (all by default):
 * - `issues` and `pull_request`: any action rewrites the item's duration (so edits, labels,
 *   milestones, closing and reopening all show), `deleted` removes it, and the action adds its
 *   moment (github-events.mjs); a pull request's "closes #n" adds links, and the items its
 *   text mentions get "mentioned" moments and links when it is opened or edited.
 * - `pull_request_review`: the review's moment, and the pull request's duration.
 * - `issue_comment`: "mentioned" moments for the items a new or edited comment names. The
 *   comment itself is not copied.
 * - `sub_issues`: both items' moments and their link.
 * `projects_v2_item` needs GraphQL, so the receiver resolves it (projectStatusChange).
 */
export function deliveryChanges(event, payload, kinds = eventKinds()) {
  const repository = payload?.repository?.full_name;
  if (event === 'sub_issues') return subIssueChanges(payload, kinds);
  if (!repositoryName(repository)) return [];
  const mentions = (source, text, by) =>
    keeps(kinds, 'mentioned') ? mentionChanges(source, text, source.time, by) : [];
  if (event === 'issue_comment') {
    const item = payload.issue;
    if (!item?.number || !['created', 'edited'].includes(payload.action)) return [];
    return mentions(
      { repository, number: item.number, time: payload.comment?.updated_at ?? item.updated_at },
      payload.comment?.body,
      payload.comment?.user?.login ?? payload.sender?.login,
    );
  }
  const item =
    event === 'issues' || event === 'pull_request' || event === 'pull_request_review'
      ? (payload.issue ?? payload.pull_request)
      : null;
  if (!item || !Number.isInteger(item.number)) return [];
  if (payload.action === 'deleted' && event !== 'pull_request_review')
    return [
      {
        repository,
        durations: [],
        moments: [],
        removed: [itemId(repository, item.number)],
        links: [],
      },
    ];
  const happened = deliveryMoments(event, payload, repository, item, kinds);
  const links = [
    ...happened.links,
    ...(event === 'pull_request'
      ? closedIssues(`${item.title ?? ''}\n${item.body ?? ''}`)
          .filter((n) => n !== item.number)
          .map((n) => closesLink(repository, item.number, n))
      : []),
  ];
  const own = {
    repository,
    durations: [itemDuration(repository, item)],
    moments: happened.moments,
    removed: [],
    links,
  };
  const mentioned =
    event !== 'pull_request_review' && ['opened', 'edited'].includes(payload.action)
      ? mentions(
          {
            repository,
            number: item.number,
            time: payload.action === 'opened' ? item.created_at : item.updated_at,
          },
          `${item.title ?? ''}\n${item.body ?? ''}`,
          payload.sender?.login,
        )
      : [];
  return [own, ...mentioned];
}
