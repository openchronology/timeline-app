// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
/**
 * OpenProject as a source (#538): a project's work packages, with their start and finish
 * dates (its Gantt chart), status, assignee, progress and milestones, their activity as
 * board-source.mjs events, their relations (follows, precedes, blocks …) and parents as
 * links, and webhooks' signatures and deliveries (docs/boards.md).
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import { BoardReader } from './board-reader.mjs';

/** A client for an OpenProject site's API v3, with an API key. */
export function openprojectReader(host, { token, fetcher, log } = {}) {
  if (!token) throw new Error('Set OPENPROJECT_TOKEN to read OpenProject.');
  return new BoardReader({
    api: `https://${host}/api/v3`,
    headers: { authorization: 'Basic ' + Buffer.from(`apikey:${token}`).toString('base64') },
    fetcher,
    log,
  });
}

const idOf = (href) => (href ? (/\/(\d+)$/.exec(href)?.[1] ?? null) : null);
const dateOnly = (value) => (value ? String(value).slice(0, 10) : null);

/**
 * The changes one activity's details describe, as OpenProject writes them in English:
 * "Status changed from New to In progress", "Assignee set to Mona Lisa", "Finish date
 * deleted (11/20/2026)". `closed` is the set of closed statuses' names. Others are left out.
 */
export function activityEvents(activity, closed = new Set()) {
  const time = activity.createdAt,
    person = activity._links?.user?.title ?? null,
    events = [];
  const at = (verb, extra = {}) => events.push({ verb, time, person, ...extra });
  for (const detail of activity.details ?? []) {
    const raw = String(detail.raw ?? '').trim();
    const changed = /^(.+?) changed from (.*) to (.*)$/.exec(raw);
    const set = /^(.+?) set to (.*)$/.exec(raw);
    const deleted = /^(.+?) deleted \((.*)\)$/.exec(raw);
    const [field, from, to] = changed
      ? changed.slice(1)
      : set
        ? [set[1], null, set[2]]
        : deleted
          ? [deleted[1], deleted[2], null]
          : [];
    if (!field) continue;
    switch (field.toLowerCase()) {
      case 'status':
        if (to) {
          at('moved', { subject: to, from });
          if (closed.has(to) && !closed.has(from)) at('completed');
          else if (closed.has(from) && !closed.has(to)) at('reopened');
        }
        break;
      case 'assignee':
        if (from) at('unassigned', { subject: from });
        if (to) at('assigned', { subject: to });
        break;
      case 'subject':
        at('renamed', { from: from ?? '' });
        break;
      case 'start date':
        at('rescheduled', { subject: 'start', to: to ?? null });
        break;
      case 'finish date':
      case 'due date':
      case 'date':
        at('rescheduled', { subject: 'due', to: to ?? null });
        break;
      case '% complete':
      case 'progress (%)':
      case '% complete (manual)':
        if (to) at('progress', { subject: `${parseInt(to, 10)}%` });
        break;
    }
  }
  return events;
}

/**
 * A work package as a board-source.mjs card. `wp` is the API's representation (with
 * `_embedded` when a webhook sent it); `closed` the closed statuses' names; `activities` its
 * activity, oldest first; `links` the work packages it depends on or belongs to.
 */
export function openprojectCard(
  host,
  wp,
  { closed = new Set(), activities = [], links = [] } = {},
) {
  const status = wp._embedded?.status?.name ?? wp._links?.status?.title ?? null;
  const isClosed = wp._embedded?.status?.isClosed ?? closed.has(status);
  const milestone = !!wp._embedded?.type?.isMilestone || (wp.date !== undefined && !wp.dueDate);
  // The first activity sets the starting values: its status is where the work package
  // began, and only its assignment is kept as a moment.
  const [first, ...later] = activities;
  const opening = first ? activityEvents(first, closed) : [];
  const events = [
    { verb: 'created', time: wp.createdAt, person: wp._links?.author?.title ?? null },
    ...opening.filter((e) => e.verb === 'assigned'),
    ...later.flatMap((a) => activityEvents(a, closed)),
  ];
  const lastClose = events.filter((e) => e.verb === 'completed').at(-1);
  const parent = idOf(wp._links?.parent?.href);
  const firstMove =
    opening.find((e) => e.verb === 'moved') ?? events.find((e) => e.verb === 'moved');
  const firstColumn = firstMove ? (firstMove.from ?? firstMove.subject) : null;
  return {
    key: String(wp.id),
    reference: `#${wp.id}`,
    number: `#${wp.id}`,
    title: wp.subject ?? '',
    description: wp.description?.raw ?? '',
    url: `https://${host}/work_packages/${wp.id}`,
    kind: (wp._embedded?.type?.name ?? wp._links?.type?.title ?? 'work package').toLowerCase(),
    created: wp.createdAt,
    done: isClosed ? (lastClose?.time ?? wp.updatedAt ?? null) : null,
    column: status,
    firstColumn,
    assignees: wp._links?.assignee?.title ? [wp._links.assignee.title] : [],
    labels: [],
    start: dateOnly(milestone ? wp.date : wp.startDate),
    due: dateOnly(milestone ? wp.date : wp.dueDate),
    progress: typeof wp.percentageDone === 'number' ? wp.percentageDone : null,
    milestone,
    links: [...new Set([...links, ...(parent ? [parent] : [])])].map((key) => ({
      key: String(key),
    })),
    events,
  };
}

