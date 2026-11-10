// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
/**
 * Boards and plans as sources of timeline events (#538), without I/O: Trello, Jira, Microsoft
 * Planner and OpenProject (trello-source.mjs, jira-source.mjs, planner-source.mjs,
 * openproject-source.mjs) each read their cards into one shape, and this module turns that
 * shape into durations, moments and links, as github-source.mjs does for issues:
 *
 * - a card is a duration from its creation until it was done, ongoing until then;
 * - its time in each column (list, bucket or status) is a duration of its own;
 * - its start and due dates are a planned duration, so a plan reads as a Gantt chart;
 * - what happened to it (moves, assignments, completion, labels, new dates) are moments;
 * - its dependencies and parent are links.
 *
 * The importer (import-github.mjs) and the receiver (github-receiver.mjs) write the same
 * entities with the same IDs, so either overwrites the other.
 *
 * A card, as each source reads it:
 *   { key, reference, number, title, description, url, kind, created, done, column, assignees,
 *     labels, start, due, progress, milestone, links: [{key, type}], events }
 * `key` is its ID on the board; `reference` what its tag names it by (`PROJ-12`), or null for
 * `key`; `number` how its title shows it (`PROJ-12`, `#12`), or null;
 * `done` when it was completed, or null; `start` and `due` its planned dates (ISO), or null;
 * `firstColumn` the column it was created in, when known; `progress` 0–100 or null; `events` what happened to it, oldest first:
 *   { verb, time, person, subject, from }
 */
import { createHash } from 'node:crypto';
import { clip, seconds, tag } from './github-source.mjs';
import { keeps } from './github-events.mjs';

/** The board platforms, each with its IDs' prefix and the name its tags start with. */
export const BOARD_PLATFORMS = {
  trello: { prefix: 'tr', name: 'Trello' },
  jira: { prefix: 'jr', name: 'Jira' },
  planner: { prefix: 'pl', name: 'Microsoft Planner' },
  openproject: { prefix: 'op', name: 'OpenProject' },
  // Plan files: Microsoft Project's XML (msproject-source.mjs).
  msproject: { prefix: 'mp', name: 'Microsoft Project' },
};
/** The most characters of a card's text a duration keeps as its notes. */
export const NOTES_LIMIT = 4000;
const ID = /^[A-Za-z0-9_.:-]{1,128}$/;
/**
 * A board reference: `trello:<board ID or short link>`, `planner:<plan ID>`,
 * `jira:<host>/<project key>` or `openproject:<host>/<project identifier>`. The last part may
 * be `*` in routing rules: every Jira project or OpenProject project on that host.
 */
const BOARD =
  /^(trello|planner|jira|openproject|msproject):(?:([A-Za-z0-9.-]{1,253}(?::\d{1,5})?)\/)?([A-Za-z0-9_.~-]{1,128}|\*)$/;
/** A board reference's parts, `{platform, host, board}`, or null when it is not one. */
export function parseBoard(reference) {
  const m = typeof reference === 'string' ? BOARD.exec(reference) : null;
  if (!m) return null;
  const [, platform, host, board] = m;
  const hosted = platform === 'jira' || platform === 'openproject';
  if (hosted !== !!host) return null;
  return { platform, host: host?.toLowerCase() ?? null, board };
}
/** A board's reference from its parts. */
export const boardReference = (platform, host, board) =>
  `${platform}:${host ? host.toLowerCase() + '/' : ''}${board}`;

/** A part of an ID from free text: its safe characters, with a hash when anything was lost. */
function slug(text) {
  const plain = String(text ?? '');
  const safe = plain.replace(/[^A-Za-z0-9_.-]+/g, '-').slice(0, 40);
  return safe === plain && safe
    ? safe
    : safe + '-' + createHash('sha256').update(plain).digest('hex').slice(0, 8);
}
/**
 * An entity ID from its source, so redelivered webhooks and repeated imports update rather
 * than duplicate: `<prefix>:[<host>:]<board>:<card>:<rest>`, hashed when too long.
 */
