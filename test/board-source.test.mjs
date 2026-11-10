// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// Boards and plans as sources (#538): Trello, Jira, OpenProject and Microsoft Planner cards
// as durations (ongoing until done), column stints, planned durations (a Gantt chart),
// moments and links; their webhooks' signatures and deliveries through the receiver; and
// Planner read again and compared, against fake APIs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import {
  BoardTracker,
  boardEntityId,
  cardChanges,
  cardDiff,
  parseBoard,
} from '../server/board-source.mjs';
import {
  actionEvents,
  readTrello,
  trelloCard,
  validTrelloSignature,
} from '../server/trello-source.mjs';
import {
  historyEvents,
  jiraCard,
  plainText,
  readJira,
  validJiraSignature,
} from '../server/jira-source.mjs';
import {
  activityEvents,
  openprojectCard,
  validOpenProjectSignature,
} from '../server/openproject-source.mjs';
import { People, plannerCard } from '../server/planner-source.mjs';
import { BoardReader } from '../server/board-reader.mjs';
import { githubRoutes } from '../server/github-source.mjs';
import { eventKinds, selectKinds } from '../server/github-events.mjs';
import { GithubIngest } from '../server/github-receiver.mjs';

const TIMELINE = '6f1c2d3e-4a5b-4c6d-8e7f-90a1b2c3d4e5';
const KEY = 'och_key_' + 'a'.repeat(32) + '_' + 'b'.repeat(64);
const ALL = eventKinds();
const secondsOf = (iso) => String(Date.parse(iso) / 1000);
const byId = (list, id) => list.find((e) => e.id === id);

test('board references and IDs', () => {
  assert.deepEqual(parseBoard('trello:AbCd1234'), {
    platform: 'trello',
    host: null,
    board: 'AbCd1234',
  });
  assert.deepEqual(parseBoard('jira:Acme.atlassian.net/PROJ'), {
    platform: 'jira',
    host: 'acme.atlassian.net',
    board: 'PROJ',
  });
  assert.equal(parseBoard('jira:PROJ'), null, 'Jira names its host');
  assert.equal(parseBoard('trello:host/abc'), null, 'Trello does not');
  assert.equal(parseBoard('gitlab:x/y'), null);
  assert.equal(
    boardEntityId('jira:acme.atlassian.net/PROJ', 'PROJ-12'),
    'jr:acme.atlassian.net:PROJ:PROJ-12',
  );
  const long = boardEntityId('openproject:' + 'h'.repeat(120) + '.example/p', '7');
  assert.match(long, /^op:[0-9a-f]{16}:7$/);
});

// A Trello card created in To do, given a member and a due date, moved to Doing and then Done.
const board = { id: '64b000000000000000000001', shortLink: 'AbCd1234', name: 'Roadmap' };
const member = { id: 'm1', username: 'mona', fullName: 'Mona Lisa' };
const card = {
  id: '64c000000000000000000002',
  idShort: 12,
  name: 'Ship the login page',
  desc: 'With passkeys.',
  shortUrl: 'https://trello.com/c/XyZ',
  idList: 'l3',
  closed: false,
  dueComplete: false,
  start: '2026-11-02T00:00:00.000Z',
  due: '2026-11-09T17:00:00.000Z',
  dateLastActivity: '2026-11-06T09:00:00.000Z',
  idMembers: ['m1'],
  members: [member],
  labels: [
    { name: 'auth', color: 'green' },
    { name: '', color: 'red' },
  ],
};
const lists = new Map([
  ['l1', 'To do'],
  ['l2', 'Doing'],
  ['l3', 'Done'],
]);
const act = (type, date, data = {}, extra = {}) => ({
  id: date,
  type,
  date,
  memberCreator: { username: 'leo' },
  data: { board, card: { id: card.id, name: card.name, idShort: 12 }, ...data },
  ...extra,
});
const actions = [
  act('createCard', '2026-11-01T10:00:00.000Z', { list: { id: 'l1', name: 'To do' } }),
  act('addMemberToCard', '2026-11-01T11:00:00.000Z', { idMember: 'm1' }, { member }),
  act('updateCard', '2026-11-02T09:00:00.000Z', {
    old: { idList: 'l1' },
    listBefore: { name: 'To do' },
    listAfter: { name: 'Doing' },
  }),
  act('updateCard', '2026-11-03T09:00:00.000Z', {
    card: { id: card.id, name: card.name, due: '2026-11-09T17:00:00.000Z' },
    old: { due: '2026-11-08T17:00:00.000Z' },
  }),
  act('updateCard', '2026-11-06T09:00:00.000Z', {
    old: { idList: 'l2' },
    listBefore: { name: 'Doing' },
    listAfter: { name: 'Done' },
  }),
];

