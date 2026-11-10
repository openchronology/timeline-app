// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// Repositories' plans (#538): due dates on GitLab and Forgejo issues and milestones' dates as
// planned durations, GitHub Projects' roadmap dates read through GraphQL and live, GitLab
// issue boards' lists (labels) as moves and stays, and Forgejo's dependencies as links.
import test from 'node:test';
import assert from 'node:assert/strict';
import { githubRoutes, itemPlan, planTime } from '../server/github-source.mjs';
import { milestoneChanges, selectKinds, timelineEvent } from '../server/github-events.mjs';
import { boardMoves, gitlabItem, gitlabMilestone } from '../server/gitlab-source.mjs';
import { forgejoTimelineEvent } from '../server/forgejo-source.mjs';
import {
  graphqlUrl,
  projectDateChange,
  projectDates,
  readProjectPlans,
} from '../server/github-projects.mjs';
import { GithubIngest } from '../server/github-receiver.mjs';

const at = (iso) => String(Date.parse(iso) / 1000);
const TIMELINE = '6f1c2d3e-4a5b-4c6d-8e7f-90a1b2c3d4e5';
const KEY = 'och_key_' + 'a'.repeat(32) + '_' + 'b'.repeat(64);

test('a due date plans an item from its creation until the end of that day', () => {
  const issue = gitlabItem(
    {
      iid: 12,
      title: 'Crash on start',
      state: 'opened',
      created_at: '2026-11-01T10:00:00Z',
      due_date: '2026-11-20',
      web_url: 'https://gitlab.com/group/app/-/issues/12',
      assignees: [{ username: 'mona' }],
    },
    false,
  );
  const plan = itemPlan('gitlab:gitlab.com/group/app', issue);
  assert.equal(plan.id, 'gl:group:app:12:planned');
  assert.equal(plan.metadata.title, 'Planned: #12 Crash on start');
  assert.deepEqual(
    [plan.start, plan.end],
    [at('2026-11-01T10:00:00Z'), at('2026-11-20T23:59:59Z')],
  );
  for (const t of ['gitlab', 'gitlab/group/app#12', 'planned', 'assigned', 'gitlab/mona'])
    assert.ok(plan.metadata.tags.includes(t), t);
  // Forgejo's due dates are times; none, or one before the start, plans nothing.
  const forgejo = {
    number: 5,
    title: 'x',
    created_at: '2026-11-01T00:00:00Z',
    due_date: '2026-11-03T23:59:59+01:00',
  };
  assert.equal(itemPlan('forgejo:codeberg.org/acme/app', forgejo).end, at('2026-11-03T22:59:59Z'));
  assert.equal(itemPlan('acme/app', { number: 1, created_at: '2026-11-01T00:00:00Z' }), null);
  assert.equal(
    itemPlan('acme/app', { number: 1, created_at: '2026-11-05T00:00:00Z', due_on: '2026-11-01' }),
    null,
  );
  assert.equal(planTime('2026-11-01'), '2026-11-01T00:00:00.000Z');
  assert.equal(planTime('nonsense'), null);
});

test('a milestone is planned from its start date (GitLab) to its due date', () => {
  const milestone = gitlabMilestone({
    iid: 3,
    title: 'v2',
    state: 'active',
    created_at: '2026-10-01T00:00:00Z',
    updated_at: '2026-10-01T00:00:00Z',
    start_date: '2026-11-01',
    due_date: '2026-11-30',
    web_url: 'https://gitlab.com/group/app/-/milestones/3',
  });
  const changes = milestoneChanges('gitlab:gitlab.com/group/app', milestone);
  const plan = changes.durations.find((d) => d.metadata.tags.includes('planned'));
  assert.equal(plan.metadata.title, 'Planned: milestone v2');
  assert.deepEqual(
    [plan.start, plan.end],
    [at('2026-11-01T00:00:00Z'), at('2026-11-30T00:00:00Z')],
  );
  const without = milestoneChanges(
    'gitlab:gitlab.com/group/app',
    milestone,
    selectKinds({ except: 'schedule' }),
  );
  assert.equal(without.durations.length, 1, 'no plan without the schedule kind');
});

