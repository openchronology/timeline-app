// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
/**
 * GitHub Projects' dates as plans (#538): a project's Roadmap layout draws each item from its
 * start date field to its target date field, and so does the timeline, as a planned duration
 * per project (github-source.mjs itemPlan). Read through GraphQL, which needs a token: by the
 * importer for a repository's items, and by the receiver when a `projects_v2_item` delivery
 * says a date field changed (docs/github.md).
 */
import { USER_AGENT, itemPlan, planId, repositoryName } from './github-source.mjs';
import { eventMoment } from './github-events.mjs';

/** Which date fields are a plan's start, and which its end: by their names. */
export const START_FIELD = /\bstart/i;
export const END_FIELD = /\b(target|end|due|finish|deadline)/i;

/** GraphQL's address for a REST API's: github.com's, or GitHub Enterprise's `/api/graphql`. */
export const graphqlUrl = (api = 'https://api.github.com') => {
  const base = api.replace(/\/+$/, '');
  return /\/api\/v3$/.test(base) ? base.replace(/\/v3$/, '/graphql') : base + '/graphql';
};

const DATES =
  'fieldValues(first: 30) { nodes { ... on ProjectV2ItemFieldDateValue { date field { ... on ProjectV2FieldCommon { name } } } } }';
const CONTENT =
  'number title url createdAt assignees(first: 20) { nodes { login } } repository { nameWithOwner }';

/**
 * A project item's dates, `{start, due}`, from its date fields' values: the first field named
 * like a start, and the first named like a target, end or due date.
 */
export function projectDates(values) {
  let start = null,
    due = null;
  for (const v of values ?? []) {
    const name = v?.field?.name ?? '';
    if (!v?.date) continue;
    if (!start && START_FIELD.test(name)) start = v.date;
    else if (!due && END_FIELD.test(name)) due = v.date;
  }
  return { start, due };
}

/** An item from GraphQL, as github-source.mjs reads items. */
const asItem = (content) => ({
  number: content.number,
  title: content.title,
  html_url: content.url,
  created_at: content.createdAt,
  assignees: (content.assignees?.nodes ?? []).map((a) => ({ login: a.login })),
});

/** A GraphQL query with a token; its `data`, or a thrown error with its status. */
async function graphql(token, fetcher, api, query, variables) {
  const response = await fetcher(graphqlUrl(api), {
    method: 'POST',
    redirect: 'error',
    signal: AbortSignal.timeout(30000),
    headers: {
      Authorization: 'Bearer ' + token,
      'Content-Type': 'application/json',
      'User-Agent': USER_AGENT,
    },
    body: JSON.stringify({ query, variables }),
  });
  const body = await response.json().catch(() => null);
  if (response.status !== 200 || !body?.data)
    throw Object.assign(
      new Error(`GraphQL: ${response.status} ${body?.errors?.[0]?.message ?? ''}`.trim()),
      { status: response.status },
    );
  return body.data;
}

/**
 * The plans of a repository's issues and pull requests on its projects' roadmaps: one planned
 * duration per item and project with a target date. Needs `reader.token`; costs one request
 * per 50 issues and per 50 pull requests.
 */
export async function readProjectPlans(reader, repository, path = repository) {
  const [owner, name] = path.split('/');
  const plans = [];
  for (const kind of ['issues', 'pullRequests'])
    for (let cursor = null; ;) {
      reader.requests = (reader.requests ?? 0) + 1;
      const data = await graphql(
        reader.token,
        reader.fetcher,
        reader.api,
        `query($owner: String!, $name: String!, $cursor: String) { repository(owner: $owner, name: $name) { list: ${kind}(first: 50, after: $cursor) { pageInfo { hasNextPage endCursor } nodes { ${CONTENT} projectItems(first: 10) { nodes { project { title } ${DATES} } } } } } }`,
        { owner, name, cursor },
      );
      const list = data.repository?.list;
      for (const node of list?.nodes ?? [])
        for (const entry of node.projectItems?.nodes ?? []) {
          const { start, due } = projectDates(entry.fieldValues?.nodes);
          const plan = itemPlan(repository, asItem(node), {
            start,
            due,
            project: entry.project?.title,
          });
          if (plan && due) plans.push(plan);
        }
      if (!list?.pageInfo?.hasNextPage) break;
      cursor = list.pageInfo.endCursor;
    }
  return plans;
}

/**
 * A `projects_v2_item` delivery whose date field changed: the item's plan on that project,
 * rewritten (or removed when it has no target date), and a `rescheduled` moment. Null for any
 * other delivery, or without a token.
 */
export async function projectDateChange(payload, token, fetcher = fetch, api) {
  const change = payload?.changes?.field_value;
  const item = payload?.projects_v2_item;
  if (payload?.action !== 'edited' || !change || !item || !token) return null;
  if (String(change.field_type ?? '').toLowerCase() !== 'date') return null;
  if (item.content_type !== 'Issue' && item.content_type !== 'PullRequest') return null;
  const data = await graphql(
    token,
    fetcher,
    api,
    `query($id: ID!) { node(id: $id) { ... on ProjectV2Item { project { title } ${DATES} content { ... on Issue { ${CONTENT} } ... on PullRequest { ${CONTENT} } } } } }`,
    { id: item.node_id },
  );
  const node = data?.node,
    content = node?.content,
    repository = content?.repository?.nameWithOwner;
  if (!content?.number || !repositoryName(repository)) return null;
  const project = node.project?.title;
  const { start, due } = projectDates(node.fieldValues?.nodes);
  const it = asItem(content);
  const plan = due ? itemPlan(repository, it, { start, due, project }) : null;
  const time = item.updated_at ?? new Date().toISOString();
  const field = change.field_name ?? 'Date';
  const to = change.to ? String(change.to).slice(0, 10) : null;
  const moment = eventMoment(repository, it, {
    verb: 'rescheduled',
    subject: `${project ?? ''}:${field}`,
    time,
    person: payload.sender?.login,
    tags: [...(project ? ['project:' + project] : [])],
    what: `${field} ${to ? 'set to ' + to : 'removed'}${project ? ' in ' + project : ''}`,
  });
  return {
    repository,
    durations: plan ? [plan] : [],
    removed: plan ? [] : [planId(repository, it, project)],
    moments: [moment],
    links: [],
  };
}
