# Timeline and query contract

The browser model is `RationalMap<readonly PointEvent[]>`, weighted by bucket size. An auxiliary ID map locates edits without searching the time domain. Different events can occupy the same rational coordinate. IDs are unique ASCII strings of 1–128 characters from `[A-Za-z0-9_.:-]`; this preserves identical event ordering across JavaScript, PostgreSQL's C collation, and SQLite.

## JSON exchange version 1

```json
{
  "format": "openchronology",
  "version": 1,
  "title": "An exact timeline",
  "description": "",
  "events": [
    {
      "id": "event-1",
      "time": "1/3",
      "metadata": { "title": "A moment", "description": "", "source": "a notebook" }
    },
    { "id": "event-2", "time": "1/3", "metadata": { "title": "Another coincident moment" } }
  ]
}
```

`metadata` is an arbitrary JSON object. Its optional `title` and `description` fields are strings. Time is a string, never a JSON number. Export always normalizes time to reduced `n/d` (including `/1`) and sorts by time, then ID. Negative times and arbitrarily large numerators and denominators are supported. All application paths canonicalize coordinates before storing them. The calendar parser/printer is a separate presentation module.

## Presentation settings

The optional version-1 `presentation` field belongs to the document and defines printers/parsers, units, exact scale/origin and display precision. It never alters event ordering or query arithmetic. PostgreSQL metadata/snapshots include nullable JSONB settings; SQLite stores them in an optional `timeline_settings` table. Existing files without settings remain readable. Custom source is interpreted only in the frontend's restricted language, with no ambient capabilities; backend validation never executes it. See [time presentation](time-presentation.md) for the schema, calendar conventions and API.

## Window summaries

Presentation context is ephemeral: exact left/span, drawable CSS pixel width, and axis/event/input/tooltip purpose accompany printer and parser calls. Gregorian chart labels suppress common larger fields and subpixel detail, with a shared calendar caption; inputs/tooltips retain the exact full timestamp. Custom scripts access only whitelisted context helpers. None of these abbreviations alter ordered-set comparisons, saved times, or grouping thresholds.

Ruler planning is separate from printing: each presenter provides an exact, value-anchored visible tick plan. Decimal levels subdivide by ten. Civil Gregorian levels align fixed-offset clock fields, Monday weeks, true months/quarters and January 1 year boundaries using BigInt calendar arithmetic. Optional saved `ruler` policies select decimal/calendar graduation or a validated ladder of exact steps. Custom scripts keep their existing restricted print/parse API; their graduation policies are data. Planning starts directly at the visible left boundary and retains no navigation history, with a maximum of 512 ticks. Only relative tick screen positions become floating point numbers. Parent and child marks share positions through exact deduplication, and labels receive the selected level's nominal interval to choose their detail.

Visible bounds are **closed**: `[left, right]`. If the drawable viewport width is `W` and the user selects a grouping distance `P` pixels, the rational threshold is `(right - left) * P / W`. Measured screen coordinates are quantized to 1/1024 pixel before entering rational arithmetic. This quantizes the gesture measurement rather than the time domain.

After interactive navigation, the viewport's `left` and `span` are rounded to multiples of a power of two. The grid step is the largest `2^k` no greater than `span / (ceil(W) * 2^20)`. The rounding uses BigInt arithmetic, including for huge absolute coordinates and extremely small spans. Each bound moves by at most one grid step, or less than one millionth of a CSS pixel. Retained rational components depend on the absolute coordinate and current zoom level rather than the number of gestures. There is no minimum time span or fixed limit on event precision. Opposite wheel deltas use reciprocal rational factors. Explicit bound entry and the underlying `Viewport` arithmetic stay exact; the UI applies `rasterize` only after gestures, including touch pinch, mouse/keyboard pan, and button/wheel zoom. Stored event coordinates and database query comparisons are unaffected.

Grouping uses anchored spans. The first visible coordinate starts a group; subsequent coordinates belong to it while `time - first < threshold`. A coordinate exactly at the threshold starts another group. Zero threshold gives one bucket per distinct coordinate. Groups report exact first/last coordinates, total event count, and distinct coordinate count. Closer zooms reduce the threshold and reveal more groups. Counts travel as decimal strings, avoiding JavaScript integer truncation.

