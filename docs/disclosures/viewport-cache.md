# Multi-resolution viewport cache for sparse editing

Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only

OpenChronology edits timelines stored on a server (PostgreSQL) or in a desktop file (SQLite) without ever loading the whole timeline into the page. The browser keeps a bounded running cache of overscanned viewport windows, each a server-computed summary frame at one grouping resolution. Resolutions are snapped to powers of two so that nearby pans and small zooms reuse a window; windows are fresh for 30 seconds, prefetched ahead of the reader in the direction of the latest motion, bounded by window count, byte budget and per-response limits, and evicted by a distance that adds resolution octaves, position and age. Windows of signed-in users persist in IndexedDB keyed by server origin, user, timeline, immutable revision and a fingerprint of the active plugins, so a revisited timeline paints from storage without a query. Unsaved edits live in a separate sparse workspace that pins only edited entities and their saved originals, and are laid over each cached frame by adjusting summary counts, never by reconstructing summary members. Disclosed at commit [`007091c`](https://github.com/openchronology/timeline-app/tree/007091ce62fdb402346c0712b0c420eac0a29dff); first public disclosure: see [First public disclosure](#first-public-disclosure).

## Field and problem

A timeline editor backed by a remote store must show any view of a timeline of up to hundreds of thousands of moments quickly, let the person edit, and never lose work. The obvious approaches fail:

- **Loading the whole timeline** costs time and memory proportional to the data on every open (in-memory opening is 34 s at 200,000 moments in Node, per [`docs/benchmarks.md`](../benchmarks.md#findings)).
- **Querying per view** makes every pan or zoom wait for a round trip, and the picture flickers as markers disappear while the response is pending.
- **Caching by exact view** never hits: views are exact rationals and two gestures almost never produce the same bounds or the same grouping threshold.
- **Caching raw moments** cannot work for summaries: a server summary reports counts of members it does not send, so the browser cannot recompute or merge summaries from cached members, and it must not export a partial cache as if it were the timeline.
- **Unbounded caches** grow with navigation; naive LRU evicts the coarse windows that make zooming out instant.
- **Persistent caches** go stale when the timeline changes, and leak data across users or servers on a shared browser.
- **Editing against a cache** risks losing unsaved changes when the cache evicts the entities they touch, and double-counting an edited moment that is still inside a saved summary.

## Summary of the mechanism

1. For each view the client plans a **window**: the view widened by a quarter of its span on each side, at a grouping threshold snapped down to a power of two (never below the window width / 1,024).
2. A view is answered from any cached window of exactly that threshold that covers the view and was fetched in the last 30 seconds. Otherwise one request is scheduled (debounced 70 ms); meanwhile the window last drawn, or the closest covering window by resolution, stays on screen with its confirmed grouping.
3. When the view settles (400 ms), up to three **predicted windows** are fetched one at a time, ordered by the latest motion: a wide window at the same resolution for panning, one level coarser for zooming out, one level finer for zooming in. Each is sized to stay within the server's response limit.
4. The cache holds at most **16 windows** and **24 MiB** (estimated UTF-16 JSON); one response may hold at most **2,048 groups** and **8 MiB**. A stored window replaces the windows of its resolution that it contains. Windows unused for five minutes are dropped; over budget, the window with the greatest distance — octaves of resolution plus position in widths plus minutes since use — is dropped first, except windows serving the view.
5. A response **reconciles** singleton moments by stable ID (unchanged objects are kept), replaces summaries wholesale and releases contained windows in one step; failures leave confirmed data intact.
6. For signed-in users, windows are written to IndexedDB (`openchronology-viewports`) two seconds after arrival and when the page is hidden, keyed by origin, user, timeline, revision and plugin fingerprint, at most 64 per revision, 64 MiB in total, 30 days old at most. Restored windows count as fresh.
7. Unsaved edits live in a `RemoteWorkspace`, a sparse rational-map index holding only loaded and edited entities. Each frame is the cached server frame with the edits laid over it: edited moments are subtracted by count from the summaries containing their saved time and added back as singletons at their new time, then groups are coalesced at the view's exact threshold.

## Detailed description

### Window planning and resolution levels

A view is `[left, left + span]` (exact rationals) on a drawable width `W` pixels with grouping distance `P` pixels ([summaries](summaries-and-clustering.md#grouping-threshold)). The view's own threshold is `t = span × P / W`. The planned window is:

```
plan(view):
  margin    = span / 4
  minimum   = span × 3/2 / 1024             # the planned window's width / 1024
  threshold = max(t, minimum)
  level     = dyadic(threshold)             # largest 2^k <= threshold, k any integer
  if level < minimum: level = minimum
  return { lower: left − margin, upper: left + span + margin, threshold: level }

dyadic(q):                                   # q = n/d > 0, exact
  e = bitlength(n) − bitlength(d)            # log2 estimate, within one
  if 2^e > q: e −= 1
  return 2^e                                 # an exact rational, 2^e or 1/2^−e
```

Snapping down to a power of two means every view whose own threshold lies in `[2^k, 2^(k+1))` asks for the same level, so zooming by less than a factor of two (at a fixed width and grouping distance) and panning by less than a quarter span reuse one window. Snapping down, not up, keeps the window's groups at most as wide as the view's own grouping; the view then coarsens them exactly (see [Display](#display-while-loading-and-after-a-hit)). The `minimum` keeps a planned window to at most about 1,025 anchored groups, which matches the server, which raises any requested threshold below `(upper − lower) / 1024` to that value.

Note on the documentation: [`docs/architecture.md`](../architecture.md#window-summaries) (line 106) says resolution levels "use exact powers of two". In the code, when the power of two at or below the threshold falls under `minimum`, the level is `minimum` itself, which is not in general a power of two. This can happen only when `t < 2 × minimum`, that is `P/W < 3/1024`: with the default 24-pixel grouping, a drawable width above 8,192 pixels. On ordinary screens levels are powers of two.

### Lookup

```
get(view, query):
  focus = (view, query.threshold)                       # remembered for eviction
  candidates = entries where
      entry.threshold == query.threshold                 # exact rational equality
      and entry.lower <= view.left and entry.upper >= view.right
      and now − entry.fetched <= 30 s
  e = newest candidate by fetched; if none: return miss
  e.used = now; shown = e
  return cut(e.frame, view)
```

`cut` keeps the groups and bands that reach into the view, edges inclusive (`g.last >= view.left and g.first <= view.right`). A group straddling the view's edge keeps its full count, which covers members outside the view.

### Display while loading and after a hit

The editor's render path (`render` in `src/app.ts`):

1. Compute `motion` by comparing the view with the previous one: a smaller span is `zoom-in`, a larger one `zoom-out`, the same span with another left edge `pan`.
2. `query = plan(view)`; `cached = get(view, query)`.
3. The frame to draw is `cached`, or else `nearest(view, query.threshold)`, or else nothing.
4. The display threshold is the view's exact threshold `t` on a hit and **zero** on a miss. With zero, no regrouping happens, so the stand-in frame keeps its confirmed grouping and visible singleton markers do not disappear while the replacement loads.
5. Unsaved edits are laid over the frame (below), and groups are coalesced at the display threshold (`regroup`: [coalescing](summaries-and-clustering.md#collapsed-durations), which merges adjacent blocks while the merged block spans less than the threshold and adds counts exactly).
6. On a miss, after a 70 ms debounce, one overview request is sent with the planned bounds and threshold, the timeline's revision and the active plugins.

`nearest` chooses the stand-in:

```
nearest(view, threshold):
  if shown is still cached and overlaps the view: return shown        # keep what is on screen
  rank(e) = ( covers(e, view) ? 0 : 1 − overlapFraction(e, view),     # covering first, then most overlap
              |octaves(e.threshold, threshold)|,                      # closest resolution
              e.threshold > threshold ? 1 : 0,                        # finer before coarser
              −e.fetched )                                            # newest
  return the entry with the smallest rank (lexicographic)
```

`octaves(a, b)` is `|bitlength(num(a/b)) − bitlength(den(a/b))|`, an integer estimate of `|log2(a/b)|` computed from the exact ratio. Preferring the window already drawn keeps markers in place during a zoom out instead of switching to a coarser covering window with different groups.

Note on the documentation: [`docs/architecture.md`](../architecture.md#window-summaries) (line 106) says "the cached window covering it at the closest resolution stays on screen meanwhile". The code first keeps the window last drawn whenever it overlaps the view at all, even if it does not cover it, and only otherwise ranks windows as above.

### Request ordering and staleness

- A view's own request goes first. A browser prefetch in flight is aborted; a desktop (native) prefetch cannot be interrupted, so the view's request waits for it and is re-issued when it ends.
- Only one view request is in flight; a newer view aborts an older web request (`AbortController`). A response is discarded if it was aborted, if a newer request was made, or if the timeline or revision changed meanwhile. A request that ends without its answer being used triggers a new render, so the view never stays loading.
- A 409 (revision conflict) reopens the view at the latest revision (keeping unsaved edits of a sparse workspace); 401, 403 and 404 also delete the windows stored for that timeline.

### Prefetch

`predict(view, motion)` returns up to three windows:

```
level = plan(view).threshold
around(threshold, margin):
  widest = threshold × 1024                    # the widest window within the server's group limit
  room   = (widest − span) / 2
  if room < 0: return none                     # cannot even cover the view
  side   = min(margin, room)
  return { lower: left − side, upper: right + side, threshold }

pan     = around(level,     2 × span)          # two spans on each side
zoomOut = around(2 × level, 2 × span)
zoomIn  = around(level / 2, span / 2)
order   = zoom-in:  [zoomIn, pan, zoomOut]
          zoom-out: [zoomOut, pan, zoomIn]
          otherwise [pan, zoomOut, zoomIn]
return order minus windows already covered by a fresh cached window of the same threshold
```

Prefetching starts 400 ms after a view is answered from the cache, only when the view's own window is cached, the page is visible, no save is running and no comparison is shown. Windows are fetched one at a time; each response is stored and the next prediction is scheduled 50 ms later, so prediction stops once all three are cached. Prefetch queries carry `prefetch: true`, which the server and the desktop store ignore. Because the zoom-in and zoom-out windows are exactly one dyadic level apart, the views reached by zooming by up to a factor of two hit them directly.

### Storage, budgets and reconciliation

Each cache entry holds `lower`, `upper`, `threshold` (parsed once), the server frame, `fetched` and `used` timestamps and an estimated size `bytes = 2 × JSON.stringify(frame).length` (UTF-16 code units). Constants (`ViewportCache`):

| Constant     | Value  | Meaning                                                |
| ------------ | ------ | ------------------------------------------------------ |
| `maxGroups`  | 2,048  | Most summary groups in one response                    |
| `maxBytes`   | 8 MiB  | Largest single response                                |
| `maxEntries` | 16     | Most windows held                                      |
| `totalBytes` | 24 MiB | Total estimated size of held windows                   |
| `freshFor`   | 30 s   | A window answers views this long after it was fetched  |
| `keepFor`    | 5 min  | A window unused this long is dropped at the next store |

`store(query, frame)`:

1. Refuse (throw, caching nothing) if the frame has more than 2,048 groups or more than 8 MiB.
2. **Reconcile singletons by stable ID.** Collect every cached singleton group by moment ID. For each group of the new frame with an ID, if an old group with that ID is JSON-identical, reuse the old object. Unchanged moments keep their object identity (and their markers, which are keyed `event:<id>`), so a refreshed window does not rebuild them.
3. **Replace summaries.** Summary groups of the new frame are taken as they are; they are never added to older summary counts.
4. Build the entry, remove every cached entry of the same threshold whose range the new window contains, and append the new one. Steps 2–4 replace the entry list in one assignment, so obsolete detail is released at the same moment the replacement becomes visible.
5. Evict:

```
drop entries with now − used > keepFor (except the new one)
distance(e) = |octaves(e.threshold, focus.threshold)|
            + gap(e, focus.view) / max(width(e), focus.view.span)     # 0 when overlapping
            + (now − e.used) / 60000                                  # minutes since use
serving(e)  = e is the new entry, or (e.threshold == focus.threshold and e covers focus.view)
while count > 16 or bytes > 24 MiB:
   remove the non-serving entry with the largest distance (stop if none)
```

The three terms are commensurable: one octave of resolution, one window width of distance and one minute of disuse each add 1. Coarse windows near the view survive longer than fine windows far away, which keeps zooming out and returning to a recent place fast.

Other releases: `release(view)` keeps only the windows covering the view (used when the page is hidden); `clear()` empties the cache when the timeline, revision, plugins (the cache key is `id:revision:JSON(activePlugins)`) or access change. The budgets bound payload sizes, not the browser process as a whole.

### Persistence across page loads

`src/viewport-store.ts` stores windows in the IndexedDB database `openchronology-viewports` (version 1), with two object stores: `windows` (the `StoredWindow` objects: `lower`, `upper`, `threshold`, `frame`) and `catalog` (`{bytes, saved}` per key), written in the same transaction. Keys are strings joined with U+0001:

```
scope   = origin ␁ userId
version = scope ␁ timelineId ␁ revision ␁ fingerprint(JSON(activePlugins)) ␁
key     = version ␁ threshold ␁ lower ␁ upper        (exact rational strings)
```

`fingerprint` is the 53-bit cyrb53 hash in base 36, so the plugin set is keyed without being stored. Prefix queries use the range `[prefix, prefix + U+FFFF]`, so a whole user, timeline or revision is read or deleted with one key range.

Only signed-in users of server timelines persist windows; guests' windows stay in the page, and desktop files keep windows only in the page because their revision does not survive the app. A saved revision is immutable, so a stored window of the confirmed revision is exact: when a timeline opens (or its cache key changes) the windows of `version` are loaded and added with `restore`, which marks them fetched now, skips windows already covered by a cached window of the same threshold or beyond the per-response limits, and then drops entries from the end of the list until within 16 windows and 24 MiB. The last views therefore paint without a query.

Saving (`planSave`), two seconds after a window arrives (debounced) and immediately when the page is hidden:

```
put    = cached windows whose key is not yet stored
remove = stored windows of this timeline with another revision or plugin set
       + stored windows of this version not held by the page beyond the newest
         (64 − held) by saved time
       + any stored window older than 30 days not held by the page
then, oldest saved first, remove windows not held by the page until total <= 64 MiB
```

Windows of the current revision that the page has let go of stay stored (up to the per-revision count), so a save made at any moment never loses what a later visit could show. Visibility handling keeps this consistent: when the page is hidden it aborts prefetching, waits for any restore still in progress, saves at once and then releases every window not covering the view; when it is shown again it restores from storage before saving anything more, and a debounced save never runs while the page is hidden.

Signing out deletes all stored windows (in the desktop app, those of that server and user); a request refused with 401, 403 or 404 deletes the timeline's stored windows. Storage errors (private windows, quota) are ignored: the server answers instead.

### Sparse workspace for unsaved changes

For a server or desktop timeline the editor's model is a `RemoteWorkspace`, a subclass of the in-memory `TimelineIndex` (whose moments are kept in a rational-keyed map) that starts with the timeline's settings and no entities. It holds:

| Field                            | Contents                                                                                                 |
| -------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `changes`                        | Moment ID → `{before?, after?}`: saved version (absent for new) and desired version (absent for deleted) |
| `durationChanges`                | The same for durations                                                                                   |
| `relationshipChanges`            | Relationship key → `{relationship, related}`, the desired link state                                     |
| `originals`, `durationOriginals` | Saved versions of loaded entities                                                                        |
| `savingIds`, `savingDurations`   | Entities whose changes a save in progress has sent                                                       |

Rules:

- `load(event)` adds a saved moment read from the server (for inspection) unless an unsaved edit of it exists, and records its original.
- `put` and `delete` record the change against `before = changes[id].before ?? originals[id]`; an edit that returns to the saved version (compared as normalized JSON) removes the change; deleting a moment that was never saved simply forgets it.
- `evict(selected, openDuration, retained)`, called on every render, drops every loaded moment and duration except: the selected moment, the open duration, entities with unsaved changes, entities being saved, entities in the undo/redo history (`retained`), and moments that edited durations are anchored to (so their bands can be placed locally). Inspector reads are therefore disposable while edits and their originals are pinned.
- Saving takes a copy (`beginSave`); when the server accepts, `accepted` makes each sent version the new original and keeps, as a new change, whatever the person did to that entity during the save. A failed save leaves the changes as they were.

**Overlay.** Each frame drawn is the cached server frame of the saved head with the edits laid over it (`overlay(frame, view, threshold)`):

```
for each group g of the server frame:
  if g is a lone collapsed duration: set it aside as a band to re-place
  count     = g.count     − |{ edited or deleted moments whose saved time is in [g.first, g.last] }|
  durations = g.durationCount − |{ edited durations whose saved version collapses and starts in [g.first, g.last] }|
  keep g with these counts if either is > 0          # summaries never reveal members: counts only
for each changed moment with an `after` inside the view: add a singleton group at its new time
bands = saved bands (anchored endpoints follow unsaved moves of their moments, edited durations
        replaced by their desired versions) + the set-aside lone collapsed durations
split bands into drawn (extent >= threshold) and collapsed; collapsed become one-duration groups
arcs  = saved arcs following unsaved moves; new links added when both ends are known; removed links dropped
return regroup(frame with these groups, at most 256 drawn bands, arcs; threshold)
```

An edited moment is never counted twice: its saved occurrence is removed from the summary that contains it (by count, since the summary does not list members), and its edited version appears once as its own group, which then coalesces with neighbours at the current threshold. Exports and saves never use the cache: a sparse editor saves only its changes (`patch`), and a full export or local copy materializes the document from the saved head plus changes (`applyChanges`, which also fixes anchors to deleted moments at their last saved time).

### Edge cases

- **Zero grouping and extreme magnitudes.** The level never falls below `window / 1024`, so a zero grouping distance or a huge coordinate still yields bounded responses; `test/remote-cache.test.mjs` checks budgets at zero grouping and extreme rational magnitudes.
- **Coincident moments** remain one group even with zero visual grouping.
- **Responses over budget** are refused before anything is cached, and the error is shown; the previous frame stays.
- **Equal thresholds** are compared as exact rationals, so windows from different gestures match only when their levels are identical.

### Complexity

With at most 16 entries and ≤ 2,048 groups each: lookup, prediction filtering and eviction are `O(entries)` per call (eviction `O(entries²)` in the worst case, at most 256 distance evaluations). Reconciliation is `O(groups)` with JSON comparison of singletons. `cut` and `overlay` are `O(groups + bands + changes)`; overlay's subtraction is `O(groups × changes)`. Storage planning is `O(catalog log catalog)`. Memory is bounded by 24 MiB of estimated frame JSON in the page and 64 MiB in IndexedDB.

### Variations

- The resolution ladder may be any geometric sequence `b^k` (b > 1), or a precomputed list of thresholds, with the same snapping-down rule and `octaves` measured in that base.
- The overscan margin, prediction margins and predicted levels (for example two levels each way) may be other fractions or multiples of the span.
- The eviction distance may weight its three terms differently or add terms (for example the window's size in bytes), while keeping windows serving the view pinned.
- The persistent key may include any other input that changes a server frame (locale, a filter, a separation view) in place of or in addition to the plugin fingerprint; any immutable version identifier may replace the revision.
- The overlay may subtract and re-add any entity type kept by count in summaries, such as durations collapsed into summaries.

## Implementation references

- `src/remote-cache.ts` — [`WindowQuery`, `StoredWindow`, `Motion`, `Entry`](https://github.com/openchronology/timeline-app/blob/007091ce62fdb402346c0712b0c420eac0a29dff/src/remote-cache.ts#L62-L89) — window and entry records.
- `src/remote-cache.ts` — [`dyadic`, `octaves`, `covers`](https://github.com/openchronology/timeline-app/blob/007091ce62fdb402346c0712b0c420eac0a29dff/src/remote-cache.ts#L91-L106) — power-of-two levels and resolution distance from exact rationals.
- `src/remote-cache.ts` — [`ViewportCache` constants](https://github.com/openchronology/timeline-app/blob/007091ce62fdb402346c0712b0c420eac0a29dff/src/remote-cache.ts#L114-L127) — budgets, freshness and keeping time.
- `src/remote-cache.ts` — [`plan`, `level`](https://github.com/openchronology/timeline-app/blob/007091ce62fdb402346c0712b0c420eac0a29dff/src/remote-cache.ts#L144-L166) — overscanned windows at snapped levels.
- `src/remote-cache.ts` — [`get`](https://github.com/openchronology/timeline-app/blob/007091ce62fdb402346c0712b0c420eac0a29dff/src/remote-cache.ts#L173-L190), [`store`](https://github.com/openchronology/timeline-app/blob/007091ce62fdb402346c0712b0c420eac0a29dff/src/remote-cache.ts#L195-L224) — coverage lookup, singleton reconciliation and replacement.
- `src/remote-cache.ts` — [`visible`, `nearest`](https://github.com/openchronology/timeline-app/blob/007091ce62fdb402346c0712b0c420eac0a29dff/src/remote-cache.ts#L226-L262) — stand-in frames while loading.
- `src/remote-cache.ts` — [`predict`](https://github.com/openchronology/timeline-app/blob/007091ce62fdb402346c0712b0c420eac0a29dff/src/remote-cache.ts#L269-L304) — motion-ordered prefetch windows within the server limit.
- `src/remote-cache.ts` — [`snapshot`, `restore`, `release`](https://github.com/openchronology/timeline-app/blob/007091ce62fdb402346c0712b0c420eac0a29dff/src/remote-cache.ts#L306-L347) — handing windows to and from storage.
- `src/remote-cache.ts` — [`evict`, `cut`](https://github.com/openchronology/timeline-app/blob/007091ce62fdb402346c0712b0c420eac0a29dff/src/remote-cache.ts#L353-L396) — distance-ordered eviction and cutting a window to a view.
- `src/remote-cache.ts` — [`RemoteWorkspace`](https://github.com/openchronology/timeline-app/blob/007091ce62fdb402346c0712b0c420eac0a29dff/src/remote-cache.ts#L408-L799): [`put`/`delete`](https://github.com/openchronology/timeline-app/blob/007091ce62fdb402346c0712b0c420eac0a29dff/src/remote-cache.ts#L495-L516), [`evict`](https://github.com/openchronology/timeline-app/blob/007091ce62fdb402346c0712b0c420eac0a29dff/src/remote-cache.ts#L522-L555), [`beginSave`, `endSave`, `patch`](https://github.com/openchronology/timeline-app/blob/007091ce62fdb402346c0712b0c420eac0a29dff/src/remote-cache.ts#L575-L603), [`accepted`](https://github.com/openchronology/timeline-app/blob/007091ce62fdb402346c0712b0c420eac0a29dff/src/remote-cache.ts#L619-L643), [`overlay`](https://github.com/openchronology/timeline-app/blob/007091ce62fdb402346c0712b0c420eac0a29dff/src/remote-cache.ts#L683-L759) — the sparse workspace and its overlay.
- `src/remote-cache.ts` — [`applyChanges`, `regroup`](https://github.com/openchronology/timeline-app/blob/007091ce62fdb402346c0712b0c420eac0a29dff/src/remote-cache.ts#L810-L853) — materializing a document and coarsening frames.
- `src/viewport-store.ts` — [`STORED_BYTES`, `KEEP_FOR`, `fingerprint`, key functions](https://github.com/openchronology/timeline-app/blob/007091ce62fdb402346c0712b0c420eac0a29dff/src/viewport-store.ts#L15-L54) — persistent keys.
- `src/viewport-store.ts` — [`STORED_PER_REVISION`, `planSave`](https://github.com/openchronology/timeline-app/blob/007091ce62fdb402346c0712b0c420eac0a29dff/src/viewport-store.ts#L66-L110) — what to write and delete.
- `src/viewport-store.ts` — [`WindowStore`](https://github.com/openchronology/timeline-app/blob/007091ce62fdb402346c0712b0c420eac0a29dff/src/viewport-store.ts#L113-L195) — IndexedDB transactions over `windows` and `catalog`.
- `src/app.ts` — [`schedulePrefetch`, `prefetchWindow`](https://github.com/openchronology/timeline-app/blob/007091ce62fdb402346c0712b0c420eac0a29dff/src/app.ts#L978-L1020) — 400 ms settle delay, one prefetch at a time, 50 ms chaining.
- `src/app.ts` — [`cacheKey`, `storedVersion`, `restoreWindows`, `persistWindows`, visibility handling](https://github.com/openchronology/timeline-app/blob/007091ce62fdb402346c0712b0c420eac0a29dff/src/app.ts#L1022-L1091) — persistence policy in the page.
- `src/app.ts` — [`render`, cached-source path](https://github.com/openchronology/timeline-app/blob/007091ce62fdb402346c0712b0c420eac0a29dff/src/app.ts#L1786-L1912) — motion, lookup, stand-in, display threshold, 70 ms debounce, aborts, 401/403/404 and 409 handling.
- `server/store.mjs` — [overview minimum threshold](https://github.com/openchronology/timeline-app/blob/007091ce62fdb402346c0712b0c420eac0a29dff/server/store.mjs#L2100-L2106) — the server's `span / 1024` floor.
- Tests: [`test/remote-cache.test.mjs`](https://github.com/openchronology/timeline-app/blob/007091ce62fdb402346c0712b0c420eac0a29dff/test/remote-cache.test.mjs) (coverage, budgets, prediction, eviction, stand-ins, pinning, reconciliation), [`test/viewport-store.test.mjs`](https://github.com/openchronology/timeline-app/blob/007091ce62fdb402346c0712b0c420eac0a29dff/test/viewport-store.test.mjs) (keys, save plans, budgets, restore), [`test/remote-cache-browser.mjs`](https://github.com/openchronology/timeline-app/blob/007091ce62fdb402346c0712b0c420eac0a29dff/test/remote-cache-browser.mjs), [`test/viewport-store-browser.mjs`](https://github.com/openchronology/timeline-app/blob/007091ce62fdb402346c0712b0c420eac0a29dff/test/viewport-store-browser.mjs).

## Benchmarks

No benchmarks measure this mechanism directly (no run compares cache hits with misses or reports hit rates). The closest measurements exercise it as part of the editor on server timelines ("Platform") in `bench/ui.mjs`, which times each interaction from the input to the frame that paints the moments of the new view; its `loaded` helper treats a view as answered from the cache when no loading note appears within 150 ms and three frames. From [`docs/benchmarks.md`](../benchmarks.md#results) (medians, one run on an AMD Ryzen 7 7730U laptop with 16 threads, headless Chromium, PostgreSQL in Docker; this run predates later drawing speed-ups and timed zooming until the bounds fields changed):

| Interaction                 | Platform 1,000 | Platform 10,000 | Platform 100,000 |
| --------------------------- | -------------: | --------------: | ---------------: |
| Open                        |         392 ms |          266 ms |           278 ms |
| Wheel zoom                  |         109 ms |          228 ms |           274 ms |
| Drag to pan (longest frame) |          50 ms |          183 ms |           217 ms |
| Fit all                     |          30 ms |           48 ms |           139 ms |

The server-side cost of one window is the "Viewport" operation in [`docs/benchmarks.md`](../benchmarks.md#findings): 27 ms (PostgreSQL) for the whole of a 100,000-moment timeline and 11 ms for a 1 % window. [`docs/capacity.md`](../capacity.md) records that the platform's operations stay well under 100 ms up to the 200,000-moment limit, and that the browser holding a whole timeline uses about 0.6 KB per moment.

## First public disclosure

The repository has been public since its creation on 2026-10-05; commit dates on `main` are public dates.

| Component                                                                                                                                                                             | First commit         | First release containing it |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- | --------------------------- |
| Summary cache kept apart from the complete timeline (architecture text)                                                                                                               | `88aea8c` 2026-10-05 | v0.1.0                      |
| Overscanned windows, per-response limits (2,048 groups, 8 MiB), singleton reconciliation by ID, `RemoteWorkspace` sparse workspace and overlay, `regroup`, server `span / 1024` floor | `6530edf` 2026-10-07 | v0.1.0                      |
| Running cache: power-of-two levels (`dyadic`), 16 windows / 24 MiB, 30 s freshness, 5 min keeping, eviction by octaves, position and age, `nearest`, `predict` with `prefetch: true`  | `c3b04c3` 2026-10-11 | v0.1.0                      |
| IndexedDB persistence (`openchronology-viewports`, plugin `fingerprint`, 64 MiB, 30 days)                                                                                             | `8780a72` 2026-10-11 | v0.1.0                      |
| Windows a hidden page lets go of stay stored                                                                                                                                          | `0f0016b` 2026-10-11 | v0.1.0                      |
| At most 64 stored windows per revision (`STORED_PER_REVISION`)                                                                                                                        | `d20bd0c` 2026-10-12 | v0.1.0                      |

## Figures

Windows around a view `V` (span `s`), with dyadic levels `L`:

```
time ─────────────────────────────────────────────────────────────►
                         [ V ]                                   view, span s
                    [  ¼s  V  ¼s  ]                              planned window, level L
          [   2s   ][     V     ][   2s   ]                      pan prediction, level L
          [   2s   ][     V     ][   2s   ]                      zoom-out prediction, level 2L
                     [½s][ V ][½s]                               zoom-in prediction, level L/2
(each prediction narrowed so its width ≤ 1024 × its level)
```

Eviction distance of a window `e` from the focus view:

```
distance(e) = |log2(e.level / focus.level)|  +  gap / max(width(e), span)  +  minutes since used
```
