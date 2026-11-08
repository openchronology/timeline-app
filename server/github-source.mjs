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
  branchMoment,
  deliveryMoments,
  eventKinds,
  forkMoment,
  pushChanges,
  selectKinds,
  keeps,
  mentionChanges,
  milestoneChanges,
  milestoneId,
  releaseId,
  releaseMoment,
  subIssueChanges,
  timelineEvent,
} from './github-events.mjs';

/** The User-Agent GitHub requires of API clients: the project, never a person. */
export const USER_AGENT =
  'OpenChronology-github-source/1.0 (https://github.com/openchronology/timeline-app)';
/** The most characters of an issue's text a duration keeps as its notes. */
export const NOTES_LIMIT = 4000;
const ID = /^[A-Za-z0-9_.:-]{1,128}$/;
/**
 * A repository reference: `owner/name` on github.com, or `<platform>:<host>/<path>` elsewhere,
 * such as `forgejo:codeberg.org/acme/app` or `gitlab:git.example.com/group/subgroup/app`
 * (GitLab nests groups; GitHub and Forgejo have an owner and a name). The platforms each
 * have a public host whose references may leave it out: github.com and gitlab.com.
 */
const REFERENCE =
  /^(?:(github|gitlab|forgejo):([A-Za-z0-9.-]{1,253}(?::\d{1,5})?)\/)?([A-Za-z0-9_.-]{1,100}(?:\/[A-Za-z0-9_.-]{1,100}){1,20})$/;
/** Each platform's public host, and its IDs' prefix. */
export const PLATFORMS = {
  github: { host: 'github.com', prefix: 'gh' },
  gitlab: { host: 'gitlab.com', prefix: 'gl' },
  forgejo: { host: null, prefix: 'fj' },
};
/**
 * A repository reference's parts, `{platform, host, path, public}`, or null when it is not
 * one: `owner/name` is github.com's; GitHub and Forgejo paths are `owner/name`.
 */
export function parseRepository(reference) {
  const m = typeof reference === 'string' ? REFERENCE.exec(reference) : null;
  if (!m) return null;
  const platform = m[1] ?? 'github',
    host = (m[2] ?? PLATFORMS[platform].host)?.toLowerCase(),
    path = m[3];
  if (!host || (platform !== 'gitlab' && path.split('/').length !== 2)) return null;
  return { platform, host, path, public: host === PLATFORMS[platform].host };
}
/** A reference in its usual form: without the host on github.com, with it everywhere else. */
export function repositoryReference(platform, host, path) {
  const h = host.toLowerCase();
  return platform === 'github' && h === 'github.com' ? path : `${platform}:${h}/${path}`;
}
/** Whether `name` is a repository reference (see parseRepository). */
export const repositoryName = (name) => parseRepository(name) !== null;
/** A repository's platform: `github`, `gitlab` or `forgejo`. */
export const platformOf = (repository) => parseRepository(repository)?.platform ?? 'github';

/**
 * An entity ID derived from its source, so redelivered webhooks and repeated imports update
 * rather than duplicate: `gh:<owner>:<repo>:<rest>` on github.com, `<prefix>:<host>:<path
 * parts>:<rest>` elsewhere (`fj`, `gl`), or with the repository hashed when that would pass
 * the 128 characters IDs may have.
 */
export function entityId(repository, ...rest) {
  const r = parseRepository(repository);
  const prefix = PLATFORMS[r.platform].prefix;
  const plain = [
    prefix,
    ...(r.public ? [] : [r.host.replace(/:/g, '.')]),
    ...r.path.split('/'),
    ...rest,
  ].join(':');
  if (ID.test(plain)) return plain;
  const hash = createHash('sha256')
    .update(r.public ? r.path.toLowerCase() : `${r.host}/${r.path.toLowerCase()}`)
    .digest('hex')
    .slice(0, 24);
  return [prefix, hash, ...rest].join(':');
}
/**
 * An item's place in its repository: its number, and for a GitLab merge request (numbered
 * apart from issues) `mr` before it.
 */
export const itemKey = (item) =>
  item.merge_request ? ['mr', String(item.number)] : [String(item.number)];
/** An item's duration ID. */
export const itemId = (repository, number, mergeRequest = false) =>
  entityId(repository, ...itemKey({ number, merge_request: mergeRequest }));

/** A GitHub timestamp (ISO 8601, whole seconds) as a stored Gregorian coordinate: Unix seconds. */
export function seconds(timestamp) {
  const ms = Date.parse(timestamp);
  if (!Number.isFinite(ms)) throw new Error(`Not a GitHub time: ${timestamp}`);
  return String(Math.floor(ms / 1000));
}

