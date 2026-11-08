// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// GitLab as a source (#538): projects named on their host (short on gitlab.com), merge
// requests as `!n`, system notes and resource events read as moments, webhooks' changes,
// tokens, and the receiver and importer reading it, against a fake API.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  gitlabDeliveryChanges,
  gitlabItem,
  gitlabRepository,
  noteEvents,
  readGitlab,
  resourceEvent,
  validGitlabToken,
} from '../server/gitlab-source.mjs';
import { githubRoutes, itemDuration } from '../server/github-source.mjs';
import { selectKinds, timelineEvent } from '../server/github-events.mjs';
import { GithubIngest } from '../server/github-receiver.mjs';
import { GithubReader } from '../server/import-github.mjs';

const SELF = 'gitlab:git.example.com/group/sub/app';
const COM = 'gitlab:gitlab.com/group/app';
const TIMELINE = '6f1c2d3e-4a5b-4c6d-8e7f-90a1b2c3d4e5';
const KEY = 'och_key_' + 'a'.repeat(32) + '_' + 'b'.repeat(64);
const project = {
  web_url: 'https://git.example.com/group/sub/app',
  path_with_namespace: 'group/sub/app',
};
const issue = (overrides = {}) => ({
  iid: 12,
  title: 'Crash on start',
  description: 'See !7',
  state: 'opened',
  created_at: '2026-11-01T10:00:00.000Z',
  updated_at: '2026-11-02T10:00:00.000Z',
  web_url: 'https://git.example.com/group/sub/app/-/issues/12',
  assignees: [{ username: 'mona' }],
  labels: ['bug'],
  ...overrides,
});

test('projects are named on their host, short on gitlab.com; merge requests are !n', () => {
  assert.equal(gitlabRepository(project), SELF);
  const d = itemDuration(SELF, gitlabItem(issue(), false));
  assert.equal(d.id, 'gl:git.example.com:group:sub:app:12');
  assert.deepEqual(d.metadata.tags, [
    'gitlab',
    'gitlab:git.example.com/group/sub/app',
    'gitlab:git.example.com/group/sub/app#12',
    'issue',
    'state:open',
    'assigned',
    'gitlab:git.example.com/mona',
    'label:bug',
  ]);
  const mr = itemDuration(
    COM,
    gitlabItem(
      issue({
        iid: 7,
        state: 'merged',
        merged_at: '2026-11-03T00:00:00.000Z',
        web_url: 'https://gitlab.com/group/app/-/merge_requests/7',
      }),
      true,
    ),
  );
  assert.equal(mr.id, 'gl:group:app:mr:7');
  assert.equal(mr.metadata.title, '!7 Crash on start');
  assert.deepEqual(mr.metadata.tags.slice(0, 5), [
    'gitlab',
    'gitlab/group/app',
    'gitlab/group/app!7',
    'merge request',
    'state:merged',
  ]);
  assert.equal(mr.end, String(Date.parse('2026-11-03T00:00:00Z') / 1000));
});

test('system notes say what happened: assignments, reviews, drafts, renames, mentions', () => {
  const note = (body) => ({
    system: true,
    body,
    created_at: '2026-11-03T00:00:00.000Z',
    author: { username: 'mona' },
  });
  const titles = (body) =>
    noteEvents(note(body), SELF).map((e) =>
      timelineEvent(SELF, gitlabItem(issue(), false), e)?.moments[0].metadata.title.replace(
        ': #12 Crash on start',
        '',
      ),
    );
  assert.deepEqual(titles('assigned to @octo and unassigned @mona'), [
    'Assigned octo',
    'Unassigned mona',
  ]);
  assert.deepEqual(titles('assigned to @a and @b'), ['Assigned a', 'Assigned b']);
  assert.deepEqual(titles('requested review from @octo'), ['Review requested from octo']);
  assert.deepEqual(titles('approved this merge request'), ['Approved by mona']);
  assert.deepEqual(titles('marked this merge request as **draft**'), ['Converted to draft']);
  assert.deepEqual(titles('marked this merge request as **ready**'), ['Ready for review']);
  assert.deepEqual(titles('changed title from **Crash{-ing-}** to **Crash{+ on start+}**'), [
    'Renamed from “Crashing”',
  ]);
  assert.deepEqual(titles('mentioned in merge request !7'), ['Mentioned in !7']);
  assert.deepEqual(titles('mentioned in issue other/proj#3'), ['Mentioned in other/proj#3']);
  assert.deepEqual(titles('added ~bug label'), [], 'labels come from their events');
  assert.deepEqual(
    noteEvents({ ...note('assigned to @x'), system: false }, SELF),
    [],
    'comments are not read',
  );
  assert.deepEqual(
    [
      resourceEvent('label', { action: 'add', label: { name: 'bug' }, created_at: 'x', user: {} })
        .event,
      resourceEvent('milestone', { action: 'remove', milestone: { title: 'v1' }, created_at: 'x' })
        .event,
      resourceEvent('state', { state: 'merged', created_at: 'x' }).event,
    ],
    ['labeled', 'demilestoned', 'merged'],
  );
});

