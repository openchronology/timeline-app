# Summaries, clustering and layout of dense timelines

Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only

OpenChronology draws timelines of up to hundreds of thousands of moments (points in time) and durations (intervals) at any zoom, on exact rational coordinates. This document describes how a window of such a timeline becomes a bounded, readable picture: moments are grouped into anchored spans whose width in time is the grouping distance chosen in screen pixels; durations shorter than that distance collapse into the same summaries; the remaining duration bands are merged when they nearly coincide, packed into a bounded number of rows longest first, and the overflow is gathered behind one "more" chip; tag separation splits a timeline into two tracks that each summarize on their own; and duration background images, halos, label lanes, stacks and summary fans are laid out by fixed rules. Every grouping decision is made with exact rational arithmetic and cached subtree summaries, so dense clusters are never enumerated. Disclosed at commit [`007091c`](https://github.com/openchronology/timeline-app/tree/007091ce62fdb402346c0712b0c420eac0a29dff); first public disclosure: see [First public disclosure](#first-public-disclosure).

## Field and problem

A timeline viewer must turn an arbitrary set of time coordinates into a picture whose size depends on the screen, not on the data. The difficulties are concrete:

- **Density is unbounded.** A window may hold 5,000 moments at one instant, a million spread over a decade, or both. Drawing one marker per moment overlaps them into an unreadable smear, and building one DOM element per moment makes each frame cost the data's size.
- **Coordinates are exact rationals.** Times are arbitrary-precision fractions ([rational time](rational-time.md)). Converting them to floating point to bin them into pixels breaks at large magnitudes or deep zoom: two distinct times can round to the same float, and pixel bins computed from floats drift as the view pans.
- **Neighbour chaining collapses everything.** The obvious clustering rule, "merge two points if they are closer than _d_", chains: a sequence of points each _d_/2 apart merges into a single group however long it is, so a uniformly busy decade becomes one dot covering the whole screen.
- **Fixed pixel bins depend on the view origin.** Binning by `floor((t - left) / binWidth)` changes every group's membership on each pan, and requires visiting every point to place it.
- **Durations interact with moments.** A duration shorter than a pixel or two cannot be drawn as a band, yet must not disappear. Thousands of durations over nearly the same span stack into thousands of rows. Long durations hide short ones beneath them.
- **Counts must be exact.** A summary saying "2,340" must hold exactly 2,340 entities, even when the server sends no members, and counts may exceed 2^53.

## Summary of the mechanism

1. The grouping distance is chosen in screen pixels (**Group within**, 12–48 px, default 24) and converted to an exact rational threshold `threshold = span × P / W` for a view of width `W` pixels.
2. Moments are grouped by **anchored spans**: the earliest coordinate in the window opens a group, every later coordinate `t` with `t − anchor < threshold` joins it, and the next coordinate at or beyond `anchor + threshold` opens the next group. Each group reports its exact first and last coordinate, its total moment count and its count of distinct coordinates. Groups are computed by range folds over a balanced tree whose nodes cache subtree summaries, so a dense group costs a few node visits, not one per moment.
3. Durations whose extent is below the threshold **collapse**: they are grouped among themselves by their starts with the same anchored-span rule, then merged into the nearby moment groups by a coalescing pass that keeps every merged group narrower than the threshold.
4. The remaining durations are drawn as bands. At most 256 are sent per window, the longest first. Bands whose start and end both lie within the grouping distance of an existing band's are drawn as that band ("Title + N more"). Bands claim rows longest first; at most a screen-dependent number of rows (3 to 16) is drawn, and the rest go behind one "＋N more durations" chip.
5. Moments are separated into tracks by tags by building two filtered views of the saved timeline, each with its own full index, so each track summarizes with the same rules.
6. Visual layout rules keep the picture readable: duration background images fade in with width and fade at edges inside the view, smaller durations draw above larger ones, a halo separates the timeline from images, labels alternate across four lanes, stack cards are drawn only near the screen, and summaries of two to five moments fan out on hover.

## Detailed description

### Grouping threshold

The view is the closed interval `[left, right]` with `span = right − left > 0` (an exact rational). The drawable width `W` is the stage width minus two side insets, at least 1 pixel. The grouping distance in pixels is

```
P = round(density × baseScale × max(1, textScale))
```

where `density` is the **Group within** slider (integer, 12 to 48, default 24), `baseScale` is 0.75 on compact (phone) screens and 1 otherwise, and `textScale` is the timeline theme's label-size multiplier, so larger labels group sooner. Both pixel quantities enter rational arithmetic only after quantization to 1/1024 pixel:

```
screenQ(x) = round(x × 1024) / 1024           (exact rational)
threshold  = span × screenQ(P) / screenQ(max(1, W))
```

The threshold is therefore an exact rational that scales with the zoom and does not change when the view pans. Absolute coordinates never become floating-point numbers; only the final screen position of each marker does.

### Anchored-span grouping of moments

Moments are stored in a persistent AVL tree keyed by exact rational time (`RationalMap` from the vendored `rational-ordered-map` library). Each key holds a bucket of the moments at that exact time, and its weight is the bucket's size. Each node caches a summary of its subtree:

| Field           | Meaning                                                    |
| --------------- | ---------------------------------------------------------- |
| `firstTime`     | Smallest key in the subtree                                |
| `lastTime`      | Largest key in the subtree                                 |
| `entryCount`    | Sum of weights (moments), a BigInt                         |
| `distinctCount` | Number of keys (distinct coordinates)                      |
| `maxGap`        | Largest gap between consecutive keys (used by `neighbors`) |

Summaries combine associatively: `combine(a, b) = {a.firstTime, b.lastTime, a.entryCount + b.entryCount, a.distinctCount + b.distinctCount, max(a.maxGap, b.firstTime − a.lastTime, b.maxGap)}`.

The overview in `span` mode is:

```
overview(lower, upper, threshold):          # window [lower, upper], upper inclusive
  if threshold == 0: return one group per distinct key in the window
  groups = []
  anchor = smallest key >= lower                         # O(height)
  while anchor exists and anchor <= upper:
    cutoff  = anchor + threshold                         # exact
    clipped = upper < cutoff
    range   = [anchor, clipped ? upper (inclusive) : cutoff (exclusive))
    groups.push(aggregate(root, range))                  # range fold over cached summaries
    if clipped: break
    anchor  = smallest key >= cutoff                     # the key at exactly cutoff starts the next group
  return groups
```

`aggregate` is a standard range fold: a subtree entirely inside the range contributes its cached summary without being descended, a subtree entirely outside is skipped, and only the two boundary paths are walked. Properties that follow:

- **Bounded width.** Every group satisfies `last − first < threshold`, so on screen it is narrower than `P` pixels. No chain of near neighbours can merge a whole viewport.
- **Strict boundary.** A coordinate at exactly `anchor + threshold` starts a new group (the range is half-open at `cutoff`). Equality is decided exactly, because coordinates and the threshold are rationals.
- **Zero threshold.** With `threshold = 0` there is one group per distinct coordinate, so coincident moments stay together at any zoom; a group whose `distinct` is 1 cannot be zoomed into further (double-clicking it does nothing).
- **Exact counts.** `count` is the sum of weights as a BigInt and travels as a decimal string; `distinct` is a number of distinct times.
- **Identity of singletons.** A group of exactly one moment carries that moment's ID, title and (on servers) a bounded plugin projection of its metadata, so it is drawn as the moment itself.
- **Anchors follow the window.** The first anchor is the first coordinate at or after the window's lower bound. In the browser's in-memory index the window is the view, so anchors move as the view pans; for server and desktop timelines the window is a cached overscanned window ([viewport cache](viewport-cache.md)) whose bounds stay fixed while the view pans inside it.

Why not neighbour chaining: the library also offers a `neighbors` mode, which merges consecutive keys whose gap is below the threshold (and consumes a subtree whole when its cached `maxGap` is below the threshold). It is not used for display, because a group's width is then unbounded.

The same rule is implemented four times, checked against each other by oracle tests:

- **Browser:** `RationalMap.overview(..., 'span', {includeUpper: true})`, called from `TimelineIndex.frame` in `src/core.ts`.
- **PostgreSQL:** `oc_overview_v2` in `server/schema.sql` walks the `oc_nodes` AVL tree (one row per distinct time, with cached `first_time`, `last_time`, `event_count`, `distinct_count`) with an explicit stack in time order. A candidate (a single node time, or a whole subtree) closes the open group when `a − current_a >= threshold`; it joins the open group whole when it lies inside the window and is a single time, has one distinct time, or ends less than `threshold` after the group's anchor; otherwise it is split into left subtree, own time and right subtree. `test/sql-oracle.mjs` checks a 5,000-moment cluster at one time is summarized with one node visit.
- **SQLite:** the `span` function in `vendor/sqlite-rational/src/index.c`, exposed through the `rational_index` virtual table with `mode='span'`, used by the desktop app (`native-store`).
- **HTTP minimum resolution:** the server raises a requested threshold to at least `(upper − lower) / 1024` (also when zero is requested). Since every anchor after the first is at least one threshold beyond the previous one, a response holds at most 1,025 moment groups. The effective threshold is returned as `threshold`.

### Collapsed durations

A duration resolves to a closed interval `[first, last]` (its endpoints ordered; an endpoint anchored to a moment takes that moment's time). It **collapses** at a threshold when `last − first < threshold`; at a zero threshold (no grouping) nothing collapses. A collapsed duration is not drawn as a band. It is summarized like a moment keyed by its start, in two steps.

**Step 1: clusters of collapsed durations** (`durationSummaries`). Durations are held in an augmented balanced interval tree ordered by `(start, ID)` (IDs compared in code-unit order). Each node caches: `min` (smallest start), `max` (largest end), `maxFirst` (largest start), `minLast` (smallest end), `count`, `minExtent`, `maxExtent`, `minId`. The walk visits subtrees in start order with an explicit stack:

```
earliest = lower − threshold
for each subtree n in start order:
  skip n if n.max < lower or n.min > upper            # outside the window
  skip n if n.maxFirst <= earliest                    # a collapsed duration reaching the window starts after lower − threshold
  skip n if n.minExtent >= threshold                  # nothing in it collapses
  whole = n.maxExtent < threshold and n.min >= lower and n.maxFirst <= upper
  base  = (open cluster and n.min − anchor < threshold) ? anchor : n.min
  if whole and n.maxFirst − base < threshold:
      join(n.min, n.max, n.count)                     # the whole subtree, from cached fields
  else descend: left subtree, own duration (if it touches the window and collapses), right subtree

join(first, end, k):
  if open cluster and first − anchor >= threshold: close it
  if no open cluster: anchor = first
  cluster.last = max(cluster.last, end);  cluster.count += k
```

A cluster records `first` (its anchor), `last` (the latest end of its members, not the latest start) and `count`; a cluster of exactly one duration also carries that duration's band. The skip rule `maxFirst <= lower − threshold` is valid because a collapsed duration that reaches `lower` has `end >= lower` and `end − start < threshold`, so `start > lower − threshold`.

PostgreSQL (`oc_duration_overview`) and SQLite compute the same clusters on the server and desktop side; their walks and indexes are described in [persistent interval index](persistent-interval-index.md).

**Step 2: coalescing** (`coalesceGroups`). Moment groups and duration clusters (converted to the group form with `count = 0` and `durationCount = k`) are sorted by `first`, moments before durations at an equal start, and merged left to right:

```
for g in sorted groups:
  prev = last output group
  if prev and (g.first == prev.first or g.last − prev.first < threshold):
     prev = { first: prev.first,
              last: max(prev.last, g.last),
              count: prev.count + g.count,
              distinct: prev.distinct + g.distinct − (both > 0 and prev.last == g.first ? 1 : 0),
              durationCount: prev.durationCount + g.durationCount }
  else append g
```

Members are never reconstructed: counts add exactly, and the distinct count subtracts one where two blocks share a boundary coordinate. Two moment groups produced at the same threshold never merge (the second starts at least one threshold after the first's anchor), so at equal threshold this pass only folds duration clusters into the moment groups they overlap. The same function also coarsens a cached frame fetched at a finer threshold to the view's own threshold (`regroup`); there, moment groups do merge, and each merged block still spans less than the threshold.

A group with exactly one collapsed duration and no moments carries that duration and is drawn as a small capsule marker that opens the duration. Any other group is a numbered summary: clicking lists its moments 25 at a time and the collapsed durations inside it; double-clicking fits the view to `[first, last]` (`Viewport.fit`: the extent × 7/5, centred).

Relationship arcs reuse the duration interval tree: each relationship is an interval between its endpoints' times (a duration endpoint counts as its start), so arcs shorter than the threshold are left out the same way, and at most 256 are drawn.

### Duration bands in dense windows

**Selecting what is sent: the exact 256 longest, best-first.** For one window, at most `limit = 256` non-collapsed durations touching `[lower, upper]` are returned (`durationWindow`). When more touch it, the 256 longest are kept (ranked by extent descending, then start ascending, then ID in code-unit order) and returned in start order, so an era that starts after thousands of short spans is still sent. The browser finds exactly these 256 without visiting every match, using three predicates on the interval tree's cached fields:

```
reaches(n) = n.min <= upper and n.max >= lower and n.maxExtent >= threshold   # subtree may hold a match
whole(n)   = n.maxFirst <= upper and n.minLast >= lower and n.minExtent >= threshold  # every entry matches
matches(n) = n.first <= upper and n.last >= lower and n.extent >= threshold   # the node's own duration
```

(with no threshold, the extent conditions are dropped). Then:

```
# 1. Capped count of matches
count = 0
tally(n): if n is null or count > 10000 or not reaches(n): return
          if whole(n): count += n.count; return            # cached subtree size
          if matches(n): count += 1
          tally(n.left); tally(n.right)

# 2. Best-first selection with a binary max-heap of entries
#    entry = (subtree n, tree=true)  ranked by (n.maxExtent desc, n.min asc, n.minId asc)
#          | (duration n, tree=false) ranked by (n.extent desc, n.first asc, n.id asc)
#    at equal rank a subtree comes before a duration (it may hold that very duration)
push (root, tree) if reaches(root)
while heap not empty and kept.size < 256:
  e = pop()
  if e is a duration: kept.append(e); continue
  if matches(e.node): push (e.node, duration)
  for child in (left, right): if child and reaches(child): push (child, tree)
sort kept by (start, ID)
truncated = count > 256;  durationsTotal = min(count, 10000);  durationsTotalMore = count > 10000
```

A subtree's rank is an upper bound on every duration inside it (its longest extent; its earliest start; `minId`, the ID of its first band in `(start, ID)` order, which is the smallest ID among bands at that earliest start), so a duration popped from the heap is never outranked by one still unexplored: the popped sequence is exactly the global ranking, and the loop stops after the 256th. The heap work therefore follows the 256 kept times the tree height, not the number of matches; the count stops descending once it passes `DURATION_COUNT_CAP = 10000` and is reported as "10,000+". Exact comparisons cross-multiply each rational's numerator and denominator, read once per rational and cached in a `WeakMap`, instead of re-parsing. Bands are sent with a bounded metadata projection (`durationOverview`). How PostgreSQL and SQLite choose the same 256 (the first 10,001 matches in start order, then ranked) is described in [persistent interval index](persistent-interval-index.md).

**Grouping near-identical bands** (`arrangeDurations`). Bands in view are ranked by extent descending, then start, title and ID (`compareDurationRank`). Positions are converted to pixels relative to the start of the top-ranked band, `x = sign(t − origin) × pixels(|t − origin|)`, so they depend on the zoom but not on the pan. In rank order, each band joins the first existing group (of the same source timeline) whose leader satisfies

```
|leader.x0 − x0| < P   and   |leader.x1 − x1| < P
```

(strictly less, matching the moment rule), otherwise it becomes a new leader. A group with members is drawn as its leader labelled "_Title_ + N more" with a solid double outline, and opens a list of its members.

**Rows.** Groups claim rows in the same rank order: each takes the lowest-numbered row in which every already placed band either ends at or before its start or starts at or after its end (touching bands may share a row). Long eras therefore take the top rows and the details within them go below, and the assignment depends only on the durations, so panning does not reshuffle rows. The number of rows drawn is

```
maxRows = clamp( floor((stageHeight / 2 / uiScale − 45) / 13), 3, compact ? 8 : 16 )
```

the rows that fit under a vertically centred axis, where bands start 35 px below the axis (axis at 192 px, first row at 227 px) and rows are 13 px apart. A group that would need row `maxRows` or beyond is hidden.

**The "more" chip.** Per source timeline, the hidden bands, plus (for the main timeline) any durations the window holds beyond the 256 sent (`durationsTotal − sent`), are represented by one chip "＋N more durations ▾" placed on the row after the last used row (at most row `maxRows`). It spans the visible extent of the hidden bands (at least 150 px wide), or the whole width when unsent durations are included. Choosing it lists the hidden bands, or, when the window was truncated, queries every duration touching the view (`{"kind": "durations", "overlapping": true, ...}`), paged 25 at a time and sortable by extent, start or title.

An older function `durationLanes` (rows by start, longer first) remains exported and tested but is not used for drawing.

### Separating moments into tracks by tags

**Separate by tags** splits a timeline into the entities carrying any of the chosen tags and the rest (`filterMembership` with `mode: 'any'` and `mode: 'none'`). Each side is built as a filtered document (`filterDocument`): durations are first resolved to fixed endpoints, because the moment a duration follows may be on the other side; relationships stay only when both ends are on the same side. Each side is then a complete index of its own (in the browser two `TimelineIndex`es; on PostgreSQL the `oc_views`, `oc_view_nodes` and `oc_view_duration_nodes` tables built on first use and reused for that revision, with the eight most recent views kept per timeline; on the desktop a derived copy of the file), so summaries, collapsed durations and bands of each track follow exactly the rules above within that track. A related variant selects an entity and everything reachable from it by relationships (breadth-first, `direct` or `all` depth).

The two tracks share one viewport and use the comparison layout: each track's block is `340 px` tall plus room for the tallest stack above and below its axis (`depth × 72 − 40` px for a stack of `depth` cards), stacked vertically. Both tracks are read-only.

### Markers, label lanes and stacks

- A group's marker sits at the exact midpoint `(first + last) / 2` of its span; a marker whose midpoint is outside `[0, W]` is not drawn. Summaries of more than 999 entities get a larger style.
- Captions alternate across four lanes in time order: lanes 0 and 1 above the axis at `160 − labelHeight − lane × labelRow`, lanes 2 and 3 below it at `272 + (lane − 2) × labelRow`, where `labelHeight = 32 × textScale` and `labelRow = labelHeight + 11` (pixels at UI scale 1). Stems join each caption to the axis.
- **Stacks** (a plugin field holding a list of cards under one moment) grow away from the axis from the moment's caption: the card `i` sits at `start + i × step`, with `step = ±72` px and `start = labelTop − 24` above the axis or `labelTop + 55` below. Only the cards inside the visible band, extended by 80 px above and below, are created (`stackWindow` computes the first and last index by solving `start + i × step` against those limits), so a stack of thousands of cards costs only what is on screen.
- **UI scale** (20 % to 300 %) scales presentation around an anchor point: `offset' = anchor − (anchor − offset) × scale' / scale`. Time coordinates are not affected.

### Summary fans

When the **summary expansion** plugin is enabled, a summary of two to five moments fans its members out around it after 100 ms of hover or at once on keyboard focus. The members are loaded with one bounded events query and laid out evenly on a circle starting straight up:

```
s      = max(0.05, min(uiScale, W / 240, H / 240))
radius = 62 s,  margin = 50 s
centre = (clamp(x, radius + margin, W − radius − margin), clamp(y, ...))
member i = centre + radius × (cos(−π/2 + 2πi/n), sin(−π/2 + 2πi/n))
```

The fan is abandoned (silently) when the load returns another page, a number of moments different from the summary's count, fewer than two or more than five, or duplicate IDs, or when the data generation, the summary's on-screen position or its identity key (`[first, last, count, sourceKey]`) changed during the load. It closes 400 ms after pointer and focus leave the summary, the fan and the hover card, and at once when the view or data changes. It keeps no member cache.

### Duration backgrounds and halos

A duration may carry a background image (a plugin field). For each band in view with an image:

- The image box spans the visible part `[max(0, start), min(Wstage, end)]` of the duration; the image inside it is as wide as the stage, centred between the visible start and end.
- **Opacity by width.** With `F = 48` px (`BACKGROUND_FADE`) and `w = end − start` in pixels (the whole duration, not only its visible part):

  ```
  t       = clamp((w − 2F) / (2F), 0, 1)
  opacity = t² (3 − 2t)          # smoothstep: 0 at <= 96 px, 1 at >= 192 px
  ```

  A narrowing duration fades out the way the ruler's finest marks do; collapsed durations have no band and show no background.

- **Edge fades.** Each edge of the duration that lies inside the view fades to transparent over `min(F, visibleWidth / 2)` px with a CSS mask gradient; an edge beyond the view (where the duration continues) does not fade.
- **Order.** Boxes are ordered by extent: larger durations get lower `z-index`, so smaller, more specific durations draw above the eras containing them. The timeline's own backdrop lies beneath all of them.

While any background, backdrop or theme background colour shows, the stage gets the `over-backgrounds` class, which adds a **halo** in the theme's halo colour: captions get a translucent backing with a 3 px backdrop blur and text shadows; tick labels and bands get text shadows only; markers and stems get stacked `drop-shadow` filters (1, 2 and 4 px), which follow their shapes; the axis line and tick notches get a box shadow; and relationship arcs get a separate 5 px halo stroke drawn beneath each arc at 0.8 opacity. Layers that fill the stage use shadows or strokes rather than a filter, because a filter on a full-stage layer is repainted every frame and made panning lag.

### Relationship arcs

An arc between screen positions `xa` and `xb` on the axis rises `lift = min(150, 18 + 0.3 × |xb − xa|)` px at its middle: the parabola `y = axis − 4 · lift · t (1 − t)`. Only the part over the stage (plus a margin) is emitted, as a quadratic Bézier from `x0` to `x1` whose control point is at `xm = (x0 + x1)/2`, `y = 2·y(xm) − (y(x0) + y(x1))/2`, which reproduces the same parabola. This avoids coordinates millions of pixels off screen, which browsers draw as a few straight chords whose height jumps as the view pans.

### Complexity

Let `n` be the number of distinct coordinates, `h = O(log n)` the tree height, `G` the number of groups and `B ≤ 256` the bands drawn.

- Moment overview: `O(G · h)` node visits and `O(G)` output, independent of the number of moments inside each group; at most 1,025 groups per server response.
- Collapsed-duration clusters: about `O(C · h)` when whole subtrees collapse (`C` clusters); mixed long and short durations degrade towards visiting the mixed subtrees.
- Coalescing: `O(m log m)` for `m` input groups.
- Band selection: heap work proportional to `256 · h` plus the capped count (at most 10,001 matches).
- Band grouping and rows: `O(B²)` comparisons in the worst case, with `B ≤ 256`.
- Stack cards: `O(visible cards)`.

### Variations

- The grouping distance may be any positive rational derived from any screen measure (pixels, ems, physical millimetres), or a fixed time width; the rule only needs a threshold.
- The cached subtree summary may carry any associative aggregate (sums of weights, min/max of a metadata field, counts by category), and the anchored-span fold returns it per group at the same cost.
- The anchor may be the latest coordinate with groups formed backwards (`first − t < threshold` from the right edge), or anchors may be aligned to a fixed grid of multiples of the threshold, with the same range-fold implementation.
- Any interval entity (durations, arcs, ranges of uncertainty) can collapse into point summaries when its extent is below the threshold, keyed by its start, its end or its midpoint.
- The band-merging tolerance may differ from the moment grouping distance, and the row cap may come from any available height.

## Implementation references

- `src/core.ts` — [`FrameGroup`](https://github.com/openchronology/timeline-app/blob/007091ce62fdb402346c0712b0c420eac0a29dff/src/core.ts#L197-L209) — the group record: exact `first`/`last`, decimal `count`, `distinct`, `durationCount`, singleton `id`/`title`/`metadata` or `duration`.
- `src/core.ts` — [`TimelineIndex.frame`](https://github.com/openchronology/timeline-app/blob/007091ce62fdb402346c0712b0c420eac0a29dff/src/core.ts#L570-L613) — browser overview: anchored spans, bands, arcs, collapsed-duration clusters and coalescing.
- `src/core.ts` — [`screenQ`](https://github.com/openchronology/timeline-app/blob/007091ce62fdb402346c0712b0c420eac0a29dff/src/core.ts#L628-L631), [`Viewport.threshold`](https://github.com/openchronology/timeline-app/blob/007091ce62fdb402346c0712b0c420eac0a29dff/src/core.ts#L706-L708) — pixel quantization to 1/1024 and the rational threshold.
- `vendor/rational-ordered-map-0.1.0.tgz` — [`package/dist/map.js`, `RationalMap.overview`](https://github.com/openchronology/timeline-app/blob/007091ce62fdb402346c0712b0c420eac0a29dff/vendor/rational-ordered-map-0.1.0.tgz) — the persistent AVL map with cached summaries and the `span`/`neighbors` overview (upstream commit in [`vendor/versions.json`](https://github.com/openchronology/timeline-app/blob/007091ce62fdb402346c0712b0c420eac0a29dff/vendor/versions.json)).
- `server/schema.sql` — [`oc_overview_v2`](https://github.com/openchronology/timeline-app/blob/007091ce62fdb402346c0712b0c420eac0a29dff/server/schema.sql#L235-L306) — the PostgreSQL anchored-span walk over `oc_nodes`.
- `server/store.mjs` — [overview query](https://github.com/openchronology/timeline-app/blob/007091ce62fdb402346c0712b0c420eac0a29dff/server/store.mjs#L2100-L2183) — minimum threshold `span / 1024`, the 256 longest bands, arcs, collapsed clusters and coalescing.
- `vendor/sqlite-rational/src/index.c` — [`span`](https://github.com/openchronology/timeline-app/blob/007091ce62fdb402346c0712b0c420eac0a29dff/vendor/sqlite-rational/src/index.c#L299-L337) — the SQLite virtual-table implementation used by the desktop app.
- `src/summaries.ts` — [`durationGroups`](https://github.com/openchronology/timeline-app/blob/007091ce62fdb402346c0712b0c420eac0a29dff/src/summaries.ts#L10-L19), [`entityCount`](https://github.com/openchronology/timeline-app/blob/007091ce62fdb402346c0712b0c420eac0a29dff/src/summaries.ts#L21-L23), [`coalesceGroups`](https://github.com/openchronology/timeline-app/blob/007091ce62fdb402346c0712b0c420eac0a29dff/src/summaries.ts#L30-L59) — cluster conversion and coalescing.
- `src/durations.ts` — [`durationTree`](https://github.com/openchronology/timeline-app/blob/007091ce62fdb402346c0712b0c420eac0a29dff/src/durations.ts#L185-L234) — augmented interval tree and its cached fields.
- `src/durations.ts` — [`collapses`](https://github.com/openchronology/timeline-app/blob/007091ce62fdb402346c0712b0c420eac0a29dff/src/durations.ts#L268-L270), [`durationSummaries`](https://github.com/openchronology/timeline-app/blob/007091ce62fdb402346c0712b0c420eac0a29dff/src/durations.ts#L518-L586) — the collapse rule and cluster walk.
- `src/durations.ts` — [`durationWindow`](https://github.com/openchronology/timeline-app/blob/007091ce62fdb402346c0712b0c420eac0a29dff/src/durations.ts#L299-L402) — the 256 longest bands best-first and the capped count (`DURATION_COUNT_CAP`, [L275](https://github.com/openchronology/timeline-app/blob/007091ce62fdb402346c0712b0c420eac0a29dff/src/durations.ts#L275)).
- `src/durations.ts` — [`compareDurationRank`](https://github.com/openchronology/timeline-app/blob/007091ce62fdb402346c0712b0c420eac0a29dff/src/durations.ts#L412-L421), [`arrangeDurations`](https://github.com/openchronology/timeline-app/blob/007091ce62fdb402346c0712b0c420eac0a29dff/src/durations.ts#L440-L504) — band grouping and row assignment.
- `src/app.ts` — [`width`, `pixels`](https://github.com/openchronology/timeline-app/blob/007091ce62fdb402346c0712b0c420eac0a29dff/src/app.ts#L929-L934), [`baseScale`](https://github.com/openchronology/timeline-app/blob/007091ce62fdb402346c0712b0c420eac0a29dff/src/app.ts#L890) — the grouping distance in pixels.
- `src/index.html` — [`#density`](https://github.com/openchronology/timeline-app/blob/007091ce62fdb402346c0712b0c420eac0a29dff/src/index.html#L412-L422) — the **Group within** slider (12–48, default 24).
- `src/app.ts` — [`drawFrame`](https://github.com/openchronology/timeline-app/blob/007091ce62fdb402346c0712b0c420eac0a29dff/src/app.ts#L1427-L1748) — markers at group midpoints, four label lanes ([L1572-L1574](https://github.com/openchronology/timeline-app/blob/007091ce62fdb402346c0712b0c420eac0a29dff/src/app.ts#L1572-L1574)), stack cards ([L1600-L1620](https://github.com/openchronology/timeline-app/blob/007091ce62fdb402346c0712b0c420eac0a29dff/src/app.ts#L1600-L1620)).
- `src/app.ts` — [`comparisonRows`](https://github.com/openchronology/timeline-app/blob/007091ce62fdb402346c0712b0c420eac0a29dff/src/app.ts#L1285-L1314) — track heights for separations and comparisons.
- `src/app.ts` — [`zoomGroup`](https://github.com/openchronology/timeline-app/blob/007091ce62fdb402346c0712b0c420eac0a29dff/src/app.ts#L4398-L4404) — double-click zoom to a group.
- `src/app.ts` — [`renderEdgeArcs`](https://github.com/openchronology/timeline-app/blob/007091ce62fdb402346c0712b0c420eac0a29dff/src/app.ts#L9477-L9564) — arc lift and halo strokes.
- `src/app.ts` — [`BACKGROUND_FADE`](https://github.com/openchronology/timeline-app/blob/007091ce62fdb402346c0712b0c420eac0a29dff/src/app.ts#L9581), [`backgroundOpacity`](https://github.com/openchronology/timeline-app/blob/007091ce62fdb402346c0712b0c420eac0a29dff/src/app.ts#L9637-L9640), [`renderDurationBackgrounds`](https://github.com/openchronology/timeline-app/blob/007091ce62fdb402346c0712b0c420eac0a29dff/src/app.ts#L9641-L9708) — background placement, fades, ordering and the halo class.
- `src/app.ts` — [`durationRows`](https://github.com/openchronology/timeline-app/blob/007091ce62fdb402346c0712b0c420eac0a29dff/src/app.ts#L9719-L9722), [`renderDurationBands`](https://github.com/openchronology/timeline-app/blob/007091ce62fdb402346c0712b0c420eac0a29dff/src/app.ts#L9729-L9884) — row cap, band drawing and "more" chips.
- `src/styles.css` — [halo rules](https://github.com/openchronology/timeline-app/blob/007091ce62fdb402346c0712b0c420eac0a29dff/src/styles.css#L694-L738) — `.over-backgrounds` backings, shadows, filters and arc halo strokes.
- `src/stack-layout.ts` — [`scaleTimeline`, `stackWindow`](https://github.com/openchronology/timeline-app/blob/007091ce62fdb402346c0712b0c420eac0a29dff/src/stack-layout.ts#L5-L30) — UI scaling around an anchor and the visible range of stack cards.
- `src/summary-expansion.ts` — [`radialPositions`](https://github.com/openchronology/timeline-app/blob/007091ce62fdb402346c0712b0c420eac0a29dff/src/summary-expansion.ts#L26-L48), [`createSummaryExpansion`](https://github.com/openchronology/timeline-app/blob/007091ce62fdb402346c0712b0c420eac0a29dff/src/summary-expansion.ts#L57-L332) — summary fans.
- `src/tags.ts` — [`filterDocument`](https://github.com/openchronology/timeline-app/blob/007091ce62fdb402346c0712b0c420eac0a29dff/src/tags.ts#L62-L89), [`filterMembership`](https://github.com/openchronology/timeline-app/blob/007091ce62fdb402346c0712b0c420eac0a29dff/src/tags.ts#L94-L114) — the two sides of a separation.
- `src/relationships.ts` — [`edgeTree`](https://github.com/openchronology/timeline-app/blob/007091ce62fdb402346c0712b0c420eac0a29dff/src/relationships.ts#L151-L161), [`arcPath`](https://github.com/openchronology/timeline-app/blob/007091ce62fdb402346c0712b0c420eac0a29dff/src/relationships.ts#L184-L212) — arcs as intervals and the clipped parabola.
- Tests: [`test/summaries.test.mjs`](https://github.com/openchronology/timeline-app/blob/007091ce62fdb402346c0712b0c420eac0a29dff/test/summaries.test.mjs) (brute-force reference for moments and collapsed durations; coalescing), [`test/sql-oracle.mjs`](https://github.com/openchronology/timeline-app/blob/007091ce62fdb402346c0712b0c420eac0a29dff/test/sql-oracle.mjs) (PostgreSQL against the browser; one node visit for a 5,000-moment cluster), [`test/summaries-equivalence.test.mjs`](https://github.com/openchronology/timeline-app/blob/007091ce62fdb402346c0712b0c420eac0a29dff/test/summaries-equivalence.test.mjs), [`test/durations.test.mjs`](https://github.com/openchronology/timeline-app/blob/007091ce62fdb402346c0712b0c420eac0a29dff/test/durations.test.mjs), [`test/summary-expansion.test.mjs`](https://github.com/openchronology/timeline-app/blob/007091ce62fdb402346c0712b0c420eac0a29dff/test/summary-expansion.test.mjs).

## Benchmarks

From [`docs/benchmarks.md`](../benchmarks.md#findings), a local run (16 cores, Node 26, PostgreSQL 16 in Docker, `BENCH_TIME=1000`), mean time to compute a viewport frame (summaries, bands and arcs) on generated timelines (`bench/generate.mjs`: two thirds of moments in dense clusters with coincident times, one duration and one relationship per ten moments), with thresholds for a 1,000-pixel view:

| Operation                    |    Size |          In-memory | SQLite | PostgreSQL |
| ---------------------------- | ------: | -----------------: | -----: | ---------: |
| Viewport: whole timeline     |   1,000 |             3.3 ms | 7.1 ms |      10 ms |
|                              |  10,000 |              13 ms |  16 ms |      14 ms |
|                              | 100,000 | 292 ms (p50 50 ms) |  31 ms |      27 ms |
| Viewport: 1% of the timeline |   1,000 |             0.7 ms | 1.9 ms |     3.0 ms |
|                              |  10,000 |             6.3 ms | 8.5 ms |     7.5 ms |
|                              | 100,000 |             8.4 ms |  14 ms |      11 ms |

The same document records that computing collapsed-duration summaries set-based over an index on starts (and pruning by start in the browser) took the 100,000-moment whole-timeline frame from 945 ms to 31 ms on SQLite and from 99 ms to 27 ms on PostgreSQL, and the in-memory 1 % window from 34 ms to 8.4 ms.

`bench/ui.mjs` includes the **group-summary** interaction (clicking a summary until its list shows, budget 1 s) and **dense-durations** (a drag across 5,000 durations over the same span beside 18 longer staggered ones, which the editor groups and caps every frame, timed by its longest frame, budget 150 ms); [`docs/benchmarks.md`](../benchmarks.md#interactions) describes them, but its published result tables do not list those two rows. [`docs/durations.md`](../durations.md#storage-and-queries) states that a drag over 5,000 identical spans computes each frame in about 3 ms; no script output for that figure is recorded in `docs/benchmarks.md`.

## First public disclosure

The repository has been public since its creation on 2026-10-05; commit dates on `main` are public dates.

| Component                                                                                                                                              | First commit                    | First release containing it |
| ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------- | --------------------------- |
| Anchored-span moment grouping (`span` mode, `oc_overview`, **Group within**)                                                                           | `88aea8c` 2026-10-05            | v0.1.0                      |
| Stack card window (`stackWindow`), `oc_overview_v2`                                                                                                    | `5929cca` 2026-10-06            | v0.1.0                      |
| Summary fans (`radialPositions`, `summary-fan`), HTTP minimum threshold `span / 1024`                                                                  | `6530edf` 2026-10-07            | v0.1.0                      |
| Duration interval tree and band window (`durationWindow`)                                                                                              | `e067a17` 2026-10-07            | v0.1.0                      |
| Collapsed durations and coalescing (`durationSummaries`, `coalesceGroups`, `oc_duration_overview`)                                                     | `2412634` 2026-10-08            | v0.1.0                      |
| Tag separation into tracks (`filterDocument`)                                                                                                          | `aaca6be` 2026-10-08            | v0.1.0                      |
| Relationship arcs on the interval tree (`edgeTree`, arc lift)                                                                                          | `2f57db4` 2026-10-08            | v0.1.0                      |
| Duration backgrounds: width opacity and edge fades (`BACKGROUND_FADE`, `backgroundOpacity`); halo (`over-backgrounds`)                                 | `07f8a9a`, `67cab90` 2026-10-19 | v0.2.0                      |
| Clipped parabolic arcs (`arcPath`)                                                                                                                     | `e44216b` 2026-10-25            | v0.9.3                      |
| Dense windows: longest-first rows, near-identical band grouping, row cap and "more" chip (`arrangeDurations`, `compareDurationRank`, `durationsTotal`) | `fc240cb` 2026-10-25            | v0.9.4                      |

The function name `durationRows` first appears in `61c0f77` (2026-10-08, v0.1.0); its current rule (3 to 8/16 rows by available height) dates from `fc240cb`.

## Figures

Anchored spans against neighbour chaining, threshold `T`, points evenly spaced `0.4 T` apart:

```
time  ──●──●──●──●──●──●──●──●──●──●──►
span:   [●  ●  ●]  [●  ●  ●]  [●  ●  ●]  [●       each group: last − anchor < T
        anchor     anchor     anchor     anchor   (a point at exactly anchor + T opens the next)
chain:  [●  ●  ●  ●  ●  ●  ●  ●  ●  ●]            every gap < T: one group for everything
```

Rows of bands beneath the axis, ranked longest first, with a row cap of 3:

```
axis ─────────────────────────────────────────────
row 0  [══════════════ Era ═══════════════════]
row 1     [══ Reign A ══]   [══ Reign B ══ + 12 more]
row 2       [War]  [Treaty]     [Famine]
row 3   [ ＋1,234 more durations ▾ ]                (bands that need row 3 or more, and unsent ones)
```