test('a Trello card: done when it reaches a done list, its stays, plan and moments', () => {
  const c = trelloCard(card, { board, lists, actions });
  assert.equal(c.reference, 'AbCd1234#12');
  assert.equal(c.done, '2026-11-06T09:00:00.000Z', 'done when moved to Done');
  assert.deepEqual(c.labels, ['auth', 'red'], 'a label without a name is its colour');
  const reference = `trello:${board.id}`;
  const out = cardChanges(reference, { platform: 'trello', name: 'Roadmap' }, c, ALL);
  const duration = byId(out.durations, boardEntityId(reference, card.id));
  assert.equal(duration.start, secondsOf('2026-11-01T10:00:00Z'));
  assert.equal(duration.end, secondsOf('2026-11-06T09:00:00Z'));
  assert.equal(duration.metadata.title, 'Ship the login page');
  for (const t of [
    'trello',
    'project:roadmap',
    'trello/abcd1234#12',
    'state:done',
    'status:done',
    'trello/mona',
    'label:auth',
  ])
    assert.ok(duration.metadata.tags.includes(t), t);
  // Its stays: To do, then Doing; none in Done, where it was finished.
  const stints = out.durations.filter((d) => d.metadata.tags.includes('in column'));
  assert.deepEqual(
    stints.map((d) => [d.metadata.title, d.start, d.end]),
    [
      [
        'Ship the login page in To do',
        secondsOf('2026-11-01T10:00:00Z'),
        secondsOf('2026-11-02T09:00:00Z'),
      ],
      [
        'Ship the login page in Doing',
        secondsOf('2026-11-02T09:00:00Z'),
        secondsOf('2026-11-06T09:00:00Z'),
      ],
    ],
  );
  // The plan: from its start date to its due date.
  const planned = byId(out.durations, boardEntityId(reference, card.id, 'planned'));
  assert.equal(planned.metadata.title, 'Planned: Ship the login page');
  assert.deepEqual([planned.start, planned.end], [secondsOf(card.start), secondsOf(card.due)]);
  assert.ok(planned.metadata.tags.includes('planned'));
  // Moments: created, assigned (tagged with the one assigned), moved twice, rescheduled.
  assert.deepEqual(
    out.moments.map((m) => m.metadata.title),
    [
      'Created: Ship the login page',
      'Assigned mona: Ship the login page',
      'Moved to Doing: Ship the login page',
      'Due set to 2026-11-09: Ship the login page',
      'Moved to Done: Ship the login page',
    ],
  );
  const assigned = out.moments[1];
  assert.ok(
    assigned.metadata.tags.includes('trello/mona') &&
      !assigned.metadata.tags.includes('trello/leo'),
  );
  // Only some kinds.
  const some = cardChanges(
    reference,
    { platform: 'trello', name: 'Roadmap' },
    c,
    selectKinds({ only: 'items' }),
  );
  assert.equal(some.durations.length, 1);
  assert.deepEqual(
    some.moments.map((m) => m.metadata.title),
    ['Created: Ship the login page'],
  );
  // An open card is ongoing; one named done lists counts only those.
  const open = trelloCard(
    { ...card, idList: 'l2' },
    { board, lists, actions: actions.slice(0, 3) },
  );
  assert.equal(open.done, null);
  assert.equal(trelloCard(card, { board, lists, actions, done: ['Shipped'] }).done, null);
});

