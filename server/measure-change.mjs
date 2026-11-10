// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
/**
 * Changing a server timeline's measures (#572; src/measures.ts) when values change with them:
 * renaming a measure moves its values, removing one drops them, and narrowing one to whole
 * numbers is refused while any value is a fraction. One save, like mapTimes (time-map.mjs):
 * the new declarations and every entity whose values change, applied in place a slice at a
 * time, telling `progress` how far it has got.
 */
import { remeasuredEntities, validateMeasureRenames, validateMeasures } from '../dist/core.mjs';
import { HttpError } from './store.mjs';
import { settings } from './retention.mjs';

/**
 * Sets timeline `t`'s (as store.access returned it) measures to `measures` at `revision`,
 * with `renames` (old name to new), by `userId`. Returns how many moments and durations
 * changed, and the timeline as saved.
 *
 * Refused for a comparison (409), a reader without write access (403), a stale `revision`
 * (409), invalid declarations or renames (400), and a fraction under a measure narrowed to
 * whole numbers (409, naming the entity).
 * @returns {Promise<{changed: {moments: number, durations: number}, timeline: object}>}
 */
export async function changeMeasures(store, t, userId, { revision, measures, renames }, progress) {
  if (t.comparison) throw new HttpError(409, 'A comparison has no measures of its own.');
  if (!t.canWrite) throw new HttpError(403, 'Only writers can change measures.');
  if (t.revision !== revision)
    throw new HttpError(409, 'Someone changed this timeline. Reload it, then try again.');
  let after, renamed;
  try {
    after = validateMeasures(measures ?? {});
    renamed = validateMeasureRenames(renames, t.measures ?? undefined, after);
  } catch (error) {
    throw new HttpError(400, error.message);
  }
  // Read as it is now; the save below is refused if anyone saves in between.
  const document = await store.transaction((c) => store.branchDocument(c, t));
  let events, durations;
  try {
    ({ events, durations } = remeasuredEntities(document, after, renamed));
  } catch (error) {
    throw new HttpError(409, error.message);
  }
  const { measures: _before, ...rest } = settings(t);
  await store.save(
    t.id,
    userId,
    revision,
    null,
    {
      settings: Object.keys(after).length ? { ...rest, measures: after } : rest,
      changes: events.map((event) => ({ id: event.id, event })),
      durationChanges: durations.map((duration) => ({ id: duration.id, duration })),
      relationshipChanges: [],
      // Every value the change affects is rewritten here (incremental.mjs).
      remeasured: true,
    },
    { progress },
  );
  return {
    changed: { moments: events.length, durations: durations.length },
    timeline: await store.metadata(t.id, userId),
  };
}
