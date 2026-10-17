// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
/**
 * Shifting and scaling a server timeline's times for good (#96; src/time-map.ts): every
 * moment and duration, or those a separation filter selects. It is one save, so one revision
 * the timeline's history can go back before: applied in place a slice at a time
 * (saveIncrementally), telling `progress` how far it has got. Saves by others meanwhile wait
 * for it to finish.
 */
import { mappedEntities, parseTime } from '../dist/core.mjs';
import { HttpError } from './store.mjs';
import { settings } from './retention.mjs';

/**
 * Maps timeline `t` (as store.access returned it) at `revision` with `mapping` (core's
 * timeMapping), to what `filter` selects or everything when it is null. Returns how many
 * moments and durations moved, and the timeline as saved.
 *
 * Refused for a comparison (409), a reader without write access (403) and a stale `revision`
 * (409). Only the entities whose times change are sent, as one save by `userId` with the
 * timeline's settings unchanged; store.save calls `progress` as the save goes.
 * @returns {Promise<{moved: {moments: number, durations: number}, timeline: object}>}
 */
export async function mapTimes(store, t, userId, { revision, mapping, filter }, progress) {
  if (t.comparison) throw new HttpError(409, 'Shift the timelines this compares instead.');
  if (!t.canWrite) throw new HttpError(403, 'Only writers can change times.');
  if (t.revision !== revision)
    throw new HttpError(409, 'Someone changed this timeline. Reload it, then try again.');
  // Read as it is now (the whole document, read in a transaction so its parts agree); the
  // save below is refused if anyone saves in between, since it sends the same revision.
  const document = await store.transaction((c) => store.branchDocument(c, t));
  const { events, durations } = mappedEntities(document, mapping, filter, parseTime);
  const moved = { moments: events.length, durations: durations.length };
  if (events.length || durations.length)
    await store.save(
      t.id,
      userId,
      revision,
      null,
      {
        settings: settings(t),
        changes: events.map((event) => ({ id: event.id, event })),
        durationChanges: durations.map((duration) => ({ id: duration.id, duration })),
        relationshipChanges: [],
      },
      { progress },
    );
  return { moved, timeline: await store.metadata(t.id, userId) };
}