test('reading a Trello board pages its actions and keeps what changed since', async () => {
  const calls = [];
  const fetcher = async (url, options) => {
    const u = new URL(url);
    calls.push({
      path: u.pathname,
      query: Object.fromEntries(u.searchParams),
      auth: options.headers.authorization,
    });
    const json = (v) => ({
      ok: true,
      status: 200,
      headers: { get: () => null },
      text: async () => JSON.stringify(v),
    });
    if (u.pathname === '/1/boards/AbCd1234') return json(board);
    if (u.pathname.endsWith('/lists')) return json([...lists].map(([id, name]) => ({ id, name })));
    if (u.pathname.endsWith('/cards/all'))
      return json([
        card,
        {
          ...card,
          id: '64c0000000000000000000ff',
          idShort: 13,
          dateLastActivity: '2026-01-01T00:00:00Z',
        },
      ]);
    if (u.pathname.endsWith('/actions'))
      return json(u.searchParams.get('before') ? [] : [...actions].reverse());
    return { ok: false, status: 404, headers: { get: () => null }, text: async () => '' };
  };
  const reader = new BoardReader({
    api: 'https://api.trello.com/1',
    headers: { authorization: 'OAuth x' },
    fetcher,
  });
  const read = await readTrello(reader, 'AbCd1234', { since: '2026-11-01T00:00:00Z' });
  assert.equal(read.cards.length, 1, 'the card idle since January is left out');
  assert.equal(read.cards[0].events.length, 5);
  assert.equal(calls.find((c) => c.path.endsWith('/actions')).query.since, '2026-11-01T00:00:00Z');
  assert.ok(calls.every((c) => c.auth === 'OAuth x'));
});

test('Trello actions: archiving, completing, labels and renames', () => {
  const update = (old, cardData) =>
    actionEvents({
      type: 'updateCard',
      date: '2026-11-05T00:00:00Z',
      memberCreator: { username: 'leo' },
      data: { card: cardData, old },
    });
  assert.deepEqual(
    update({ closed: false }, { closed: true }).map((e) => e.verb),
    ['archived'],
  );
  assert.deepEqual(
    update({ dueComplete: false }, { dueComplete: true }).map((e) => e.verb),
    ['completed'],
  );
  assert.deepEqual(update({ name: 'Old' }, { name: 'New' })[0], {
    verb: 'renamed',
    time: '2026-11-05T00:00:00Z',
    person: 'leo',
    from: 'Old',
  });
  assert.deepEqual(update({ pos: 1 }, {}), [], 'a position is not kept');
  assert.equal(
    actionEvents({ type: 'addLabelToCard', date: 'x', data: { label: { name: 'bug' } } })[0]
      .subject,
    'bug',
  );
});