export function boardEntityId(board, ...rest) {
  const b = parseBoard(board);
  const prefix = BOARD_PLATFORMS[b.platform].prefix;
  const parts = rest.map((part) => slug(part));
  const plain = [prefix, ...(b.host ? [b.host.replace(/:/g, '.')] : []), b.board, ...parts].join(
    ':',
  );
  if (ID.test(plain)) return plain;
  const hash = createHash('sha256')
    .update(`${b.host ?? ''}/${b.board}`)
    .digest('hex')
    .slice(0, 16);
  const short = [prefix, hash, ...parts].join(':');
  return ID.test(short)
    ? short
    : [prefix, createHash('sha256').update(plain).digest('hex')].join(':');
}
/** A card's duration ID. */
export const cardId = (board, card) => boardEntityId(board, card.key);
/** A card's tag: `trello/ab12cd34#12`, `jira/proj-12`, `planner/<task ID>`, `openproject/#7`. */
export const cardTag = (platform, card) => tag(`${platform}/${card.reference ?? card.key}`);
/** A person's tag on a board's platform: `trello/mona`, `jira/mona lisa`. */
export const boardPersonTag = (platform, person) => tag(`${platform}/${person}`);

const notesOf = (card) => {
  const text = typeof card.description === 'string' ? card.description : '';
  return (
    (text.length > NOTES_LIMIT ? clip(text, NOTES_LIMIT) + '…' : text) +
    (card.url ? (text ? '\n\n' : '') + card.url : '')
  );
};
/** The tags every entity of a card carries: the platform, the board's and the card's own. */
const ownTags = (platform, boardName, card) => [
  platform,
  ...(boardName ? ['project:' + boardName] : []),
  cardTag(platform, card),
];
const unique = (tags) => [...new Set(tags.map(tag).filter(Boolean))].slice(0, 40);
const titled = (card) =>
  clip(`${card.number ? card.number + ' ' : ''}${card.title ?? ''}`.trim(), 300);
const time = (iso) => seconds(iso);

/**
 * A card's duration: from its creation until it was done, or ongoing. Tagged with the
 * platform, `project:<board>`, its own tag, its kind, `state:open` or `state:done`, its
 * column as `status:<column>`, `assigned` and each person assigned, and its labels.
 */
export function cardDuration(board, { platform, name }, card) {
  const done = card.done && Date.parse(card.done) >= Date.parse(card.created) ? card.done : null;
  const notes = notesOf(card);
  return {
    id: cardId(board, card),
    start: time(card.created),
    end: done ? time(done) : { ongoing: true },
    metadata: {
      title: titled(card),
      ...(notes ? { description: notes } : {}),
      ...(card.url ? { url: card.url } : {}),
      tags: unique([
        ...ownTags(platform, name, card),
        card.kind ?? 'card',
        'state:' + (done ? 'done' : 'open'),
        ...(card.column ? ['status:' + card.column] : []),
        ...(card.assignees?.length ? ['assigned'] : []),
        ...(card.assignees ?? []).map((person) => boardPersonTag(platform, person)),
        ...(card.labels ?? []).map((label) => 'label:' + label),
        ...(card.milestone ? ['milestone'] : []),
      ]),
    },
  };
}

/** A date or date-time as an ISO time: a plain date (`2026-11-20`) is midnight UTC. */
const instant = (value) => {
  if (!value) return null;
  const ms = Date.parse(/^\d{4}-\d{2}-\d{2}$/.test(value) ? value + 'T00:00:00Z' : value);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
};
/** A due date as the end of its day when it is a plain date: work due on the 20th ends then. */
const dueInstant = (value) =>
  /^\d{4}-\d{2}-\d{2}$/.test(value ?? '') ? instant(value + 'T23:59:59Z') : instant(value);

/**
 * A card's plan, as a Gantt chart draws it: a duration from its start date (or, without one,
 * its creation) until its due date, titled `Planned: …` and tagged `planned` with the card's
 * tags and the people assigned. A milestone's single date is a `milestone` moment instead.
 * Nothing without a due date, or with one before the start.
 */
