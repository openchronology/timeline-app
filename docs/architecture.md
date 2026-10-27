# Timeline and query contract

The browser model is `RationalMap<readonly PointEvent[]>`, weighted by bucket size. An auxiliary ID map locates edits without searching the time domain. Different moments can occupy the same rational coordinate. IDs are unique ASCII strings of 1–128 characters from `[A-Za-z0-9_.:-]`; this preserves identical moment ordering across JavaScript, PostgreSQL's C collation, and SQLite.

## JSON exchange version 1 (.ochx)

```json
{
  "format": "openchronology",
  "version": 1,
  "title": "An exact timeline",
  "description": "",
  "events": [
    {
      "id": "moment-1",
      "time": "1/3",
      "metadata": { "title": "A moment", "description": "", "source": "a notebook" }
    },
    { "id": "moment-2", "time": "1/3", "metadata": { "title": "Another coincident moment" } }
  ]
}
```

`events` holds the timeline's moments: the name predates durations and stays for compatibility. Durations, the other kind of event, are in `durations` ([durations](durations.md)), and links between events in `relationships`. The optional `image` is the timeline's own image, `{url, alt, width?, height?}` ([images](images.md#a-timelines-own-image)). `metadata` is an arbitrary JSON object. Its optional `title` and `description` fields are strings. Time is a string, never a JSON number. Export always normalizes time to reduced `n/d` (including `/1`) and sorts by time, then ID. Negative times and arbitrarily large numerators and denominators are supported. All application paths canonicalize coordinates before storing them. The calendar parser/printer is a separate presentation module.

## Presentation settings

The optional version-1 `presentation` field belongs to the document and defines printers/parsers, units, exact scale/origin and display precision. It never alters moment ordering or query arithmetic. PostgreSQL metadata/snapshots include nullable JSONB settings; SQLite stores them in an optional `timeline_settings` table. Existing files without settings remain readable. Custom source is interpreted only in the frontend's restricted language, with no ambient capabilities; backend validation never executes it. See [time presentation](time-presentation.md) for the schema, calendar conventions and API.

## Window summaries

Presentation context is ephemeral: exact left/span, drawable CSS pixel width, and axis/event/input/tooltip purpose accompany printer and parser calls. Gregorian chart labels suppress common larger fields and subpixel detail, with a shared calendar caption; inputs/tooltips retain the exact full timestamp. Custom scripts access only whitelisted context helpers. None of these abbreviations alter ordered-set comparisons, saved times, or grouping thresholds.

Ruler planning is separate from printing: each presenter provides an exact, value-anchored visible tick plan. Decimal levels subdivide by ten. Civil Gregorian levels align fixed-offset clock fields, Monday weeks, true months/quarters and January 1 year boundaries using BigInt calendar arithmetic. Optional saved `ruler` policies select decimal/calendar graduation or a validated ladder of exact steps. Custom scripts keep their existing restricted print/parse API; their graduation policies are data. Planning starts directly at the visible left boundary and retains no navigation history, with a maximum of 512 ticks. Only relative tick screen positions and normalized spatial fade weights become floating point numbers. Adjacent graduation plans crossfade as zoom depth approaches a breakpoint, with independent subdivision/boundary fades and no time-driven animation. Parent and child marks share positions through exact deduplication, and labels receive the selected level's nominal interval to choose their detail.

Visible bounds are **closed**: `[left, right]`. If the drawable viewport width is `W` and the user selects a grouping distance `P` pixels, the rational threshold is `(right - left) * P / W`. Measured screen coordinates are quantized to 1/1024 pixel before entering rational arithmetic. This quantizes the gesture measurement rather than the time domain.

After interactive navigation, the viewport's `left` and `span` are rounded to multiples of a power of two. The grid step is the largest `2^k` no greater than `span / (ceil(W) * 2^20)`. The rounding uses BigInt arithmetic, including for huge absolute coordinates and extremely small spans. Each bound moves by at most one grid step, or less than one millionth of a CSS pixel. Retained rational components depend on the absolute coordinate and current zoom level rather than the number of gestures. There is no minimum time span or fixed limit on time precision. Opposite wheel deltas use reciprocal rational factors. Explicit bound entry and the underlying `Viewport` arithmetic stay exact; the UI applies `rasterize` only after gestures, including touch pinch, mouse/keyboard pan, and button/wheel zoom. Stored times and database query comparisons are unaffected.

Grouping uses anchored spans. The first visible coordinate starts a group; subsequent coordinates belong to it while `time - first < threshold`. A coordinate exactly at the threshold starts another group. Zero threshold gives one bucket per distinct coordinate. Groups report exact first/last coordinates, total event count, and distinct coordinate count. Closer zooms reduce the threshold and reveal more groups. Counts travel as decimal strings, avoiding JavaScript integer truncation. Durations shorter than the threshold collapse into the same summaries; see [duration summaries](durations.md#summaries).

This rule bounds each group's span and prevents chains of nearby points from merging an entire viewport. It follows the libraries' `span` mode; `neighbors` is an available library operation, but not the application's display policy.

The browser and SQLite implementations cache subtree bounds and weights. PostgreSQL uses pgmp `mpq` values with an augmented AVL tree in `oc_nodes`, scoped by timeline UUID: one node per distinct time, holding that time's moment IDs, with the moments themselves in `oc_moments`. The primary key contains only `(timeline_id, node_id)`, so a rational with thousands of digits never becomes an oversized PostgreSQL B-tree key. Rational bounds remain exact payloads; traversal prunes subtrees outside the viewport and consumes cached summaries that fit a group. Singleton metadata is found by cached integer node IDs. Dense contained clusters take a small number of node visits; the oracle test checks one visit for a 5,000-event cluster.

### Incremental saves

Node IDs are stable, and each node records its height. A sparse save (`PUT /timelines/:id/changes`) updates the stored indexes in place (`server/incremental.mjs`, `server/avl.mjs`):

- Adding, moving or deleting a moment inserts into or removes from the AVL tree. That rewrites only the nodes on the path to the root, plus rotations, and recomputes their summaries from their children.
- Editing a moment's metadata without moving it updates its `oc_moments` row and its search row, and writes no tree node.
- Durations and relationship arcs use AVL interval trees in the same way, ordered by start and then ID. The timeline row names each tree's root.
- Durations anchored to a moved or deleted moment move with it, and arcs of moved entities are placed again.
- Search rows and relationship rows change only for the entities a patch names.
- A save reads the tree nodes it needs in one query before changing anything (`prefetch`, each tree's `path`): the keys descend from the root together, each node splitting those that reach it between its children, so it reads each node on the paths once (with its children) rather than once per key. Moments appended to a log share nearly their whole path, so a 5,000-moment append reads a few dozen nodes. `test/tree-paths-postgres.mjs` checks that the walks then find every node already read.

A save therefore costs O(k log n) rows for k changes in a timeline of n moments, and the same save's cost does not depend on other timelines. A patch changing more than half of a timeline under 200,000 moments, whole-document saves and merges of revisions saved before history was kept as rows rebuild the indexes from the document instead; a rebuild costs about 0.5 ms per moment and an in-place change about 1 ms, and beyond 200,000 moments a whole document is too large to build in memory. Any other patch is applied in place however large, including one that changes the timeline's plugins, since each plugin reads its own metadata ([where plugins run](plugins.md#where-plugins-run)): a slice of 5,000 changes at a time (`slicePatch`), each to the timeline as the previous slice left it, so no statement grows with the patch, and still as one revision. At a million moments, deleting 200,000 (a retention batch) in place takes about 5 minutes in statements of at most 10 s, where a rebuild took about 10 minutes and over 1 GB of memory. A rebuilt tree is perfectly balanced, which is also a valid AVL tree.

The save transaction updates nodes, roots and counts atomically. Read transactions use repeatable-read isolation, so a root and its nodes always come from the same revision. Viewport queries do not depend on the tree's shape, so incremental and rebuilt indexes return the same groups. `test/incremental-postgres.mjs` checks this against rebuilds over random patches, along with AVL balance, every summary and the absence of orphaned rows.

Saved history is kept as rows ([saved history](#saved-history)): a save records new versions of only the entities it changed. The catalogue's whole-timeline search text (`event_text`) is rebuilt in the database after the save commits, and rapid saves coalesce into one rebuild. It is the first 1 MiB of the timeline's titles and notes, durations by start and then moments by time (`oc_event_text`); both are read in that order and reading stops once the text is full, so a rebuild costs about the same at any size (0.4–0.7 s at a million moments, where reading every moment took 6 s). A fork's durations are read through its levels and sorted whole, so its rebuild grows with its durations (#135). Walking the moment tree takes a statement per step, several on a fork (one per level it looks through), so a timeline of at most 50,000 moments sorts all its moments' IDs in one query instead and reads the moments by ID a page at a time, still stopping once the text is full (#285, `bench/fork-text.mjs`). Larger timelines, whose rebuild takes longer, wait longer between rebuilds. A sparse save updates the timeline row once and leaves its indexed columns alone: `updated_at` advances at most once a minute during continuous editing. The update therefore stays in place and does not rewrite the catalogue's full-text index. Separation views of earlier revisions are discarded at the same time. `npm run migrate` converts indexes saved before these changes.

SQL operations are `oc_overview(timeline_uuid, lower_mpq, upper_mpq, threshold_mpq)` and `oc_events(timeline_uuid, lower_mpq, upper_mpq, after_time_mpq, after_id, max_rows)`. These are internal database functions; the HTTP layer applies account permissions before using them. Raw event traversal stops at the requested page size and uses an exact `(time, id)` cursor. It does not sort or collect an entire visible cluster to produce a page. SQLite uses a canonical `TEXT COLLATE RATIONAL_V1` metadata index plus a weighted `rational_index` table with one row per coordinate.

## Saved history

Every save is a revision, and a timeline's history is kept as rows (`server/history.mjs`). Each version of a moment, duration, relationship or the timeline's settings is a row valid from the revision number that saved it (`since`) until the revision that changed or removed it (`until`, empty while current). Revision _n_ is the set of rows with `since ≤ n < until`.

- **A save writes only what changed.** It ends the current versions of the entities it touched, unless they are unchanged, and adds their new versions. Its cost and its storage charge follow the change, not the timeline's size. Saves that rebuild the index (large patches, merges, syncs) compare the whole timeline with its current versions in one query, and still write only the differences.
- **Reading a revision is a query.** It selects the versions valid at that number, so no revision depends on replaying others, and none is stored as a whole document. Old revisions can be pruned without touching newer ones (see [retention](retention.md)): a version goes once no remaining revision sees it.
- **Versions are immutable.** A trigger allows only ending a version, once. Revisions themselves stay immutable as before, apart from forgetting their content (below).
- **Documents stream** (`server/document-stream.mjs`, #135). Exporting a timeline (`GET /timelines/:id/document`) and reading a saved revision (`GET /timelines/:id/history/:saved`), each with `?download=1` for an `.ochx` file, read its moments, durations and relationships through cursors a page at a time in one read-only snapshot, in the orders their indexes give (moments by ID, durations by start, relationships by key; a saved revision's through its versions' primary keys), and send the JSON as it is read: neither the server's memory nor any one statement grows with the timeline. A client that stops reading closes the cursors (the Next.js route hands the response a stream it pulls from). Documents read whole inside the server (merges, rebuilds) keep a document's order. A fork's entities are read through its levels and sorted, so its first part waits for that.
- **Saved history is optional** (`oc_timelines.keep_history`, #136). A timeline that keeps none records each save as a revision without content (no snapshot, patch or rows; `checkpoint`, `saveIncrementally`), charged nothing, and its head is read from its live index (`revisionDocument`). Turning it off (`stopHistory` in `server/store.mjs`) forgets the content of its past revisions, the one change the revision trigger allows (`oc_revision_forget`), which also refunds their charge; revisions others still read keep theirs (`STILL_READ`: those copies read through to, forks were made from, other timelines' heads are, and pull requests refer to, with the revisions their patches are stored against). Its current versions end after its latest revision, and `pruneHistoryRows` removes those no kept revision sees. Turning it on (`startHistory`) records the current state as a new `baseline` revision: copied as it is, or, for a copy whose kept revisions still read through to its base, compared with that base as a whole-timeline save is. Copies inherit the setting; migrations start no history for timelines without it.
- **Copies share history.** A fork or duplicate does not copy its source's history, and its index reads through to its source's (see below). A fork reads through at most four levels (`INDEX_LEVELS`): one that would read through more copies what it reads of the nearest level, its source's own rows at the clock forked (`takeLevels`, `copyLevel` in `server/index-versions.mjs`), and reads through to the levels its source reads, so it costs what its source changed rather than its whole index. When that is 20,000 events or more, the copy is answered at once and the rows copied afterwards (`prepare`): `oc_timelines.preparing_revision_id` names the revision it copies until then, and `access` refuses its index with HTTP 409. The pin on the source keeps the rows as forked whatever the source does meanwhile (saves, a rewrite, deletion), so the copy is exactly the revision forked, and is released once made. One server process prepares a copy at a time (`SKIP LOCKED`), and a crash leaves nothing behind for the next start to resume; a copy an earlier release left to prepare is rebuilt from the revision it copies. Comparisons and indexes awaiting a startup repair are rebuilt as before. Search vectors (`oc_entity_search.document`) are kept by a trigger instead of generated, so the copy takes them as they are. It records the revision it was copied from as its base (`oc_history_bases`) and reads through to it for every entity it has not saved itself. When a copy first saves an entity that differs from its base, an override (`oc_history_*_overrides`) records the revision from which the copy keeps its own versions of it; an override without a version is an entity the copy removed. A new copy is charged only its settings, and later saves are charged what they change. A copy of a copy reads through each level in turn. Past four levels, a new copy starts its own history with one copy made in the database, so reading a revision never reads through more than four levels. Retention and deletion keep a base revision, with the versions it sees, while a copy reads through to it. Once the last copy is deleted, a deleted source's remaining history goes too.
- **Versioned index rows** (`server/index-versions.mjs`), so forks can share their source's index instead of copying it (#145). Each timeline's index has a clock (`oc_timelines.index_clock`), advanced by every transaction that writes the index (`beginIndexWrite`), and each live index row records the clock that wrote it (`since`). A fork pins the clock it reads its source at (`index_pinned`, the highest pin). Before a row a pin can see is changed or deleted, a trigger copies it into its table's `_retired` twin with the clock that ended it (`until`); rows nothing pins change in place as before, so a timeline that is never forked writes as it did, and reading the current index, the live rows, is unchanged. The index at a clock is its live rows written by then and its retired rows live then (`indexAtSql`). Inserting an index row outside `beginIndexWrite` fails, so no write goes unversioned. A version is retired only while a pin can see it, and a pin it covers is the highest then, so versions are only left unread when pins go: when a fork is deleted, saved whole or compacted, `oc_release_index` recomputes each level's pins from the lineages that remain, keeps the highest as `index_pinned`, and deletes the retired versions no pin falls in (a deleted level also loses the live rows no pin sees, and everything once nothing reads it). Migrating releases what earlier versions kept after a fork was deleted (`releaseIndexes`).
- **Forks read through to their source's index** (`shareIndex` in `server/store.mjs`). Forking a timeline's head pins the source at its clock and records the levels the fork reads (`oc_timelines.index_bases`, nearest first, and `index_clocks`, the clock each is read at): the source, then whatever it reads through to, at most four levels. Nothing is copied, so a fork of any size is ready at once. A fork's index is its own rows, then each level's rows at that level's clock whose key no nearer level has a version of. What a fork changes becomes its own row; what it removes from a level is hidden by a hidden row of its own with the same key (`hidden`, `removeRows`). Queries from the server write this out for the fork's levels (`indexReader`, with the levels as literals so it plans as written): a lookup by key takes the first version going down the levels, a scan hashes the keys nearer levels have versions of, and other queries check nearer levels row by row; the walks in the database (overview, events, duration overview, recent times, catalogue text) hand forks to `_lineage` variants generated from the originals. These look a node up level by level, starting where its parent was found: a node a fork changes becomes its own along with the whole path to it (`PersistentTree`), and a moment it changes makes its node its own, so a fork's own nodes have only its own nodes above them and each step down usually takes one lookup, as on the source. Within a level, a step tries the version (live or retired) its parent had first. At 200,000 moments, reads on a fork take about 1.2 to 1.5 times as long as on its source, also after both have moved thousands of moments since the fork (`bench/fork-reads.mjs`). Reading through levels makes the planner expect costly queries and compile them (JIT), which takes far longer than running them, so a fork's transactions and walks turn that off. As with large writes, a transaction that retires many versions (1,000 rows or more, counted by the triggers) or saves many changes to a fork refreshes the statistics before answering: until they count a timeline's retired or own rows, a lookup by key can take any index that starts with the timeline and read them all. The walks' plans are kept per connection, so they never scan a table whole. A fork whose index is rewritten whole (a save rebuilt from a document) reads through to nothing from then on, and so does one compacted: once a fork's own moment rows reach half its moments, it is compacted in the background after saving (`compact`), copying what it still reads through to into rows of its own a page per transaction (the same rows, so it reads the same meanwhile and saves only wait for a page), then dropping its hidden rows and its lineage and releasing what it read. Index rows outlive their timeline while forks read them: deleting a timeline (`oc_release_index`, run by a trigger) deletes its rows only once no timeline reads through to it, and releases the deleted levels it read through to that nothing else reads.
- **Pull requests keep revisions, not documents.** A timeline submitted for review (or the result of rebasing one) is a revision outside any timeline's numbered history: its own one-revision history (its ID as `timeline_id`, number 1) that reads through to its base like a copy, keeping only what it changes. Deleting the timeline deletes them with its pull requests.
- **Comparing two revisions** (`differences`) compares only the entities either one's history saved since they last shared a state: everything the levels above the first timeline both read through to saved, and what that timeline saved between the two revisions (indexes on `since` and `until` find those). A pull request's change summary costs what it changes, not the timeline's size.
- **Merging entity by entity.** Merges, rebases and syncs (`mergePatch` in `server/merge.mjs`) take what the other side changed since the common base from `differences`, merge each entity with the timeline's current version field by field (as `rebaseDocument` merges whole documents, conflicts included), and complete the result as a whole-timeline merge would leave it: links to removed entities go, and durations anchored to removed moments keep the moment's last time. The result is a patch, applied like a save, or for a rebase, kept as a revision that reads through to upstream's head.
- **Upgrading:** a timeline starts keeping history as rows at its first save after the upgrade (`oc_timelines.history_since`), with one copy of its current state made inside the database. Its earlier revisions keep the snapshots and patches they were saved with, and still read back as before. Pull request sources and rebases, which are not part of a timeline's numbered history, keep whole documents.

## HTTP operations

All paths start with `/api/`. Request and response bodies are JSON except SQLite uploads/downloads. Authenticated mutation requests include `X-CSRF-Token` from `/session` or the sign-in response; the session cookie is HTTP-only.

| Method and path                           | Operation                                                           |
| ----------------------------------------- | ------------------------------------------------------------------- |
| `GET /session`                            | Current user, CSRF token, and server capability                     |
| `POST /auth/register`, `POST /auth/login` | Username/password account session                                   |
| `POST /auth/logout`                       | Revoke current session                                              |
| `GET /timelines`                          | Owned and explicitly shared timelines                               |
| `POST /timelines`                         | Create a private timeline from an exchange document                 |
| `GET /timelines/:id`                      | Read authorized timeline metadata and bounds                        |
| `GET /timelines/:id/document`             | Read/export a full snapshot, streamed; `?download=1` for an `.ochx` |
| `GET /timelines/:id/export/:name.ochx`    | The `.ochx` streamed as a file named `:name` (signed in)            |
| `PUT /timelines/:id`                      | Save `{revision, document}` with conflict detection                 |
| `PUT /timelines/:id/changes`              | Save sparse edits against a revision; preserve untouched moments    |
| `POST /timelines/:id/query`               | Read bounded summaries or an event page                             |
| `GET /timelines/:id/members`              | Owner lists collaborators                                           |
| `POST /timelines/:id/members`             | Owner sets `{username, role}` (`viewer`, `contributor` or `writer`) |
| `DELETE /timelines/:id/members`           | Owner removes `{username}`                                          |
| `PATCH /timelines/:id/settings`           | Owner sets `{visibility}` (`private` or `public`)                   |

The query endpoint also accepts `{"kind":"duration","id":"…"}` for a duration's full definition and `{"kind":"search","text":"…","page":1}` for [text search](search.md). Overview, event and duration-page queries accept a tag `filter`, and `{"kind":"tags"}` lists tags; see [tags](tags.md). `{"kind":"related","entity":{...}}` lists an entity's relationships; see [relationships](relationships.md). An overview request has `{"kind":"overview","lower":"0/1","upper":"10/1","threshold":"1/100"}`. An event request has `{"kind":"events","lower":"0/1","upper":"10/1","limit":100,"after":null}`. The response includes `next: {time, id}` when another page exists. Event queries may omit bounds; overviews require finite exact bounds and a nonnegative threshold. Private resources conceal their existence from unauthorized readers with HTTP 404. Public readers cannot mutate a timeline.

Both readers and editors of server timelines and desktop files treat the browser as a running cache of the saved timeline, not a complete snapshot. `src/remote-cache.ts` keeps overscanned windows (the view plus 25% of its span on each side) at several resolutions. Resolution levels use exact powers of two, so nearby pans and small zooms reuse a window. A view is answered by any window of its resolution that covers it and was fetched in the last 30 seconds; otherwise a query is scheduled, and the cached window covering it at the closest resolution stays on screen meanwhile. Visible moments and their confirmed grouping remain on screen while loading. A successful response reconciles singleton moments by stable ID, replaces summaries, and releases obsolete detail atomically; rejected, aborted or failed responses leave confirmed data intact.

Once the view settles (400 ms), windows ahead of the reader are fetched one at a time: a wide window at the view's resolution (two spans on each side) for panning, and windows one level coarser and one finer for zooming, ordered by the latest motion. Each stays within the server's response limit, and windows already cached are skipped. A view's own query goes first: a web prefetch is aborted, and a native one, which cannot be interrupted, is waited for. Prefetch queries carry `prefetch: true`, which servers and the desktop store ignore.

The cache holds at most 16 windows and 24 MiB of estimated UTF-16 JSON storage, each response at most 2,048 summary groups and 8 MiB. A window replaces the windows of its resolution that it contains. Over budget, the windows farthest from the view are released first, by resolution (in octaves), position (in widths of the view or the window) and time since last use. The windows serving the view stay. Windows unused for five minutes are released, and a hidden page keeps only the windows covering its view. Timeline changes and access revocation clear the cache. These are payload budgets, not a hard bound on the entire browser process. Requests are debounced, obsolete web fetches are aborted, and native requests are serialized with stale results ignored.

For signed-in users, windows of server timelines also outlive the page, in the `openchronology-viewports` IndexedDB database (`src/viewport-store.ts`); guests' windows stay in the page, like their drafts. Each record is one window of one timeline revision, keyed by server origin, user, timeline, revision and a fingerprint of the active plugins. A revision's windows never change, so when a timeline opens, its stored windows for the confirmed revision are restored as fresh and its last views appear without a query. Two seconds after a window arrives, and when the page is hidden, new windows are written and windows of other revisions are deleted. Windows the page has let go of (when hidden, or over its own limits) stay stored, so a save at any moment never loses what a later visit could show. A revision keeps at most 64 stored windows. Stored windows total at most 64 MiB, and are kept for 30 days; beyond these limits, the least recently saved go first. Signing out deletes them all; a query refused with 401, 403 or 404 deletes the timeline's. Desktop files keep windows only in the page: their revision does not survive the app.

The server HTTP overview enforces a minimum threshold of queried span / 1,024, including when the requested threshold is zero, keeping responses to at most 1,025 anchored groups. The underlying SQL/conformance zero-threshold behavior remains exact and unchanged. Returned `threshold` records the effective server resolution. Cached subtree weights supply **exact** counts without running `COUNT(*)` over every event. The browser does not reconstruct members of summaries. Cached groups can straddle viewport edges; their displayed count covers the complete summarized group, including nearby prefetched coordinates.

Only a selected moment or explicitly opened summary page fetches full metadata (at most 25 events per page). Normal singleton overview metadata is a plugin projection limited to 2,048 characters; larger projections, including large stacks, are deferred to selection. Selected inspector content remains available, while unselected inspector reads are evicted. Unsaved changes and their original coordinates are pinned separately in a sparse rational-map workspace so navigating never discards work. Local/offline/file timelines still use a complete rational-map.

`PUT /timelines/:id/changes` accepts `{revision, settings, changes}`; each change is `{id, event}` or `{id, event: null}`. It validates all data, requires write access and CSRF, locks the current timeline, applies changes to the saved document server-side, preserves untouched events, and creates an immutable checkpoint in one transaction. There are at most 5,000 changes per save. Edits made during an in-flight save are rebased locally onto the accepted checkpoint. Settings contain the exchange document header and optional presentation/plugins/tags/image/assets, with no event array.

Full JSON/SQLite export, saving a remote timeline as a local file, and legacy document-based proposal submission explicitly materialize a full document for that operation. A sparse editor uses its immutable saved head plus local changes, so it cannot export a partial cache as a complete timeline. Authentication redirects persist the sparse working changes rather than downloading the full timeline. Saving remains a server-side full index rebuild and snapshot checkpoint; incremental index writes are a separate future optimization.

## Native file boundary

The Rust `native-store` crate links the independently vendored sqlite-rational C extension and dynamically links system SQLite/GMP. It registers the extension on every connection; application users cannot load arbitrary extension paths. `trusted_schema=OFF` and parameterized queries apply to opened files.

`timeline_meta` contains title/description; `events` contains canonical rational coordinates and JSON metadata; `points` is the persistent augmented coordinate index. Application ID/version identify the file. A failed snapshot write rolls back. Native file paths only enter through Tauri dialogs, and local editing has no account/server network dependency. The connected desktop transports cloud operations through a native HTTPS client; the webview has no direct network capability. See [authentication](authentication.md).

## SQLite exchange (.och)

`.och` files use SQLite's native file format, application ID `1329812556` and schema version 1. The extension is distinct from `.ochx` JSON. Existing native `.sqlite` files can still be opened through desktop dialogs; new saves default to `.och`.

`POST /files/import` accepts `application/vnd.openchronology.sqlite` (or octet-stream), requires a signed-in CSRF-protected session and returns `{document}`. `POST /files/export` accepts a validated exchange document and returns a SQLite attachment. `GET /timelines/:id/file` exports a snapshot under the same private/public ACL as ordinary viewing. The browser does not parse SQLite, and import does not create a server timeline until the user saves it.

The Node server invokes `och-convert` in a separate process, built from the same `native-store` and sqlite-rational sources as desktop persistence. Compose installs it automatically; other deployments build it with `cargo build --manifest-path native-store/Cargo.toml --release --locked --bin och-convert` or set `OCH_CONVERTER` to an installed executable. An unavailable converter hides file-exchange controls and returns HTTP 503 for conversion. Temporary directories are private and removed after success or failure. Conversion concurrency is limited to two jobs per server process, input/output to `TIMELINE_FILE_BYTES` (64 MiB by default; [administration](administration.md#timeline-size)), elapsed time to twenty seconds and SQLite work to twenty million instructions per statement. On Linux the child also limits address space to 512 MiB (or eight times the file limit, when that is more), CPU time to twenty seconds and file output to the file limit. Writing a file parses each moment's metadata only as the moment is saved, so a conversion's memory follows the document's size rather than several times it. Unknown formats, corrupt files, invalid presentation/rationals, executable views in timeline table positions and oversized files are rejected. Normal native-store editing has no converter-specific instruction/memory budget.

## Authentication operations

| Method and path                | Operation                                                                                      |
| ------------------------------ | ---------------------------------------------------------------------------------------------- |
| `POST /auth/:provider/start`   | Begin configured Google/GitHub/Facebook sign-in, or `{link:true}` for explicit account linking |
| `GET /auth/:provider/callback` | Complete a browser-bound one-use provider flow, then redirect locally                          |
| `POST /auth/device/start`      | Native client obtains secret, visible user code and verification URL                           |
| `POST /auth/device/approve`    | Authenticated web user approves `{userCode}` with CSRF                                         |
| `POST /auth/device/poll`       | Native secret polls once per three seconds; approval yields native bearer session              |
| `GET /auth/account`            | Linked providers and active sessions                                                           |
| `POST /auth/revoke-others`     | CSRF-protected revocation of all other sessions                                                |

`GET /session` also returns enabled `providers` and a `fileExchange` capability. Before anonymous password/provider sign-in, it issues a short-lived HTTP-only login nonce and returns its CSRF counterpart. See [authentication and operator configuration](authentication.md) for identity verification, expiry, HTTPS and proxy settings.

See [collaboration.md](collaboration.md) for the owner custody model, public full-text browser, proposed branches and merge API.

## Hosted platform (Next.js)

`platform/app` is the Next.js App Router application for timescale.info. `/` renders the dashboard on the server, with the account’s own timelines above public full-text search results. Search and pagination use URL parameters and Next forms/links. `/login` and `/account` own browser sign-in, OAuth initiation and session management; `/connect/desktop/:code` owns explicit desktop authorization. `/timelines/:id`, its `/pulls` routes and `/settings` enforce access before rendering. The plugin catalogue and legal pages also use Next routes. Private pages are dynamic, without shared page caching.

App Router handlers under `/api` dispatch streamed requests directly to the existing database/authentication controllers through `server/next-handler.mjs`. There is no second HTTP server or internal HTTP proxy in production. The controllers remain independently testable; `createApplication` is a local test/Tauri development harness. PostgreSQL, pgmp, revision checks, CSRF, signed-in access checks, bounded uploads, OAuth PKCE and session expiration remain server-side. React state never contains provider secrets or native bearer tokens.

`server/platform.mjs` initializes one bounded PostgreSQL pool per server process. It reads server-only environment variables. The Next proxy gives each page request a fresh CSP nonce, with no production `unsafe-eval`. Browsers use HttpOnly cookies and the existing server-issued CSRF tokens through Next APIs. Authentication remains the tested application session service; Next.js supplies its pages and request lifecycle.

The rational editor builds separately with esbuild. The hosted page embeds `/editor/frame` on the same origin; only that frame may be embedded, and it calls the same Next API endpoints. Its resizing and timeline mechanics remain independent of React. Parent/frame navigation validates message origin and source. The standalone HTML has no Next.js runtime or requests; the Tauri edition uses the same editor and can access the public Next API through native HTTPS transport.

Run `npm run dev` for Next.js with editor watchers, `npm run build` for both production builds, and `npm start` for Next.js. Docker runs the generated standalone Next server and includes its public/static assets, the native SQLite converter, and matching application source. See `docs/docker.md`.

## Saved revisions and fork ancestry

PostgreSQL stores immutable JSONB documents in `oc_snapshots`, checkpoint identities in `oc_revisions`, and ordered parent links in `oc_revision_parents`. `oc_timelines.head_revision_id` points to the current saved head; `revision` remains the optimistic-concurrency counter. Forks reference an upstream and initial base, share their upstream's saved history up to that base (see [saved history](#saved-history)), and maintain independent rational indexes and membership. Duplicates share saved history the same way without inheriting ancestry. Saving, syncing and merging update the head and rational index together in a transaction.

`server/versioning.mjs` handles copying, saved-history access and ancestry-aware sync. `server/merge.mjs` performs structured three-way comparisons by moment ID and metadata field, with conservative array conflicts. Source-pinned proposals use immutable checkpoints; explicit updates advance the mutable review revision, and merges record target/source parents. Cross-timeline historical document access is rejected even when a public merge references a private source parent. Deletion preserves ancestor documents required by surviving forks/reviews while removing unreferenced history belonging to the deleted timeline. See [collaboration](collaboration.md) for permissions, routes and migration behavior.

Native SQLite JSON payloads are validated and serialized by `serde_json`. Save atomically recreates the data tables that are fully replaced, migrating older `json_valid()` checks that some system SQLite builds reject with `trusted_schema=OFF`. Schema trust remains disabled, exact rational constraints and indexes remain active, and legacy files stay readable.

## Desktop SQLite viewport storage

Opening `.och` now reads only the timeline header and the summary index root's
cached total count and bounds; it does not count or enumerate the event table.
`native-store/src/workspace.rs` maintains a private, disk-backed baseline copied
with SQLite's [online backup API](https://www.sqlite.org/backup.html), including
committed WAL content. It does not turn the database into a Rust event vector or
send a full document through Tauri during ordinary opening/navigation. Baselines
are removed on normal release/shutdown; their directories have owner-only Unix
permissions. An abnormal exit can leave temporary files for the OS/operator to
clean up.

The editor shares `ViewportCache` and `RemoteWorkspace` with server timelines.
`desktop_query` addresses the active baseline by generation, accepts exact rational
bounds, and delegates dense grouping to `sqlite-rational`'s persisted `points`
index. It enforces queried span / 1,024 as the minimum display threshold, including
when requested grouping is zero. At most 1,025 groups cross the native bridge.
Singleton plugin metadata is limited to 2 KiB, with longer metadata projected to
active plugin fields and a short notes preview. Summaries contain no member list.
Full metadata is retrieved only for selection or explicit summary pages of at
most 100 moments. Native result budgets reject excessive payloads before IPC;
the same 8 MiB viewport payload budget applies in the webview. Selected metadata,
unsaved edits, undo history, global settings/assets, and runtime/DOM overhead are
additional memory costs.

SQLite connections use a 2 MiB page-cache target, disable mmap, and put temporary
sorting tables on disk. A composite rational-time/ID index supports keyset pages.
Queries run off the UI thread, serialize per baseline, and release connections
when finished. The frontend allows one viewport request at a time and ignores
stale responses after navigation or file generation changes. Desktop **Import** parses `.ochx`/JSON natively into a disk baseline, so its
events never pass through the webview. Native parsing temporarily holds the import
and rejects files over 32 MiB; use `.och` for larger timelines. Programmatic/demo
imports over 2,048 moments are also staged after their initial JavaScript import.

Saving a local indexed timeline sends settings plus sparse additions, edits and
deletions, never cached summaries as if they were all the events. Native SQLite
updates affected coordinate weights and preserves every untouched hidden event.
Settings include time-display scripts, custom plugins, tags, and assets. Duration and
arc indexes are AVL interval trees with stable node IDs (`native-store/src/intervals.rs`),
so a save rewrites only the nodes on the changed intervals' paths; durations anchored to
a moved moment and arcs of moved entities are placed again. Each file records its index
layout and a save token. When the destination holds exactly the open baseline's saved
state (same token), the changes apply to the file in one SQLite transaction and then to
the baseline, in time proportional to the change. Otherwise (the first save of a file
from an older version, or Save As) a patched copy of the baseline replaces the
destination through a transactional SQLite backup. Either way, invalid patches leave the
original untouched.
Changes made at once (#179), such as deleting everything in a view or shifting times, would
be too many to keep as edits in the page: each overlay edit is drawn on its own and checked
against every summary. `desktop_stage_patch` applies them natively instead, to a patched
copy of the baseline (`Snapshot::with_patch`), reporting its progress through a Tauri
channel. The copy becomes the open baseline, unsaved; its save token is new, so the next
save writes the whole file. The baselines before are kept (up to eight), so undo and redo
switch between them (`desktop_restore_baseline`) until the file is saved or another opened.
They require no other unsaved edits, which the switch would otherwise lose.
Save As preserves the original file. Generation checks reject stale commands;
file and WAL modification stamps detect external changes and require Save As.
As with other file editors, avoid simultaneous editing by another application.

Successful saves rebase edits made while saving and evict clean inspector reads.
Exporting full JSON or initially publishing a local file to the server remains an
explicit full-document operation and can temporarily consume more memory; normal
local saves, browsing, grouping and inspector pagination do not. Preparing a
disk baseline costs disk space and file-size-proportional I/O when a file opens (and on
a copying save), traded for bounded UI data and atomic file persistence. Existing JSON
export/document size limits still apply.

Gregorian presentation uses historical BCE/CE year numbering (1 BCE is astronomical
Gregorian year 0). Exact input and tooltip timestamps append the era, e.g.
`0001-01-01T00:00:00Z BCE`; existing signed ISO timestamps remain accepted.
At geological label resolutions (at least 10,000 years per label), years a
million or more before the Common Era use `mya`, measured against a fixed
reference year 2000 CE. Far-future labels use `Myr after 2000 CE`. The caption
states this reference; it never depends on the current date. These are rounded
chart labels. Parsing an age places a marker at January 1 of the corresponding
whole Gregorian year, while exact editable fields retain complete rational
timestamps. Numeric and custom presentations retain their own unit conventions.

The selected-group inspector retains only its current page of 25 moments.
Next/Previous requests fetch bounded pages on demand using exact time/ID cursors;
only lightweight page-start cursors survive navigation. Local coincident buckets
seek by binary search instead of rescanning earlier pages. Opening a moment,
closing the inspector, or changing timelines clears the previous list and its
listeners. Selection/request generations discard late results and errors;
pagination controls disable while loading to prevent duplicate requests.

## Guest editing and complete browser copies

Guests and standalone HTML users edit complete local rational maps in memory only.
They do not initialize IndexedDB or auto-save drafts. A persistent banner explains
refresh/close behavior and links to .ochx export. Signed-in local browser drafts
retain the existing persistence behavior; Tauri continues using local SQLite.

`POST /api/timelines/:id/browser-fork` accepts `{}` or a saved `{revision}` token.
It returns the complete document and source revision for public timelines only,
without inserting a timeline, fork relationship or revision. It caps copies at
5,000 entries (moments, stack entries and durations) and 4 MiB of JSON, including embedded assets and plugin definitions.
The service reads precomputed `oc_snapshots.document_bytes` and the timeline event
count before loading document JSON. New checkpoints record UTF-8 serialized sizes;
the operator migration measures legacy snapshots once, conservatively using their
JSONB text size. Admission reserves space for response metadata; an additional
actual response-size check protects against inconsistent stored counters.

Copy requests use the existing per-client rate limiter (ten/minute), four concurrent
copies per server process, and a 1.5-second SQL statement timeout. Configure trusted
proxy address forwarding as described in the authentication deployment guide;
unknown addresses share one limit. Guest full-document downloads use the same gate,
and SQLite downloads require authentication. Regular viewport queries remain bounded
and can display timelines too large to copy. The client also caps streamed response
bytes before JSON parsing and validates the event count. See [guest behavior](guest-editing.md).

Timeline stars are platform bookmarks stored in `oc_timeline_stars`, with one
entry per user and timeline. A database trigger keeps each timeline's exact
`star_count` synchronized, including user and timeline deletion. Star requests
set an explicit boolean, so retries cannot accidentally toggle a favorite.
They require an authenticated session, CSRF protection, and read access to the
timeline. Stars do not change its saved revision or exported document.

The dashboard includes the user's paginated favorites, including accessible
private timelines. `/<username>` ([addresses](sharing.md#addresses)) shows
public timelines and public favorites only. Losing access removes a private timeline from search results;
its bookmark does not grant access. Timeline browsing supports featured-first,
star count, popularity (stars plus public forks), alphabetical title, newest
creation date, and full-text relevance. Private forks do not contribute to
public popularity. Historical timelines created before this migration use
their previous update timestamp as the best available creation date.