test('a Jira issue: its changelog, done category, start field and links', () => {
  const histories = [
    {
      created: '2026-11-02T09:00:00.000+0000',
      author: { displayName: 'Leo' },
      items: [
        { field: 'status', fromString: 'To Do', toString: 'In Progress' },
        { field: 'assignee', fromString: null, toString: 'Mona Lisa' },
        { field: 'labels', fromString: 'web', toString: 'web auth' },
      ],
    },
    {
      created: '2026-11-04T09:00:00.000+0000',
      author: { displayName: 'Mona Lisa' },
      items: [
        { field: 'status', fromString: 'In Progress', toString: 'Done' },
        { field: 'resolution', fromString: null, toString: 'Done' },
        { field: 'Start date', to: '2026-11-02', toString: '2/Nov/26' },
      ],
    },
  ];
  const issue = {
    key: 'PROJ-12',
    fields: {
      summary: 'Ship the login page',
      description: {
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: 'With passkeys.' }] }],
      },
      status: { name: 'Done', statusCategory: { key: 'done' } },
      assignee: { displayName: 'Mona Lisa' },
      reporter: { displayName: 'Leo' },
      created: '2026-11-01T10:00:00.000+0000',
      resolutiondate: '2026-11-04T09:00:00.000+0000',
      duedate: '2026-11-06',
      customfield_10015: '2026-11-02',
      labels: ['web', 'auth'],
      issuetype: { name: 'Story' },
      issuelinks: [{ outwardIssue: { key: 'PROJ-9' } }, { inwardIssue: { key: 'OTHER-1' } }],
      parent: { key: 'PROJ-1' },
    },
  };
  const c = jiraCard('acme.atlassian.net', issue, {
    histories,
    startField: { id: 'customfield_10015', name: 'Start date' },
  });
  assert.equal(c.description, 'With passkeys.');
  assert.equal(c.done, '2026-11-04T09:00:00.000+0000');
  assert.equal(c.firstColumn, 'To Do');
  assert.deepEqual(
    c.links.map((l) => l.key),
    ['PROJ-9', 'PROJ-1'],
    'another project’s issue is left out',
  );
  assert.deepEqual(
    c.events.map((e) => `${e.verb} ${e.subject ?? ''}`.trim()),
    [
      'created',
      'moved In Progress',
      'assigned Mona Lisa',
      'labeled auth',
      'moved Done',
      'completed',
      'rescheduled start',
    ],
  );
  const reference = 'jira:acme.atlassian.net/PROJ';
  const out = cardChanges(reference, { platform: 'jira', name: 'Project' }, c, ALL);
  const duration = byId(out.durations, boardEntityId(reference, 'PROJ-12'));
  assert.equal(duration.metadata.title, 'PROJ-12 Ship the login page');
  assert.ok(
    duration.metadata.tags.includes('jira/proj-12') && duration.metadata.tags.includes('story'),
  );
  const planned = byId(out.durations, boardEntityId(reference, 'PROJ-12', 'planned'));
  assert.deepEqual(
    [planned.start, planned.end],
    [secondsOf('2026-11-02T00:00:00Z'), secondsOf('2026-11-06T23:59:59Z')],
  );
  assert.equal(out.links.length, 2);
  assert.equal(plainText('plain'), 'plain');
  assert.deepEqual(
    historyEvents({ created: 't', items: [{ field: 'Sprint', toString: 'S1' }] }),
    [],
  );
});

test('reading Jira Cloud pages by token and fills in long changelogs', async () => {
  const seen = [];
  const fetcher = async (url) => {
    const u = new URL(url);
    seen.push(u.pathname + (u.searchParams.get('nextPageToken') ? '?next' : ''));
    const json = (v) => ({
      ok: true,
      status: 200,
      headers: { get: () => null },
      text: async () => JSON.stringify(v),
    });
    if (u.pathname.endsWith('/project/PROJ')) return json({ key: 'PROJ', name: 'Project' });
    if (u.pathname.endsWith('/field'))
      return json([{ id: 'customfield_10015', name: 'Start date' }]);
    if (u.pathname.endsWith('/search/jql'))
      return json(
        u.searchParams.get('nextPageToken')
          ? {
              issues: [
                {
                  key: 'PROJ-2',
                  fields: { created: '2026-11-01T00:00:00Z', status: { name: 'To Do' } },
                  changelog: { total: 0, histories: [] },
                },
              ],
              isLast: true,
            }
          : {
              issues: [
                {
                  key: 'PROJ-1',
                  fields: { created: '2026-11-01T00:00:00Z', status: { name: 'To Do' } },
                  changelog: { total: 2, histories: [] },
                },
              ],
              nextPageToken: 'n',
            },
      );
    if (u.pathname.endsWith('/issue/PROJ-1/changelog'))
      return json({
        values: [
          {
            created: '2026-11-02T00:00:00Z',
            items: [{ field: 'status', fromString: 'To Do', toString: 'Doing' }],
          },
        ],
        isLast: true,
      });
    return { ok: false, status: 404, headers: { get: () => null }, text: async () => '' };
  };
  const reader = new BoardReader({ api: 'https://acme.atlassian.net/rest/api/3', fetcher });
  reader.cloud = true;
  const read = await readJira(reader, 'acme.atlassian.net', 'PROJ');
  assert.deepEqual(
    read.cards.map((c) => c.key),
    ['PROJ-1', 'PROJ-2'],
  );
  assert.equal(read.cards[0].column, 'To Do');
  assert.deepEqual(
    read.cards[0].events.map((e) => e.verb),
    ['created', 'moved'],
  );
  assert.ok(seen.includes('/rest/api/3/search/jql?next'));
});

