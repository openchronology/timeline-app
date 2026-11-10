// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
/**
 * Reading a board or plan by its reference (board-source.mjs parseBoard) with the credentials
 * in the environment, and what it writes to a timeline: shared by `och-import-github --board`
 * and the receiver's polling of Planner (docs/boards.md).
 */
import { BOARD_PLATFORMS, boardReference, cardChanges, parseBoard } from './board-source.mjs';
import { readTrello, trelloReader } from './trello-source.mjs';
import { jiraReader, readJira } from './jira-source.mjs';
import { openprojectReader, readOpenProject } from './openproject-source.mjs';
import { People, plannerReader, readPlanner } from './planner-source.mjs';

/** The reader for a board's platform, from TRELLO_*, JIRA_*, PLANNER_* or OPENPROJECT_*. */
export function boardClient(reference, env = process.env, { fetcher, log } = {}) {
  const b = parseBoard(reference);
  if (!b || b.board === '*') throw new Error(`Not a board: ${reference}`);
  switch (b.platform) {
    case 'trello':
      return trelloReader({ key: env.TRELLO_KEY, token: env.TRELLO_TOKEN, fetcher, log });
    case 'jira':
      return jiraReader(b.host, { email: env.JIRA_EMAIL, token: env.JIRA_TOKEN, fetcher, log });
    case 'openproject':
      return openprojectReader(b.host, { token: env.OPENPROJECT_TOKEN, fetcher, log });
    case 'planner': {
      const reader = plannerReader(
        {
          tenant: env.PLANNER_TENANT,
          clientId: env.PLANNER_CLIENT_ID,
          clientSecret: env.PLANNER_CLIENT_SECRET,
        },
        { fetcher, log },
      );
      reader.people = new People(reader);
      return reader;
    }
  }
}

/**
 * A board's cards: `{reference, source: {platform, name}, cards}`, where `reference` names the
 * board as its entities' IDs do (Trello's board ID, whichever way it was named).
 */
export async function readBoard(reader, reference, { since, done, start } = {}) {
  const b = parseBoard(reference);
  const read =
    b.platform === 'trello'
      ? await readTrello(reader, b.board, { since, done })
      : b.platform === 'jira'
        ? await readJira(reader, b.host, b.board, { since, start })
        : b.platform === 'openproject'
          ? await readOpenProject(reader, b.host, b.board, { since })
          : await readPlanner(reader, b.board, { people: reader.people });
  return {
    reference: boardReference(b.platform, b.host, read.board.id),
    source: { platform: b.platform, name: read.board.name },
    board: read.board,
    cards: read.cards,
  };
}

/** Everything a board's cards write, of `kinds`, merged: `{durations, moments, links}`. */
export function boardChanges({ reference, source, cards }, kinds, options) {
  const out = { durations: [], moments: [], links: [] };
  for (const card of cards) {
    const c = cardChanges(reference, source, card, kinds, options);
    out.durations.push(...c.durations);
    out.moments.push(...c.moments);
    out.links.push(...c.links);
  }
  return out;
}

/** A platform's name for messages: "Trello", "Microsoft Planner". */
export const platformName = (reference) => BOARD_PLATFORMS[parseBoard(reference)?.platform]?.name;
