// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
/**
 * The Branches view (#557): what och-import-github sets up as a mirrored repository's default
 * view. Each of the most recently active branches is a separation by its tag, which disjoins
 * from the main timeline when the branch began and unites back into it when it was merged
 * (docs/github.md, docs/views.md).
 *
 * Branches come from two places. Pull requests (merge requests on GitLab) from the repository
 * itself name their branch, when it was opened and when it was merged, and outlive the branch;
 * branches that still exist add their own commits. A merged branch's commits are read with the
 * default branch's history, so for the branches shown, each one's pull request commits are
 * read again and tagged with it, and so is its pull request: its track holds its work.
 */
import { SEPARATION_LIMIT, relationshipKey } from '../dist/core.mjs';
import { branchMoment, commitLinks, commitMoment, keeps } from './github-events.mjs';
import { entityId, itemId, itemKey, parseRepository, seconds, tag } from './github-source.mjs';

/** The view's title, by which a later import finds it again among its owner's views. */
export const BRANCH_VIEW_TITLE = 'Branches';
const DESCRIPTION =
  'Each recently active branch in its own track, from when it began until it was merged. Set up by och-import-github.';

/**
 * The repository's own pull requests (merge requests on GitLab), as `{branch, number,
 * mergeRequest, created, updated, merged}`; those from forks name a branch elsewhere and are
 * left out.
 */
export async function readBranchRequests(reader, repository) {
  const { platform, path } = parseRepository(repository);
  const requests = [];
  if (platform === 'gitlab') {
    const project = `/projects/${encodeURIComponent(path)}`;
    for await (const mr of reader.list(`${project}/merge_requests`, {
      scope: 'all',
      order_by: 'created_at',
      sort: 'asc',
    }))
      if (mr.source_branch && mr.source_project_id === mr.target_project_id)
        requests.push({
          branch: mr.source_branch,
          number: mr.iid,
          mergeRequest: true,
          created: mr.created_at,
          updated: mr.updated_at,
          merged: mr.state === 'merged' ? (mr.merged_at ?? mr.updated_at) : null,
        });
    return requests;
  }
  for await (const pull of reader.list(`/repos/${path}/pulls`, {
    state: 'all',
    sort: 'created',
    direction: 'asc',
  })) {
    const head = pull.head?.repo?.full_name,
      base = pull.base?.repo?.full_name;
    if (!pull.head?.ref || !head || !base || head.toLowerCase() !== base.toLowerCase()) continue;
    requests.push({
      branch: pull.head.ref,
      number: pull.number,
      mergeRequest: false,
      created: pull.created_at,
      updated: pull.updated_at,
      merged: pull.merged_at ?? null,
    });
  }
  return requests;
}

/** One pull request's commits, in the shape readRepository gives commitMoment. */
async function* requestCommits(reader, repository, request) {
  const { platform, path } = parseRepository(repository);
  const url =
    platform === 'gitlab'
      ? `/projects/${encodeURIComponent(path)}/merge_requests/${request.number}/commits`
      : `/repos/${path}/pulls/${request.number}/commits`;
  for await (const entry of reader.list(url))
    yield platform === 'gitlab'
      ? {
          sha: entry.id,
          message: entry.message,
          time: entry.authored_date ?? entry.created_at,
          url: entry.web_url,
          login: null,
        }
      : {
          sha: entry.sha,
          message: entry.commit?.message,
          time: entry.commit?.author?.date ?? entry.created,
          url: entry.html_url,
          login: entry.author?.login ?? null,
        };
}

const time = (iso) => (iso ? Date.parse(iso) : NaN);
const latest = (...times) => Math.max(...times.map(time).filter(Number.isFinite));

/**
 * The branches to show: every branch but the default one, from its latest pull request and
 * its own commits (`branches`: `{name, first, last}`), the `limit` most recently active (by
 * their last commit, merge or update), oldest first. A branch with commits of its own after
 * its pull request was merged is still under way, so it is not merged.
 */
export function planBranches(requests, branches, main, limit = SEPARATION_LIMIT) {
  const by = new Map();
  const entry = (name) => {
    if (!by.has(name)) by.set(name, { name, request: null, first: null, last: null });
    return by.get(name);
  };
  for (const b of branches)
    if (b.name !== main) Object.assign(entry(b.name), { first: b.first, last: b.last });
  for (const r of requests) {
    if (!r.branch || r.branch === main) continue;
    const e = entry(r.branch);
    if (!e.request || time(r.created) >= time(e.request.created)) e.request = r;
  }
  const plan = [...by.values()].map((e) => {
    const merged =
      e.request?.merged && !(time(e.last) > time(e.request.merged)) ? e.request.merged : null;
    const began = [e.first, e.request?.created].filter(Boolean).sort((a, b) => time(a) - time(b));
    return {
      ...e,
      began: began[0] ?? null,
      merged,
      active: latest(e.last, e.request?.merged, e.request?.updated),
    };
  });
  return plan
    .filter((e) => e.began)
    .sort((a, b) => b.active - a.active || (a.name < b.name ? -1 : 1))
    .slice(0, limit)
    .sort((a, b) => time(a.began) - time(b.began) || (a.name < b.name ? -1 : 1));
}