/** A tag as events' tags allow it: lower case, no commas or control characters, 128 at most. */
export function tag(text) {
  return String(text)
    .normalize('NFC')
    .replace(/[\x00-\x1f\x7f,]/g, ' ')
    .trim()
    .toLowerCase()
    .slice(0, 128)
    .trim();
}

/** Room in a tag's 128 characters for a repository, leaving `#` or `!` and a nine-digit number. */
const TAG_ROOM = 128 - 1 - 9;
/**
 * What a platform's tags start with: `github/` or `gitlab/` on the public hosts, and
 * `<platform>:<host>/` elsewhere, such as `forgejo:codeberg.org/`.
 */
export function tagPrefix(repository) {
  const r = parseRepository(repository);
  return r.public ? `${r.platform}/` : `${r.platform}:${r.host}/`;
}
/**
 * A repository's tag, as its platform writes a reference to it: `github/acme/app`,
 * `gitlab:git.example.com/group/subgroup/app`. One too long for tags is shortened to a hash
 * of it, the same every time for the same repository.
 */
export function repositoryTag(repository) {
  const r = parseRepository(repository),
    prefix = tagPrefix(repository),
    path = r.path.toLowerCase();
  return prefix.length + path.length <= TAG_ROOM
    ? prefix + path
    : prefix + createHash('sha256').update(path).digest('hex').slice(0, 16);
}
/**
 * An item's tag, `github/acme/app#412`, or for a GitLab merge request `…!12`: the item's
 * duration and its moments carry it.
 */
export const itemTag = (repository, number, mergeRequest = false) =>
  repositoryTag(repository) + (mergeRequest ? '!' : '#') + number;
