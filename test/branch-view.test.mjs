// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// The Branches view (#557): the importer's default view of a mirrored repository, each recently
// active branch a separation from when it began until it was merged.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BRANCH_VIEW_TITLE,
  branchView,
  planBranches,
  readBranchRequests,
  saveBranchView,
} from '../server/branch-view.mjs';
import { commitMoment, eventMoment, selectKinds } from '../server/github-events.mjs';
import { itemDuration, seconds } from '../server/github-source.mjs';
import { GithubReader } from '../server/import-github.mjs';
import { TimelineWriter } from '../server/timeline-writer.mjs';
import { validateTimelineView } from '../dist/core.mjs';

const TIMELINE = '6f1c2d3e-4a5b-4c6d-8e7f-90a1b2c3d4e5';
const KEY = 'och_key_' + 'a'.repeat(32) + '_' + 'b'.repeat(64);
const day = (n) => `2026-11-${String(n).padStart(2, '0')}T00:00:00Z`;
const pull = (number, ref, { created, merged = null, updated = created, fork = false }) => ({
  number,
  created_at: created,
  updated_at: updated,
  merged_at: merged,
  head: { ref, repo: { full_name: fork ? 'mona/app' : 'acme/app' } },
  base: { repo: { full_name: 'acme/app' } },
});

test('the branches shown are the most recently active, oldest first, but never the default', () => {
  const requests = [
    { branch: 'main', number: 1, created: day(1), updated: day(1), merged: null },
    { branch: 'a', number: 2, created: day(2), updated: day(3), merged: day(3) },
    // Opened again from the same branch: the latest request is the branch's.
    { branch: 'a', number: 9, created: day(10), updated: day(12), merged: day(12) },
    { branch: 'b', number: 3, created: day(4), updated: day(5), merged: day(5) },
  ];
  const branches = [
    { name: 'c', first: day(6), last: day(20) },
    // Merged, then worked on again: still under way.
    { name: 'b', first: day(4), last: day(15) },
  ];
  const plan = planBranches(requests, branches, 'main', 2);
  assert.deepEqual(
    plan.map((b) => [b.name, b.began, b.merged]),
    [
      ['b', day(4), null],
      ['c', day(6), null],
    ],
  );
  const all = planBranches(requests, branches, 'main');
  assert.deepEqual(
    all.map((b) => [b.name, b.request?.number ?? null, b.merged]),
    [
      ['b', 3, null],
      ['c', null, null],
      ['a', 9, day(12)],
    ],
  );
});

test('each branch disjoins when it began and unites when merged, holding its own work', async () => {
  // feat was opened as #5 and merged; its commits were read with main's history.
  const repository = 'acme/app';
  const item = {
    number: 5,
    title: 'The feature',
    state: 'closed',
    created_at: day(2),
    closed_at: day(4),
    pull_request: { merged_at: day(4) },
    labels: [],
    assignees: [],
  };
  const merged = eventMoment(repository, item, { verb: 'merged', time: day(4), what: 'Merged' });
  const onMain = commitMoment(
    repository,
    { sha: 'f1', message: 'Begin', time: '2026-11-01T12:00:00Z' },
    'main',
  );
  const changes = {
    durations: [itemDuration(repository, item)],
    moments: [onMain, merged],
    links: [],
    main: 'main',
    branches: [{ name: 'wip', first: day(6), last: day(7) }],
    commits: 1,
  };
  const reader = {
    async *list(url) {
      assert.equal(url, '/repos/acme/app/pulls/5/commits');
      yield {
        sha: 'f1',
        commit: { message: 'Begin\n\nFixes #5', author: { date: '2026-11-01T12:00:00Z' } },
        html_url: 'https://github.com/acme/app/commit/f1',
        author: { login: 'mona' },
      };
    },
  };
  const requests = [
    {
      branch: 'feat',
      number: 5,
      mergeRequest: false,
      created: day(2),
      updated: day(4),
      merged: day(4),
    },
  ];
  const view = await branchView(reader, repository, changes, {
    kinds: selectKinds({}),
    requests,
  });
  const [feat, wip] = view.separations;
  // feat began at its first commit, before the pull request was opened.
  const began = changes.moments.find((m) => m.id === feat.disjoins[0].moment);
  assert.equal(began.metadata.title, 'Branch feat');
  assert.equal(began.time, seconds('2026-11-01T12:00:00Z'));
  assert.deepEqual(feat.tags, ['feat']);
  assert.deepEqual(feat.unions, [{ into: null, moment: merged.id }]);
  // Its commit, read with main, is now its own; so is its pull request.
  const commit = changes.moments.find((m) => m.id === onMain.id);
  assert.ok(commit.metadata.tags.includes('feat') && !commit.metadata.tags.includes('main'));
  assert.ok(changes.durations[0].metadata.tags.includes('feat'));
  assert.equal(changes.commits, 1, 'no commit counted twice');
  assert.equal(changes.links.length, 1, 'the commit fixes #5');
  // A branch with no pull request, not merged: no union.
  assert.deepEqual(wip.tags, ['wip']);
  assert.equal(wip.unions, undefined);
  // A view the server takes as it is.
  assert.deepEqual(validateTimelineView({ separation: view }).separation, view);

  // Without the merge's moment (state left out), it unites at the time it was merged; and
  // without branches, it disjoins at the time it began.
  const bare = { ...changes, moments: [onMain], durations: [], links: [] };
  const timed = await branchView(reader, repository, bare, {
    kinds: selectKinds({ except: ['state', 'branches'] }),
    requests,
  });
  assert.deepEqual(timed.separations[0].disjoins, [
    { from: null, at: seconds('2026-11-01T12:00:00Z') },
  ]);
  assert.deepEqual(timed.separations[0].unions, [{ into: null, at: seconds(day(4)) }]);
  // No branches but the default: no view.
  assert.equal(
    await branchView(reader, repository, { ...changes, branches: [] }, { requests: [] }),
    null,
  );
});

