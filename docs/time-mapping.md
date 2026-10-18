# Shifting and scaling times

Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only

**Shift or scale times…** changes the times of many events (moments and durations) at once, for good ([#96](https://github.com/openchronology/timeline-app/issues/96)): every one in the timeline, or those a [separation](tags.md#separating-by-tags) would select. Use it to correct a whole timeline recorded against the wrong clock or epoch, to move one strand of a story, or to stretch or compress a period. It uses the alignment [comparisons](comparison.md) use, but changes the timeline itself rather than one view of it.

## Where it is

- **The timeline's menu** (right-click, or press and hold, on the timeline). Opened on a moment or a duration, the dialog also offers what is related to it.
- **Separated tracks** have **Shift or scale these…** in their bar. It applies to the upper track, returning to the whole timeline first.

It is offered to whoever may change the whole timeline: anyone editing a timeline in their browser or the desktop app, and writers of a server timeline.

## The mapping

Each time becomes

```
(time − around) × scale + around + offset
```

in exact rational arithmetic, as comparisons align timelines. With **Around** at zero, this is the comparison's `time × scale + offset`.

| Field  | Takes                                                                                                                                                                                                                                        |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Scale  | A positive number: an exact fraction (`3/2`) or a finite decimal (`1.5`). A positive scale keeps the order of everything it moves.                                                                                                           |
| Around | A time, written as the timeline shows them. Scaling stretches or compresses times away from it, and it stays where it is. The dialog starts with the time where you opened the menu, or the middle of the view.                              |
| Offset | A [time difference](time-presentation.md#time-differences) in the timeline's display units, such as `2 years 3 days` or `-1 h 30 min` with a Gregorian display; a plain number is in the display's unit, or in coordinates when it has none. |

## What it applies to

| Apply to                                        | Selects                                                                                                                              |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Every event                                     | Everything.                                                                                                                          |
| Those tagged / Those not tagged                 | Events with any of the tags you name, or with none of them.                                                                          |
| Related to … / Connected to … through any chain | The event the menu was opened on, and what is directly linked to it, or what any chain of [relationships](relationships.md) reaches. |

The selection is exactly what separating by the same tags or relationships shows in the upper track (or, for "not tagged", the lower one).

A duration's fixed start or end is mapped. A start or end that follows a moment keeps following it, so it moves when, and only when, that moment moves, whether or not the duration was selected. A selected duration whose ends both follow moments has nothing of its own to move.

## Before and while it works

The dialog says what will change before you apply it:

- **In the browser** (drafts, imported files, the offline edition) it counts the events that will move. Applying it is one edit, which one **Undo** reverts. When everything moves, the view moves with it, so it still shows the same moments.
- **In a desktop file of over 2,048 moments,** which the app keeps in its native store rather than the page, it is made there at once ([#179](https://github.com/openchronology/timeline-app/issues/179)), and stays unsaved: **Undo** and **Redo** take it back and forward until you save the file, and saving writes the whole file. Save other changes first; it refuses until you do. (Smaller desktop files are kept in the page, as in the browser.)
- **On the server** it is saved at once, as one version. The timeline's history keeps the version before it. The dialog says how many moments the timeline has, and warns when it is large. Save your own unsaved edits first; it refuses until you do.

While it works, a progress bar shows how far it has got. The dialog cannot be closed until it finishes.

## On the server

`POST /api/timelines/:id/map-times`, for writers:

```json
{
  "revision": "12",
  "mapping": { "scale": "2", "offset": "86400", "around": "0" },
  "filter": { "tags": ["war"], "mode": "any" }
}
```

- **`mapping`:** exact rationals or finite decimals as text, in coordinates. `around` defaults to `0`.
- **`filter`:** optional, and takes the same forms as separation queries: `{"tags": [...], "mode": "any" | "none"}` or `{"related": {"moment": "id"}, "depth": "direct" | "all", "mode": "any"}`. Without it, everything moves.
- **Refusals:** a stale `revision` is refused with 409, a reader with 403, a comparison with 409.

The server reads the timeline, maps what the filter selects, and saves those changes as one revision.

- **How it saves:**
  - In place a slice at a time ([incremental saves](architecture.md#incremental-saves)).
  - Or, when it changes over half of a timeline under 200,000 moments, by rebuilding its index, which is quicker then.
- **Locking:** other saves to the timeline wait until it finishes.
- **If the client goes away:** the server carries on.

With `Accept: application/x-ndjson` the reply streams JSON lines as it works:

```
{"progress":{"reading":true}}
{"progress":{"done":0,"total":20001}}
{"progress":{"done":5000,"total":20001}}
…
{"result":{"moved":{"moments":20000,"durations":1},"timeline":{…}}}
```

- **While rebuilding:** progress lines instead name each stage, as `{"rebuilding": "writing moments", "done": 1, "total": 7}`.
- **Failures once streaming:** a failure after the stream has started arrives as `{"error":{"status":…,"message":…}}`.
- **Without that header:** clients such as the desktop app's get one JSON reply, the `result`.