test('OpenProject: activity in English, closed statuses, milestones and relations', () => {
  const closed = new Set(['Closed']);
  const events = activityEvents(
    {
      createdAt: '2026-11-03T00:00:00Z',
      _links: { user: { title: 'Leo' } },
      details: [
        { raw: 'Status changed from In progress to Closed' },
        { raw: 'Assignee changed from Leo to Mona Lisa' },
        { raw: '% Complete changed from 50 to 100' },
        { raw: 'Finish date set to 11/20/2026' },
        { raw: 'Description changed (Details)' },
      ],
    },
    closed,
  );
  assert.deepEqual(
    events.map((e) => `${e.verb} ${e.subject ?? ''}`.trim()),
    [
      'moved Closed',
      'completed',
      'unassigned Leo',
      'assigned Mona Lisa',
      'progress 100%',
      'rescheduled due',
    ],
  );
  const wp = {
    id: 7,
    subject: 'Pour the foundations',
    createdAt: '2026-11-01T00:00:00Z',
    updatedAt: '2026-11-03T00:00:00Z',
    startDate: '2026-11-02',
    dueDate: '2026-11-10',
    percentageDone: 100,
    _links: {
      status: { title: 'Closed' },
      assignee: { title: 'Mona Lisa' },
      type: { title: 'Task' },
      parent: { href: '/api/v3/work_packages/3' },
    },
  };
  const c = openprojectCard('op.example', wp, {
    closed,
    activities: [
      {
        createdAt: '2026-11-03T00:00:00Z',
        details: [{ raw: 'Status changed from New to Closed' }],
      },
    ],
    links: ['5'],
  });
  assert.equal(c.done, '2026-11-03T00:00:00Z');
  assert.deepEqual(
    c.links.map((l) => l.key),
    ['5', '3'],
  );
  const reference = 'openproject:op.example/house';
  const out = cardChanges(reference, { platform: 'openproject', name: 'House' }, c, ALL);
  assert.equal(
    byId(out.durations, boardEntityId(reference, '7')).metadata.title,
    '#7 Pour the foundations',
  );
  assert.ok(
    byId(out.durations, boardEntityId(reference, '7', 'planned')).metadata.tags.includes(
      'progress:100%',
    ),
  );
  // A milestone is a moment on its date.
  const m = openprojectCard('op.example', {
    id: 8,
    subject: 'Handover',
    createdAt: '2026-11-01T00:00:00Z',
    date: '2026-12-01',
    _embedded: { type: { isMilestone: true }, status: { name: 'New', isClosed: false } },
    _links: {},
  });
  const milestone = cardChanges(
    reference,
    { platform: 'openproject', name: 'House' },
    m,
    ALL,
  ).moments.find((x) => x.metadata.tags.includes('milestone'));
  assert.equal(milestone.metadata.title, 'Milestone: #8 Handover');
  assert.equal(milestone.time, secondsOf('2026-12-01T23:59:59Z'));
});