test('pull requests from forks name a branch elsewhere and are left out', async () => {
  const pulls = [
    pull(1, 'feat', { created: day(1), merged: day(2) }),
    pull(2, 'patch', { created: day(3), fork: true }),
  ];
  const fetcher = async (url) => ({
    status: 200,
    json: async () => (new URL(url).pathname.endsWith('/pulls') ? pulls : []),
    headers: { get: () => null },
  });
  const reader = new GithubReader({ token: 'ghp_x', fetcher });
  assert.deepEqual(await readBranchRequests(reader, 'acme/app'), [
    {
      branch: 'feat',
      number: 1,
      mergeRequest: false,
      created: day(1),
      updated: day(1),
      merged: day(2),
    },
  ]);
  // GitLab's merge requests, from the project itself.
  const mrs = [
    {
      iid: 7,
      source_branch: 'fix',
      source_project_id: 1,
      target_project_id: 1,
      state: 'merged',
      merged_at: day(5),
      created_at: day(4),
      updated_at: day(5),
    },
    { iid: 8, source_branch: 'x', source_project_id: 2, target_project_id: 1, state: 'opened' },
  ];
  const gitlab = new GithubReader({
    api: 'https://gitlab.com/api/v4',
    fetcher: async () => ({ status: 200, json: async () => mrs, headers: { get: () => null } }),
  });
  assert.deepEqual(await readBranchRequests(gitlab, 'gitlab:gitlab.com/group/app'), [
    {
      branch: 'fix',
      number: 7,
      mergeRequest: true,
      created: day(4),
      updated: day(5),
      merged: day(5),
    },
  ]);
});

/** An OpenChronology API with one timeline and the key owner's saved views. */
function fakeApi({ view = null, views = [] } = {}) {
  const state = { revision: '3', view, views, saves: [], conflicts: 0 };
  const fetcher = async (url, options = {}) => {
    const path = new URL(url).pathname.replace(/^\/api\//, '');
    const body = options.body ? JSON.parse(options.body) : null;
    const reply = (status, value) => ({
      status,
      json: async () => value,
      headers: { get: () => null },
    });
    if (path === `timelines/${TIMELINE}`)
      return reply(200, {
        revision: state.revision,
        title: 'App',
        presentation: { mode: 'gregorian' },
        ...(state.view ? { view: state.view } : {}),
      });
    if (path === 'views' && !body) return reply(200, { views: state.views });
    if (path === 'views') {
      const saved = { ...body, id: 'v-new', role: 'owner', timeline: { id: body.timeline } };
      state.views.push(saved);
      return reply(201, saved);
    }
    if (path.startsWith('views/')) {
      const saved = state.views.find((v) => v.id === path.slice(6));
      Object.assign(saved, body);
      return reply(200, saved);
    }
    if (path === `timelines/${TIMELINE}/changes`) {
      if (state.conflicts) {
        state.conflicts--;
        state.revision = String(Number(state.revision) + 1);
        return reply(409, { error: 'Someone else saved.' });
      }
      assert.equal(body.revision, state.revision);
      assert.deepEqual(body.changes, []);
      state.saves.push(body.settings);
      state.view = body.settings.view;
      state.revision = String(Number(state.revision) + 1);
      return reply(200, { revision: state.revision });
    }
    return reply(404, { error: 'Not found' });
  };
  return { state, writer: new TimelineWriter({ api: 'http://och.test', key: KEY, fetcher }) };
}

test('the view is saved once, updated after, and made the default unless one was chosen', async () => {
  const separation = { separations: [{ tags: ['feat'], disjoins: [{ from: null, at: '1' }] }] };
  // A timeline without a default view: saved, public, and made its default (after a
  // conflicting save, against the new revision).
  const api = fakeApi();
  api.state.conflicts = 1;
  assert.deepEqual(await saveBranchView(api.writer, TIMELINE, separation), {
    id: 'v-new',
    created: true,
    isDefault: true,
  });
  assert.equal(api.state.views[0].title, BRANCH_VIEW_TITLE);
  assert.equal(api.state.views[0].visibility, 'public');
  assert.deepEqual(api.state.view, { id: 'v-new', separation });
  assert.equal(api.state.saves.length, 1);
  assert.equal(api.state.saves[0].title, 'App', 'the other settings are sent back unchanged');
  // Imported again: the same view, updated, and still the default.
  const next = { separations: [{ tags: ['next'], disjoins: [{ from: null, at: '2' }] }] };
  assert.deepEqual(await saveBranchView(api.writer, TIMELINE, next), {
    id: 'v-new',
    created: false,
    isDefault: true,
  });
  assert.deepEqual(api.state.views[0].separation, next);
  assert.equal(api.state.views.length, 1);
  // A timeline whose authors chose their own default keeps it.
  const own = fakeApi({ view: { separation: { tags: ['war'] } } });
  assert.equal((await saveBranchView(own.writer, TIMELINE, separation)).isDefault, false);
  assert.deepEqual(own.state.view, { separation: { tags: ['war'] } });
  assert.equal(own.state.saves.length, 0);
  // Another view of the same title, someone else's or of another timeline, is not it.
  const shared = fakeApi({
    views: [
      { id: 'theirs', title: BRANCH_VIEW_TITLE, role: 'editor', timeline: { id: TIMELINE } },
      { id: 'other', title: BRANCH_VIEW_TITLE, role: 'owner', timeline: { id: 'x' } },
    ],
  });
  assert.equal((await saveBranchView(shared.writer, TIMELINE, separation)).created, true);
});