test('webhooks: an item with its changes, a note, a push and a release', () => {
  const [labelled, mentioned] = gitlabDeliveryChanges('Issue Hook', {
    project,
    user: { username: 'mona' },
    object_attributes: { ...issue(), action: 'update' },
    labels: [{ title: 'bug' }, { title: 'p1' }],
    assignees: [{ username: 'octo' }],
    changes: {
      labels: { previous: [{ title: 'bug' }], current: [{ title: 'bug' }, { title: 'p1' }] },
      assignees: { previous: [{ username: 'mona' }], current: [{ username: 'octo' }] },
      description: { previous: '', current: 'See !7' },
    },
  });
  assert.deepEqual(
    labelled.moments.map((m) => m.metadata.title.replace(': #12 Crash on start', '')),
    ['Labelled p1', 'Assigned octo', 'Unassigned mona'],
  );
  assert.ok(labelled.durations[0].metadata.tags.includes('label:p1'));
  assert.equal(mentioned.moments[0].metadata.title, 'Mentioned in #12: !7');
  const [merged] = gitlabDeliveryChanges('Merge Request Hook', {
    project,
    user: { username: 'mona' },
    object_attributes: {
      ...issue({ iid: 7, state: 'merged', description: 'Closes #12' }),
      action: 'merge',
    },
    changes: { draft: { previous: true, current: false } },
  });
  assert.deepEqual(
    merged.moments.map((m) => m.metadata.tags[3]),
    ['ready for review', 'merged'],
  );
  assert.deepEqual(merged.links, [
    {
      a: { duration: 'gl:git.example.com:group:sub:app:mr:7' },
      b: { duration: 'gl:git.example.com:group:sub:app:12' },
      related: true,
    },
  ]);
  const [note] = gitlabDeliveryChanges('Note Hook', {
    project,
    user: { username: 'mona' },
    object_attributes: {
      note: 'Same as #3, private words',
      noteable_type: 'Issue',
      updated_at: '2026-11-04T00:00:00Z',
    },
    issue: { iid: 12 },
  });
  assert.equal(note.moments[0].metadata.title, 'Mentioned in #12: #3');
  assert.ok(!JSON.stringify(note).includes('private words'));
  const [created, pushed] = gitlabDeliveryChanges('Push Hook', {
    project,
    ref: 'refs/heads/feat/new_feature',
    before: '0000000000000000000000000000000000000000',
    after: 'abc',
    user_username: 'mona',
    commits: [
      {
        id: 'abc',
        message: 'Begin #12',
        timestamp: '2026-11-04T00:00:00Z',
        url: 'https://git.example.com/c/abc',
        author: { name: 'Mona', email: 'mona@example.com' },
      },
    ],
  });
  assert.equal(created.moments[0].metadata.title, 'Created branch feat/new_feature');
  assert.deepEqual(pushed.moments[0].metadata.tags.slice(1), [
    'gitlab:git.example.com/group/sub/app',
    'commit',
    'feat/new_feature',
  ]);
  assert.ok(
    !JSON.stringify(pushed).includes('example.com/c/abc') ||
      !JSON.stringify(pushed).includes('mona@'),
  );
  const [release] = gitlabDeliveryChanges('Release Hook', {
    project,
    action: 'create',
    tag: 'v1.0',
    tag_name: 'v1.0',
    name: 'One',
    released_at: '2026-11-05T00:00:00Z',
    url: 'https://git.example.com/group/sub/app/-/releases/v1.0',
  });
  assert.equal(release.moments[0].metadata.title, 'Released v1.0 One');
  assert.deepEqual(
    gitlabDeliveryChanges('Issue Hook', { object_attributes: issue() }),
    [],
    'no project',
  );
});

test("a webhook's token is compared whole, in constant time", () => {
  assert.ok(validGitlabToken('t0ken', 't0ken'));
  assert.ok(!validGitlabToken('t0ken', 't0ke'));
  assert.ok(!validGitlabToken('t0ken', undefined));
  assert.ok(!validGitlabToken(undefined, 't0ken'));
});

