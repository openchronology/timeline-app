// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// Forgejo and Gitea as sources (#538): references on their host, timelines and deliveries
// translated into GitHub's shapes, signatures, and the receiver and importer reading them.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import {
  forgejoDelivery,
  forgejoRepository,
  forgejoTimelineEvent,
  validForgejoSignature,
} from '../server/forgejo-source.mjs';
import {
  deliveryChanges,
  githubRoutes,
  itemDuration,
  parseRepository,
  repositoryTag,
} from '../server/github-source.mjs';
import { timelineEvent } from '../server/github-events.mjs';
import { GithubIngest } from '../server/github-receiver.mjs';
import { GithubReader, readRepository } from '../server/import-github.mjs';

const REPO = 'forgejo:codeberg.org/acme/app';
const TIMELINE = '6f1c2d3e-4a5b-4c6d-8e7f-90a1b2c3d4e5';
const KEY = 'och_key_' + 'a'.repeat(32) + '_' + 'b'.repeat(64);
const repository = {
  full_name: 'acme/app',
  html_url: 'https://codeberg.org/acme/app',
};
const issue = (overrides = {}) => ({
  number: 5,
  title: 'Crash on start',
  body: 'Steps…',
  state: 'open',
  created_at: '2026-11-01T10:00:00Z',
  updated_at: '2026-11-02T10:00:00Z',
  html_url: 'https://codeberg.org/acme/app/issues/5',
  assignees: null,
  labels: [{ name: 'bug' }],
  ...overrides,
});

test('a Forgejo repository is named on its host, in its IDs and tags', () => {
  assert.equal(forgejoRepository(repository), REPO);
  assert.deepEqual(parseRepository(REPO), {
    platform: 'forgejo',
    host: 'codeberg.org',
    path: 'acme/app',
    public: false,
  });
  const d = itemDuration(REPO, issue());
  assert.equal(d.id, 'fj:codeberg.org:acme:app:5');
  assert.deepEqual(d.metadata.tags.slice(0, 4), [
    'forgejo',
    'forgejo:codeberg.org/acme/app',
    'forgejo:codeberg.org/acme/app#5',
    'issue',
  ]);
  assert.equal(repositoryTag('forgejo:Codeberg.org/Acme/App'), 'forgejo:codeberg.org/acme/app');
  // Routes name the host too.
  const routes = githubRoutes({
    routes: [{ repository: 'forgejo:codeberg.org/acme/*', timeline: TIMELINE }],
  });
  assert.equal(routes.route(REPO), TIMELINE);
  assert.equal(routes.route('acme/app'), null, 'not the github.com repository of that name');
});

test('timeline entries become the events GitHub timelines carry', () => {
  const at = { created_at: '2026-11-03T00:00:00Z', user: { login: 'mona' } };
  const title = (entry) => {
    const event = forgejoTimelineEvent({ ...at, ...entry }, 'codeberg.org');
    return (
      event &&
      timelineEvent(REPO, issue(), event)?.moments[0].metadata.title.replace(
        ': #5 Crash on start',
        '',
      )
    );
  };
  assert.equal(title({ type: 'label', body: '1', label: { name: 'bug' } }), 'Labelled bug');
  assert.equal(title({ type: 'label', body: '', label: { name: 'bug' } }), 'Unlabelled bug');
  assert.equal(title({ type: 'assignees', assignee: { login: 'octo' } }), 'Assigned octo');
  assert.equal(
    title({ type: 'assignees', assignee: { login: 'octo' }, removed_assignee: true }),
    'Unassigned octo',
  );
  assert.equal(title({ type: 'milestone', milestone: { title: 'v1' } }), 'Added to milestone v1');
  assert.equal(
    title({ type: 'milestone', old_milestone: { title: 'v1' } }),
    'Removed from milestone v1',
  );
  assert.equal(title({ type: 'merge_pull' }), 'Merged');
  assert.equal(
    title({ type: 'change_title', old_title: 'Crash', new_title: 'Crash on start' }),
    'Renamed from “Crash”',
  );
  assert.equal(
    title({ type: 'review_request', assignee: { login: 'octo' } }),
    'Review requested from octo',
  );
  assert.equal(title({ type: 'comment', body: 'private words' }), null);
  assert.equal(title({ type: 'pull_push', body: '{}' }), null);
  assert.equal(
    title({
      type: 'pull_ref',
      ref_issue: { number: 9, title: 'Fix', repository: { full_name: 'acme/app' } },
    }),
    'Mentioned in #9 Fix',
  );
});

