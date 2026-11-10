// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
/**
 * Trello as a source (#538): a board's cards, read with their history of actions (created,
 * moved between lists, members added and removed, labels, due dates, completion, archiving)
 * into board-source.mjs's cards, and its webhooks' signatures and actions (docs/boards.md).
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import { BoardReader } from './board-reader.mjs';

export const TRELLO_API = 'https://api.trello.com/1';
/** A list whose name says its cards are finished: they are done when they get there. */
export const DONE_LIST = /\b(done|complete|completed|finished|closed|shipped|released)\b/i;
/** The actions that change a card, as Trello names them. */
export const CARD_ACTIONS = [
  'createCard',
  'copyCard',
  'convertToCardFromCheckItem',
  'moveCardToBoard',
  'updateCard',
  'addMemberToCard',
  'removeMemberFromCard',
  'addLabelToCard',
  'removeLabelFromCard',
  'deleteCard',
];
const CARD_FIELDS =
  'name,desc,idShort,shortUrl,idList,closed,due,start,dueComplete,dateLastActivity,idMembers,labels';

/** A client for Trello's API with a key and token, sent in the Authorization header. */
export function trelloReader({ key, token, api = TRELLO_API, fetcher, log } = {}) {
  if (!key || !token) throw new Error('Set TRELLO_KEY and TRELLO_TOKEN to read Trello boards.');
  return new BoardReader({
    api,
    headers: { authorization: `OAuth oauth_consumer_key="${key}", oauth_token="${token}"` },
    fetcher,
    log,
  });
}

/** When a Trello object was created: the first four bytes of its ID are a Unix time. */
export const createdAt = (id) =>
  new Date(parseInt(String(id).slice(0, 8), 16) * 1000).toISOString();
/** A label's name, or its colour when it has none. */
const labelName = (label) => label?.name || label?.color || null;
/** Whom an action names: a member's username, else their full name. */
const who = (member) => member?.username || member?.fullName || null;

/** Whether a list counts as done: named in `done`, or by its name (DONE_LIST). */
export const doneList = (name, done) =>
  !!name &&
  (done?.length ? done.some((d) => d.toLowerCase() === name.toLowerCase()) : DONE_LIST.test(name));

/**
 * What one action did to its card, as board-source.mjs events; empty for what is not kept
 * (descriptions, positions, comments).
 */
export function actionEvents(action) {
  const d = action.data ?? {},
    time = action.date,
    person = who(action.memberCreator);
  const at = (verb, extra = {}) => ({ verb, time, person, ...extra });
  switch (action.type) {
    case 'createCard':
    case 'copyCard':
    case 'convertToCardFromCheckItem':
    case 'moveCardToBoard':
      return [at('created', { list: d.list?.name ?? null })];
    case 'addMemberToCard':
      return [at('assigned', { subject: who(action.member) ?? d.idMember })];
    case 'removeMemberFromCard':
      return [at('unassigned', { subject: who(action.member) ?? d.idMember })];
    case 'addLabelToCard':
      return labelName(d.label) ? [at('labeled', { subject: labelName(d.label) })] : [];
    case 'removeLabelFromCard':
      return labelName(d.label) ? [at('unlabeled', { subject: labelName(d.label) })] : [];
    case 'updateCard': {
      const old = d.old ?? {},
        card = d.card ?? {},
        events = [];
      if ('idList' in old && d.listAfter?.name)
        events.push(at('moved', { subject: d.listAfter.name, from: d.listBefore?.name ?? null }));
      if ('closed' in old) events.push(at(card.closed ? 'archived' : 'reopened'));
      if ('dueComplete' in old) events.push(at(card.dueComplete ? 'completed' : 'reopened'));
      if ('name' in old && old.name !== card.name) events.push(at('renamed', { from: old.name }));
      for (const field of ['start', 'due'])
        if (field in old && old[field] !== card[field])
          events.push(
            at('rescheduled', {
              subject: field,
              to: card[field] ? card[field].slice(0, 10) : null,
            }),
          );
      return events;
    }
    default:
      return [];
  }
}

/**
 * When a card was done, from its history: when it was last archived, marked complete or moved
 * to a done list, if it is still so; or, without that history, its last activity.
 */
