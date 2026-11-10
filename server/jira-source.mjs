// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
/**
 * Jira as a source (#538), Cloud and Data Center: a project's issues with their changelogs
 * (status changes, assignees, resolutions, labels, renames, start and due dates) as
 * board-source.mjs cards, issue links and parents as links, and webhooks' signatures and
 * deliveries (docs/boards.md).
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import { BoardReader } from './board-reader.mjs';

/** Jira Cloud's sites: the rest is Data Center or Server, which keep API version 2. */
export const isCloud = (host) => /\.atlassian\.net$/i.test(host);

/**
 * A client for a Jira site: on Cloud with an account's email and API token (basic), elsewhere
 * with a personal access token (bearer).
 */
export function jiraReader(host, { email, token, fetcher, log } = {}) {
  if (!token) throw new Error('Set JIRA_TOKEN (and JIRA_EMAIL on Jira Cloud) to read Jira.');
  const cloud = isCloud(host);
  if (cloud && !email) throw new Error('Jira Cloud needs JIRA_EMAIL with JIRA_TOKEN.');
  const reader = new BoardReader({
    api: `https://${host}/rest/api/${cloud ? 3 : 2}`,
    headers: {
      authorization: email
        ? 'Basic ' + Buffer.from(`${email}:${token}`).toString('base64')
        : `Bearer ${token}`,
    },
    fetcher,
    log,
  });
  reader.cloud = cloud;
  return reader;
}

/** The text of a description: a string (version 2) or Atlassian's document format (3). */
export function plainText(value) {
  if (typeof value === 'string') return value;
  if (!value || typeof value !== 'object') return '';
  if (value.type === 'text') return value.text ?? '';
  const inner = (value.content ?? []).map(plainText);
  const block = ['paragraph', 'heading', 'listItem', 'codeBlock', 'blockquote'].includes(
    value.type,
  );
  return inner.join(block ? '' : value.type === 'doc' ? '\n\n' : '\n') + (block ? '\n' : '');
}
const name = (user) => user?.displayName ?? user?.name ?? null;
const words = (text) =>
  String(text ?? '')
    .split(/\s+/)
    .filter(Boolean);
const dateOnly = (value) => (value ? String(value).slice(0, 10) : null);

/**
 * What one changelog entry (`{author, created, items}`) did, as board-source.mjs events.
 * `startField` names the start date's field (its name in the changelog, such as "Start date").
 */
export function historyEvents(history, { startField = 'Start date' } = {}) {
  const time = history.created,
    person = name(history.author),
    events = [];
  const at = (verb, extra = {}) => events.push({ verb, time, person, ...extra });
  for (const item of history.items ?? []) {
    const field = String(item.field ?? '').toLowerCase();
    if (field === 'status' && item.toString)
      at('moved', { subject: item.toString, from: item.fromString ?? null });
    else if (field === 'assignee') {
      if (item.fromString) at('unassigned', { subject: item.fromString });
      if (item.toString) at('assigned', { subject: item.toString });
    } else if (field === 'resolution') at(item.toString ? 'completed' : 'reopened');
    else if (field === 'labels') {
      const was = new Set(words(item.fromString)),
        now = new Set(words(item.toString));
      for (const l of now) if (!was.has(l)) at('labeled', { subject: l });
      for (const l of was) if (!now.has(l)) at('unlabeled', { subject: l });
    } else if (field === 'summary') at('renamed', { from: item.fromString ?? '' });
    else if (field === 'duedate')
      at('rescheduled', { subject: 'due', to: dateOnly(item.to ?? item.toString) });
    else if (field === startField.toLowerCase())
      at('rescheduled', { subject: 'start', to: dateOnly(item.to ?? item.toString) });
  }
  return events;
}

/**
 * A Jira issue as a board-source.mjs card: done while its status is in the "done" category,
 * since its resolution (or its last status change); its links to issues in the same project
 * and its parent are links.
 */
export function jiraCard(host, issue, { histories = [], startField } = {}) {
  const f = issue.fields ?? {};
  const events = [
    {
      verb: 'created',
      time: f.created,
      person: name(f.reporter ?? f.creator),
    },
    ...[...histories]
      .sort((a, b) => Date.parse(a.created) - Date.parse(b.created))
      .flatMap((h) => historyEvents(h, { startField: startField?.name })),
  ];
  const done = f.status?.statusCategory?.key === 'done';
  const lastMove = events.filter((e) => e.verb === 'moved').at(-1);
  const project = issue.key.split('-')[0];
  const linked = [
    ...(f.issuelinks ?? []).map((l) => (l.outwardIssue ?? l.inwardIssue)?.key),
    f.parent?.key,
  ].filter((key) => key && key.split('-')[0] === project);
  // The status it was created in: its first change's "from", or where it still is.
  const firstMove = events.find((e) => e.verb === 'moved');
  return {
    key: issue.key,
    reference: issue.key,
    number: issue.key,
    title: f.summary ?? '',
    description: plainText(f.description).trim(),
    url: `https://${host}/browse/${issue.key}`,
    kind: (f.issuetype?.name ?? 'issue').toLowerCase(),
    created: f.created,
    done: done ? (f.resolutiondate ?? lastMove?.time ?? f.updated ?? null) : null,
    column: f.status?.name ?? null,
    firstColumn: firstMove?.from ?? null,
    assignees: f.assignee ? [name(f.assignee)] : [],
    labels: f.labels ?? [],
    start: startField ? dateOnly(f[startField.id]) : null,
    due: dateOnly(f.duedate),
    progress: null,
    milestone: false,
    links: [...new Set(linked)].map((key) => ({ key })),
    events,
  };
}