test('GitLab issue boards: list labels are moves, changed together as one', () => {
  const issue = {
    number: 4,
    title: 'Board me',
    created_at: '2026-11-01T00:00:00Z',
    state: 'closed',
    closed_at: '2026-11-06T00:00:00Z',
  };
  const label = (event, name, created_at) => ({
    event,
    label: { name },
    created_at,
    actor: { login: 'mona' },
  });
  const events = [
    label('labeled', 'bug', '2026-11-01T01:00:00Z'),
    label('labeled', 'Doing', '2026-11-02T00:00:00Z'),
    // Moved from Doing to Review: one label off and another on, at once.
    label('unlabeled', 'Doing', '2026-11-04T00:00:00Z'),
    label('labeled', 'Review', '2026-11-04T00:00:00Z'),
  ];
  const moves = boardMoves(issue, events, [{ name: 'Development', lists: ['Doing', 'Review'] }]);
  assert.deepEqual(
    moves.map((m) => [m.column, m.time, !!m.initial]),
    [
      ['Open', '2026-11-01T00:00:00Z', true],
      ['Doing', '2026-11-02T00:00:00Z', false],
      ['Review', '2026-11-04T00:00:00Z', false],
    ],
  );
  assert.equal(moves[1].actor.login, 'mona');
});

test('Forgejo dependencies are moments and links', () => {
  const event = forgejoTimelineEvent(
    {
      type: 'add_dependency',
      created_at: '2026-11-02T00:00:00Z',
      user: { login: 'mona' },
      dependent_issue: { number: 9, title: 'Schema', repository: { full_name: 'acme/app' } },
    },
    'codeberg.org',
  );
  const repository = 'forgejo:codeberg.org/acme/app';
  const changes = timelineEvent(repository, { number: 5, title: 'Migrate' }, event);
  assert.equal(
    changes.moments[0].metadata.title,
    'Dependency added forgejo:codeberg.org/acme/app#9: #5 Migrate',
  );
  assert.ok(changes.moments[0].metadata.tags.includes('dependency added'));
  assert.deepEqual(changes.links, [
    {
      a: { duration: 'fj:codeberg.org:acme:app:5' },
      b: { duration: 'fj:codeberg.org:acme:app:9' },
      related: true,
    },
  ]);
  assert.equal(
    forgejoTimelineEvent(
      { type: 'remove_dependency', created_at: 't', dependent_issue: {} },
      'codeberg.org',
    ),
    null,
  );
});

const date = (name, value) => ({ date: value, field: { name } });
test('GitHub Projects: start and target date fields, read for a repository', async () => {
  assert.deepEqual(
    projectDates([
      date('Start date', '2026-11-02'),
      date('Target date', '2026-11-09'),
      date('Other', '2026-01-01'),
    ]),
    {
      start: '2026-11-02',
      due: '2026-11-09',
    },
  );
  assert.equal(graphqlUrl(), 'https://api.github.com/graphql');
  assert.equal(
    graphqlUrl('https://github.example.com/api/v3'),
    'https://github.example.com/api/graphql',
  );
  const queries = [];
  const fetcher = async (url, options) => {
    const body = JSON.parse(options.body);
    queries.push({
      url,
      kind: /list: (\w+)/.exec(body.query)[1],
      cursor: body.variables.cursor,
      auth: options.headers.Authorization,
    });
    const node = (number) => ({
      number,
      title: 'Roadmap item',
      url: `https://github.com/acme/app/issues/${number}`,
      createdAt: '2026-11-01T00:00:00Z',
      assignees: { nodes: [{ login: 'octo' }] },
      projectItems: {
        nodes: [
          {
            project: { title: 'Roadmap' },
            fieldValues: { nodes: [date('Start', '2026-11-02'), date('End', '2026-11-09')] },
          },
        ],
      },
    });
    const first = body.variables.cursor === null;
    const list = body.query.includes('list: issues')
      ? { pageInfo: { hasNextPage: first, endCursor: 'c1' }, nodes: [node(first ? 1 : 2)] }
      : { pageInfo: { hasNextPage: false }, nodes: [] };
    return { status: 200, json: async () => ({ data: { repository: { list } } }) };
  };
  const plans = await readProjectPlans(
    { token: 'ghp_x', fetcher, api: 'https://api.github.com' },
    'acme/app',
  );
  assert.deepEqual(
    plans.map((p) => p.id),
    ['gh:acme:app:1:planned:Roadmap', 'gh:acme:app:2:planned:Roadmap'],
  );
  assert.deepEqual(
    [plans[0].start, plans[0].end],
    [at('2026-11-02T00:00:00Z'), at('2026-11-09T23:59:59Z')],
  );
  assert.ok(
    plans[0].metadata.tags.includes('project:roadmap') &&
      plans[0].metadata.tags.includes('github/octo'),
  );
  assert.deepEqual(
    queries.map((q) => `${q.kind} ${q.cursor}`),
    ['issues null', 'issues c1', 'pullRequests null'],
  );
  assert.ok(queries.every((q) => q.auth === 'Bearer ghp_x'));
  // A token without read:project: GitHub answers with errors and no data.
  await assert.rejects(
    readProjectPlans(
      {
        token: 't',
        fetcher: async () => ({
          status: 200,
          json: async () => ({ errors: [{ message: 'INSUFFICIENT_SCOPES' }] }),
        }),
      },
      'acme/app',
    ),
    /INSUFFICIENT_SCOPES/,
  );
});