function doneTime(raw, events, column, done) {
  const finished = raw.closed || raw.dueComplete || doneList(column, done);
  if (!finished) return null;
  let at = null;
  for (const e of events)
    if (
      e.verb === 'archived' ||
      e.verb === 'completed' ||
      (e.verb === 'moved' && doneList(e.subject, done))
    )
      at = e.time;
    else if (e.verb === 'reopened' || (e.verb === 'moved' && !doneList(e.subject, done))) at = null;
  return at ?? raw.dateLastActivity ?? createdAt(raw.id);
}

/**
 * A Trello card as a board-source.mjs card: `raw` from the API (with `members`), the board's
 * `{shortLink}`, its lists by ID, its actions (oldest first) and the lists that count as done.
 */
export function trelloCard(raw, { board, lists, actions = [], done }) {
  const events = actions.flatMap(actionEvents);
  const created = events.find((e) => e.verb === 'created');
  const column = lists.get(raw.idList) ?? null;
  const members = new Map((raw.members ?? []).map((m) => [m.id, who(m)]));
  return {
    key: raw.id,
    reference: `${board.shortLink}#${raw.idShort}`,
    number: null,
    title: raw.name ?? '',
    description: raw.desc ?? '',
    url: raw.shortUrl ?? raw.url ?? null,
    kind: 'card',
    created: created?.time ?? createdAt(raw.id),
    done: doneTime(raw, events, column, done),
    column,
    // The list it was created in, where its first stay began.
    firstColumn: created?.list ?? null,
    assignees: (raw.idMembers ?? []).map((id) => members.get(id) ?? id),
    labels: (raw.labels ?? []).map(labelName).filter(Boolean),
    start: raw.start ?? null,
    due: raw.due ?? null,
    progress: null,
    milestone: false,
    links: [],
    events: events.map(({ list: _, ...e }) => e),
  };
}

/**
 * A board and its cards with their history: `since` (ISO) keeps the cards active since then.
 * Returns `{board: {id, shortLink, name, url}, cards}`.
 */
export async function readTrello(reader, boardId, { since, done } = {}) {
  const board = await reader.json(`/boards/${encodeURIComponent(boardId)}`, {
    query: { fields: 'name,url,shortLink' },
  });
  const lists = new Map(
    (
      await reader.json(`/boards/${board.id}/lists`, { query: { filter: 'all', fields: 'name' } })
    ).map((l) => [l.id, l.name]),
  );
  const cards = await reader.json(`/boards/${board.id}/cards/all`, {
    query: { fields: CARD_FIELDS, members: 'true', member_fields: 'username,fullName' },
  });
  // The board's card actions, newest first a thousand at a time, back to `since`.
  const actions = new Map();
  let before;
  for (;;) {
    const page = await reader.json(`/boards/${board.id}/actions`, {
      query: { filter: CARD_ACTIONS.join(','), limit: 1000, before, since },
    });
    for (const action of page) {
      const id = action.data?.card?.id;
      if (!id) continue;
      if (!actions.has(id)) actions.set(id, []);
      actions.get(id).push(action);
    }
    if (page.length < 1000) break;
    before = page[page.length - 1].id;
  }
  const kept = cards.filter(
    (c) => !since || actions.has(c.id) || Date.parse(c.dateLastActivity) >= Date.parse(since),
  );
  return {
    board,
    cards: kept.map((raw) =>
      trelloCard(raw, {
        board,
        lists,
        actions: (actions.get(raw.id) ?? []).slice().reverse(),
        done,
      }),
    ),
  };
}

/** One card now, with its lists, for a webhook's action (whose card data is partial). */
export async function readTrelloCard(reader, cardId) {
  return reader.json(`/cards/${encodeURIComponent(cardId)}`, {
    query: {
      fields: CARD_FIELDS,
      members: 'true',
      member_fields: 'username,fullName',
      list: 'true',
    },
  });
}

/**
 * Checks a webhook delivery's `X-Trello-Webhook`: the base64 HMAC-SHA1, keyed with the app's
 * secret, of the body followed by the callback URL exactly as the webhook was created with.
 */
export function validTrelloSignature(secret, callbackUrl, body, header) {
  if (typeof header !== 'string' || !secret || !callbackUrl) return false;
  const expected = createHmac('sha1', secret)
    .update(Buffer.concat([Buffer.from(body), Buffer.from(callbackUrl, 'utf8')]))
    .digest();
  const given = Buffer.from(header, 'base64');
  return given.length === expected.length && timingSafeEqual(given, expected);
}