export function plannedEntities(board, { platform, name }, card) {
  const people = (card.assignees ?? []).map((person) => boardPersonTag(platform, person));
  if (card.milestone) {
    const at = dueInstant(card.due ?? card.start);
    if (!at) return { durations: [], moments: [] };
    return {
      durations: [],
      moments: [
        {
          id: boardEntityId(board, card.key, 'milestone'),
          time: time(at),
          metadata: {
            title: clip(`Milestone: ${titled(card)}`, 300),
            ...(card.url ? { url: card.url } : {}),
            tags: unique([...ownTags(platform, name, card), 'milestone', 'planned', ...people]),
          },
        },
      ],
    };
  }
  const due = dueInstant(card.due);
  const start = instant(card.start) ?? instant(card.created);
  if (!due || !start || Date.parse(due) < Date.parse(start)) return { durations: [], moments: [] };
  return {
    durations: [
      {
        id: boardEntityId(board, card.key, 'planned'),
        start: time(start),
        end: time(due),
        metadata: {
          title: clip(`Planned: ${titled(card)}`, 300),
          ...(card.url ? { url: card.url } : {}),
          tags: unique([
            ...ownTags(platform, name, card),
            'planned',
            ...(card.progress !== null && card.progress !== undefined
              ? [`progress:${Math.round(card.progress)}%`]
              : []),
            ...(card.assignees?.length ? ['assigned'] : []),
            ...people,
          ]),
        },
      },
    ],
    moments: [],
  };
}

/** What each verb's moment is titled with, before the card. */
const WHAT = {
  created: () => 'Created',
  moved: (e) => `Moved to ${e.subject}`,
  assigned: (e) => `Assigned ${e.subject}`,
  unassigned: (e) => `Unassigned ${e.subject}`,
  completed: () => 'Completed',
  reopened: () => 'Reopened',
  archived: () => 'Archived',
  labeled: (e) => `Labelled ${e.subject}`,
  unlabeled: (e) => `Unlabelled ${e.subject}`,
  renamed: (e) => `Renamed from "${e.from ?? ''}"`,
  rescheduled: (e) =>
    `${e.subject === 'start' ? 'Start' : 'Due'} ${e.to ? 'set to ' + e.to : 'removed'}`,
  progress: (e) => `${e.subject} done`,
};
/** The verbs the event kinds (github-events.mjs EVENT_KINDS) switch, for boards. */
const KIND_VERB = {
  created: 'item',
  archived: 'item',
  completed: 'completed',
};

/**
 * One moment on a card: `verb` at `time`, by or about `person`. Tagged with the card's own
 * tags, the verb, `status:<column>` for a move, `label:<name>` for a label, and the person:
 * the one assigned for an assignment, otherwise whoever did it.
 */
export function cardMoment(board, { platform, name }, card, event) {
  const what = (WHAT[event.verb] ?? (() => event.verb))(event);
  const subjectTags =
    event.verb === 'moved'
      ? ['status:' + event.subject]
      : event.verb === 'labeled' || event.verb === 'unlabeled'
        ? ['label:' + event.subject]
        : event.verb === 'progress'
          ? ['progress:' + event.subject]
          : [];
  const person =
    event.verb === 'assigned' || event.verb === 'unassigned' ? event.subject : event.person;
  return {
    id: boardEntityId(
      board,
      card.key,
      event.verb,
      ...(event.subject ? [event.subject] : []),
      time(event.time),
    ),
    time: time(event.time),
    metadata: {
      title: clip(`${what}: ${titled(card)}`, 300),
      ...(card.url ? { url: card.url } : {}),
      tags: unique([
        ...ownTags(platform, name, card),
        event.verb,
        ...subjectTags,
        ...(person ? [boardPersonTag(platform, person)] : []),
      ]),
    },
  };
}

/**
 * The time a card spent in one column, as a duration: from when it got there until it moved
 * on (`end`), or ongoing. Titled `PROJ-12 in Review`, tagged `in column` and
 * `status:<column>`: separated by `status:` tags, the board's columns become rows.
 */
