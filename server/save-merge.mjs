// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
/**
 * Saving edits made on a revision others have saved since (#165). The editor sends, with its
 * changes, what it saw: each changed moment's and duration's version when it loaded it (null
 * for one it added) and the timeline's settings. The save then applies on the current head
 * whatever no one else changed meanwhile, field by field (merge.mjs):
 *
 * - a moment or duration someone else left as the editor saw it takes the editor's version;
 *   one both changed merges their fields, and fields both changed differently conflict;
 * - each setting (title, description, tags, time display, plugins, assets) the editor left
 *   as it saw takes the head's value; assets merge image by image;
 * - relationships are added or removed as asked, whatever happened meanwhile.
 *
 * This holds on the latest revision too: an editor that moved to it with edits staged (the
 * view follows others' saves) still made them on what it saw before.
 *
 * A change the editor sends without what it saw applies as it is: that is how the editor
 * keeps its own version of a conflict. Conflicts refuse the save, naming them (409), so the
 * editor can keep its versions or take the saved ones and save again.
 */
import { HttpError } from './store.mjs';
import { indexReader } from './index-versions.mjs';
import { canonical, timelineSettings } from './incremental.mjs';
import { mergeValue, SETTINGS } from './merge.mjs';

/** An entity ID as the application allows them (see docs/architecture.md). */
const ENTITY = /^[A-Za-z0-9_.:-]{1,128}$/;

/**
 * `value` (a request's `base`) as `{settings, moments, durations}`: settings an object (of
 * any of SETTINGS), moments and durations maps from ID to the version seen (null for none).
 * Null when the request sent none (the save applies as it is). Throws 400 for a malformed
 * base: not an object, more than 5,000 entries of a kind, an invalid or repeated ID, a
 * version that is not an object or null, or a setting outside SETTINGS.
 */
export function saveBase(value) {
  if (value === undefined) return null;
  const fail = () => {
    throw new HttpError(400, 'Invalid base for merging the save.');
  };
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail();
  const entities = (list = [], key) => {
    if (!Array.isArray(list) || list.length > 5000) fail();
    const seen = new Map();
    for (const entry of list) {
      if (!entry || typeof entry.id !== 'string' || !ENTITY.test(entry.id) || seen.has(entry.id))
        fail();
      const version = entry[key];
      if (version !== null && (typeof version !== 'object' || Array.isArray(version))) fail();
      seen.set(entry.id, version);
    }
    return seen;
  };
  const settings = value.settings ?? {};
  if (
    typeof settings !== 'object' ||
    Array.isArray(settings) ||
    Object.keys(settings).some((key) => !SETTINGS.includes(key))
  )
    fail();
  return {
    settings,
    moments: entities(value.moments, 'event'),
    durations: entities(value.durations, 'duration'),
  };
}

/** Whether two versions are the same (absent and null alike). */
const same = (a, b) => canonical(a ?? null) === canonical(b ?? null);

/**
 * Three-way merge of one entity: `before` what the editor saw, `mine` what it wants, `head`
 * what is saved now (null for none). Returns the version to save, or undefined on a conflict.
 */
function mergeEntity(before, mine, head) {
  if (same(before, head) || same(mine, head)) return mine;
  if (same(before, mine)) return head;
  const conflicts = [];
  const merged = mergeValue(
    before ?? undefined,
    mine ?? undefined,
    head ?? undefined,
    '',
    true,
    conflicts,
  );
  return conflicts.length ? undefined : (merged ?? null);
}

/**
 * `patch` (with `base`, saveBase) rebased onto timeline `t`'s current head: the changes to
 * apply, without `base`. Throws 409 naming the conflicts, if any.
 * `c` is the save's transaction, with `t` (the timeline row) locked, so the head read here is
 * the one the changes apply to. Reads only the moments and durations the base names, by key
 * through the timeline's levels; writes nothing.
 */
export async function rebaseSave(c, t, patch) {
  const { base } = patch;
  const index = await indexReader(c, t);
  const conflicts = [];
  const title = (...versions) => versions.find((v) => v?.metadata?.title)?.metadata.title || null;

  const momentIds = patch.changes.filter((ch) => base.moments.has(ch.id)).map((ch) => ch.id);
  // The head's version of each moment the base names, looked up by key (indexReader).
  const savedMoments = new Map(
    momentIds.length
      ? (
          await c.query(
            `SELECT m.id,m.event FROM unnest($2::text[]) k(id)
            CROSS JOIN LATERAL ${index.lookup('oc_moments', ['k.id'])} m`,
            [t.id, momentIds],
          )
        ).rows.map((row) => [row.id, row.event])
      : [],
  );
  const changes = [];
  for (const change of patch.changes) {
    if (!base.moments.has(change.id)) {
      changes.push(change);
      continue;
    }
    const before = base.moments.get(change.id),
      head = savedMoments.get(change.id) ?? null;
    const event = mergeEntity(before, change.event, head);
    if (event === undefined)
      conflicts.push({ kind: 'moment', id: change.id, title: title(change.event, head, before) });
    // What is saved already needs no change.
    else if (!same(event, head)) changes.push({ id: change.id, event });
  }

  const durationIds = (patch.durationChanges ?? [])
    .filter((ch) => base.durations.has(ch.id))
    .map((ch) => ch.id);
  // The head's definition of each duration the base names, by its band's ID: a lookup per
  // key on the expression index (timeline_id, band->>'id'), OFFSET 0 keeping it one.
  const savedDurations = new Map(
    durationIds.length
      ? (
          await c.query(
            `SELECT k.id,n.definition FROM unnest($2::text[]) k(id) CROSS JOIN LATERAL
              (SELECT definition FROM ${index('oc_duration_nodes')} x WHERE x.band->>'id'=k.id OFFSET 0) n`,
            [t.id, durationIds],
          )
        ).rows.map((row) => [row.id, row.definition])
      : [],
  );
  const durationChanges = [];
  for (const change of patch.durationChanges ?? []) {
    if (!base.durations.has(change.id)) {
      durationChanges.push(change);
      continue;
    }
    const before = base.durations.get(change.id),
      head = savedDurations.get(change.id) ?? null;
    const duration = mergeEntity(before, change.duration, head);
    if (duration === undefined)
      conflicts.push({
        kind: 'duration',
        id: change.id,
        title: title(change.duration, head, before),
      });
    else if (!same(duration, head)) durationChanges.push({ id: change.id, duration });
  }

  // Settings merge one by one, only those the editor reported seeing; assets merge image by
  // image (field by field), the others as whole values.
  const saved = timelineSettings(t),
    settings = { ...patch.settings };
  for (const key of SETTINGS) {
    if (!(key in base.settings)) continue;
    const found = [];
    const value = mergeValue(
      base.settings[key] ?? undefined,
      patch.settings[key] ?? undefined,
      saved[key] ?? undefined,
      key,
      key === 'assets',
      found,
    );
    if (found.length) conflicts.push({ kind: 'setting', id: key, title: null });
    else if (value === undefined) delete settings[key];
    else settings[key] = value;
  }

  if (conflicts.length)
    throw Object.assign(
      new HttpError(
        409,
        `${conflicts.length === 1 ? 'An edit conflicts' : `${conflicts.length} edits conflict`} with changes saved since you opened this timeline.`,
      ),
      { conflicts },
    );
  return {
    settings,
    changes,
    durationChanges,
    relationshipChanges: patch.relationshipChanges ?? [],
  };
}
