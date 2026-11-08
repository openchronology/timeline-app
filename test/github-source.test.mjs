// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// GitHub as a source (#538): issues and pull requests as durations (ongoing while open),
// assignments as moments, "closes #n" as links; the webhook receiver's signatures, routing,
// batching and retries; and the importer's paging, against fake GitHub and OpenChronology APIs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import {
  assignmentMoment,
  closedIssues,
  deliveryChanges,
  entityId,
  githubRoutes,
  itemTag,
  repositoryTag,
  itemDuration,
  validSignature,
  NOTES_LIMIT,
} from '../server/github-source.mjs';
import {
  StintTracker,
  eventKinds,
  mentionChanges,
  projectStatusChange,
  timelineEvent,
} from '../server/github-events.mjs';
import { GithubIngest, listenGithub } from '../server/github-receiver.mjs';
import { GithubReader, main, readRepository } from '../server/import-github.mjs';
import { validateDuration, Q } from '../dist/core.mjs';

const TIMELINE = '6f1c2d3e-4a5b-4c6d-8e7f-90a1b2c3d4e5';
const OTHER = '0b7e1111-2222-4333-8444-555566667777';
const KEY = 'och_key_' + 'a'.repeat(32) + '_' + 'b'.repeat(64);
const issue = (overrides = {}) => ({
  number: 412,
  title: 'Fix the login loop',
  body: 'It loops.',
  state: 'open',
  created_at: '2026-11-01T10:00:00Z',
  updated_at: '2026-11-02T10:00:00Z',
  closed_at: null,
  html_url: 'https://github.com/acme/app/issues/412',
  assignees: [{ login: 'octo' }],
  labels: [{ name: 'Bug' }, { name: 'p1, urgent' }],
  milestone: { title: 'v2' },
  ...overrides,
});

test('an open issue is an ongoing duration, with its number, text, address and tags', () => {
  const d = itemDuration('acme/app', issue());
  assert.equal(d.id, 'gh:acme:app:412');
  assert.equal(d.start, String(Date.parse('2026-11-01T10:00:00Z') / 1000));
  assert.deepEqual(d.end, { ongoing: true });
  assert.equal(d.metadata.title, '#412 Fix the login loop');
  assert.equal(d.metadata.description, 'It loops.\n\nhttps://github.com/acme/app/issues/412');
  assert.deepEqual(d.metadata.tags, [
    'github',
    'github/acme/app',
    'github/acme/app#412',
    'issue',
    'state:open',
    'assigned',
    'github/octo',
    'label:bug',
    'label:p1  urgent',
    'milestone:v2',
  ]);
  // The core accepts it as it is.
  assert.deepEqual(validateDuration(d, Q.parse).end, { ongoing: true });
});

test('closed issues and merged pull requests end when they closed or merged', () => {
  const closed = itemDuration(
    'acme/app',
    issue({ state: 'closed', closed_at: '2026-11-03T00:00:00Z' }),
  );
  assert.equal(closed.end, String(Date.parse('2026-11-03T00:00:00Z') / 1000));
  assert.ok(closed.metadata.tags.includes('state:closed'));
  // From the issues listing, a pull request carries pull_request.merged_at.
  const merged = itemDuration(
    'acme/app',
    issue({
      state: 'closed',
      closed_at: '2026-11-04T00:00:00Z',
      pull_request: { merged_at: '2026-11-04T00:00:00Z' },
    }),
  );
  assert.ok(merged.metadata.tags.includes('pull request'));
  assert.ok(merged.metadata.tags.includes('state:merged'));
  const long = itemDuration('acme/app', issue({ body: 'x'.repeat(NOTES_LIMIT + 50) }));
  assert.ok(long.metadata.description.startsWith('x'.repeat(NOTES_LIMIT) + '…'));
});