/**
 * The Branches view for `changes` (what readRepository or readGitlab read, with its `main`
 * and `branches`), adding to them what its tracks need: each shown branch's pull request
 * commits and the pull request itself tagged with it, and the moment it began. Returns the
 * separation, or null with no branch to show.
 */
export async function branchView(reader, repository, changes, { kinds, requests } = {}) {
  const plan = planBranches(requests ?? [], changes.branches ?? [], changes.main);
  if (!plan.length) return null;
  const durations = new Map(changes.durations.map((d) => [d.id, d]));
  const moments = new Map(changes.moments.map((m) => [m.id, m]));
  const links = new Map(changes.links.map((l) => [relationshipKey(l), l]));
  const separations = [];
  for (const branch of plan) {
    const name = tag(branch.name);
    if (!name) continue;
    let began = branch.began;
    if (branch.request) {
      // Its commits, tagged with it rather than the branch they were first read on.
      if (keeps(kinds, 'commit'))
        for await (const commit of requestCommits(reader, repository, branch.request)) {
          if (!commit.time) continue;
          const moment = commitMoment(repository, commit, branch.name);
          if (!moments.has(moment.id)) changes.commits = (changes.commits ?? 0) + 1;
          moments.set(moment.id, moment);
          // Its links to items read here (`Fixes #12`), each once.
          for (const link of commitLinks(repository, commit))
            if ([link.a, link.b].some((ref) => 'duration' in ref && durations.has(ref.duration)))
              links.set(relationshipKey(link), link);
          if (time(commit.time) < time(began)) began = commit.time;
        }
      // The pull request is the branch's work too.
      const request = durations.get(
        itemId(repository, branch.request.number, branch.request.mergeRequest),
      );
      if (request && !request.metadata.tags?.includes(name)) {
        const tags = request.metadata.tags ?? [];
        request.metadata = {
          ...request.metadata,
          tags: [...tags.slice(0, 3), name, ...tags.slice(3)].slice(0, 40),
        };
      }
    }
    // The moment it began, replacing one read at another time this run.
    let disjoin = { at: seconds(began) };
    if (keeps(kinds, 'branch')) {
      const moment = branchMoment(repository, branch.name, { verb: 'branch', time: began });
      const prefix = moment.id.slice(0, moment.id.lastIndexOf(':') + 1);
      for (const id of [...moments.keys()]) if (id.startsWith(prefix)) moments.delete(id);
      moments.set(moment.id, moment);
      disjoin = { moment: moment.id };
    }
    const separation = { tags: [name], disjoins: [{ from: null, ...disjoin }] };
    if (branch.merged) {
      // At the moment it was merged, where this import wrote it; else at the time.
      const prefix =
        entityId(
          repository,
          ...itemKey({ number: branch.request.number, merge_request: branch.request.mergeRequest }),
          'merged',
        ) + ':';
      const merged = [...moments.keys()].find((id) => id.startsWith(prefix));
      if (time(branch.merged) >= time(began))
        separation.unions = [
          { into: null, ...(merged ? { moment: merged } : { at: seconds(branch.merged) }) },
        ];
    }
    separations.push(separation);
  }
  changes.moments = [...moments.values()];
  changes.links = [...links.values()];
  return separations.length ? { separations } : null;
}

/**
 * Saves the Branches view as its key owner's public view of `timeline`: the one an earlier
 * import saved (found by its title among the owner's views of it), or a new one. Makes it the
 * timeline's default view unless the timeline already has a default of its own. Returns
 * `{id, created, isDefault}`.
 */
export async function saveBranchView(writer, timeline, separation) {
  const answer = (step, { status, value }) => {
    if (status >= 200 && status < 300) return value;
    throw Object.assign(new Error(step), { status, value });
  };
  const mine = answer('views', await writer.request('views'));
  const existing = (mine.views ?? []).find(
    (v) => v.timeline?.id === timeline && v.role === 'owner' && v.title === BRANCH_VIEW_TITLE,
  );
  const body = { description: DESCRIPTION, separation };
  const view = existing
    ? answer(
        'view',
        await writer.request(`views/${existing.id}`, {
          method: 'PUT',
          body: JSON.stringify(body),
        }),
      )
    : answer(
        'view',
        await writer.request('views', {
          method: 'POST',
          body: JSON.stringify({
            timeline,
            title: BRANCH_VIEW_TITLE,
            visibility: 'public',
            ...body,
          }),
        }),
      );
  const isDefault = await writer.setDefaultView(timeline, { id: view.id, separation });
  return { id: view.id, created: !existing, isDefault };
}