/** A person's tag on a repository's platform: `github/mona`, `forgejo:codeberg.org/mona`. */
export const personTag = (login, repository) => tag(tagPrefix(repository) + login);

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
  const pull = isPullRequest(item),
    mr = !!item.merge_request;
  const merged = item.merged_at ?? item.pull_request?.merged_at ?? null;
  const closed = item.state === 'closed';
  const body = typeof item.body === 'string' ? item.body : '';
  const notes =
    (body.length > NOTES_LIMIT ? body.slice(0, NOTES_LIMIT) + '…' : body) +
    (item.html_url ? (body ? '\n\n' : '') + item.html_url : '');
  const assignees = item.assignees ?? (item.assignee ? [item.assignee] : []);
  const tags = [
    platformOf(repository),
    repositoryTag(repository),
    itemTag(repository, item.number, mr),
    mr ? 'merge request' : pull ? 'pull request' : 'issue',
    'state:' + (merged ? 'merged' : closed ? 'closed' : 'open'),
    ...(assignees.length ? ['assigned'] : []),
    ...assignees.map((user) => personTag(user.login, repository)),
    ...(item.labels ?? []).map((label) => 'label:' + (label.name ?? label)),
    ...(item.milestone?.title ? ['milestone:' + item.milestone.title] : []),
  ]
    .map(tag)
    .filter(Boolean);
  return {
    id: itemId(repository, item.number, mr),
    start: seconds(item.created_at),
    end:
      closed && (merged ?? item.closed_at) ? seconds(merged ?? item.closed_at) : { ongoing: true },
    metadata: {
      title: `${mr ? '!' : '#'}${item.number} ${item.title ?? ''}`.trim().slice(0, 300),
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
 * is not kept. Names compare without regard to case, as GitHub's do. `"only": ["commits",
 * …]` records only those kinds, and `"except": ["forks", …]` all but those.
 */
export function githubRoutes(config) {
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!config || typeof config !== 'object') throw new Error('The routes must be a JSON object.');
  const routes = (config.routes ?? []).map((route, i) => {
    // A repository reference, whose last part may be `*`: everything under that owner or
    // group (on GitLab, in its subgroups too).
    const pattern = typeof route?.repository === 'string' ? route.repository : '';
    const parsed = parseRepository(pattern.replace(/\/\*$/, '/x'));
    if (!parsed || !uuid.test(route.timeline ?? ''))
      throw new Error(
        `Route ${i + 1} needs a repository (such as "owner/name", "owner/*" or "forgejo:codeberg.org/owner/*") and a timeline ID.`,
      );
    const wild = pattern.endsWith('/*'),
      path = parsed.path.toLowerCase();
    return {
      platform: parsed.platform,
      host: parsed.host,
      path: wild ? path.slice(0, -1) : path,
      wild,
      timeline: route.timeline.toLowerCase(),
    };
  });
  if (config.default !== undefined && !uuid.test(config.default))
    throw new Error('The default timeline must be a timeline ID.');
  const fallback = config.default?.toLowerCase() ?? null;
  return {
    timelines: [...new Set([...routes.map((r) => r.timeline), ...(fallback ? [fallback] : [])])],
    // The kinds recorded (github-events.mjs EVENT_KINDS): all, `only` some, or all `except`
    // some.
    kinds: selectKinds({ only: config.only, except: config.except }),
    route(repository) {
      const r = parseRepository(repository);
      if (!r) return null;
      const path = r.path.toLowerCase();
      return (
        routes.find(
          (route) =>
            route.platform === r.platform &&
            route.host === r.host &&
            (route.wild ? path.startsWith(route.path) : path === route.path),
        )?.timeline ?? fallback
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
 * - `release`: a published release's moment; deleting or unpublishing it removes it.
 * - `milestone`: the milestone's duration and due moment; deleting it removes them.
 * `projects_v2_item` needs GraphQL, so the receiver resolves it (projectStatusChange).
 */
export function deliveryChanges(event, payload, kinds = eventKinds()) {
  const repository = payload?.repository?.full_name;
  if (event === 'sub_issues') return subIssueChanges(payload, kinds);
  if (!repositoryName(repository)) return [];
  const none = { durations: [], moments: [], removed: [], removedMoments: [], links: [] };
  if (event === 'push') {
    const change = pushChanges(repository, payload, kinds);
    return change ? [change] : [];
  }
  if ((event === 'create' || event === 'delete') && payload.ref_type === 'branch') {
    const verb = event === 'create' ? 'branch created' : 'branch deleted';
    if (!keeps(kinds, verb) || !payload.ref) return [];
    return [
      {
        ...none,
        repository,
        moments: [
          branchMoment(repository, payload.ref, {
            verb,
            time: payload.repository?.pushed_at
              ? new Date(
                  typeof payload.repository.pushed_at === 'number'
                    ? payload.repository.pushed_at * 1000
                    : payload.repository.pushed_at,
                ).toISOString()
              : new Date().toISOString(),
            person: payload.sender?.login,
          }),
        ],
      },
    ];
  }
  if (event === 'fork' && payload.forkee) {
    if (!keeps(kinds, 'forked')) return [];
    return [{ ...none, repository, moments: [forkMoment(repository, payload.forkee)] }];
  }
  if (event === 'release' && payload.release) {
    if (!keeps(kinds, 'released')) return [];
    const moment = ['deleted', 'unpublished'].includes(payload.action)
      ? null
      : releaseMoment(repository, payload.release);
    return [
      {
        ...none,
        repository,
        ...(moment
          ? { moments: [moment] }
          : { removedMoments: [releaseId(repository, payload.release)] }),
      },
    ];
  }
  if (event === 'milestone' && payload.milestone) {
    if (!keeps(kinds, 'milestone')) return [];
    if (payload.action === 'deleted')
      return [
        {
          ...none,
          repository,
          removed: [milestoneId(repository, payload.milestone)],
          removedMoments: milestoneChanges(repository, { ...payload.milestone, due_on: null })
            .removedMoments,
        },
      ];
    return [{ ...none, repository, ...milestoneChanges(repository, payload.milestone) }];
  }
  const mentions = (source, text, by) =>
    keeps(kinds, 'mentioned')
      ? mentionChanges(source, text, source.time, by).map((change) =>
          keeps(kinds, 'item') ? change : { ...change, links: [] },
        )
      : [];
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
    return keeps(kinds, 'item')
      ? [{ ...none, repository, removed: [itemId(repository, item.number, !!item.merge_request)] }]
      : [];
  const happened = deliveryMoments(event, payload, repository, item, kinds);
  const links = [
    ...happened.links,
    ...(event === 'pull_request'
      ? closedIssues(`${item.title ?? ''}\n${item.body ?? ''}`)
          .filter((n) => n !== item.number)
          .map((n) => closesLink(repository, item.number, n))
      : []),
  ];
  // Without items, their durations are not kept, nor links (which need them).
  const items = keeps(kinds, 'item');
  const own = {
    repository,
    durations: items ? [itemDuration(repository, item)] : [],
    moments: happened.moments,
    removed: [],
    links: items ? links : [],
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
