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

/** Whether a GitHub issue (from the REST API or a webhook) is a pull request. */
export const isPullRequest = (item) => !!item.pull_request || 'merged_at' in item;

/**
 * The duration of an issue or pull request in `repository`: from when it was opened, until it
 * was closed (or merged), or ongoing while it is open. Its title carries its number; its notes
 * the start of its text and its address; its tags the repository, the kind, the state, the
 * assignees, the labels and the milestone.
 */
export function itemDuration(repository, item) {
  const pull = isPullRequest(item);
  const merged = item.merged_at ?? item.pull_request?.merged_at ?? null;
  const closed = item.state === 'closed';
  const body = typeof item.body === 'string' ? item.body : '';
  const notes =
    (body.length > NOTES_LIMIT ? body.slice(0, NOTES_LIMIT) + '…' : body) +
    (item.html_url ? (body ? '\n\n' : '') + item.html_url : '');
  const tags = [
    'github',
    'repository:' + repository,
    pull ? 'pull request' : 'issue',
    'state:' + (merged ? 'merged' : closed ? 'closed' : 'open'),
    ...(item.assignees ?? (item.assignee ? [item.assignee] : [])).map(
      (user) => 'assignee:' + user.login,
    ),
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
 * The moment of an assignment or unassignment (`event.event` or a webhook's `action`):
 * `assigned` or `unassigned`, of `assignee` to the item, at `time`, keyed by the event's ID
 * when GitHub gives one (the importer), else by the item, the person, the action and the
 * time (a webhook delivery), so delivering it twice writes it once.
 */
export function assignmentMoment(repository, item, { action, assignee, time, id }) {
  const login = assignee?.login ?? 'someone';
  return {
    id: entityId(
      repository,
      String(item.number),
      action,
      id ? String(id) : `${login.replace(/[^A-Za-z0-9_.-]/g, '-')}:${seconds(time)}`,
    ),
    time: seconds(time),
    metadata: {
      title:
        `${action === 'assigned' ? 'Assigned' : 'Unassigned'} ${login}: #${item.number} ${item.title ?? ''}`
          .trim()
          .slice(0, 300),
      ...(item.html_url ? { url: item.html_url } : {}),
      tags: [
        'github',
        'repository:' + repository,
        action === 'assigned' ? 'assigned' : 'unassigned',
        'assignee:' + login,
      ].map(tag),
    },
  };
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
 * is not kept. Names compare without regard to case, as GitHub's do.
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
 * What one webhook delivery changes, or null for events it does not keep: `{repository,
 * durations, moments, removed, links}`. Issues and pull requests: any action rewrites the
 * item's duration (so edits, labels, milestones, closing and reopening all show), `assigned`
 * and `unassigned` also add a moment, `deleted` removes the duration, and a pull request's
 * "closes #n" adds links.
 */
export function deliveryChanges(event, payload) {
  const repository = payload?.repository?.full_name;
  if (!repositoryName(repository)) return null;
  const item =
    event === 'issues' ? payload.issue : event === 'pull_request' ? payload.pull_request : null;
  if (!item || !Number.isInteger(item.number)) return null;
  if (payload.action === 'deleted')
    return {
      repository,
      durations: [],
      moments: [],
      removed: [itemId(repository, item.number)],
      links: [],
    };
  const moments =
    payload.action === 'assigned' || payload.action === 'unassigned'
      ? [
          assignmentMoment(repository, item, {
            action: payload.action,
            assignee: payload.assignee,
            time: item.updated_at ?? new Date().toISOString(),
          }),
        ]
      : [];
  const links =
    event === 'pull_request'
      ? closedIssues(`${item.title ?? ''}\n${item.body ?? ''}`)
          .filter((n) => n !== item.number)
          .map((n) => closesLink(repository, item.number, n))
      : [];
  return { repository, durations: [itemDuration(repository, item)], moments, removed: [], links };
}
