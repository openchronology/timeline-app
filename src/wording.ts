// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
/**
 * What the editor and the website both call things (#187), kept in one place so they say the
 * same: the editor's sharing dialog and the website's Sharing & settings, pull requests, and
 * saving. Points in time are "moments" wherever people read about them; `events` stays only
 * as the file format's key.
 */
export const VISIBILITY_OPTIONS = [
  ['private', 'Private — you and the collaborators you add'],
  ['public', 'Public — anyone can view it, and signed-in readers can propose changes'],
] as const;
export const ROLE_OPTIONS = [
  ['viewer', 'Viewer — read'],
  ['contributor', 'Contributor — propose changes'],
  ['writer', 'Writer — save changes and merge pull requests'],
] as const;
export const ADD_COLLABORATOR = 'Add or update collaborator';
export const REBASE_PULL_REQUEST = 'Rebase on upstream';
export const SAVE_TO_SERVER = 'Save to server';

/** "1 moment", "2,000 moments". */
export function momentsText(count: number | bigint): string {
  return `${count.toLocaleString()} ${BigInt(count) === 1n ? 'moment' : 'moments'}`;
}

/**
 * What a save, an import or the duration editor says of background image addresses too long
 * for a band to carry (BACKGROUND_URL_LIMIT, #365): `count` durations have one.
 */
export function longBackgroundsText(count: number, limit: number): string {
  const which = count === 1 ? '1 duration has' : `${count.toLocaleString('en')} durations have`;
  return `${which} a background image address longer than ${limit.toLocaleString('en')} characters, which is not shown. Use a shorter address.`;
}

/** A time as stored: exact, or a duration's end anchored to a moment. */
type StoredTime = string | { moment: string };
/** A moment or duration as a pull request's summary of changes gives it. */
interface ChangedEntity {
  id?: string;
  metadata?: { title?: string };
  time?: string;
  start?: StoredTime;
  end?: StoredTime;
}
/**
 * A moment or duration a pull request adds, removes or changes, with its `before` and `after`
 * versions and, from current servers, their times as the timeline displays them (#384).
 */
export interface ChangeExample {
  change: 'added' | 'removed' | 'changed';
  before: ChangedEntity | null;
  after: ChangedEntity | null;
  times?: { before: string | null; after: string | null };
}
/** "x → y" when they differ, else the one there is. */
const changed = (before: string | null, after: string | null) =>
  before !== null && after !== null && before !== after
    ? `${before} → ${after}`
    : (after ?? before);
/** An entity's exact time: a moment's, or a duration's start – end. */
function exactTime(entity: ChangedEntity): string {
  const one = (time: StoredTime | undefined) =>
    typeof time === 'object' ? `moment ${time.moment}` : String(time);
  return entity.time !== undefined ? entity.time : `${one(entity.start)} – ${one(entity.end)}`;
}
/**
 * Its line in a pull request's list of changes, on the website and in the editor: `Added:
 * Coronation · 1953-06-02`, its time as the timeline displays it, and a changed time as
 * old → new. Without display times (older servers), its exact times.
 */
export function changeText(example: ChangeExample, kind: 'moment' | 'duration'): string {
  const { before, after } = example;
  const entity = (after ?? before)!;
  const label = { added: 'Added', removed: 'Removed', changed: 'Changed' }[example.change];
  const title =
    entity.metadata?.title || (kind === 'moment' ? 'Untitled moment' : 'Untitled duration');
  const time = example.times
    ? changed(example.times.before, example.times.after)
    : exactTimeText(example);
  return `${label}${kind === 'duration' ? ' duration' : ''}: ${title} · ${time}`;
}
/** Its exact stored times, old → new when they changed: for a tooltip, to debug with. */
export function exactTimeText(example: ChangeExample): string {
  const { before, after } = example;
  return changed(before && exactTime(before), after && exactTime(after)) ?? '';
}