test('the receiver takes GitLab deliveries with their token', async () => {
  const saves = [];
  const fetcher = async (url, options = {}) => ({
    status: 200,
    headers: { get: () => null },
    json: async () =>
      options.method === 'PUT'
        ? (saves.push(JSON.parse(options.body)), { revision: 'r' + saves.length })
        : { revision: 'r0', title: 'Work', description: '', presentation: { mode: 'gregorian' } },
  });
  const ingest = new GithubIngest({
    api: 'http://och.test',
    key: KEY,
    secrets: { gitlab: 'gl-token' },
    routes: githubRoutes({
      routes: [{ repository: 'gitlab:git.example.com/group/*', timeline: TIMELINE }],
    }),
    fetcher,
    flushMs: 60000,
  });
  const body = Buffer.from(
    JSON.stringify({
      project,
      object_attributes: { ...issue(), action: 'open' },
      user: { username: 'mona' },
    }),
  );
  assert.equal(
    ingest.receiveFrom({ 'x-gitlab-event': 'Issue Hook', 'x-gitlab-token': 'gl-token' }, body),
    202,
  );
  assert.equal(
    ingest.receiveFrom({ 'x-gitlab-event': 'Issue Hook', 'x-gitlab-token': 'wrong' }, body),
    401,
  );
  await ingest.drain();
  assert.equal(saves[0].durationChanges[0].id, 'gl:git.example.com:group:sub:app:12');
});

test('the importer reads a project, leaving out what needs a token it lacks', async () => {
  const seen = [];
  const listing = {
    issues: [issue({ state: 'closed', closed_at: '2026-11-03T00:00:00Z' })],
    merge_requests: [issue({ iid: 7, state: 'opened', description: 'Closes #12' })],
    'issues/12/resource_label_events': [
      {
        action: 'add',
        label: { name: 'bug' },
        created_at: '2026-11-02T00:00:00Z',
        user: { username: 'mona' },
      },
    ],
    'issues/12/resource_state_events': [
      { state: 'closed', created_at: '2026-11-03T00:00:00Z', user: { username: 'mona' } },
    ],
    'repository/branches': [
      { name: 'main', commit: { id: 'c1', committed_date: '2026-11-01T00:00:00Z' } },
    ],
    'repository/commits': [
      {
        id: 'c1',
        message: 'Start\n\nFor #12',
        authored_date: '2026-11-01T00:00:00Z',
        web_url: 'https://git.example.com/c/c1',
      },
    ],
    releases: [],
    forks: [],
  };
  const fetcher = async (url, options) => {
    const u = new URL(url);
    seen.push({ path: u.pathname, auth: options.headers.Authorization });
    const rest = decodeURIComponent(u.pathname)
      .replace('/api/v4/projects/group/sub/app', '')
      .replace(/^\//, '');
    if (rest === '')
      return {
        status: 200,
        json: async () => ({ default_branch: 'main' }),
        headers: { get: () => null },
      };
    // Notes and milestones need a token here, as on gitlab.com.
    if (/notes$|milestones$/.test(rest))
      return {
        status: 401,
        json: async () => ({ message: '401 Unauthorized' }),
        headers: { get: () => null },
      };
    return { status: 200, json: async () => listing[rest] ?? [], headers: { get: () => null } };
  };
  const reader = new GithubReader({
    api: 'https://git.example.com/api/v4',
    token: 'glpat',
    fetcher,
  });
  const changes = await readGitlab(reader, SELF, { kinds: selectKinds({ except: ['forks'] }) });
  assert.deepEqual(
    changes.durations.map((d) => d.metadata.title),
    ['#12 Crash on start', '!7 Crash on start'],
  );
  assert.deepEqual(
    changes.moments.map((m) =>
      m.metadata.tags.includes('commit') ? 'commit' : m.metadata.tags[3],
    ),
    ['labeled', 'closed', 'commit'],
  );
  // The merge request closes #12, and the commit names it.
  assert.equal(changes.links.length, 2);
  assert.deepEqual(changes.warnings, [
    'Notes need a token that can read the project (GITLAB_TOKEN); left out.',
    'Milestones need a token that can read the project (GITLAB_TOKEN); left out.',
  ]);
  // Notes were asked for once, then not again.
  assert.equal(seen.filter((r) => r.path.endsWith('/notes')).length, 1);
  assert.ok(seen.every((r) => r.auth === 'Bearer glpat'));
});