test('comparing readings, and the tracker’s column stints', () => {
  const before = {
    title: 'A',
    column: 'To do',
    assignees: ['Ann'],
    labels: [],
    done: null,
    start: null,
    due: null,
    progress: 0,
  };
  const after = {
    ...before,
    column: 'Doing',
    assignees: ['Bo'],
    progress: 50,
    due: '2026-11-20T00:00:00Z',
  };
  assert.deepEqual(
    cardDiff(before, after, 't', 'Leo').map((e) => `${e.verb} ${e.subject ?? ''}`.trim()),
    ['moved Doing', 'assigned Bo', 'unassigned Ann', 'rescheduled due', 'progress 50%'],
  );
  assert.deepEqual(cardDiff(null, after, 't'), [], 'nothing to compare the first reading with');
  const saved = {};
  const tracker = new BoardTracker('state.json', {
    read: () => ({}),
    write: (_, v) => Object.assign(saved, v),
  });
  const source = { platform: 'planner', name: 'Plan' };
  const card = {
    key: 'T1',
    title: 'A',
    created: '2026-11-01T00:00:00Z',
    column: 'To do',
    done: null,
  };
  const first = tracker.observe('planner:p', source, card, '2026-11-05T00:00:00Z');
  assert.deepEqual(
    first.map((d) => [d.start, d.end]),
    [[secondsOf('2026-11-01T00:00:00Z'), { ongoing: true }]],
  );
  const moved = tracker.observe(
    'planner:p',
    source,
    { ...card, column: 'Doing' },
    '2026-11-06T00:00:00Z',
  );
  assert.deepEqual(
    moved.map((d) => [d.metadata.title, d.end]),
    [
      ['A in To do', secondsOf('2026-11-06T00:00:00Z')],
      ['A in Doing', { ongoing: true }],
    ],
  );
  const done = tracker.observe(
    'planner:p',
    source,
    { ...card, column: 'Doing', done: '2026-11-07T00:00:00Z' },
    '2026-11-07T00:00:00Z',
  );
  assert.deepEqual(
    done.map((d) => d.end),
    [secondsOf('2026-11-07T00:00:00Z')],
  );
  assert.ok(saved['planner:p|T1'], 'remembered in its file');
  assert.deepEqual(tracker.keys('planner:p'), ['T1']);
});

/** A fake OpenChronology server that records saves. */
function fakeServer() {
  const saves = [];
  const fetcher = async (url, options = {}) => {
    const respond = (status, value) => ({
      status,
      json: async () => value,
      headers: { get: () => null },
    });
    if (!options.method || options.method === 'GET')
      return respond(200, {
        revision: 'r' + saves.length,
        title: 'Work',
        description: '',
        presentation: { version: 1, mode: 'gregorian', unit: '', scale: '1/1', origin: '0/1' },
      });
    saves.push(JSON.parse(options.body));
    return respond(200, { revision: 'r' + saves.length });
  };
  const durations = () =>
    saves.flatMap((s) => (s.durationChanges ?? []).map((c) => c.duration).filter(Boolean));
  const moments = () => saves.flatMap((s) => s.changes.map((c) => c.event).filter(Boolean));
  return { fetcher, saves, durations, moments };
}

