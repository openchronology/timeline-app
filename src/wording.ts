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