export function cardStint(board, { platform, name }, card, { column, start, end }) {
  return {
    id: boardEntityId(board, card.key, 'in', column, time(start)),
    start: time(start),
    end: end ? time(end) : { ongoing: true },
    metadata: {
      title: clip(`${card.number ?? card.title ?? card.key} in ${column}`, 300),
      ...(card.url ? { url: card.url } : {}),
      tags: unique([...ownTags(platform, name, card), 'in column', 'status:' + column]),
    },
  };
}
/**
 * A card's column stints from its history: from its first column (where it was created)
 * through each move; the last ends when the card was done, or is ongoing. Stays of no length
 * (a card created straight into its done column) are left out.
 */
export function cardStints(board, source, card) {
  const moves = (card.events ?? []).filter((e) => e.verb === 'moved' && e.subject);
  const first = card.firstColumn ?? moves[0]?.from ?? card.column;
  const stays = [];
  if (first) stays.push({ column: first, start: card.created });
  for (const move of moves) stays.push({ column: move.subject, start: move.time });
  const done = card.done ?? null;
  return stays
    .map((stay, i) => ({ ...stay, end: stays[i + 1]?.start ?? done }))
    .filter((s) => !s.end || Date.parse(s.end) > Date.parse(s.start))
    .map((s) => cardStint(board, source, card, s));
}

/** A link between two cards on the board (a dependency, a parent), as a relationship change. */
export const cardLink = (board, a, b) => ({
  a: { duration: boardEntityId(board, a) },
  b: { duration: boardEntityId(board, b) },
  related: true,
});

/**
 * Everything one card writes, of the kinds chosen: its duration, its planned duration or
 * milestone, its column stints, its moments and its links.
 * @param {string} board the board's reference
 * @param {{platform: string, name: string}} source the platform and the board's name
 * @param {Set<string>} kinds github-events.mjs's kinds
 * @param {{stints?: boolean}} options `stints: false` leaves column stints out (the receiver
 *   keeps those from its own memory, BoardTracker)
 */
export function cardChanges(board, source, card, kinds, { stints = true } = {}) {
  const items = keeps(kinds, 'item');
  const plan = keeps(kinds, 'planned')
    ? plannedEntities(board, source, card)
    : { durations: [], moments: [] };
  const moments = (card.events ?? [])
    .filter((e) => WHAT[e.verb] && keeps(kinds, KIND_VERB[e.verb] ?? e.verb))
    .map((e) => cardMoment(board, source, card, e));
  return {
    durations: [
      // A plan's task not yet begun has no duration of its own, only its plan.
      ...(items && card.created ? [cardDuration(board, source, card)] : []),
      ...plan.durations,
      ...(stints && keeps(kinds, 'in column') ? cardStints(board, source, card) : []),
    ],
    moments: [...plan.moments, ...moments],
    links:
      items && keeps(kinds, 'linked')
        ? (card.links ?? [])
            .filter((l) => l.key !== card.key)
            .map((l) => cardLink(board, card.key, l.key))
        : [],
  };
}

/**
 * What changed between two readings of a card (`before` may be null: first seen), as events
 * at `at` by `person`: moves, assignments, labels, completion, renames, new dates and
 * progress. For the sources that send a card's state rather than what happened to it
 * (Planner, read periodically; OpenProject's webhooks).
 */
export function cardDiff(before, after, at, person = null) {
  if (!before) return [];
  const events = [];
  const add = (verb, extra = {}) => events.push({ verb, time: at, person, ...extra });
  if (after.column && before.column !== after.column)
    add('moved', { subject: after.column, from: before.column });
  const was = new Set(before.assignees ?? []),
    now = new Set(after.assignees ?? []);
  for (const p of now) if (!was.has(p)) add('assigned', { subject: p });
  for (const p of was) if (!now.has(p)) add('unassigned', { subject: p });
  const hadLabels = new Set(before.labels ?? []),
    hasLabels = new Set(after.labels ?? []);
  for (const l of hasLabels) if (!hadLabels.has(l)) add('labeled', { subject: l });
  for (const l of hadLabels) if (!hasLabels.has(l)) add('unlabeled', { subject: l });
  if (!before.done && after.done)
    events.push({ verb: 'completed', time: after.done, person: after.doneBy ?? person });
  if (before.done && !after.done) add('reopened');
  if (before.title !== undefined && before.title !== after.title)
    add('renamed', { from: before.title });
  for (const field of ['start', 'due'])
    if ((before[field] ?? null) !== (after[field] ?? null))
      add('rescheduled', { subject: field, to: after[field] ? after[field].slice(0, 10) : null });
  if (
    after.progress !== null &&
    after.progress !== undefined &&
    before.progress !== after.progress &&
    !after.done
  )
    add('progress', { subject: `${Math.round(after.progress)}%` });
  return events;
}