/** Every page of a collection: OpenProject pages by number (`offset`). */
async function collection(reader, path, query = {}) {
  const elements = [];
  for (let offset = 1; ; offset++) {
    const page = await reader.json(path, { query: { pageSize: 200, offset, ...query } });
    const got = page._embedded?.elements ?? [];
    elements.push(...got);
    if (!got.length || elements.length >= (page.total ?? 0)) break;
  }
  return elements;
}

/**
 * A project's work packages, open and closed (those updated since `since` if given), each
 * with its activity, and the relations between them. Returns `{board: {id, name, url}, cards}`.
 */
export async function readOpenProject(reader, host, identifier, { since } = {}) {
  const project = await reader.json(`/projects/${encodeURIComponent(identifier)}`);
  const closed = new Set(
    (await collection(reader, '/statuses')).filter((s) => s.isClosed).map((s) => s.name),
  );
  // Every status: without a filter, OpenProject lists open work packages only.
  const filters = [{ status: { operator: '*', values: [] } }];
  const packages = (
    await collection(reader, `/projects/${project.id}/work_packages`, {
      filters: JSON.stringify(filters),
      sortBy: JSON.stringify([['id', 'asc']]),
    })
  ).filter((wp) => !since || Date.parse(wp.updatedAt) >= Date.parse(since));
  const ids = new Set(packages.map((wp) => String(wp.id)));
  // Relations between this project's work packages: each a link on both.
  const related = new Map();
  for (const r of await collection(reader, '/relations')) {
    const a = idOf(r._links?.from?.href),
      b = idOf(r._links?.to?.href);
    if (!a || !b || !ids.has(a) || !ids.has(b)) continue;
    if (!related.has(a)) related.set(a, []);
    related.get(a).push(b);
  }
  // Activities link to their users without naming them: named once each, where the key may
  // read them.
  const names = new Map();
  const named = async (link) => {
    if (!link?.href || link.title) return link?.title ?? null;
    if (!names.has(link.href))
      names.set(
        link.href,
        await reader
          .json(link.href)
          .then((u) => u?.name ?? null)
          .catch(() => null),
      );
    return names.get(link.href);
  };
  const cards = [];
  for (const wp of packages) {
    const activities = (await collection(reader, `/work_packages/${wp.id}/activities`)).sort(
      (x, y) => Date.parse(x.createdAt) - Date.parse(y.createdAt),
    );
    for (const a of activities)
      if (a._links?.user) a._links.user = { ...a._links.user, title: await named(a._links.user) };
    cards.push(
      openprojectCard(host, wp, {
        closed,
        activities,
        links: related.get(String(wp.id)) ?? [],
      }),
    );
  }
  return {
    board: {
      id: project.identifier,
      name: project.name,
      url: `https://${host}/projects/${project.identifier}`,
    },
    cards,
  };
}

/**
 * A webhook delivery (`work_package:created` or `…:updated`) as `{project, card, by}`: the work
 * package as it is now (its changes are found by comparing it with the last one seen); null
 * for any other.
 */
export function openprojectDelivery(host, payload) {
  const wp = payload?.work_package;
  if (!wp?.id || !/^work_package:(created|updated)$/.test(payload.action ?? '')) return null;
  const card = openprojectCard(host, wp);
  if (payload.action === 'work_package:updated') card.events = [];
  return {
    project: wp._embedded?.project?.identifier ?? null,
    card,
    by: payload.actor?.name ?? null,
  };
}

/** Checks a delivery's `X-OP-Signature` (`sha1=<hex HMAC of the body>`) with the secret. */
export function validOpenProjectSignature(secret, body, header) {
  if (!secret || typeof header !== 'string' || !header.startsWith('sha1=')) return false;
  const expected = createHmac('sha1', secret).update(body).digest();
  const given = Buffer.from(header.slice(5), 'hex');
  return given.length === expected.length && timingSafeEqual(given, expected);
}
