// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
/**
 * What happens to a GitHub issue or pull request, as moments on its timeline (#538): labels,
 * milestones, assignments, closing, reopening and merging, renames, review requests and
 * reviews, drafts, mentions, related issues, project status and the rest. Without I/O, except
 * resolving a project item's issue (GraphQL) for the receiver.
 *
 * Both the importer (from an item's timeline, GET /repos/{r}/issues/{n}/timeline) and the
 * webhook receiver (from deliveries) build each moment here, with an ID derived from the item,
 * what happened, to what and when, so the same event read by either is one moment.
 */
import { createHash } from 'node:crypto';
import {
  USER_AGENT,
  entityId,
  itemId,
  itemTag,
  personTag,
  repositoryName,
  repositoryTag,
  seconds,
} from './github-source.mjs';

/**
 * The kinds of event, each switchable (`events` in the routes, `--events` to the importer),
 * and the verbs each records. All are on unless a list names some.
 */
export const EVENT_KINDS = {
  assignments: ['assigned', 'unassigned'],
  labels: ['labeled', 'unlabeled'],
  milestones: ['milestoned', 'demilestoned', 'milestone', 'due'],
  state: ['closed', 'reopened', 'merged'],
  renames: ['renamed'],
  reviews: [
    'review requested',
    'review request removed',
    'reviewed',
    'ready for review',
    'converted to draft',
  ],
  mentions: ['mentioned'],
  relations: [
    'sub-issue added',
    'sub-issue removed',
    'parent issue added',
    'parent issue removed',
    'marked as duplicate',
    'unmarked as duplicate',
  ],
  status: ['moved', 'in column'],
  releases: ['released'],
  other: ['locked', 'unlocked', 'pinned', 'unpinned', 'transferred'],
};
const KIND_OF = new Map(
  Object.entries(EVENT_KINDS).flatMap(([kind, verbs]) => verbs.map((v) => [v, kind])),
);
/** The kinds to record: a list of EVENT_KINDS names, or all of them. */
export function eventKinds(list) {
  if (list === undefined || list === null) return new Set(Object.keys(EVENT_KINDS));
  const names = Array.isArray(list) ? list : String(list).split(',');
  const kinds = new Set(names.map((n) => String(n).trim()).filter(Boolean));
  for (const kind of kinds)
    if (!(kind in EVENT_KINDS))
      throw new Error(
        `Unknown kind of GitHub event "${kind}"; use ${Object.keys(EVENT_KINDS).join(', ')}.`,
      );
  return kinds;
}
/** Whether moments of `verb` are kept, given the kinds to record. */
export const keeps = (kinds, verb) => kinds.has(KIND_OF.get(verb));
const ALL_KINDS = eventKinds();

/** A part of an ID from free text: its safe characters, with a hash when anything was lost. */
function slug(text) {
  const plain = String(text ?? '');
  const safe = plain.replace(/[^A-Za-z0-9_.-]+/g, '-').slice(0, 32);
  return safe === plain && safe
    ? safe
    : safe + '-' + createHash('sha256').update(plain).digest('hex').slice(0, 8);
}
const lowerTag = (text) =>
  String(text)
    .normalize('NFC')
    .replace(/[\x00-\x1f\x7f,]/g, ' ')
    .trim()
    .toLowerCase()
    .slice(0, 64)
    .trim();

/**
 * One moment on an item: `verb` (an EVENT_KINDS verb) of `subject` (a label, a milestone, a
 * person, another item … or nothing) at `time`, by `person` (whom the person tag names: the
 * one assigned, the reviewer, or who did it). Titled `<what>: #<n> <title>`; tagged `github`,
 * the repository's and the item's tags, the verb, `tags`, and the person.
 */
