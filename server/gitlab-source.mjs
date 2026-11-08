// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
/**
 * GitLab as a source of timeline events (#538): issues and merge requests (numbered apart, so
 * a merge request is `!12`), what happens to them, commits, branches, forks, releases and
 * milestones. GitLab's API and webhooks differ from GitHub's more than Forgejo's do: an item's
 * history is in three event listings and its system notes (plain sentences), and a webhook
 * carries each change's before and after. Both are turned into the GitHub shapes that
 * github-source.mjs and github-events.mjs read. Repositories are `gitlab:<host>/<path>`, with
 * nested groups; on gitlab.com their tags leave the host out.
 */
import { createHash, timingSafeEqual } from 'node:crypto';
import {
  closedIssues,
  closesLink,
  entityId,
  itemDuration,
  itemId,
  parseRepository,
  repositoryReference,
} from './github-source.mjs';
import {
  branchMoment,
  commitLinks,
  commitMoment,
  eventKinds,
  forkMoment,
  keeps,
  mentionChanges,
  milestoneChanges,
  pushChanges,
  releaseMoment,
  timelineEvent,
} from './github-events.mjs';
import { relationshipKey } from '../dist/core.mjs';

/** A project as a repository reference, from its address and its path with namespace. */
export function gitlabRepository(project) {
  const url = project?.web_url ?? project?.homepage;
  const path = project?.path_with_namespace;
  return url && path ? repositoryReference('gitlab', new URL(url).host, path) : null;
}

/** Checks a delivery's `X-Gitlab-Token` against the webhook's secret token, in constant time. */
export function validGitlabToken(secret, header) {
  if (typeof secret !== 'string' || typeof header !== 'string') return false;
  const digest = (text) => createHash('sha256').update(text).digest();
  return timingSafeEqual(digest(secret), digest(header));
}

const user = (u) => (u?.username ? { login: u.username } : null);
const labelNames = (labels) =>
  (labels ?? []).map((l) => (typeof l === 'string' ? l : (l.title ?? l.name)));

/**
 * An issue or merge request (from the API, or a webhook's `object_attributes` with its
 * `assignees` and `labels`) as the GitHub item itemDuration reads: `iid` is its number, and a
 * merge request is marked so its tag and ID use `!`.
 */
export function gitlabItem(object, mergeRequest, extra = {}) {
  const state = object.state === 'opened' ? 'open' : 'closed';
  const merged = object.state === 'merged' ? (object.merged_at ?? object.updated_at) : null;
  return {
    number: object.iid,
    title: object.title,
    body: object.description ?? '',
    state,
    created_at: object.created_at,
    updated_at: object.updated_at,
    closed_at: merged ?? object.closed_at ?? (state === 'closed' ? object.updated_at : null),
    html_url: object.web_url ?? object.url,
    assignees: (extra.assignees ?? object.assignees ?? []).map(user).filter(Boolean),
    labels: labelNames(extra.labels ?? object.labels).map((name) => ({ name })),
    ...(object.milestone?.title ? { milestone: { title: object.milestone.title } } : {}),
    ...(mergeRequest
      ? { merge_request: true, pull_request: { merged_at: merged }, merged_at: merged }
      : {}),
  };
}

/** A title from a system note, where GitLab marks what changed: {-removed-} and {+added+}. */
const titleSide = (text, side) =>
  text
    .replace(side === 'old' ? /\{\+.*?\+\}/g : /\{-.*?-\}/g, '')
    .replace(/\{[-+](.*?)[-+]\}/g, '$1');

/**
 * What a system note says happened, as GitHub timeline events (none when it says nothing kept
 * here): assignments, review requests, approvals, drafts, renames, mentions, locks and
 * duplicates. Labels, milestones and closing come from GitLab's event listings instead.
 */