/** What a card's reading keeps for the next comparison (cardDiff) and its column's stint. */
const snapshot = (card) => ({
  title: card.title,
  column: card.column ?? null,
  assignees: card.assignees ?? [],
  labels: card.labels ?? [],
  done: card.done ?? null,
  start: card.start ?? null,
  due: card.due ?? null,
  progress: card.progress ?? null,
});

/**
 * The receiver's memory of each card: its last reading and the column it is in since when, so
 * a move ends the stint before it, and sources that send state can be compared. Kept in
 * `file` (JSON) when given, across restarts.
 */
export class BoardTracker {
  constructor(file, { read, write } = {}) {
    this.file = file;
    this.write = write;
    this.cards = new Map(file && read ? Object.entries(read(file) ?? {}) : []);
  }
  save() {
    if (this.file && this.write) this.write(this.file, Object.fromEntries(this.cards));
  }
  /** The last reading of a card, or null. */
  get(board, key) {
    return this.cards.get(`${board}|${key}`)?.card ?? null;
  }
  /**
   * A new reading of a card at `at`: the stints it ends and opens (with the card done, the
   * open one ends then), and remembers it. The first reading opens a stint from `at`, or from
   * the card's creation when it was created then.
   */
  observe(board, source, card, at) {
    const id = `${board}|${card.key}`;
    const before = this.cards.get(id);
    const durations = [];
    let since = before?.since ?? null,
      column = before?.card.column ?? null;
    const end = card.done ?? null;
    if (card.column !== column) {
      if (column && since && !before?.card.done && Date.parse(at) > Date.parse(since))
        durations.push(cardStint(board, source, card, { column, start: since, end: at }));
      column = card.column ?? null;
      since = before ? at : card.created;
      // A card first seen already done: where it spent its time is unknown.
      if (column && (before || !end) && !(end && Date.parse(end) <= Date.parse(since)))
        durations.push(cardStint(board, source, card, { column, start: since, end }));
    } else if (end && !before?.card.done && column && since && Date.parse(end) > Date.parse(since))
      durations.push(cardStint(board, source, card, { column, start: since, end }));
    else if (!end && before?.card.done && column)
      // Reopened where it was: a new stay from now.
      durations.push(cardStint(board, source, card, { column, start: (since = at) }));
    this.cards.set(id, { since, card: snapshot(card) });
    this.save();
    return durations;
  }
  /** Whether a reading of a card says what the last one did. */
  same(board, card) {
    const before = this.cards.get(`${board}|${card.key}`)?.card;
    return !!before && JSON.stringify(before) === JSON.stringify(snapshot(card));
  }
  /** The keys of the cards remembered on a board. */
  keys(board) {
    const prefix = `${board}|`;
    return [...this.cards.keys()]
      .filter((k) => k.startsWith(prefix))
      .map((k) => k.slice(prefix.length));
  }
  /** A card deleted at its source: forgotten. */
  forget(board, key) {
    if (this.cards.delete(`${board}|${key}`)) this.save();
  }
}

/** The IDs of everything a card wrote, as far as can be known without it, for a deletion. */
export const cardRemoval = (board, card) => ({
  removed: [cardId(board, card), boardEntityId(board, card.key, 'planned')],
  removedMoments: [boardEntityId(board, card.key, 'milestone')],
});