export function eventMoment(repository, item, { verb, subject, time, person, tags = [], what }) {
  return {
    id: entityId(
      repository,
      String(item.number),
      slug(verb),
      ...(subject ? [slug(subject)] : []),
      seconds(time),
    ),
    time: seconds(time),
    metadata: {
      title: `${what}: #${item.number} ${item.title ?? ''}`.trim().slice(0, 300),
      ...(item.html_url ? { url: item.html_url } : {}),
      tags: [
        ...new Set(
          [
            'github',
            repositoryTag(repository),
            itemTag(repository, item.number),
            verb,
            ...tags,
            ...(person ? [personTag(person)] : []),
          ].map(lowerTag),
        ),
      ].slice(0, 40),
    },
  };
}
const labelName = (label) => (typeof label === 'string' ? label : label?.name) ?? '';
const login = (user) => user?.login ?? null;

/** A link between two items' durations (both must be on the timeline for it to be saved). */
export const itemLink = (a, b) => ({
  a: { duration: itemId(a.repository, a.number) },
  b: { duration: itemId(b.repository, b.number) },
  related: true,
});

/**
 * References to items in text: `#12` (in `repository`), `owner/name#12`, and addresses of
 * issues and pull requests on github.com. Each once, in order.
 */
export function mentionedItems(text, repository) {
  const found = new Map();
  const add = (repo, number) => {
    const n = Number(number);
    if (repositoryName(repo) && Number.isSafeInteger(n) && n > 0)
      found.set(repo.toLowerCase() + '#' + n, { repository: repo, number: n });
  };
  const source = String(text ?? '');
  for (const m of source.matchAll(
    /https:\/\/github\.com\/([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)\/(?:issues|pull)\/(\d{1,9})\b/g,
  ))
    add(m[1], m[2]);
  for (const m of source.matchAll(
    /(?<![\w/.#-])(?:([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+))?#(\d{1,9})\b/g,
  ))
    add(m[1] ?? repository, m[2]);
  return [...found.values()];
}

/**
 * The moments (and links) for an item mentioned by another: on the mentioned item, "Mentioned
 * in <source>", one per source (mentioning it again, or editing the text, keeps one moment);
 * and a link between the two. Returns one change per mentioned item's repository.
 */
export function mentionChanges(source, text, time, by) {
  return mentionedItems(text, source.repository)
    .filter(
      (m) =>
        !(
          m.repository.toLowerCase() === source.repository.toLowerCase() &&
          m.number === source.number
        ),
    )
    .map((target) => ({
      repository: target.repository,
      durations: [],
      removed: [],
      moments: [
        {
          ...eventMoment(
            target.repository,
            { number: target.number },
            {
              verb: 'mentioned',
              subject: `${source.repository}#${source.number}`,
              time,
              person: by,
              tags: [itemTag(source.repository, source.number)],
              what: `Mentioned in ${source.repository}#${source.number}`,
            },
          ),
          // One moment per source, whenever it was (re)written.
          id: entityId(
            target.repository,
            String(target.number),
            'mentioned',
            slug(`${source.repository}#${source.number}`),
          ),
        },
      ],
      links: [itemLink(source, target)],
    }));
}

/**
 * A move on a project board from an item's timeline, `{project, column, time}`, or null: classic
 * projects name the column; Projects' status events may not, and then it is not known.
 */
export function moveOf(event) {
  if (
    !['moved_columns_in_project', 'added_to_project', 'project_v2_item_status_changed'].includes(
      event.event,
    )
  )
    return null;
  const column =
    event.project_card?.column_name ??
    event.project_v2_item_status?.name ??
    event.status?.name ??
    event.to?.name ??
    null;
  const time = event.created_at;
  return column && time
    ? { project: event.project?.name ?? event.project_v2?.title ?? undefined, column, time }
    : null;
}
/** The verb (see EVENT_KINDS) each GitHub timeline event is recorded as. */
const VERB_OF = {
  assigned: 'assigned',
  unassigned: 'unassigned',
  labeled: 'labeled',
  unlabeled: 'unlabeled',
  milestoned: 'milestoned',
  demilestoned: 'demilestoned',
  closed: 'closed',
  reopened: 'reopened',
  merged: 'merged',
  renamed: 'renamed',
  review_requested: 'review requested',
  review_request_removed: 'review request removed',
  reviewed: 'reviewed',
  ready_for_review: 'ready for review',
  convert_to_draft: 'converted to draft',
  'cross-referenced': 'mentioned',
  marked_as_duplicate: 'marked as duplicate',
  unmarked_as_duplicate: 'unmarked as duplicate',
  sub_issue_added: 'sub-issue added',
  sub_issue_removed: 'sub-issue removed',
  parent_issue_added: 'parent issue added',
  parent_issue_removed: 'parent issue removed',
  moved_columns_in_project: 'moved',
  added_to_project: 'moved',
  project_v2_item_status_changed: 'moved',
  locked: 'locked',
  unlocked: 'unlocked',
  pinned: 'pinned',
  unpinned: 'unpinned',
  transferred: 'transferred',
};
/**
 * One event from an item's timeline (the importer): `{moments, links}`, or null for events it
 * does not record, or of kinds not in `kinds` (all by default). Links go to items in
 * `repository` only, and only when both are imported.
 */
export function timelineEvent(repository, item, event, kinds = ALL_KINDS) {
  const time = event.created_at ?? event.submitted_at;
  const verb = VERB_OF[event.event];
  if (!time || !verb || !keeps(kinds, verb)) return null;
  const actor = login(event.actor) ?? login(event.user);
  const one = (verb, options) => ({
    moments: [eventMoment(repository, item, { verb, time, person: actor, ...options })],
    links: [],
  });
  switch (event.event) {
    case 'assigned':
    case 'unassigned': {
      const who = login(event.assignee) ?? 'someone';
      return one(event.event, {
        subject: who,
        person: who,
        what: `${event.event === 'assigned' ? 'Assigned' : 'Unassigned'} ${who}`,
      });
    }
    case 'labeled':
    case 'unlabeled': {
      const name = labelName(event.label);
      return one(event.event, {
        subject: name,
        tags: ['label:' + name],
        what: `${event.event === 'labeled' ? 'Labelled' : 'Unlabelled'} ${name}`,
      });
    }
    case 'milestoned':
    case 'demilestoned': {
      const title = event.milestone?.title ?? '';
      return one(event.event, {
        subject: title,
        tags: ['milestone:' + title],
        what: `${event.event === 'milestoned' ? 'Added to milestone' : 'Removed from milestone'} ${title}`,
      });
    }
    case 'closed':
    case 'reopened':
    case 'merged':
      return one(event.event, {
        what: { closed: 'Closed', reopened: 'Reopened', merged: 'Merged' }[event.event],
      });
    case 'renamed':
      return one('renamed', {
        subject: event.rename?.to,
        what: `Renamed from “${event.rename?.from ?? ''}”`,
      });
    case 'review_requested':
    case 'review_request_removed': {
      const who = login(event.requested_reviewer) ?? event.requested_team?.name ?? 'someone';
      const verb =
        event.event === 'review_requested' ? 'review requested' : 'review request removed';
      return one(verb, {
        subject: who,
        person: who,
        what: `${event.event === 'review_requested' ? 'Review requested from' : 'Review no longer requested from'} ${who}`,
      });
    }
    case 'reviewed': {
      const who = login(event.user) ?? 'someone';
      const state = String(event.state ?? 'commented').toLowerCase();
      return one('reviewed', {
        subject: `${who}:${state}`,
        person: who,
        tags: ['review:' + state.replace(/_/g, ' ')],
        what:
          {
            approved: 'Approved by',
            changes_requested: 'Changes requested by',
            commented: 'Reviewed by',
            dismissed: 'Review dismissed:',
          }[state] + ` ${who}`,
      });
    }
    case 'ready_for_review':
      return one('ready for review', { what: 'Ready for review' });
    case 'convert_to_draft':
      return one('converted to draft', { what: 'Converted to draft' });
    case 'cross-referenced': {
      // Mentioned by another item: recorded on this one, linked when in this repository.
      const from = event.source?.issue;
      const repo = from?.repository?.full_name;
      if (!from || !repositoryName(repo)) return null;
      const source = { repository: repo, number: from.number };
      return {
        moments: [
          {
            ...eventMoment(repository, item, {
              verb: 'mentioned',
              subject: `${repo}#${from.number}`,
              time,
              person: actor,
              tags: [itemTag(repo, from.number)],
              what: `Mentioned in ${repo}#${from.number}${from.title ? ' ' + from.title : ''}`,
            }),
            id: entityId(
              repository,
              String(item.number),
              'mentioned',
              slug(`${repo}#${from.number}`),
            ),
          },
        ],
        links:
          repo.toLowerCase() === repository.toLowerCase()
            ? [itemLink(source, { repository, number: item.number })]
            : [],
      };
    }
    case 'marked_as_duplicate':
    case 'unmarked_as_duplicate':
      return one(verb, {
        what:
          event.event === 'marked_as_duplicate' ? 'Marked as a duplicate' : 'No longer a duplicate',
      });
    case 'sub_issue_added':
    case 'sub_issue_removed':
    case 'parent_issue_added':
    case 'parent_issue_removed': {
      const other = event.sub_issue ?? event.parent_issue;
      const repo = other?.repository?.full_name ?? repository;
      const ref = other?.number ? `${repo}#${other.number}` : '';
      return {
        moments: [
          eventMoment(repository, item, {
            verb,
            subject: ref,
            time,
            person: actor,
            tags: other?.number ? [itemTag(repo, other.number)] : [],
            what: `${verb[0].toUpperCase()}${verb.slice(1)}${ref ? ' ' + ref : ''}`,
          }),
        ],
        links:
          other?.number && event.event.endsWith('added') && repositoryName(repo)
            ? [
                itemLink(
                  { repository, number: item.number },
                  { repository: repo, number: other.number },
                ),
              ]
            : [],
      };
    }
    case 'moved_columns_in_project':
    case 'added_to_project':
    case 'project_v2_item_status_changed': {
      const column = moveOf(event)?.column;
      if (!column) return null;
      return one('moved', {
        subject: column,
        tags: ['status:' + column],
        what: `Moved to ${column}`,
      });
    }
    case 'locked':
    case 'unlocked':
    case 'pinned':
    case 'unpinned':
    case 'transferred':
      return one(event.event, { what: event.event[0].toUpperCase() + event.event.slice(1) });
    default:
      return null;
  }
}

/**
 * The moments one webhook delivery adds for its item (beside its duration, which
 * deliveryChanges writes): from `issues`, `pull_request`, `pull_request_review` and
 * `sub_issues` deliveries. The time is when GitHub last updated the item (or the review was
 * submitted), as close as a delivery tells.
 */
export function deliveryMoments(event, payload, repository, item, kinds = ALL_KINDS) {
  const time = item.updated_at ?? new Date().toISOString();
  const as = (name, extra = {}) =>
    timelineEvent(
      repository,
      item,
      {
        event: name,
        created_at: time,
        actor: payload.sender,
        ...extra,
      },
      kinds,
    );
  const a = payload.action;
  let result = null;
  if (a === 'assigned' || a === 'unassigned') result = as(a, { assignee: payload.assignee });
  else if (a === 'labeled' || a === 'unlabeled') result = as(a, { label: payload.label });
  else if (a === 'milestoned' || a === 'demilestoned')
    result = as(a, { milestone: payload.milestone ?? item.milestone });
  else if (a === 'closed')
    result = as(event === 'pull_request' && item.merged ? 'merged' : 'closed', {
      created_at: (item.merged ? item.merged_at : item.closed_at) ?? time,
    });
  else if (a === 'reopened') result = as('reopened');
  else if (a === 'edited' && payload.changes?.title)
    result = as('renamed', { rename: { from: payload.changes.title.from, to: item.title } });
  else if (a === 'review_requested' || a === 'review_request_removed')
    result = as(a, {
      requested_reviewer: payload.requested_reviewer,
      requested_team: payload.requested_team,
    });
  else if (a === 'ready_for_review') result = as('ready_for_review');
  else if (a === 'converted_to_draft') result = as('convert_to_draft');
  else if (['locked', 'unlocked', 'pinned', 'unpinned', 'transferred'].includes(a)) result = as(a);
  else if (event === 'pull_request_review' && a === 'submitted' && payload.review)
    result = as('reviewed', {
      created_at: payload.review.submitted_at ?? time,
      user: payload.review.user,
      state: payload.review.state,
    });
  return result ?? { moments: [], links: [] };
}

/**
 * A `sub_issues` delivery: the parent's and the child's moments and their link, as the
 * importer reads them from either item's timeline.
 */
export function subIssueChanges(payload, kinds = ALL_KINDS) {
  const parent = payload.parent_issue,
    child = payload.sub_issue;
  const parentRepo = payload.parent_issue_repo?.full_name ?? payload.repository?.full_name;
  const childRepo = payload.sub_issue_repo?.full_name ?? payload.repository?.full_name;
  if (
    !parent?.number ||
    !child?.number ||
    !repositoryName(parentRepo) ||
    !repositoryName(childRepo)
  )
    return [];
  const time = parent.updated_at ?? child.updated_at ?? new Date().toISOString();
  const added = String(payload.action ?? '').endsWith('added');
  const parentEvent = timelineEvent(
    parentRepo,
    parent,
    {
      event: added ? 'sub_issue_added' : 'sub_issue_removed',
      created_at: time,
      actor: payload.sender,
      sub_issue: { number: child.number, repository: { full_name: childRepo } },
    },
    kinds,
  );
  const childEvent = timelineEvent(
    childRepo,
    child,
    {
      event: added ? 'parent_issue_added' : 'parent_issue_removed',
      created_at: time,
      actor: payload.sender,
      parent_issue: { number: parent.number, repository: { full_name: parentRepo } },
    },
    kinds,
  );
  return [
    ...(parentEvent
      ? [{ repository: parentRepo, durations: [], removed: [], ...parentEvent }]
      : []),
    ...(childEvent
      ? [
          {
            repository: childRepo,
            durations: [],
            removed: [],
            moments: childEvent.moments,
            links: [],
          },
        ]
      : []),
  ];
}

/**
 * A `projects_v2_item` delivery that changed an item's Status: `{repository, moments}` for the
 * item, resolving its issue and the project's title through GraphQL with `token` (deliveries
 * name them by node ID only). Null for other changes, items that are drafts, or without a token.
 */
export async function projectStatusChange(
  payload,
  token,
  fetcher = fetch,
  api = 'https://api.github.com',
) {
  const change = payload?.changes?.field_value;
  const item = payload?.projects_v2_item;
  if (payload?.action !== 'edited' || !change || !item || !token) return null;
  if (String(change.field_name ?? '').toLowerCase() !== 'status') return null;
  if (item.content_type !== 'Issue' && item.content_type !== 'PullRequest') return null;
  const column = change.to?.name ?? null;
  if (!column) return null;
  const response = await fetcher(api.replace(/\/+$/, '') + '/graphql', {
    method: 'POST',
    redirect: 'error',
    signal: AbortSignal.timeout(30000),
    headers: {
      Authorization: 'Bearer ' + token,
      'Content-Type': 'application/json',
      'User-Agent': USER_AGENT,
    },
    body: JSON.stringify({
      query:
        'query($item: ID!, $project: ID!) { item: node(id: $item) { ... on Issue { number title url repository { nameWithOwner } } ... on PullRequest { number title url repository { nameWithOwner } } } project: node(id: $project) { ... on ProjectV2 { title } } }',
      variables: { item: item.content_node_id, project: item.project_node_id },
    }),
  });
  if (response.status !== 200) return null;
  const data = (await response.json())?.data;
  const issue = data?.item,
    repository = issue?.repository?.nameWithOwner;
  if (!issue?.number || !repositoryName(repository)) return null;
  const project = data?.project?.title;
  const moment = eventMoment(
    repository,
    { number: issue.number, title: issue.title, html_url: issue.url },
    {
      verb: 'moved',
      subject: `${project ?? ''}:${column}`,
      time: item.updated_at ?? new Date().toISOString(),
      person: login(payload.sender),
      tags: ['status:' + column, ...(project ? ['project:' + project] : [])],
      what: `Moved to ${column}${project ? ' in ' + project : ''}`,
    },
  );
  return {
    repository,
    durations: [],
    removed: [],
    moments: [moment],
    links: [],
    move: {
      item: { number: issue.number, title: issue.title, html_url: issue.url },
      project,
      column,
      time: item.updated_at ?? new Date().toISOString(),
    },
  };
}

/**
 * A release, as a moment on its repository: when it was published (drafts are not), titled
 * with its tag and name, tagged `released`, `release:<tag>` and its author. Keyed by GitHub's
 * release ID, so an edit rewrites it and a deletion removes it.
 */
export function releaseMoment(repository, release) {
  if (!release?.published_at || release.draft) return null;
  const name = release.name && release.name !== release.tag_name ? ` ${release.name}` : '';
  return {
    id: entityId(repository, 'release', String(release.id)),
    time: seconds(release.published_at),
    metadata: {
      title: `Released ${release.tag_name}${name}`.slice(0, 300),
      ...(release.html_url ? { url: release.html_url } : {}),
      tags: [
        ...new Set(
          [
            'github',
            repositoryTag(repository),
            'released',
            'release:' + release.tag_name,
            ...(release.prerelease ? ['prerelease'] : []),
            ...(release.author?.login ? [personTag(release.author.login)] : []),
          ].map(lowerTag),
        ),
      ],
    },
  };
}
export const releaseId = (repository, release) =>
  entityId(repository, 'release', String(release.id));

/**
 * A milestone, as a duration on its repository: from when it was created until it was closed,
 * ongoing while open; and, when it has a due date, a moment then. Tagged `milestone`,
 * `milestone:<title>` (as its items are) and its state.
 */
export function milestoneChanges(repository, milestone) {
  const tags = [
    'github',
    repositoryTag(repository),
    'milestone',
    'milestone:' + milestone.title,
    'state:' + (milestone.state === 'closed' ? 'closed' : 'open'),
  ].map(lowerTag);
  const description = typeof milestone.description === 'string' ? milestone.description : '';
  const duration = {
    id: milestoneId(repository, milestone),
    start: seconds(milestone.created_at),
    end:
      milestone.state === 'closed' && milestone.closed_at
        ? seconds(milestone.closed_at)
        : { ongoing: true },
    metadata: {
      title: `Milestone ${milestone.title}`.slice(0, 300),
      ...(description || milestone.html_url
        ? {
            description:
              description.slice(0, 4000) +
              (milestone.html_url ? (description ? '\n\n' : '') + milestone.html_url : ''),
          }
        : {}),
      ...(milestone.html_url ? { url: milestone.html_url } : {}),
      tags: [...new Set(tags)],
    },
  };
  const due = milestone.due_on
    ? {
        id: entityId(repository, 'milestone', String(milestone.number), 'due'),
        time: seconds(milestone.due_on),
        metadata: {
          title: `Due: milestone ${milestone.title}`.slice(0, 300),
          ...(milestone.html_url ? { url: milestone.html_url } : {}),
          tags: [...new Set([...tags.slice(0, 4), 'due'].map(lowerTag))],
        },
      }
    : null;
  return {
    durations: [duration],
    moments: due ? [due] : [],
    removedMoments: due ? [] : [dueId(repository, milestone)],
  };
}
export const milestoneId = (repository, milestone) =>
  entityId(repository, 'milestone', String(milestone.number));
const dueId = (repository, milestone) =>
  entityId(repository, 'milestone', String(milestone.number), 'due');

/**
 * The time an item spent in one column of a project board, as a duration: from when it was
 * moved there, until it was moved on (`end`), or ongoing. Titled `#412 in Review (Roadmap)`,
 * tagged with the item's tags, `in column`, `status:<column>` and `project:<name>`: separated
 * by `status:` tags, the board's columns become rows, each showing how long work sat there.
 */
export function columnStint(repository, item, { project, column, start, end }) {
  return {
    id: entityId(
      repository,
      String(item.number),
      'in',
      ...(project ? [slug(project)] : []),
      slug(column),
      seconds(start),
    ),
    start: seconds(start),
    end: end ? seconds(end) : { ongoing: true },
    metadata: {
      title: `#${item.number} in ${column}${project ? ` (${project})` : ''}`.slice(0, 300),
      ...(item.html_url ? { url: item.html_url } : {}),
      tags: [
        ...new Set(
          [
            'github',
            repositoryTag(repository),
            itemTag(repository, item.number),
            'in column',
            'status:' + column,
            ...(project ? ['project:' + project] : []),
          ].map(lowerTag),
        ),
      ],
    },
  };
}
/**
 * An item's column stints from its moves, in time order (`{project, column, time}`): each
 * lasts until the next move on the same board, and the last until the item closed, or is
 * ongoing while it is open.
 */
export function stintsFromMoves(repository, item, moves) {
  const boards = new Map();
  for (const move of [...moves].sort((a, b) => Date.parse(a.time) - Date.parse(b.time))) {
    const key = move.project ?? '';
    if (!boards.has(key)) boards.set(key, []);
    boards.get(key).push(move);
  }
  const closed = item.state === 'closed' ? (item.closed_at ?? null) : null;
  const stints = [];
  for (const list of boards.values())
    list.forEach((move, i) =>
      stints.push(
        columnStint(repository, item, {
          project: move.project,
          column: move.column,
          start: move.time,
          end: list[i + 1]?.time ?? closed,
        }),
      ),
    );
  return stints;
}

/**
 * The receiver's memory of each item's open column stint per board, so a move can end the one
 * before it: `{column, start}` by `<repository>#<number>|<project>`. Kept in `file` (JSON)
 * when given, so a restart remembers; without it, a stint open when the receiver restarted
 * stays ongoing until the importer or a later move corrects it.
 */
export class StintTracker {
  constructor(file, { read, write } = {}) {
    this.file = file;
    this.write = write;
    this.open = new Map(file && read ? Object.entries(read(file) ?? {}) : []);
  }
  save() {
    if (this.file && this.write) this.write(this.file, Object.fromEntries(this.open));
  }
  /** A move: the stint it ends (with its end) and the one it opens. */
  move(repository, item, { project, column, time }) {
    const key = `${repository.toLowerCase()}#${item.number}|${project ?? ''}`;
    const before = this.open.get(key);
    const durations = [];
    if (before && before.column !== column)
      durations.push(
        columnStint(repository, item, {
          project,
          column: before.column,
          start: before.start,
          end: time,
        }),
      );
    if (!before || before.column !== column) {
      durations.push(columnStint(repository, item, { project, column, start: time }));
      this.open.set(key, { column, start: time });
      this.save();
    }
    return durations;
  }
  /** The item closed: its open stints end then. */
  close(repository, item, time) {
    const prefix = `${repository.toLowerCase()}#${item.number}|`;
    const durations = [];
    for (const [key, stint] of this.open)
      if (key.startsWith(prefix)) {
        durations.push(
          columnStint(repository, item, {
            project: key.slice(prefix.length) || undefined,
            column: stint.column,
            start: stint.start,
            end: time,
          }),
        );
        this.open.delete(key);
      }
    if (durations.length) this.save();
    return durations;
  }
}