test('a repository too long for a tag is named by a hash, the same each time', () => {
  const name =
    'gitlab:git.example.com/' +
    Array(8)
      .fill('group-' + 'g'.repeat(12))
      .join('/');
  const tag = itemTag(name, 123456789);
  assert.match(tag, /^gitlab:git\.example\.com\/[0-9a-f]{16}#123456789$/);
  assert.equal(itemTag(name.replace('example', 'EXAMPLE'), 123456789), tag);
  assert.equal(repositoryTag('Acme/App'), 'github/acme/app');
  // Unassigned items carry no `assigned` tag.
  assert.ok(!itemDuration('acme/app', issue({ assignees: [] })).metadata.tags.includes('assigned'));
});

test('IDs stay within 128 characters, hashing a long repository name', () => {
  const name = 'o'.repeat(39) + '/' + 'r'.repeat(100);
  const id = entityId(name, '7');
  assert.ok(id.length <= 128 && /^gh:[0-9a-f]{24}:7$/.test(id));
  assert.equal(entityId(name, '7'), id);
});

test('pull requests close the issues their text names', () => {
  assert.deepEqual(closedIssues('Fixes #12, closes: #13 and resolved #12. See #14.'), [12, 13]);
  assert.deepEqual(closedIssues(null), []);
});

test('signatures are checked against the secret', () => {
  const body = Buffer.from('{"zen":"hi"}');
  const sign = (secret) => 'sha256=' + createHmac('sha256', secret).update(body).digest('hex');
  assert.ok(validSignature('s3cret', body, sign('s3cret')));
  assert.ok(!validSignature('s3cret', body, sign('other')));
  assert.ok(!validSignature('s3cret', body, undefined));
  assert.ok(!validSignature('s3cret', body, 'sha256=abc'));
});

test('routes choose a timeline by repository, then the default', () => {
  const routes = githubRoutes({
    routes: [
      { repository: 'acme/app', timeline: TIMELINE },
      { repository: 'ACME/*', timeline: OTHER },
    ],
  });
  assert.equal(routes.route('acme/App'), TIMELINE);
  assert.equal(routes.route('acme/site'), OTHER);
  assert.equal(routes.route('else/where'), null);
  assert.equal(githubRoutes({ default: TIMELINE }).route('else/where'), TIMELINE);
  assert.throws(() => githubRoutes({ routes: [{ repository: 'acme', timeline: TIMELINE }] }));
});

test('deliveries become changes: edits, events, deletions, mentions and links', () => {
  const repository = { full_name: 'acme/app' };
  const sender = { login: 'mona' };
  const [labeled] = deliveryChanges('issues', {
    action: 'labeled',
    label: { name: 'Bug' },
    issue: issue(),
    repository,
    sender,
  });
  assert.equal(labeled.durations[0].id, 'gh:acme:app:412');
  assert.equal(labeled.moments[0].metadata.title, 'Labelled Bug: #412 Fix the login loop');
  assert.deepEqual(labeled.moments[0].metadata.tags.slice(3), [
    'labeled',
    'label:bug',
    'github/mona',
  ]);
  const assigned = () =>
    deliveryChanges('issues', {
      action: 'assigned',
      issue: issue(),
      assignee: { login: 'octo' },
      repository,
      sender,
    })[0].moments[0];
  assert.equal(assigned().metadata.title, 'Assigned octo: #412 Fix the login loop');
  // The same delivery twice is the same moment, and so is the importer's reading of it.
  assert.equal(assigned().id, assigned().id);
  assert.equal(
    assigned().id,
    timelineEvent('acme/app', issue(), {
      event: 'assigned',
      assignee: { login: 'octo' },
      created_at: issue().updated_at,
    }).moments[0].id,
  );
  assert.deepEqual(
    deliveryChanges('issues', { action: 'deleted', issue: issue(), repository })[0].removed,
    ['gh:acme:app:412'],
  );
  // A pull request: "closes" links, and the items it names are marked mentioned.
  const pull = deliveryChanges('pull_request', {
    action: 'opened',
    pull_request: {
      ...issue({ number: 413, body: 'Fixes #412, see other/lib#7' }),
      merged_at: null,
    },
    repository,
    sender,
  });
  assert.deepEqual(pull[0].links, [
    { a: { duration: 'gh:acme:app:413' }, b: { duration: 'gh:acme:app:412' }, related: true },
  ]);
  assert.deepEqual(
    pull.slice(1).map((c) => [c.repository, c.moments[0].metadata.title]),
    [
      ['acme/app', 'Mentioned in #413: #412'],
      ['other/lib', 'Mentioned in acme/app#413: #7'],
    ],
  );
  // A comment's mentions, without its text.
  const [comment] = deliveryChanges('issue_comment', {
    action: 'created',
    issue: issue(),
    comment: { body: 'Same as #9', user: { login: 'mona' }, updated_at: '2026-11-06T00:00:00Z' },
    repository,
  });
  assert.equal(comment.moments[0].metadata.title, 'Mentioned in #412: #9');
  assert.ok(!JSON.stringify(comment).includes('Same as'));
  // A review, a merge and a rename.
  const [review] = deliveryChanges('pull_request_review', {
    action: 'submitted',
    review: { state: 'approved', user: { login: 'octo' }, submitted_at: '2026-11-06T01:00:00Z' },
    pull_request: { ...issue({ number: 413 }), merged_at: null },
    repository,
  });
  assert.equal(review.moments[0].metadata.title, 'Approved by octo: #413 Fix the login loop');
  assert.ok(review.moments[0].metadata.tags.includes('review:approved'));
  const [merged] = deliveryChanges('pull_request', {
    action: 'closed',
    pull_request: {
      ...issue({ number: 413, state: 'closed', closed_at: '2026-11-07T00:00:00Z' }),
      merged: true,
      merged_at: '2026-11-07T00:00:00Z',
    },
    repository,
    sender,
  });
  assert.ok(merged.moments[0].metadata.tags.includes('merged'));
  const [renamed] = deliveryChanges('issues', {
    action: 'edited',
    changes: { title: { from: 'Login loops' } },
    issue: issue(),
    repository,
    sender,
  });
  assert.equal(
    renamed.moments[0].metadata.title,
    'Renamed from “Login loops”: #412 Fix the login loop',
  );
  // Sub-issues: both ends, and their link.
  const sub = deliveryChanges('sub_issues', {
    action: 'sub_issue_added',
    parent_issue: issue({ number: 1 }),
    sub_issue: issue({ number: 2 }),
    repository,
    sender,
  });
  assert.deepEqual(
    sub.map((c) => c.moments[0].metadata.tags[3]),
    ['sub-issue added', 'parent issue added'],
  );
  assert.equal(sub[0].links.length, 1);
  // Kinds left out are not recorded; events it does not know are ignored.
  const quiet = deliveryChanges(
    'issues',
    { action: 'labeled', label: { name: 'Bug' }, issue: issue(), repository },
    eventKinds(['assignments']),
  );
  assert.equal(quiet[0].moments.length, 0);
  assert.equal(quiet[0].durations.length, 1);
  assert.deepEqual(deliveryChanges('star', { action: 'created', repository }), []);
  assert.throws(() => eventKinds(['labels', 'stars']), /Unknown kind/);
});

test('every timeline event the importer reads becomes its moment', () => {
  const item = issue();
  const at = '2026-11-03T00:00:00Z';
  const title = (event) =>
    timelineEvent('acme/app', item, {
      created_at: at,
      actor: { login: 'mona' },
      ...event,
    })?.moments[0].metadata.title.replace(': #412 Fix the login loop', '');
  assert.equal(title({ event: 'milestoned', milestone: { title: 'v2' } }), 'Added to milestone v2');
  assert.equal(title({ event: 'closed' }), 'Closed');
  assert.equal(
    title({ event: 'review_requested', requested_reviewer: { login: 'octo' } }),
    'Review requested from octo',
  );
  assert.equal(title({ event: 'ready_for_review' }), 'Ready for review');
  assert.equal(title({ event: 'convert_to_draft' }), 'Converted to draft');
  assert.equal(title({ event: 'marked_as_duplicate' }), 'Marked as a duplicate');
  assert.equal(title({ event: 'pinned' }), 'Pinned');
  assert.equal(
    title({ event: 'moved_columns_in_project', project_card: { column_name: 'In progress' } }),
    'Moved to In progress',
  );
  assert.equal(title({ event: 'commented' }), undefined);
  const mention = timelineEvent('acme/app', item, {
    event: 'cross-referenced',
    created_at: at,
    source: { issue: { number: 9, title: 'Root cause', repository: { full_name: 'acme/app' } } },
  });
  assert.equal(
    mention.moments[0].metadata.title,
    'Mentioned in #9 Root cause: #412 Fix the login loop',
  );
  assert.ok(mention.moments[0].metadata.tags.includes('github/acme/app#9'));
  assert.equal(mention.links.length, 1);
  // A mention read by the importer and one seen by the receiver are the same moment.
  assert.equal(
    mention.moments[0].id,
    mentionChanges({ repository: 'acme/app', number: 9 }, '#412', at, 'mona')[0].moments[0].id,
  );
});

test('a project status change names its issue through GraphQL', async () => {
  const calls = [];
  const fetcher = async (url, options) => {
    calls.push({ url, body: JSON.parse(options.body), auth: options.headers.Authorization });
    return {
      status: 200,
      json: async () => ({
        data: {
          item: {
            number: 412,
            title: 'Fix the login loop',
            url: 'https://github.com/acme/app/issues/412',
            repository: { nameWithOwner: 'acme/app' },
          },
          project: { title: 'Roadmap' },
        },
      }),
    };
  };
  const payload = {
    action: 'edited',
    projects_v2_item: {
      content_type: 'Issue',
      content_node_id: 'I_1',
      project_node_id: 'PVT_1',
      updated_at: '2026-11-04T00:00:00Z',
    },
    changes: { field_value: { field_name: 'Status', to: { name: 'In review' } } },
    sender: { login: 'mona' },
  };
  const change = await projectStatusChange(payload, 'ghp_x', fetcher);
  assert.equal(change.repository, 'acme/app');
  assert.equal(
    change.moments[0].metadata.title,
    'Moved to In review in Roadmap: #412 Fix the login loop',
  );
  assert.ok(change.moments[0].metadata.tags.includes('status:in review'));
  assert.ok(change.moments[0].metadata.tags.includes('project:roadmap'));
  assert.equal(calls[0].url, 'https://api.github.com/graphql');
  assert.equal(calls[0].auth, 'Bearer ghp_x');
  // Without a token, or for another field, nothing.
  assert.equal(await projectStatusChange(payload, undefined, fetcher), null);
  assert.equal(
    await projectStatusChange(
      { ...payload, changes: { field_value: { field_name: 'Priority', to: { name: 'P1' } } } },
      'ghp_x',
      fetcher,
    ),
    null,
  );
});

/** A fake OpenChronology API: a Gregorian timeline per ID; saves recorded; failures scripted. */
function fakeServer({ failures = [], refuse = () => null } = {}) {
  const saves = [];
  const fetcher = async (url, options = {}) => {
    const path = new URL(url).pathname;
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
    const body = JSON.parse(options.body);
    const failure = refuse(body) ?? failures.shift();
    if (failure) return respond(failure.status, { error: failure.error ?? 'failed' });
    saves.push({ path, body });
    return respond(200, { revision: 'r' + saves.length });
  };
  return { fetcher, saves };
}
const delivery = (ingest, event, payload, secret = 's3cret') => {
  const body = Buffer.from(JSON.stringify(payload));
  return ingest.receive(
    event,
    'sha256=' + createHmac('sha256', secret).update(body).digest('hex'),
    body,
  );
};

test('the receiver checks, routes, coalesces and saves deliveries', async () => {
  const server = fakeServer();
  const ingest = new GithubIngest({
    api: 'http://och.test',
    key: KEY,
    secret: 's3cret',
    routes: githubRoutes({ routes: [{ repository: 'acme/*', timeline: TIMELINE }] }),
    fetcher: server.fetcher,
    flushMs: 60000,
  });
  await ingest.check();
  const repository = { full_name: 'acme/app' };
  assert.equal(
    delivery(ingest, 'issues', { action: 'opened', issue: issue(), repository }, 'bad'),
    401,
  );
  assert.equal(delivery(ingest, 'ping', { zen: 'hi', repository }), 204);
  assert.equal(
    delivery(ingest, 'issues', {
      action: 'opened',
      issue: issue(),
      repository: { full_name: 'else/where' },
    }),
    204,
  );
  assert.equal(delivery(ingest, 'issues', { action: 'opened', issue: issue(), repository }), 202);
  assert.equal(
    delivery(ingest, 'issues', {
      action: 'closed',
      issue: issue({ state: 'closed', closed_at: '2026-11-05T00:00:00Z' }),
      repository,
    }),
    202,
  );
  assert.equal(
    delivery(ingest, 'pull_request', {
      action: 'opened',
      pull_request: { ...issue({ number: 413, body: 'Closes #412' }), merged_at: null },
      repository,
    }),
    202,
  );
  await ingest.drain();
  // One save of both items (the issue's last state), its close and the mention, then the
  // link (from "Closes #412", and the mention) on its own.
  assert.equal(server.saves.length, 2);
  const [entities, links] = server.saves;
  assert.equal(entities.path, `/api/timelines/${TIMELINE}/changes`);
  assert.deepEqual(
    entities.body.durationChanges.map((c) => [c.id, c.duration.end]),
    [
      ['gh:acme:app:412', String(Date.parse('2026-11-05T00:00:00Z') / 1000)],
      ['gh:acme:app:413', { ongoing: true }],
    ],
  );
  assert.equal(links.body.relationshipChanges.length, 1);
  assert.deepEqual(
    entities.body.changes.map((c) => c.event.metadata.title),
    ['Closed: #412 Fix the login loop', 'Mentioned in #413: #412'],
  );
  assert.deepEqual(ingest.stats, { deliveries: 5, rejected: 1, ignored: 1, saved: 4, failed: 0 });
});

test('the receiver retries what the server could not take, and drops what it refused', async () => {
  const server = fakeServer({ failures: [{ status: 503 }] });
  const errors = [];
  const ingest = new GithubIngest({
    api: 'http://och.test',
    key: KEY,
    secret: 's3cret',
    routes: githubRoutes({ default: TIMELINE }),
    fetcher: server.fetcher,
    flushMs: 60000,
    log: { error: (line) => errors.push(line), log() {} },
  });
  const repository = { full_name: 'acme/app' };
  delivery(ingest, 'issues', { action: 'opened', issue: issue(), repository });
  await ingest.flush(TIMELINE);
  assert.equal(server.saves.length, 0);
  assert.equal(ingest.pending.get(TIMELINE).size, 1, 'kept for later');
  await ingest.drain();
  assert.equal(server.saves.length, 1);
  // A link the server refuses (its issue is not on the timeline) is let go quietly.
  const refusing = fakeServer({
    refuse: (body) => (body.relationshipChanges ? { status: 400, error: 'unknown entity' } : null),
  });
  const linker = new GithubIngest({
    api: 'http://och.test',
    key: KEY,
    secret: 's3cret',
    routes: githubRoutes({ default: TIMELINE }),
    fetcher: refusing.fetcher,
    flushMs: 60000,
  });
  delivery(linker, 'pull_request', {
    action: 'opened',
    pull_request: { ...issue({ number: 413, body: 'Closes #9' }), merged_at: null },
    repository,
  });
  // The pull request saves; its link is refused, and not retried.
  await linker.drain();
  assert.equal(refusing.saves.length, 1);
  assert.equal(linker.pending.get(TIMELINE)?.size ?? 0, 0);
  assert.equal(errors.length, 0);
});

test('the receiver serves webhooks over HTTP', async () => {
  const server = fakeServer();
  const ingest = new GithubIngest({
    api: 'http://och.test',
    key: KEY,
    secret: 's3cret',
    routes: githubRoutes({ default: TIMELINE }),
    fetcher: server.fetcher,
    flushMs: 60000,
  });
  const listening = await listenGithub(ingest, { port: 0 });
  try {
    const url = `http://127.0.0.1:${listening.port}/`;
    const body = JSON.stringify({
      action: 'opened',
      issue: issue(),
      repository: { full_name: 'acme/app' },
    });
    const sign = 'sha256=' + createHmac('sha256', 's3cret').update(body).digest('hex');
    const post = (headers) => fetch(url, { method: 'POST', body, headers });
    assert.equal(
      (await post({ 'X-GitHub-Event': 'issues', 'X-Hub-Signature-256': sign })).status,
      202,
    );
    assert.equal((await post({ 'X-GitHub-Event': 'issues' })).status, 401);
    assert.equal((await fetch(url)).status, 404);
  } finally {
    await listening.close();
  }
  await ingest.drain();
  assert.equal(server.saves.length, 1);
});

/** A fake GitHub API: issues and events in pages of two, with Link headers. */
function fakeGithub() {
  const items = [
    issue({ number: 1, state: 'closed', closed_at: '2026-11-02T00:00:00Z' }),
    issue({ number: 2 }),
    { ...issue({ number: 3, body: 'Fixes #2 and #99' }), pull_request: { merged_at: null } },
  ];
  // Each item's timeline: #2 is assigned, labelled, mentioned by #3 and unassigned; #3 is
  // reviewed; #1 is closed.
  const timelines = {
    1: [{ event: 'closed', created_at: '2026-11-02T00:00:00Z', actor: { login: 'octo' } }],
    2: [
      { event: 'assigned', created_at: '2026-11-01T11:00:00Z', assignee: { login: 'octo' } },
      { event: 'labeled', created_at: '2026-11-01T12:00:00Z', label: { name: 'bug' } },
      { event: 'commented', created_at: '2026-11-01T12:10:00Z', body: 'private words' },
      {
        event: 'cross-referenced',
        created_at: '2026-11-01T12:20:00Z',
        source: { issue: { number: 3, repository: { full_name: 'acme/app' } } },
      },
      { event: 'unassigned', created_at: '2026-11-01T13:00:00Z', assignee: { login: 'octo' } },
    ],
    3: [
      {
        event: 'moved_columns_in_project',
        created_at: '2026-11-01T09:00:00Z',
        project_card: { column_name: 'In progress' },
      },
      {
        event: 'moved_columns_in_project',
        created_at: '2026-11-01T13:30:00Z',
        project_card: { column_name: 'Review' },
      },
      {
        event: 'reviewed',
        submitted_at: '2026-11-01T14:00:00Z',
        state: 'approved',
        user: { login: 'mona' },
      },
    ],
  };
  const releases = [
    {
      id: 70,
      tag_name: 'v1.0.0',
      name: 'First',
      published_at: '2026-11-01T15:00:00Z',
      author: { login: 'mona' },
    },
    { id: 71, tag_name: 'v1.1.0-draft', draft: true, published_at: null },
  ];
  const milestones = [
    {
      number: 5,
      title: 'v1',
      state: 'closed',
      created_at: '2026-10-01T00:00:00Z',
      closed_at: '2026-11-01T15:00:00Z',
      updated_at: '2026-11-01T15:00:00Z',
      due_on: '2026-11-01T00:00:00Z',
    },
    {
      number: 6,
      title: 'v2',
      state: 'open',
      created_at: '2026-11-01T16:00:00Z',
      updated_at: '2026-11-01T16:00:00Z',
      due_on: null,
    },
  ];
  const seen = [];
  const fetcher = async (url, options) => {
    seen.push({ url, headers: options.headers });
    const u = new URL(url);
    const number = /\/issues\/(\d+)\/timeline$/.exec(u.pathname)?.[1];
    const list = number
      ? timelines[number]
      : u.pathname.endsWith('/releases')
        ? releases
        : u.pathname.endsWith('/milestones')
          ? milestones
          : items;
    const page = Number(u.searchParams.get('page') ?? '1');
    const slice = list.slice((page - 1) * 2, page * 2);
    const next = page * 2 < list.length ? new URL(url) : null;
    next?.searchParams.set('page', String(page + 1));
    return {
      status: 200,
      json: async () => slice,
      headers: { get: (name) => (name === 'link' && next ? `<${next.href}>; rel="next"` : null) },
    };
  };
  return { fetcher, seen };
}

test('the importer reads every page of issues and their timelines, and links what it read', async () => {
  const github = fakeGithub();
  const reader = new GithubReader({ token: 'ghp_x', fetcher: github.fetcher });
  const changes = await readRepository(reader, 'acme/app');
  assert.deepEqual(
    changes.durations.map((d) => [d.metadata.title, typeof d.end === 'string' ? 'closed' : 'open']),
    [
      ['#1 Fix the login loop', 'closed'],
      ['#2 Fix the login loop', 'open'],
      ['#3 Fix the login loop', 'open'],
      // #3's time in each column: In progress until it moved to Review, still there.
      ['#3 in In progress', 'closed'],
      ['#3 in Review', 'open'],
      ['Milestone v1', 'closed'],
      ['Milestone v2', 'open'],
    ],
  );
  assert.equal(changes.durations[3].end, String(Date.parse('2026-11-01T13:30:00Z') / 1000));
  assert.deepEqual(
    changes.moments.map((m) => m.metadata.tags[3] ?? m.metadata.tags[2]),
    [
      'closed',
      'assigned',
      'labeled',
      'mentioned',
      'unassigned',
      'moved',
      'moved',
      'reviewed',
      'release:v1.0.0',
      'milestone:v1',
    ],
  );
  assert.equal(changes.moments.at(-2).metadata.title, 'Released v1.0.0 First');
  assert.equal(changes.moments.at(-1).metadata.title, 'Due: milestone v1');
  // v2 has no due date: any earlier one is removed.
  assert.deepEqual(changes.removedMoments, ['gh:acme:app:milestone:6:due']);
  assert.ok(!JSON.stringify(changes).includes('private words'), 'comments are not copied');
  // #3 closes #2 and mentions it: one link. #99 was not read, so no link to it.
  assert.equal(changes.links.length, 1);
  assert.ok(github.seen.every((r) => r.headers.Authorization === 'Bearer ghp_x'));
  assert.ok(
    github.seen.every((r) => /^OpenChronology-github-source/.test(r.headers['User-Agent'])),
  );
  // Since a time: the listing asks GitHub for it, and earlier events are left out.
  const recent = await readRepository(reader, 'acme/app', { since: '2026-11-01T12:30:00Z' });
  assert.deepEqual(
    recent.moments.map((m) => m.metadata.tags[3]),
    ['closed', 'unassigned', 'moved', 'reviewed', 'release:v1.0.0', 'milestone:v1'],
  );
  assert.ok(
    github.seen.some((r) => new URL(r.url).searchParams.get('since') === '2026-11-01T12:30:00Z'),
  );
  // Only some kinds; or none, which reads no timelines.
  const labels = await readRepository(reader, 'acme/app', { kinds: eventKinds(['labels']) });
  assert.deepEqual(
    labels.moments.map((m) => m.metadata.tags[3]),
    ['labeled'],
  );
  github.seen.length = 0;
  await readRepository(reader, 'acme/app', { kinds: new Set() });
  assert.ok(github.seen.every((r) => !r.url.includes('/timeline')));
});

test('the command checks its arguments, and a dry run writes nothing', async () => {
  const lines = [];
  const out = { log: (l) => lines.push(l), error: (l) => lines.push(l) };
  assert.equal(await main(['--repo', 'not-a-repo', '--timeline', TIMELINE], {}, out), 2);
  assert.equal(
    await main(['--repo', 'acme/app', '--timeline', TIMELINE, '--since', 'soon'], {}, out),
    2,
  );
  assert.equal(
    await main(['--repo', 'acme/app', '--timeline', TIMELINE, '--events', 'stars'], {}, out),
    2,
  );
  const github = fakeGithub();
  const realFetch = globalThis.fetch;
  globalThis.fetch = github.fetcher;
  try {
    lines.length = 0;
    assert.equal(
      await main(['--repo', 'acme/app', '--timeline', TIMELINE, '--dry-run'], {}, out),
      0,
    );
  } finally {
    globalThis.fetch = realFetch;
  }
  assert.match(
    lines[0],
    /acme\/app → .*: would import 3 issues and pull requests \(2 open\), 4 other durations \(milestones, time in columns\), 10 events, 1 links\./,
  );
});

test('assignment moments carry who and what', () => {
  const m = assignmentMoment('acme/app', issue(), {
    action: 'unassigned',
    assignee: { login: 'octo' },
    time: '2026-11-01T13:00:00Z',
  });
  assert.equal(
    m.id,
    `gh:acme:app:412:unassigned:octo:${Date.parse('2026-11-01T13:00:00Z') / 1000}`,
  );
  // It carries its item's tag, so separating by it gathers the item and its assignments.
  assert.deepEqual(m.metadata.tags, [
    'github',
    'github/acme/app',
    'github/acme/app#412',
    'unassigned',
    'github/octo',
  ]);
});

test("the receiver keeps each item's time in its board's columns", async () => {
  const server = fakeServer();
  const github = async () => ({
    status: 200,
    json: async () => ({
      data: {
        item: {
          number: 412,
          title: 'Fix the login loop',
          url: 'https://github.com/acme/app/issues/412',
          repository: { nameWithOwner: 'acme/app' },
        },
        project: { title: 'Roadmap' },
      },
    }),
  });
  const written = [];
  const stints = new StintTracker('state.json', { write: (file, value) => written.push(value) });
  const ingest = new GithubIngest({
    api: 'http://och.test',
    key: KEY,
    secret: 's3cret',
    routes: githubRoutes({ default: TIMELINE }),
    fetcher: async (url, options) =>
      url.endsWith('/graphql') ? github() : server.fetcher(url, options),
    flushMs: 60000,
    token: 'ghp_x',
    stints,
  });
  const move = (column, at) =>
    delivery(ingest, 'projects_v2_item', {
      action: 'edited',
      projects_v2_item: {
        content_type: 'Issue',
        content_node_id: 'I_1',
        project_node_id: 'PVT_1',
        updated_at: at,
      },
      changes: { field_value: { field_name: 'Status', to: { name: column } } },
      sender: { login: 'mona' },
    });
  assert.equal(move('In progress', '2026-11-01T09:00:00Z'), 202);
  await ingest.drain();
  assert.equal(move('Review', '2026-11-01T13:00:00Z'), 202);
  await ingest.drain();
  assert.equal(
    delivery(ingest, 'issues', {
      action: 'closed',
      issue: issue({ state: 'closed', closed_at: '2026-11-02T00:00:00Z' }),
      repository: { full_name: 'acme/app' },
    }),
    202,
  );
  await ingest.drain();
  const stintsSaved = new Map();
  for (const save of server.saves)
    for (const c of save.body.durationChanges ?? [])
      if (c.duration.metadata.tags.includes('in column')) stintsSaved.set(c.id, c.duration);
  const s = (t) => String(Date.parse(t) / 1000);
  assert.deepEqual(
    [...stintsSaved.values()].map((d) => [d.metadata.title, d.start, d.end]),
    [
      ['#412 in In progress (Roadmap)', s('2026-11-01T09:00:00Z'), s('2026-11-01T13:00:00Z')],
      ['#412 in Review (Roadmap)', s('2026-11-01T13:00:00Z'), s('2026-11-02T00:00:00Z')],
    ],
  );
  // What it remembered was written down at each step, and is empty once the item closed.
  assert.deepEqual(written.at(-1), {});
  assert.equal(written.length, 3);
});

test('releases and milestones arrive as moments and durations, and leave when deleted', () => {
  const repository = { full_name: 'acme/app' };
  const release = {
    id: 70,
    tag_name: 'v1.0.0',
    name: 'First',
    published_at: '2026-11-01T15:00:00Z',
  };
  const [published] = deliveryChanges('release', { action: 'published', release, repository });
  assert.equal(published.moments[0].metadata.title, 'Released v1.0.0 First');
  const [deleted] = deliveryChanges('release', { action: 'deleted', release, repository });
  assert.deepEqual(deleted.removedMoments, [published.moments[0].id]);
  const milestone = {
    number: 5,
    title: 'v1',
    state: 'open',
    created_at: '2026-10-01T00:00:00Z',
    due_on: '2026-11-01T00:00:00Z',
  };
  const [created] = deliveryChanges('milestone', { action: 'created', milestone, repository });
  assert.deepEqual(created.durations[0].end, { ongoing: true });
  assert.equal(created.moments[0].metadata.title, 'Due: milestone v1');
  const [gone] = deliveryChanges('milestone', { action: 'deleted', milestone, repository });
  assert.deepEqual(gone.removed, ['gh:acme:app:milestone:5']);
  assert.deepEqual(gone.removedMoments, ['gh:acme:app:milestone:5:due']);
  assert.deepEqual(
    deliveryChanges(
      'release',
      { action: 'published', release, repository },
      eventKinds(['labels']),
    ),
    [],
  );
});
