// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
/**
 * Microsoft Planner as a source (#538), through Microsoft Graph with an app's own credentials:
 * a plan's tasks as board-source.mjs cards, in their buckets, with their assignments (each
 * dated), start and due dates, progress and completion. Planner keeps no history and sends no
 * webhooks, so moves between buckets and other changes are found by reading the plan again
 * and comparing (board-source.mjs cardDiff); the receiver does that every few minutes
 * (docs/boards.md).
 */
import { BoardReader } from './board-reader.mjs';

export const GRAPH_API = 'https://graph.microsoft.com/v1.0';

/** An app-only access token (client credentials) for Microsoft Graph, and when it expires. */
export async function graphToken({ tenant, clientId, clientSecret, fetcher = fetch }) {
  if (!tenant || !clientId || !clientSecret)
    throw new Error(
      'Set PLANNER_TENANT, PLANNER_CLIENT_ID and PLANNER_CLIENT_SECRET to read Planner.',
    );
  const response = await fetcher(
    `https://login.microsoftonline.com/${encodeURIComponent(tenant)}/oauth2/v2.0/token`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        scope: 'https://graph.microsoft.com/.default',
        grant_type: 'client_credentials',
      }),
    },
  );
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body.access_token)
    throw Object.assign(
      new Error(
        `Microsoft sign-in failed: ${body.error_description ?? body.error ?? response.status}`,
      ),
      { status: response.status },
    );
  return {
    token: body.access_token,
    expires: Date.now() + (Number(body.expires_in) || 3600) * 1000,
  };
}

/** A Graph client whose token is renewed a few minutes before it expires. */
export function plannerReader(credentials, { fetcher = fetch, log, api = GRAPH_API } = {}) {
  const reader = new BoardReader({ api, fetcher, log });
  let current = null;
  const json = reader.json.bind(reader);
  reader.json = async (path, options) => {
    if (!current || current.expires - Date.now() < 5 * 60 * 1000) {
      current = await graphToken({ ...credentials, fetcher });
      reader.headers = { authorization: `Bearer ${current.token}` };
    }
    return json(path, options);
  };
  reader.tenant = credentials.tenant;
  return reader;
}

/** Every page of a Graph collection (`@odata.nextLink`). */
async function pages(reader, path, query) {
  const values = [];
  for (let next = path, q = query; next; q = undefined) {
    const page = await reader.json(next, { query: q });
    values.push(...(page.value ?? []));
    next = page['@odata.nextLink'] ?? null;
  }
  return values;
}

/** People's display names by ID, read once each; their ID when the app may not read them. */
export class People {
  constructor(reader) {
    this.reader = reader;
    this.names = new Map();
  }
  async name(id) {
    if (!id) return null;
    if (!this.names.has(id))
      this.names.set(
        id,
        await this.reader
          .json(`/users/${encodeURIComponent(id)}`, { query: { $select: 'displayName' } })
          .then((u) => u?.displayName || id)
          .catch(() => id),
      );
    return this.names.get(id);
  }
}

/**
 * A Planner task as a board-source.mjs card: its bucket is its column, its categories (named
 * in the plan's details) its labels; created, assigned and completed are dated by Planner.
 */
export async function plannerCard(task, { buckets, categories, people, tenant }) {
  const assignments = Object.entries(task.assignments ?? {}).filter(([, a]) => a);
  const assignees = [];
  const events = [
    {
      verb: 'created',
      time: task.createdDateTime,
      person: await people.name(task.createdBy?.user?.id),
    },
  ];
  for (const [user, a] of assignments) {
    const who = await people.name(user);
    assignees.push(who);
    if (a.assignedDateTime)
      events.push({
        verb: 'assigned',
        time: a.assignedDateTime,
        person: await people.name(a.assignedBy?.user?.id),
        subject: who,
      });
  }
  const doneBy = await people.name(task.completedBy?.user?.id);
  if (task.completedDateTime)
    events.push({ verb: 'completed', time: task.completedDateTime, person: doneBy });
  events.sort((a, b) => Date.parse(a.time) - Date.parse(b.time));
  return {
    key: task.id,
    reference: null,
    number: null,
    title: task.title ?? '',
    description: '',
    url: tenant ? `https://tasks.office.com/${tenant}/Home/Task/${task.id}` : null,
    kind: 'task',
    created: task.createdDateTime,
    done: task.completedDateTime ?? null,
    doneBy,
    column: buckets.get(task.bucketId) ?? null,
    firstColumn: null,
    assignees: [...new Set(assignees)],
    labels: Object.entries(task.appliedCategories ?? {})
      .filter(([, on]) => on)
      .map(([c]) => categories[c] || c),
    start: task.startDateTime ?? null,
    due: task.dueDateTime ?? null,
    progress: typeof task.percentComplete === 'number' ? task.percentComplete : null,
    milestone: false,
    links: [],
    events,
  };
}

/** A plan and its tasks now. Returns `{board: {id, name, url}, cards}`. */
export async function readPlanner(reader, planId, { people = new People(reader) } = {}) {
  const id = encodeURIComponent(planId);
  const plan = await reader.json(`/planner/plans/${id}`, { query: { $select: 'id,title' } });
  const buckets = new Map(
    (await pages(reader, `/planner/plans/${id}/buckets`)).map((b) => [b.id, b.name]),
  );
  const details = await reader.json(`/planner/plans/${id}/details`).catch(() => ({}));
  const categories = details?.categoryDescriptions ?? {};
  const tasks = await pages(reader, `/planner/plans/${id}/tasks`);
  const cards = [];
  for (const task of tasks)
    cards.push(await plannerCard(task, { buckets, categories, people, tenant: reader.tenant }));
  return { board: { id: plan.id, name: plan.title, url: null }, cards };
}
