# Exact time mapping and range operations

Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only

OpenChronology changes the times of many events at once with an exact affine map, `t ↦ (t − around) × scale + around + offset`, over exact rationals, applied to every moment and duration of a timeline or to those a tag or relationship filter selects. Durations whose ends are anchored to moments are not mapped directly: they follow their moments, whether or not they were selected, and relationships follow by identity. Only entities whose times actually change are written, and the same pure function computes them for three stores: the browser's in-memory index (one undoable edit), the desktop app's SQLite file (applied natively to a staged copy, undoable until saved) and the server (one revision, applied in place a slice at a time with streamed progress). The same machinery deletes everything in a time range. Comparisons of several timelines use the same affine map as a read-only view, reading each source through the inverse map. Disclosed at commit [`007091c`](https://github.com/openchronology/timeline-app/tree/007091ce62fdb402346c0712b0c420eac0a29dff); first public disclosure: see [below](#first-public-disclosure).

## Field and problem

A timeline recorded against the wrong clock or epoch, a strand of a story that needs moving, or a period to be stretched, means changing thousands to millions of times consistently.

- **Floating-point maps drift and reorder.** `t × 1.1 + offset` in doubles rounds every result; distinct times can collide, and applying a map and its inverse does not return the original. Times on these timelines are exact rationals of any size (from Planck-scale fractions to geological ages), so a map must be exact and its result canonical.
- **Durations reference moments.** A duration's start or end may be a fixed time or "the time of moment X". Mapping both kinds blindly moves an anchored end twice (once through the moment, once directly) or detaches it; mapping neither leaves fixed ends behind.
- **Selections must be consistent with what the user sees.** "Shift everything tagged _war_" or "everything connected to this event" must select exactly what the view's separation into tracks shows.
- **Bulk changes are expensive in every store.** Recording a million per-entity edits in a browser's undo stack, re-rendering per edit, or saving a whole document to change half of it, does not scale; a server-side update that bypasses revisions breaks history, concurrency control and live viewers.
- **Deleting a range** raises the same issues: durations anchored to deleted moments, revision semantics, and finding the range's members without scanning the whole timeline.

## Summary of the mechanism

1. **The mapping** is a triple of exact rationals `(scale > 0, offset, around)`, validated from text (`"3/2"` or a finite decimal `"1.5"`). `mapTime(t) = (t − around)·scale + around + offset`. A positive scale makes the map strictly increasing, so order is preserved.
2. **Selection** is a predicate `keep(key, metadata)` built from a view filter: tags (`any` / `none`) or relationships (`direct` neighbours, or everything reachable by breadth-first search, of a chosen entity). It is the same membership function that separates the view into tracks.
3. **`mappedEntities(document, mapping, filter)`** returns only the selected moments whose canonical time changes, with new times, and the selected durations at least one of whose _fixed_ endpoints changes, with those endpoints mapped and anchored endpoints left as anchors.
4. **Anchored endpoints follow** in every store: when a moment moves, each store re-resolves and re-indexes the durations anchored to it (and the relationship arcs of moved entities).
5. **Three application paths** take the same output as a sparse patch: in-page (one grouped undoable edit), desktop native (`desktop_stage_patch` applies it to a new copy of the disk baseline, keeping the old one for undo), and server (`POST /map-times`: one save at a checked revision, applied in place in slices of 5,000 or by rebuilding when it changes over half of a timeline under 200,000 moments, streaming progress as JSON lines).
6. **Delete-range** collects moments in `[lower, upper]` and durations wholly inside it and deletes them through the same patch paths; anchored durations of deleted moments keep the moment's last time.
7. **Comparison** places sources on one axis with `shared = original × scale + offset` and answers each view by mapping the view's bounds and grouping threshold back through the inverse into each source's own coordinates.

## Detailed description

### Data structures

```ts
interface TimeMapping { scale: Q; offset: Q; around: Q }   // Q: exact rational (BigInt n/d)
type DurationEndpoint = string /* fixed exact time */ | { moment: string } /* anchor */;
interface Duration { id; start: DurationEndpoint; end: DurationEndpoint; metadata }
type ViewFilter =
  | { tags: string[]; mode: 'any' | 'none' }
  | { related: { moment | duration: id }; depth: 'direct' | 'all'; mode: 'any' | 'none' };
```

Invariants: `scale > 0`; times are canonical reduced fractions (the comparison "did it change" is made on canonical text); entity references in filters and relationships use keys `m:<id>` and `d:<id>`.

**Validation (`timeMapping`).** Each field must be a non-empty string of at most 4,000 characters; text containing `/` is parsed as a fraction, otherwise as a finite decimal (`parseDecimal`, exact: `1.5 = 3/2`). A non-positive scale is refused. `around` defaults to 0, which reduces the map to `time × scale + offset`, the form comparisons use. In the editor, `offset` is typed as a time difference in the display's units (`2 years 3 days`, `-1 h 30 min`) and `around` as a displayed time; both are parsed exactly into coordinates before the mapping is built.

### Algorithm: computing what moves

```
mappedEntities(doc, mapping, filter, parse):
  keep := filter ? filterMembership(doc, filter) : (always true)
  if mapping.scale = 1 and mapping.offset = 0: return ([], [])     # nothing moves
  events := []
  for e in doc.events:
    if not keep("m:"+e.id, e.metadata): continue
    t' := canonical(mapTime(parse(e.time)))
    if t' ≠ canonical(parse(e.time)): events.push({...e, time: t'})
  durations := []
  for d in doc.durations:
    if not keep("d:"+d.id, d.metadata): continue
    s' := (d.start is a string) ? canonical(mapTime(parse(d.start))) : d.start   # anchors untouched
    e' := (d.end   is a string) ? canonical(mapTime(parse(d.end)))   : d.end
    if (d.start is a string and s' ≠ canonical(d.start)) or (d.end is a string and e' ≠ canonical(d.end)):
      durations.push({...d, start: s', end: e'})
  return (events, durations)
```

(With scale 1 and offset 0 every `around` gives the identity, so the early return is exact.)

**Selection (`filterMembership`).** For tags, an entity is inside when any of its tags is in the set; for relationships, the graph is the undirected adjacency of the document's relationships and the inside set is the start plus everything `reachable` within depth 1 (`direct`) or unbounded (`all`), by breadth-first search. The predicate returns `inside === (mode === 'any')`. This is the function that splits the view into upper and lower tracks, so "what will move" is exactly what the separated view shows in the upper track (or, for `none`, the lower one).

**How anchored endpoints follow.** A moment's new time is written once; durations that name it are found and re-placed by the store:

- _In the page_, the index re-resolves anchored bands from moment times whenever a moment is put, so they move as the moment does.
- _On the server_ (`applyIncrementally`), a save looks up durations by changed ID and, through expression indexes on `definition->'start'->>'moment'` and `definition->'end'->>'moment'`, by every moved or deleted moment; each one's band is resolved again and re-placed in the duration interval tree only when its first/last or start/end time changed. Relationship arcs of moved entities are placed again. Durations anchored to a deleted moment keep that moment's last saved time as a fixed endpoint.
- _In the desktop SQLite store_ (`apply_changes`), step 3 re-places every changed duration and every duration anchored to a moved or deleted moment in the duration tree; step 4 re-places arcs whose endpoint moved.

Consequences: a selected duration whose ends both follow moments has nothing of its own to move and is not written; an unselected duration anchored to a selected moment still moves with it; a selected duration with one fixed and one anchored end has only the fixed end mapped, so it may stretch (or even reverse, which band resolution tolerates by ordering `first`/`last`) if its anchor did not move.

### Applying the patch

All three paths turn `(events, durations)` into the same sparse patch shape: `changes: [{id, event}]`, `durationChanges: [{id, duration}]`, settings unchanged, no relationship changes (relationships reference entities by ID, so they are unaffected).

**1. In the page (`mapHere`).** For a timeline held in memory (drafts, imports, the offline edition, small desktop files), each moved moment is `put` into the index and each duration `putDuration`, recording `{before, after}` pairs into a single group edit. Every 5,000 changes it yields to the event loop and updates a progress bar. One **Undo** reverts the group. A preview counts what will move before applying.

**2. Desktop native (`mapOnDesktop` → `desktop_stage_patch`).** A desktop file of more than 2,048 moments lives in a disk-backed SQLite baseline, not in the page. The editor reads the baseline's whole document once (`desktop_document`), computes `mappedEntities` in the page, and sends the patch to the native command, which (off the UI thread) makes a fresh private copy of the baseline, applies the patch in one SQLite transaction (`apply_with`), reports progress every 2,000 changes through a Tauri channel, and makes the copy the open baseline. The previous baseline is kept (up to eight), so **Undo** and **Redo** switch baselines (`desktop_restore_baseline`). The change stays unsaved; the copy carries a new save token, so the next save writes the whole file. It is refused while other unsaved edits exist, since switching baselines would lose them. See [desktop file baselines](desktop-file-format.md).

**3. Server (`POST /api/timelines/<id>/map-times`).**

```
map-times(id, {revision, mapping, filter?}):
  validate mapping (400), filter
  t := access(id)                          # 409 for a comparison, 403 without write access
  if t.revision ≠ revision: 409
  doc := read whole branch document in one transaction
  (events, durations) := mappedEntities(doc, mapping, filter, parseTime)
  if anything moved:
    store.save(id, user, revision, patch, progress)   # locks the row; rechecks revision
  return {moved: {moments, durations}, timeline}
```

`store.save` takes the timeline row `FOR UPDATE`, so other saves wait; it refuses a revision that changed between the read and the lock. If `incremental(t, patch)` holds (the patch has at most `max(64, n/2)` changes or the timeline has at least 200,000 moments), the patch is applied in place in slices of 5,000 changes (moments, then durations, then relationships), each slice applied to the timeline row as the previous left it, all within one transaction and recorded as one revision; otherwise the index is rebuilt from `applyPatch(current, patch)`. Either way progress is reported: `{done, total}` per slice, or `{rebuilding: stage, done, total}` per rebuild stage.

With `Accept: application/x-ndjson`, the response is a stream of JSON lines produced by an async generator around the work: `{"progress":{"reading":true}}` first, then each progress value, then `{"result": …}` or `{"error":{status,message}}`. The work runs to completion even if the client disconnects. Without the header (the desktop app's native HTTP transport), one JSON reply is sent.

**Viewport.** When everything moved (no filter), the editor maps its view the same way, `new Viewport(mapTime(left), span × scale)`, so the same moments stay on screen.

### Delete-range

**Server.** `POST /api/timelines/<id>/delete-range` with `{revision, lower, upper}` (both inclusive, exact rational text, `lower ≤ upper`) calls `deleteWhere` (see [log ingestion, retention](log-ingestion.md#6-retention)):

- moments: an in-order walk of the moment tree (`oc_events`) from `lower`, a page of 5,000 at a time with an exact `(time, id)` cursor, collecting at most 200,000 IDs;
- durations wholly inside: from the duration interval index, using a bounded order-preserving key of the start (`first_key = oc_qkey(first_time)`) to narrow the scan and exact comparisons on `first_time ≥ lower` and `last_time ≤ upper`, at most 200,000;
- one save at `revision` deleting them (`event: null`, `duration: null`); `more: true` tells the client to repeat for the rest.

**In the page.** Moments come from the exact range query of the in-memory weighted index (`points.range(lower, upper, {includeUpper: true})`); durations are those whose resolved band lies within `[lower, upper]`. All deletions form one group edit, undone by one **Undo**. Durations following a deleted moment keep its time: the index remembers each deleted moment's last time (`retired`), and the document it produces replaces anchors to deleted moments with those times (`fixMissingAnchors`).

**Desktop.** The editor reads the baseline's document, filters moments and resolved duration bands to the range, and stages the deletion with `desktop_stage_patch` as for mapping; native `apply_changes` converts anchors to deleted moments into fixed endpoints at the moment's last time.

### Read-side variant: comparisons on one axis

A comparison view places two to eight timelines on one axis; each track has `shared = original × scale + offset` (`scale > 0`), a per-track viewport cache kept in the source's own coordinates, and a source that is either an in-memory index or a remote query function.

```
frame(view: [left, left+span], width_px, grouping_px):
  for each track:
    sourceView := Viewport((view.left − offset)/scale, view.span/scale)    # inverse map
    plan := track.cache.plan(sourceView, width_px, grouping_px)              # threshold scales with span
    f := local ? index.frame(sourceView, …) : cache.get(sourceView, plan) ?? await query(plan)
    frames.push(mapFrame(track, f))                                         # forward map
  return combined ? regroup(concat(frames), view.threshold(width_px, grouping_px)) : concat(frames)

mapFrame: every time (group first/last, band start/end/first/last) ↦ t × scale + offset (exact);
          IDs ↦ sourceKey + ":" + id; anchored endpoints keep their anchor with a qualified ID
```

Because the width in pixels is unchanged, the grouping threshold in source coordinates is the shared-axis threshold divided by `scale`, so each source groups exactly as it would at the equivalent zoom on its own. Changing a track's alignment clears only that track's cache. Remote tracks are read one at a time to bound memory and database load, and an abort signal discards stale viewport requests. In **combined** mode the mapped groups of all tracks are regrouped at the shared threshold so nearby moments from different sources merge. **Fit all** maps each source's first and last time forward and frames their extremes.

Applying a comparison's alignment to a timeline for good is the [map-times](#applying-the-patch) operation with `around = 0`.

### Numeric and precision constraints

- All arithmetic is exact rational arithmetic on BigInt numerators and denominators; results are reduced to canonical form. There is no rounding at any step, so mapping by `(scale s, offset o, around a)` and then by its inverse `(scale 1/s, offset −o, around a + o)` returns the original times exactly.
- Input sizes are bounded by text length (4,000 characters per field); result sizes grow with the operands' digit counts (the product of a k-digit and an m-digit fraction has about k+m digits).
- Native stage patches are limited to 200,000 moment changes and 200,000 duration changes; server deletes to 200,000 of each per request.

### Complexity

| Step                                         | Time                                                                                                | Space                       |
| -------------------------------------------- | --------------------------------------------------------------------------------------------------- | --------------------------- |
| `mappedEntities` over n moments, m durations | O((n + m) · c) for c the cost of one rational multiply-add, plus O(V + E) for a relationship filter | O(k) for k moved entities   |
| In-page apply                                | O(k log n) index updates                                                                            | k undo pairs                |
| Server apply, in place                       | O(k log n) tree rows, in ⌈k / 5,000⌉ slices; plus a whole-document read to compute the patch        | one slice of rows at a time |
| Server apply, rebuild                        | O(n log n) (about 0.5 ms per moment)                                                                | the whole document          |
| Desktop apply                                | file copy O(size) plus O(k log n) SQLite rows                                                       | a second disk copy          |
| Delete-range                                 | O(k log n) to find k moments by tree walk, plus index scan of durations by start key                | O(k)                        |
| Comparison frame                             | per track: one cached or bounded window query in source coordinates, plus O(g) to map g groups      | per-track cache             |

### Edge cases

- Scale 1 and offset 0: nothing is written, whatever `around` is.
- Entities whose time maps to the same canonical value (for example `around` equal to the time and offset 0) are left out of the patch.
- A comparison timeline refuses map-times and delete-range (409): its sources must be changed instead.
- Unsaved edits: the server and desktop paths refuse to run while the editor holds unsaved edits on a large (sparse) timeline, since the change is saved or staged at once.
- A concurrent save between the read and the save makes the save fail with 409; nothing is applied.

### Variations

- `around` may be any point; with `around = 0` the map is the plain `t·s + o`. Any composition of shifts and positive scalings is again of this form, so a sequence of corrections can be applied as one map.
- The selection predicate may be any membership function over entity keys and metadata (here tags and relationship reachability at depth 1 or ∞; any depth d is the same breadth-first search).
- The map may be any strictly increasing exact function of time (the patch computation and anchor-following do not depend on its affine form); positive affine maps are the ones whose inverse is again affine, which comparisons rely on to read sources in their own coordinates.
- The same patch may be applied by any store that can apply a sparse patch atomically and re-place anchored intervals: in memory, a SQLite file copy, or a server-side incremental save.

## Implementation references

- `src/time-map.ts` — [`timeMapping`, `unchanged`, `mapTime`](https://github.com/openchronology/timeline-app/blob/007091ce62fdb402346c0712b0c420eac0a29dff/src/time-map.ts#L17-L64) — validation and the exact affine map; [`mappedEntities`](https://github.com/openchronology/timeline-app/blob/007091ce62fdb402346c0712b0c420eac0a29dff/src/time-map.ts#L65-L99) — what moves, fixed endpoints only.
- `src/tags.ts` — [`ViewFilter`](https://github.com/openchronology/timeline-app/blob/007091ce62fdb402346c0712b0c420eac0a29dff/src/tags.ts#L48-L51), [`filterMembership`](https://github.com/openchronology/timeline-app/blob/007091ce62fdb402346c0712b0c420eac0a29dff/src/tags.ts#L90-L114) — the selection predicate shared with separated tracks.
- `src/relationships.ts` — [`adjacency`, `reachable`](https://github.com/openchronology/timeline-app/blob/007091ce62fdb402346c0712b0c420eac0a29dff/src/relationships.ts#L85-L114) — breadth-first reachability.
- `src/durations.ts` — [`resolveDuration`, `fixMissingAnchors`](https://github.com/openchronology/timeline-app/blob/007091ce62fdb402346c0712b0c420eac0a29dff/src/durations.ts#L121-L160) — band resolution and anchors to deleted moments.
- `server/time-map.mjs` — [`mapTimes`](https://github.com/openchronology/timeline-app/blob/007091ce62fdb402346c0712b0c420eac0a29dff/server/time-map.mjs#L13-L48) — server application as one save.
- `server/http.mjs` — [`progressLines`](https://github.com/openchronology/timeline-app/blob/007091ce62fdb402346c0712b0c420eac0a29dff/server/http.mjs#L232-L268) — JSON-lines progress stream; [`delete-range` and `map-times` routes](https://github.com/openchronology/timeline-app/blob/007091ce62fdb402346c0712b0c420eac0a29dff/server/http.mjs#L1396-L1442).
- `server/store.mjs` — [`save`](https://github.com/openchronology/timeline-app/blob/007091ce62fdb402346c0712b0c420eac0a29dff/server/store.mjs#L1138-L1196) — row lock, revision check, in place or rebuild; [`saveIncrementally`](https://github.com/openchronology/timeline-app/blob/007091ce62fdb402346c0712b0c420eac0a29dff/server/store.mjs#L1431-L1514) — slices of one revision with progress.
- `server/incremental.mjs` — [`incremental`, `slicePatch`](https://github.com/openchronology/timeline-app/blob/007091ce62fdb402346c0712b0c420eac0a29dff/server/incremental.mjs#L65-L113); [anchored durations follow moved and deleted moments](https://github.com/openchronology/timeline-app/blob/007091ce62fdb402346c0712b0c420eac0a29dff/server/incremental.mjs#L273-L344).
- `server/retention.mjs` — [`deleteWhere`](https://github.com/openchronology/timeline-app/blob/007091ce62fdb402346c0712b0c420eac0a29dff/server/retention.mjs#L102-L161) — range deletion as one save.
- `src/app.ts` — [`stageOnDesktop`, `restoreBaseline`](https://github.com/openchronology/timeline-app/blob/007091ce62fdb402346c0712b0c420eac0a29dff/src/app.ts#L5912-L5979); [`requestRangeDelete`](https://github.com/openchronology/timeline-app/blob/007091ce62fdb402346c0712b0c420eac0a29dff/src/app.ts#L5980-L6110); [`mapHere`, `mapOnDesktop`, `mapOnServer`](https://github.com/openchronology/timeline-app/blob/007091ce62fdb402346c0712b0c420eac0a29dff/src/app.ts#L6247-L6336); [applying and moving the viewport](https://github.com/openchronology/timeline-app/blob/007091ce62fdb402346c0712b0c420eac0a29dff/src/app.ts#L6337-L6386).
- `src-tauri/src/main.rs` — [`desktop_stage_patch`, `desktop_restore_baseline`](https://github.com/openchronology/timeline-app/blob/007091ce62fdb402346c0712b0c420eac0a29dff/src-tauri/src/main.rs#L229-L297).
- `native-store/src/workspace.rs` — [`Snapshot::with_patch`](https://github.com/openchronology/timeline-app/blob/007091ce62fdb402346c0712b0c420eac0a29dff/native-store/src/workspace.rs#L634-L659); [`apply_with`, `apply_changes`](https://github.com/openchronology/timeline-app/blob/007091ce62fdb402346c0712b0c420eac0a29dff/native-store/src/workspace.rs#L756-L1098) — native application with progress, anchored durations and arcs re-placed.
- `src/comparison.ts` — [`Track`](https://github.com/openchronology/timeline-app/blob/007091ce62fdb402346c0712b0c420eac0a29dff/src/comparison.ts#L62-L72), [`transform`, `fit`, `cached`, `visible`, `frame`](https://github.com/openchronology/timeline-app/blob/007091ce62fdb402346c0712b0c420eac0a29dff/src/comparison.ts#L161-L262), [`mapFrame`, `join`](https://github.com/openchronology/timeline-app/blob/007091ce62fdb402346c0712b0c420eac0a29dff/src/comparison.ts#L278-L345), [`mapEndpoint`](https://github.com/openchronology/timeline-app/blob/007091ce62fdb402346c0712b0c420eac0a29dff/src/comparison.ts#L494-L503).

## Benchmarks

No benchmarks measure time mapping or delete-range directly. The closest:

- [docs/architecture.md, "Incremental saves"](https://github.com/openchronology/timeline-app/blob/007091ce62fdb402346c0712b0c420eac0a29dff/docs/architecture.md#incremental-saves): a rebuild costs about 0.5 ms per moment and an in-place change about 1 ms; at a million moments, deleting 200,000 in place takes about 5 minutes in statements of at most 10 s, where a rebuild took about 10 minutes and over 1 GB of memory.
- [docs/benchmarks.md, "Save time against timeline size"](https://github.com/openchronology/timeline-app/blob/007091ce62fdb402346c0712b0c420eac0a29dff/docs/benchmarks.md#save-time-against-timeline-size) (8-core virtual machine, PostgreSQL 17): changing 1,000 moments spread through the timeline takes 0.56 s at 200,000 moments and 0.75 s at 1,000,000.
- Correctness: `test/time-map.test.mjs`, `test/time-map-postgres.mjs`, `test/time-map-live-postgres.mjs`, `test/time-map-browser.mjs` and `test/desktop-bulk.mjs` (shifting what is tagged and deleting a view in a large desktop file, with Undo and Redo).

## First public disclosure

| Component                                                                                                   | First commit       | First release |
| ----------------------------------------------------------------------------------------------------------- | ------------------ | ------------- |
| Comparison view: per-track affine alignment, inverse-mapped reads                                           | 6530edf 2026-10-07 | v0.1.0        |
| Range deletion (`deleteWhere`, `POST /delete-range`)                                                        | 63312b8 2026-10-11 | v0.1.0        |
| Time mapping (`time-map.ts`, `mapTimes`, `POST /map-times`, progress lines)                                 | 7347c96 2026-10-15 | v0.1.0        |
| Native staged patches (`desktop_stage_patch`, `with_patch`) for mapping and deleting in large desktop files | bd8d487 2026-10-15 | v0.1.0        |

The repository has been public on GitHub since 2026-10-05, so these commit dates on `main` are public dates.