const FIELDS = [
  'summary',
  'description',
  'status',
  'assignee',
  'reporter',
  'creator',
  'created',
  'updated',
  'resolutiondate',
  'duedate',
  'labels',
  'issuetype',
  'issuelinks',
  'parent',
];

/** The start date's field, `{id, name}`: `JIRA_START_FIELD` (an ID or a name), else "Start date". */
export async function startField(reader, wanted) {
  const fields = await reader.json('/field');
  const match = (f) =>
    wanted
      ? f.id === wanted || f.name?.toLowerCase() === wanted.toLowerCase()
      : /^start date$/i.test(f.name ?? '');
  const field = fields.find(match);
  return field ? { id: field.id, name: field.name } : null;
}

/** An issue's whole changelog, when its search result held only part of it. */
async function fullChangelog(reader, key) {
  if (!reader.cloud)
    return (
      (
        await reader.json(`/issue/${encodeURIComponent(key)}`, {
          query: { expand: 'changelog', fields: 'none' },
        })
      ).changelog?.histories ?? []
    );
  const histories = [];
  for (let startAt = 0; ;) {
    const page = await reader.json(`/issue/${encodeURIComponent(key)}/changelog`, {
      query: { startAt, maxResults: 100 },
    });
    histories.push(...(page.values ?? []));
    startAt += page.values?.length ?? 0;
    if (page.isLast !== false || !page.values?.length) break;
  }
  return histories;
}

/**
 * A project's issues with their changelogs, those updated since `since` if given. Returns
 * `{board: {id, name, url}, cards}`.
 */
export async function readJira(reader, host, projectKey, { since, start } = {}) {
  const project = await reader.json(`/project/${encodeURIComponent(projectKey)}`);
  const field = await startField(reader, start);
  const day = since ? new Date(since).toISOString().slice(0, 16).replace('T', ' ') : null;
  const jql = `project = "${project.key}"${day ? ` AND updated >= "${day}"` : ''} ORDER BY created ASC`;
  const fields = [...FIELDS, ...(field ? [field.id] : [])].join(',');
  const issues = [];
  if (reader.cloud) {
    for (let token; ;) {
      const page = await reader.json('/search/jql', {
        query: { jql, fields, expand: 'changelog', maxResults: 100, nextPageToken: token },
      });
      issues.push(...(page.issues ?? []));
      token = page.nextPageToken;
      if (!token || page.isLast) break;
    }
  } else {
    for (let startAt = 0; ;) {
      const page = await reader.json('/search', {
        query: { jql, fields, expand: 'changelog', maxResults: 100, startAt },
      });
      issues.push(...(page.issues ?? []));
      startAt += page.issues?.length ?? 0;
      if (!page.issues?.length || startAt >= page.total) break;
    }
  }
  const cards = [];
  for (const issue of issues) {
    const log = issue.changelog ?? {};
    const histories =
      (log.total ?? 0) > (log.histories?.length ?? 0)
        ? await fullChangelog(reader, issue.key)
        : (log.histories ?? []);
    cards.push(jiraCard(host, issue, { histories, startField: field }));
  }
  return {
    board: { id: project.key, name: project.name, url: `https://${host}/browse/${project.key}` },
    cards,
  };
}

/**
 * A webhook delivery (`jira:issue_created`, `jira:issue_updated`, `jira:issue_deleted`) as
 * `{host, project, card, deleted}`, its changelog as the card's events; null for any other.
 */
export function jiraDelivery(payload, { startField: field } = {}) {
  const issue = payload?.issue;
  const event = payload?.webhookEvent;
  if (!issue?.key || !/^jira:issue_(created|updated|deleted)$/.test(event ?? '')) return null;
  let host;
  try {
    host = new URL(issue.self).host.toLowerCase();
  } catch {
    return null;
  }
  const time = new Date(Number(payload.timestamp) || Date.now()).toISOString();
  const card = jiraCard(host, issue, { startField: field });
  card.events =
    event === 'jira:issue_created'
      ? card.events.slice(0, 1)
      : payload.changelog
        ? historyEvents(
            { created: time, author: payload.user, items: payload.changelog.items },
            { startField: field?.name },
          )
        : [];
  return {
    host,
    project: issue.fields?.project?.key ?? issue.key.split('-')[0],
    card,
    deleted: event === 'jira:issue_deleted',
  };
}

/** Checks a delivery's `X-Hub-Signature` (`sha256=<hex HMAC of the body>`) with the secret. */
export function validJiraSignature(secret, body, header) {
  if (!secret || typeof header !== 'string' || !header.startsWith('sha256=')) return false;
  const expected = createHmac('sha256', secret).update(body).digest();
  const given = Buffer.from(header.slice(7), 'hex');
  return given.length === expected.length && timingSafeEqual(given, expected);
}