This rule bounds each group's span and prevents chains of nearby points from merging an entire viewport. It follows the libraries' `span` mode; `neighbors` is an available library operation, but not the application's display policy.

The browser and SQLite implementations cache subtree bounds and weights. PostgreSQL uses pgmp `mpq` values with a balanced, augmented tree in `oc_nodes`, scoped by timeline UUID. The primary key contains only `(timeline_id, node_id)`, so a rational with thousands of digits never becomes an oversized PostgreSQL B-tree key. Rational bounds remain exact payloads; traversal prunes subtrees outside the viewport and consumes cached summaries that fit a group. Singleton metadata is found by cached integer node IDs. Dense contained clusters take a small number of node visits; the oracle test checks one visit for a 5,000-event cluster.

The PostgreSQL tree is balanced when a snapshot is saved. The save transaction replaces nodes and updates the root and count atomically. Read transactions use repeatable-read isolation, ensuring a root and its nodes come from the same revision. This favors efficient viewing and simple first-version saves; incremental node updates would be the next step for large collaborative editors.

SQL operations are `oc_overview(timeline_uuid, lower_mpq, upper_mpq, threshold_mpq)` and `oc_events(timeline_uuid, lower_mpq, upper_mpq, after_time_mpq, after_id, max_rows)`. These are internal database functions; the HTTP layer applies account permissions before using them. Raw event traversal stops at the requested page size and uses an exact `(time, id)` cursor. It does not sort or collect an entire visible cluster to produce a page. SQLite uses a canonical `TEXT COLLATE RATIONAL_V1` metadata index plus a weighted `rational_index` table with one row per coordinate.

## HTTP operations

All paths start with `/api/`. Request and response bodies are JSON. Authenticated mutation requests include `X-CSRF-Token` from `/session` or the sign-in response; the session cookie is HTTP-only.

| Method and path                           | Operation                                            |
| ----------------------------------------- | ---------------------------------------------------- |
| `GET /session`                            | Current user, CSRF token, and server capability      |
| `POST /auth/register`, `POST /auth/login` | Username/password account session                    |
| `POST /auth/logout`                       | Revoke current session                               |
| `GET /timelines`                          | Owned and explicitly shared timelines                |
| `POST /timelines`                         | Create a private timeline from an exchange document  |
| `GET /timelines/:id`                      | Read authorized timeline metadata and bounds         |
| `GET /timelines/:id/document`             | Read/export a full snapshot                          |
| `PUT /timelines/:id`                      | Save `{revision, document}` with conflict detection  |
| `POST /timelines/:id/query`               | Read bounded summaries or an event page              |
| `GET /timelines/:id/members`              | Owner lists collaborators                            |
| `POST /timelines/:id/members`             | Owner sets `{username, role}` (`viewer` or `editor`) |
| `DELETE /timelines/:id/members`           | Owner removes `{username}`                           |
| `PATCH /timelines/:id/settings`           | Owner sets `{visibility}` (`private` or `public`)    |

An overview request has `{"kind":"overview","lower":"0/1","upper":"10/1","threshold":"1/100"}`. An event request has `{"kind":"events","lower":"0/1","upper":"10/1","limit":100,"after":null}`. The response includes `next: {time, id}` when another page exists. Event queries may omit bounds; overviews require finite exact bounds and a nonnegative threshold. Private resources conceal their existence from unauthorized readers with HTTP 404. Public readers cannot mutate a timeline.

Read-only server views order their returned summaries in rational-map, then fetch metadata in bounded pages on demand. Editors load a complete rational-map snapshot. The app keeps these states separate: a summary cache is never exported or saved as if it were the complete timeline.

## Native file boundary

The Rust `native-store` crate links the independently vendored sqlite-rational C extension and dynamically links system SQLite/GMP. It registers the extension on every connection; application users cannot load arbitrary extension paths. `trusted_schema=OFF` and parameterized queries apply to opened files.

`timeline_meta` contains title/description; `events` contains canonical rational coordinates and JSON metadata; `points` is the persistent augmented coordinate index. Application ID/version identify the file. A failed snapshot write rolls back. Native file paths only enter through Tauri dialogs, and the packaged desktop has no account/server network dependency.