export function noteEvents(note, repository) {
  if (!note?.system) return [];
  const body = String(note.body ?? '');
  const base = { created_at: note.created_at, actor: user(note.author) };
  const people = (text) => [...text.matchAll(/@([A-Za-z0-9_.-]+)/g)].map((m) => ({ login: m[1] }));
  const events = [];
  for (const part of body.split(/ and (?=(?:un)?assigned|removed|requested)/)) {
    let m;
    if ((m = /^assigned to (.+)$/.exec(part)))
      for (const p of people(m[1])) events.push({ ...base, event: 'assigned', assignee: p });
    else if ((m = /^unassigned (.+)$/.exec(part)))
      for (const p of people(m[1])) events.push({ ...base, event: 'unassigned', assignee: p });
    else if ((m = /^requested review from (.+)$/.exec(part)))
      for (const p of people(m[1]))
        events.push({ ...base, event: 'review_requested', requested_reviewer: p });
    else if ((m = /^removed review request for (.+)$/.exec(part)))
      for (const p of people(m[1]))
        events.push({ ...base, event: 'review_request_removed', requested_reviewer: p });
  }
  let m;
  if (/^approved this merge request/.test(body))
    events.push({
      ...base,
      event: 'reviewed',
      state: 'approved',
      user: user(note.author),
      submitted_at: note.created_at,
    });
  else if (/^marked this merge request as \*\*draft\*\*/.test(body))
    events.push({ ...base, event: 'convert_to_draft' });
  else if (/^marked this merge request as \*\*ready\*\*/.test(body))
    events.push({ ...base, event: 'ready_for_review' });
  else if ((m = /^changed title from \*\*(.*)\*\* to \*\*(.*)\*\*$/s.exec(body)))
    events.push({
      ...base,
      event: 'renamed',
      rename: { from: titleSide(m[1], 'old'), to: titleSide(m[2], 'new') },
    });
  else if ((m = /^mentioned in (issue|merge request) (?:([\w./-]+))?([#!])(\d+)/.exec(body))) {
    const r = parseRepository(repository);
    const ref = m[2] ? repositoryReference('gitlab', r.host, m[2]) : repository;
    events.push({
      ...base,
      event: 'cross-referenced',
      source: {
        issue: {
          number: Number(m[4]),
          merge_request: m[3] === '!',
          repository: { full_name: ref },
        },
      },
    });
  } else if (/^locked (this|the discussion)/.test(body)) events.push({ ...base, event: 'locked' });
  else if (/^unlocked (this|the discussion)/.test(body))
    events.push({ ...base, event: 'unlocked' });
  else if (/^marked this issue as a duplicate of/.test(body))
    events.push({ ...base, event: 'marked_as_duplicate' });
  return events;
}

/** A resource event (label, milestone or state) as a GitHub timeline event. */
export function resourceEvent(kind, entry) {
  const base = { created_at: entry.created_at, actor: user(entry.user) };
  if (kind === 'label' && entry.label)
    return {
      ...base,
      event: entry.action === 'remove' ? 'unlabeled' : 'labeled',
      label: { name: entry.label.name },
    };
  if (kind === 'milestone' && entry.milestone)
    return {
      ...base,
      event: entry.action === 'remove' ? 'demilestoned' : 'milestoned',
      milestone: { title: entry.milestone.title },
    };
  if (kind === 'state')
    return entry.state === 'closed' || entry.state === 'reopened' || entry.state === 'merged'
      ? { ...base, event: entry.state }
      : null;
  return null;
}

/** The kinds that need each item read, and which of its listings each needs. */
const LISTINGS = {
  label: ['labels'],
  milestone: ['milestones'],
  state: ['state'],
  notes: ['assignments', 'reviews', 'renames', 'mentions', 'relations', 'other'],
};

/**
 * Reads one GitLab project into timeline changes, as readRepository (import-github.mjs) does a
 * GitHub repository's: issues and merge requests, what happened to them (from their label,
 * milestone and state events, and their system notes), commits by branch, branches, forks,
 * releases and milestones, of the kinds in `kinds`, since `since` when given.
 */
export async function readGitlab(reader, repository, { since, kinds = eventKinds() } = {}) {
  const { path } = parseRepository(repository);
  const project = `/projects/${encodeURIComponent(path)}`;
  const after = (time) => !since || (time && Date.parse(time) >= Date.parse(since));
  const durations = [],
    moments = [],
    removedMoments = [],
    links = [],
    items = [],
    warnings = [];
  // Listings GitLab keeps from readers without a token (on gitlab.com: events, notes and
  // milestones) are left out, once each, with a warning, rather than failing the import.
  const refused = new Set();
  const all = async (listing, url, query = {}) => {
    if (refused.has(listing)) return [];
    const entries = [];
    try {
      for await (const entry of reader.list(url, query)) entries.push(entry);
    } catch (error) {
      if (error.status !== 401 && error.status !== 403) throw error;
      refused.add(listing);
      warnings.push(`${listing} need a token that can read the project (GITLAB_TOKEN); left out.`);
      return [];
    }
    return entries;
  };
  const perItem = Object.values(LISTINGS).flat();
  if (kinds.has('items') || perItem.some((k) => kinds.has(k)))
    for (const [kind, mr] of [
      ['issues', false],
      ['merge_requests', true],
    ])
      for await (const object of reader.list(`${project}/${kind}`, {
        scope: 'all',
        order_by: 'created_at',
        sort: 'asc',
        ...(since ? { updated_after: since } : {}),
      })) {
        const item = gitlabItem(object, mr);
        items.push(item);
        if (keeps(kinds, 'item')) durations.push(itemDuration(repository, item));
      }
  for (const item of items) {
    const kind = item.merge_request ? 'merge_requests' : 'issues';
    const events = [];
    for (const [listing, needs] of Object.entries(LISTINGS)) {
      if (!needs.some((k) => kinds.has(k))) continue;
      const url =
        listing === 'notes'
          ? `${project}/${kind}/${item.number}/notes`
          : `${project}/${kind}/${item.number}/resource_${listing}_events`;
      for (const entry of await all(
        listing === 'notes' ? 'Notes' : `The ${listing} events`,
        url,
        listing === 'notes' ? { sort: 'asc' } : {},
      ))
        events.push(
          ...(listing === 'notes'
            ? noteEvents(entry, repository)
            : [resourceEvent(listing, entry)]),
        );
    }
    for (const event of events) {
      if (!event || !after(event.created_at)) continue;
      const changes = timelineEvent(repository, item, event, kinds);
      if (!changes) continue;
      moments.push(...changes.moments);
      links.push(...changes.links);
    }
  }
  // Commits, the default branch's first; then each other branch until it meets history read.
  const commitIds = new Set();
  if (keeps(kinds, 'commit') || keeps(kinds, 'branch')) {
    const main = (await reader.get(`${reader.api}${project}`)).value.default_branch;
    const branches = [{ name: main }];
    for await (const branch of reader.list(`${project}/repository/branches`))
      // A branch with nothing since `since` is not read: GitLab dates each one's last commit.
      if (branch.name !== main && after(branch.commit?.committed_date ?? branch.commit?.created_at))
        branches.push({ name: branch.name, head: branch.commit?.id });
    const seen = new Set();
    for (const { name: branch, head } of branches) {
      if (head && seen.has(head)) continue;
      let first = null;
      for await (const entry of reader.list(`${project}/repository/commits`, {
        ref_name: branch,
        ...(since ? { since } : {}),
      })) {
        if (seen.has(entry.id)) break;
        seen.add(entry.id);
        // GitLab names a commit's author, not their account: no person tag.
        const commit = {
          sha: entry.id,
          message: entry.message,
          time: entry.authored_date ?? entry.created_at,
          url: entry.web_url,
          login: null,
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
        moments.push(branchMoment(repository, branch, { verb: 'branch', time: first.time }));
    }
  }
  if (keeps(kinds, 'forked'))
    for await (const fork of reader.list(`${project}/forks`))
      if (after(fork.created_at))
        moments.push(
          forkMoment(repository, {
            full_name: fork.path_with_namespace,
            created_at: fork.created_at,
            html_url: fork.web_url,
            owner: { login: fork.owner?.username ?? fork.namespace?.path },
          }),
        );
  if (keeps(kinds, 'released'))
    for await (const release of reader.list(`${project}/releases`)) {
      const moment = releaseMoment(repository, gitlabRelease(release));
      if (moment && after(release.released_at)) moments.push(moment);
    }
  if (keeps(kinds, 'milestone'))
    for (const milestone of await all('Milestones', `${project}/milestones`)) {
      if (!after(milestone.updated_at)) continue;
      const changes = milestoneChanges(repository, gitlabMilestone(milestone));
      durations.push(...changes.durations);
      moments.push(...changes.moments);
      removedMoments.push(...changes.removedMoments);
    }
  if (keeps(kinds, 'item'))
    for (const item of items)
      if (item.merge_request)
        for (const issue of closedIssues(`${item.title ?? ''}\n${item.body ?? ''}`))
          links.push({
            ...closesLink(repository, item.number, issue),
            a: { duration: itemId(repository, item.number, true) },
          });
  // Only links between entities written here, each once.
  const ids = keeps(kinds, 'item')
    ? new Set(items.map((i) => itemId(repository, i.number, !!i.merge_request)))
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
    items: keeps(kinds, 'item') ? items.length : 0,
    open: keeps(kinds, 'item') ? items.filter((i) => i.state === 'open').length : 0,
    commits: commitIds.size,
    warnings,
  };
}

/** A release as the GitHub release releaseMoment reads (GitLab keys them by tag). */
export function gitlabRelease(release) {
  return {
    id: release.tag_name,
    tag_name: release.tag_name,
    name: release.name,
    published_at: release.released_at ?? release.created_at,
    html_url: release._links?.self ?? release.url,
    author: release.author?.username ? { login: release.author.username } : null,
    prerelease: !!release.upcoming_release,
  };
}
/** A milestone as the GitHub milestone milestoneChanges reads. */
export function gitlabMilestone(milestone) {
  const closed = milestone.state === 'closed';
  return {
    number: milestone.iid,
    title: milestone.title,
    description: milestone.description,
    state: closed ? 'closed' : 'open',
    created_at: milestone.created_at,
    updated_at: milestone.updated_at,
    closed_at: closed ? milestone.updated_at : null,
    due_on: milestone.due_date ? `${milestone.due_date}T00:00:00Z` : null,
    html_url: milestone.web_url,
  };
}

/** The difference between two lists of names: those added and those removed. */
function difference(previous = [], current = []) {
  const before = new Set(previous),
    after = new Set(current);
  return {
    added: [...after].filter((x) => !before.has(x)),
    removed: [...before].filter((x) => !after.has(x)),
  };
}

/**
 * What one GitLab webhook delivery changes, as deliveryChanges (github-source.mjs) gives it:
 * `Issue Hook` and `Merge Request Hook` (the item's duration, and from `changes` its labels,
 * assignees, reviewers, title and draft state, and its closing, reopening, merging and
 * approval, as moments), `Note Hook` (mentions in a comment, not its text), `Push Hook`
 * (commits, and a branch created or deleted) and `Release Hook`.
 */
export function gitlabDeliveryChanges(event, payload, kinds = eventKinds()) {
  const repository = gitlabRepository(payload?.project);
  if (!repository) return [];
  const none = {
    repository,
    durations: [],
    moments: [],
    removed: [],
    removedMoments: [],
    links: [],
  };
  const actor = user(payload.user);
  if (event === 'Push Hook') {
    const branch = /^refs\/heads\/(.+)$/.exec(payload.ref ?? '')?.[1];
    if (!branch) return [];
    const zero = /^0+$/;
    const time = payload.commits?.at(-1)?.timestamp ?? new Date().toISOString();
    if (zero.test(payload.before ?? '') || zero.test(payload.after ?? '')) {
      const verb = zero.test(payload.after ?? '') ? 'branch deleted' : 'branch created';
      const created = keeps(kinds, verb)
        ? [
            {
              ...none,
              moments: [
                branchMoment(repository, branch, { verb, time, person: payload.user_username }),
              ],
            },
          ]
        : [];
      if (verb === 'branch deleted') return created;
      const commits = pushChanges(
        repository,
        { ref: payload.ref, commits: payload.commits },
        kinds,
      );
      return [...created, ...(commits ? [commits] : [])];
    }
    const commits = pushChanges(repository, { ref: payload.ref, commits: payload.commits }, kinds);
    return commits ? [commits] : [];
  }
  if (event === 'Release Hook') {
    if (!keeps(kinds, 'released')) return [];
    const release = gitlabRelease({ ...payload, author: null, _links: { self: payload.url } });
    if (payload.action === 'delete')
      return [{ ...none, removedMoments: [entityId(repository, 'release', String(release.id))] }];
    const moment = releaseMoment(repository, release);
    return moment ? [{ ...none, moments: [moment] }] : [];
  }
  if (event === 'Note Hook') {
    const noted = payload.issue ?? payload.merge_request;
    if (!noted?.iid || !keeps(kinds, 'mentioned')) return [];
    const changes = mentionChanges(
      {
        repository,
        number: noted.iid,
        mergeRequest: !!payload.merge_request,
        time: payload.object_attributes?.updated_at ?? payload.object_attributes?.created_at,
      },
      payload.object_attributes?.note,
      payload.object_attributes?.updated_at ?? payload.object_attributes?.created_at,
      payload.user?.username,
    );
    return keeps(kinds, 'item') ? changes : changes.map((c) => ({ ...c, links: [] }));
  }
  const mr = event === 'Merge Request Hook';
  if (event !== 'Issue Hook' && !mr) return [];
  const attributes = payload.object_attributes ?? {};
  const item = gitlabItem(attributes, mr, { assignees: payload.assignees, labels: payload.labels });
  const time = attributes.updated_at ?? new Date().toISOString();
  const as = (name, extra = {}) =>
    timelineEvent(repository, item, { event: name, created_at: time, actor, ...extra }, kinds);
  const happened = [];
  const changes = payload.changes ?? {};
  if (changes.labels) {
    const { added, removed } = difference(
      labelNames(changes.labels.previous),
      labelNames(changes.labels.current),
    );
    for (const name of added) happened.push(as('labeled', { label: { name } }));
    for (const name of removed) happened.push(as('unlabeled', { label: { name } }));
  }
  if (changes.assignees) {
    const names = (list) => (list ?? []).map((u) => u.username);
    const { added, removed } = difference(
      names(changes.assignees.previous),
      names(changes.assignees.current),
    );
    for (const login of added) happened.push(as('assigned', { assignee: { login } }));
    for (const login of removed) happened.push(as('unassigned', { assignee: { login } }));
  }
  if (changes.reviewers) {
    const names = (list) => (list ?? []).map((u) => u.username);
    const { added, removed } = difference(
      names(changes.reviewers.previous),
      names(changes.reviewers.current),
    );
    for (const login of added)
      happened.push(as('review_requested', { requested_reviewer: { login } }));
    for (const login of removed)
      happened.push(as('review_request_removed', { requested_reviewer: { login } }));
  }
  if (changes.title?.previous)
    happened.push(
      as('renamed', { rename: { from: changes.title.previous, to: changes.title.current } }),
    );
  if (changes.draft)
    happened.push(as(changes.draft.current ? 'convert_to_draft' : 'ready_for_review'));
  const action = attributes.action;
  if (action === 'close') happened.push(as('closed'));
  else if (action === 'reopen') happened.push(as('reopened'));
  else if (action === 'merge') happened.push(as('merged'));
  else if (action === 'approved')
    happened.push(as('reviewed', { state: 'approved', user: actor, submitted_at: time }));
  const own = {
    ...none,
    durations: keeps(kinds, 'item') ? [itemDuration(repository, item)] : [],
    moments: happened.flatMap((h) => h?.moments ?? []),
    links: [],
  };
  if (mr && keeps(kinds, 'item'))
    own.links = closedIssues(`${item.title ?? ''}\n${item.body ?? ''}`).map((n) => ({
      a: { duration: itemId(repository, item.number, true) },
      b: { duration: itemId(repository, n) },
      related: true,
    }));
  const mentioned =
    keeps(kinds, 'mentioned') && (action === 'open' || changes.description || changes.title)
      ? mentionChanges(
          { repository, number: item.number, mergeRequest: mr, time },
          `${item.title ?? ''}\n${item.body ?? ''}`,
          time,
          payload.user?.username,
        ).map((c) => (keeps(kinds, 'item') ? c : { ...c, links: [] }))
      : [];
  return [own, ...mentioned];
}