test('deliveries become GitHub deliveries, label sets and review verdicts included', () => {
  const opened = forgejoDelivery('issues', 'issues', {
    action: 'opened',
    issue: issue(),
    repository,
  });
  const [change] = deliveryChanges(opened.event, opened.payload);
  assert.equal(change.repository, REPO);
  assert.equal(change.durations[0].id, 'fj:codeberg.org:acme:app:5');
  // Forgejo says only that the labels changed: the duration follows, with no moment.
  const relabelled = forgejoDelivery('issues', 'issue_label', {
    action: 'label_updated',
    issue: issue(),
    repository,
  });
  const [labels] = deliveryChanges(relabelled.event, relabelled.payload);
  assert.equal(labels.moments.length, 0);
  assert.ok(labels.durations[0].metadata.tags.includes('label:bug'));
  // An assignment names its person on the item.
  const assigned = forgejoDelivery('issues', 'issue_assign', {
    action: 'assigned',
    issue: issue({ assignee: { login: 'octo' }, assignees: [{ login: 'octo' }] }),
    repository,
  });
  assert.equal(
    deliveryChanges(assigned.event, assigned.payload)[0].moments[0].metadata.title,
    'Assigned octo: #5 Crash on start',
  );
  const approved = forgejoDelivery('pull_request_approved', 'pull_request_review_approved', {
    action: 'reviewed',
    pull_request: { ...issue({ number: 6 }), merged: false },
    review: { type: 'pull_request_review_approved', content: '' },
    sender: { login: 'octo' },
    repository,
  });
  const [review] = deliveryChanges(approved.event, approved.payload);
  assert.equal(review.moments[0].metadata.title, 'Approved by octo: #6 Crash on start');
  const release = forgejoDelivery('release', 'release', {
    action: 'published',
    release: { id: 3, tag_name: 'v1', published_at: '2026-11-04T00:00:00Z' },
    repository,
  });
  assert.equal(
    deliveryChanges(release.event, release.payload)[0].moments[0].metadata.title,
    'Released v1',
  );
  assert.equal(
    forgejoDelivery('issues', 'issues', { action: 'opened', issue: issue(), repository: {} }),
    null,
  );
});

test('signatures are the hex HMAC of the body, without a prefix', () => {
  const body = Buffer.from('{}');
  const hex = createHmac('sha256', 's3cret').update(body).digest('hex');
  assert.ok(validForgejoSignature('s3cret', body, hex));
  assert.ok(!validForgejoSignature('s3cret', body, 'sha256=' + hex));
  assert.ok(!validForgejoSignature('other', body, hex));
});

test('the receiver takes Forgejo deliveries with their own secret', async () => {
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
    secrets: { forgejo: 'fj-secret' },
    routes: githubRoutes({
      routes: [{ repository: 'forgejo:codeberg.org/acme/*', timeline: TIMELINE }],
    }),
    fetcher,
    flushMs: 60000,
  });
  const body = Buffer.from(JSON.stringify({ action: 'opened', issue: issue(), repository }));
  const sign = (secret) => createHmac('sha256', secret).update(body).digest('hex');
  assert.equal(
    ingest.receiveFrom(
      { 'x-forgejo-event': 'issues', 'x-forgejo-signature': sign('fj-secret') },
      body,
    ),
    202,
  );
  assert.equal(
    ingest.receiveFrom({ 'x-gitea-event': 'issues', 'x-gitea-signature': sign('wrong') }, body),
    401,
  );
  // A GitHub delivery, with no GitHub secret set, is refused.
  assert.equal(
    ingest.receiveFrom(
      { 'x-github-event': 'issues', 'x-hub-signature-256': 'sha256=' + sign('fj-secret') },
      body,
    ),
    401,
  );
  assert.equal(ingest.receiveFrom({}, body), 400);
  await ingest.drain();
  assert.equal(saves.length, 1);
  assert.equal(saves[0].durationChanges[0].id, 'fj:codeberg.org:acme:app:5');
});

test('the importer reads Forgejo with its own paging and token scheme', async () => {
  const seen = [];
  const fetcher = async (url, options) => {
    seen.push({ url: new URL(url), auth: options.headers.Authorization });
    const u = new URL(url);
    const body = u.pathname.endsWith('/timeline')
      ? [{ type: 'close', created_at: '2026-11-03T00:00:00Z', user: { login: 'mona' } }]
      : u.pathname.endsWith('/issues')
        ? [issue({ state: 'closed', closed_at: '2026-11-03T00:00:00Z' })]
        : [];
    return { status: 200, json: async () => body, headers: { get: () => null } };
  };
  const reader = new GithubReader({
    api: 'https://codeberg.org/api/v1',
    token: 'fj',
    scheme: 'token',
    pageSize: ['limit', '50'],
    fetcher,
  });
  const changes = await readRepository(reader, REPO);
  assert.deepEqual(
    changes.durations.map((d) => d.id),
    ['fj:codeberg.org:acme:app:5'],
  );
  assert.deepEqual(
    changes.moments.map((m) => m.metadata.title),
    ['Closed: #5 Crash on start'],
  );
  assert.equal(seen[0].url.pathname, '/api/v1/repos/acme/app/issues');
  assert.equal(seen[0].url.searchParams.get('limit'), '50');
  assert.ok(seen.every((r) => r.auth === 'token fj'));
});