test('the receiver rewrites a plan when a roadmap date changes', async () => {
  const saves = [];
  const fetcher = async (url, options = {}) => {
    if (String(url).endsWith('/graphql'))
      return {
        status: 200,
        json: async () => ({
          data: {
            node: {
              project: { title: 'Roadmap' },
              fieldValues: {
                nodes: [date('Start date', '2026-11-02'), date('Target date', '2026-11-12')],
              },
              content: {
                number: 7,
                title: 'Ship',
                url: 'https://github.com/acme/app/issues/7',
                createdAt: '2026-11-01T00:00:00Z',
                assignees: { nodes: [] },
                repository: { nameWithOwner: 'acme/app' },
              },
            },
          },
        }),
      };
    const respond = (status, value) => ({
      status,
      json: async () => value,
      headers: { get: () => null },
    });
    if (!options.method || options.method === 'GET')
      return respond(200, {
        revision: 'r',
        title: 'W',
        description: '',
        presentation: { version: 1, mode: 'gregorian', unit: '', scale: '1/1', origin: '0/1' },
      });
    saves.push(JSON.parse(options.body));
    return respond(200, { revision: 'r' + saves.length });
  };
  const ingest = new GithubIngest({
    api: 'http://och.test',
    key: KEY,
    secret: 's',
    token: 'ghp_x',
    routes: githubRoutes({ routes: [{ repository: 'acme/*', timeline: TIMELINE }] }),
    fetcher,
    flushMs: 60000,
  });
  const payload = {
    action: 'edited',
    projects_v2_item: {
      node_id: 'PVTI_1',
      content_type: 'Issue',
      updated_at: '2026-11-03T00:00:00Z',
    },
    changes: { field_value: { field_type: 'date', field_name: 'Target date', to: '2026-11-12' } },
    sender: { login: 'octo' },
  };
  assert.equal(ingest.handle('projects_v2_item', payload), 202);
  await ingest.drain(2000);
  const plan = saves
    .flatMap((s) => s.durationChanges ?? [])
    .find((c) => c.id === 'gh:acme:app:7:planned:Roadmap');
  assert.deepEqual(
    [plan.duration.start, plan.duration.end],
    [at('2026-11-02T00:00:00Z'), at('2026-11-12T23:59:59Z')],
  );
  const moment = saves.flatMap((s) => s.changes).find((c) => c.event)?.event;
  assert.equal(moment.metadata.title, 'Target date set to 2026-11-12 in Roadmap: #7 Ship');
  // Without a target date, the plan is removed.
  const change = await projectDateChange(payload, 'ghp_x', async () => ({
    status: 200,
    json: async () => ({
      data: {
        node: {
          project: { title: 'Roadmap' },
          fieldValues: { nodes: [] },
          content: {
            number: 7,
            title: 'Ship',
            createdAt: '2026-11-01T00:00:00Z',
            repository: { nameWithOwner: 'acme/app' },
          },
        },
      },
    }),
  }));
  assert.deepEqual(change.removed, ['gh:acme:app:7:planned:Roadmap']);
  assert.equal(
    await projectDateChange(
      { ...payload, changes: { field_value: { field_type: 'single_select' } } },
      't',
    ),
    null,
  );
});