test('the receiver takes Jira and OpenProject webhooks, checking their signatures', async () => {
  const server = fakeServer();
  const ingest = new GithubIngest({
    api: 'http://och.test',
    key: KEY,
    routes: githubRoutes({
      routes: [
        { board: 'jira:acme.atlassian.net/PROJ', timeline: TIMELINE },
        { board: 'openproject:op.example/*', timeline: TIMELINE },
      ],
    }),
    boards: { jira: { secret: 'j' }, openproject: { secret: 'o', host: 'op.example' } },
    fetcher: server.fetcher,
    flushMs: 60000,
  });
  const jira = {
    webhookEvent: 'jira:issue_updated',
    timestamp: Date.parse('2026-11-02T09:00:00Z'),
    user: { displayName: 'Leo' },
    issue: {
      key: 'PROJ-12',
      self: 'https://acme.atlassian.net/rest/api/2/issue/10012',
      fields: {
        summary: 'Ship it',
        created: '2026-11-01T10:00:00Z',
        status: { name: 'In Progress', statusCategory: { key: 'indeterminate' } },
        project: { key: 'PROJ', name: 'Project' },
        assignee: { displayName: 'Mona Lisa' },
      },
    },
    changelog: { items: [{ field: 'status', fromString: 'To Do', toString: 'In Progress' }] },
  };
  const body = Buffer.from(JSON.stringify(jira));
  const sign = (secret, b, algorithm = 'sha256') =>
    `${algorithm}=` + createHmac(algorithm, secret).update(b).digest('hex');
  assert.equal(ingest.receiveFrom({ 'x-hub-signature': sign('wrong', body) }, body), 401);
  assert.equal(
    ingest.receiveFrom(
      { 'x-atlassian-webhook-identifier': '1', 'x-hub-signature': sign('j', body) },
      body,
    ),
    202,
  );
  const elsewhere = Buffer.from(
    JSON.stringify({
      ...jira,
      issue: { ...jira.issue, key: 'X-1', fields: { ...jira.issue.fields, project: { key: 'X' } } },
    }),
  );
  assert.equal(
    ingest.receiveFrom({ 'x-hub-signature': sign('j', elsewhere) }, elsewhere),
    204,
    'no route',
  );
  // OpenProject: the first reading, then a change found by comparing.
  const wp = (status, percentageDone) => ({
    id: 7,
    subject: 'Pour the foundations',
    createdAt: '2026-11-01T00:00:00Z',
    updatedAt: status === 'New' ? '2026-11-01T00:00:00Z' : '2026-11-03T00:00:00Z',
    percentageDone,
    _embedded: {
      status: { name: status, isClosed: false },
      project: { identifier: 'house', name: 'House' },
      type: { name: 'Task' },
    },
    _links: {},
  });
  for (const [action, w] of [
    ['work_package:created', wp('New', 0)],
    ['work_package:updated', wp('In progress', 40)],
  ]) {
    const b = Buffer.from(JSON.stringify({ action, work_package: w, actor: { name: 'Leo' } }));
    assert.equal(ingest.receiveFrom({ 'x-op-signature': sign('o', b, 'sha1') }, b), 202);
  }
  await ingest.drain(2000);
  const titles = server.moments().map((m) => m.metadata.title);
  assert.ok(titles.includes('Moved to In Progress: PROJ-12 Ship it'));
  assert.ok(titles.includes('Created: #7 Pour the foundations'));
  assert.ok(titles.includes('Moved to In progress: #7 Pour the foundations'));
  assert.ok(titles.includes('40% done: #7 Pour the foundations'));
  const stints = server
    .durations()
    .filter((d) => d.metadata.tags.includes('in column'))
    .map((d) => d.metadata.title);
  assert.deepEqual(stints.sort(), ['#7 in In progress', '#7 in New', 'PROJ-12 in In Progress']);
  assert.ok(validJiraSignature('j', body, sign('j', body)));
  assert.ok(!validOpenProjectSignature('o', body, sign('o', body)), 'OpenProject signs with SHA-1');
});

test('the receiver takes a Trello webhook and reads its card', async () => {
  const server = fakeServer();
  const trelloFetch = async (url) => {
    assert.match(String(url), /\/1\/cards\/64c000000000000000000002/);
    return {
      ok: true,
      status: 200,
      headers: { get: () => null },
      text: async () =>
        JSON.stringify({ ...card, idList: 'l2', list: { id: 'l2', name: 'Doing' } }),
    };
  };
  const callbackUrl = 'https://och.example/hooks/github';
  const ingest = new GithubIngest({
    api: 'http://och.test',
    key: KEY,
    routes: githubRoutes({ routes: [{ board: 'trello:AbCd1234', timeline: TIMELINE }] }),
    boards: {
      trello: {
        secret: 'app-secret',
        callbackUrl,
        reader: new BoardReader({ api: 'https://api.trello.com/1', fetcher: trelloFetch }),
      },
    },
    fetcher: server.fetcher,
    flushMs: 60000,
  });
  const body = Buffer.from(JSON.stringify({ action: actions[2], model: board }));
  const signature = createHmac('sha1', 'app-secret')
    .update(Buffer.concat([body, Buffer.from(callbackUrl)]))
    .digest('base64');
  assert.ok(validTrelloSignature('app-secret', callbackUrl, body, signature));
  assert.equal(ingest.receiveFrom({ 'x-trello-webhook': 'bad' }, body), 401);
  assert.equal(ingest.receiveFrom({ 'x-trello-webhook': signature }, body), 202);
  await ingest.drain(2000);
  assert.deepEqual(
    server.moments().map((m) => m.metadata.title),
    ['Moved to Doing: Ship the login page'],
  );
  const duration = server
    .durations()
    .find((d) => d.id === boardEntityId(`trello:${board.id}`, card.id));
  assert.ok(duration.metadata.tags.includes('status:doing'));
  assert.deepEqual(duration.end, { ongoing: true });
});

test('Planner: tasks read, then read again and compared', async () => {
  const server = fakeServer();
  let bucket = 'b1';
  const graph = async (url) => {
    const u = new URL(url);
    const json = (v) => ({
      ok: true,
      status: 200,
      headers: { get: () => null },
      text: async () => JSON.stringify(v),
    });
    if (u.pathname.endsWith('/plans/P1')) return json({ id: 'P1', title: 'Launch' });
    if (u.pathname.endsWith('/buckets'))
      return json({
        value: [
          { id: 'b1', name: 'To do' },
          { id: 'b2', name: 'Doing' },
        ],
      });
    if (u.pathname.endsWith('/details'))
      return json({ categoryDescriptions: { category1: 'Urgent' } });
    if (u.pathname.endsWith('/tasks'))
      return json({
        value: [
          {
            id: 'T1',
            title: 'Write the press release',
            bucketId: bucket,
            createdDateTime: '2026-11-01T00:00:00Z',
            createdBy: { user: { id: 'u1' } },
            dueDateTime: '2026-11-20T00:00:00Z',
            percentComplete: bucket === 'b1' ? 0 : 50,
            appliedCategories: { category1: true },
            assignments: {
              u2: { assignedDateTime: '2026-11-02T00:00:00Z', assignedBy: { user: { id: 'u1' } } },
            },
          },
        ],
      });
    if (u.pathname.startsWith('/v1.0/users/'))
      return json({ displayName: u.pathname.endsWith('u1') ? 'Leo' : 'Mona Lisa' });
    return { ok: false, status: 404, headers: { get: () => null }, text: async () => '' };
  };
  const reader = new BoardReader({ api: 'https://graph.microsoft.com/v1.0', fetcher: graph });
  reader.people = new People(reader);
  const ingest = new GithubIngest({
    api: 'http://och.test',
    key: KEY,
    routes: githubRoutes({ routes: [{ board: 'planner:P1', timeline: TIMELINE }] }),
    boards: { planner: reader },
    log: { log() {}, error: console.error },
    fetcher: server.fetcher,
    flushMs: 60000,
  });
  await ingest.pollPlanner(() => '2026-11-05T00:00:00.000Z');
  await ingest.drain(2000);
  const first = server.moments().map((m) => m.metadata.title);
  assert.deepEqual(first, [
    'Created: Write the press release',
    'Assigned Mona Lisa: Write the press release',
  ]);
  const task = server.durations().find((d) => d.id === 'pl:P1:T1');
  assert.ok(
    task.metadata.tags.includes('label:urgent') && task.metadata.tags.includes('planner/mona lisa'),
  );
  // Nothing changed: nothing written.
  const saves = server.saves.length;
  await ingest.pollPlanner(() => '2026-11-05T00:05:00.000Z');
  await ingest.drain(2000);
  assert.equal(server.saves.length, saves);
  // Moved to Doing, half done: dated by the reading that saw it.
  bucket = 'b2';
  await ingest.pollPlanner(() => '2026-11-05T00:10:00.000Z');
  await ingest.drain(2000);
  const later = server.moments().slice(first.length);
  assert.deepEqual(
    later.map((m) => m.metadata.title),
    ['Moved to Doing: Write the press release', '50% done: Write the press release'],
  );
  assert.equal(later[0].time, secondsOf('2026-11-05T00:10:00Z'));
  const card = await plannerCard(
    { id: 'T2', title: 'x', createdDateTime: '2026-11-01T00:00:00Z' },
    { buckets: new Map(), categories: {}, people: reader.people },
  );
  assert.equal(card.done, null);
});
