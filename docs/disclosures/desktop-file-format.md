# Desktop timeline files: disk-backed baselines with token-matched saves

Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only

The OpenChronology desktop app edits timeline files (`.och`, SQLite databases with exact rational times and persistent indexes) without loading them into the user interface. Opening a file copies it, after security checks and inside one read transaction, into a private on-disk **baseline** that answers bounded viewport queries; unsaved edits stay in the page as a sparse overlay. Each file and baseline records an index-layout version and a random **save token**, rewritten by every save. When the file on disk still carries the baseline's token, a save applies only the changed entities to the file and then to the baseline, each in one SQLite transaction, at a cost proportional to the change; otherwise a patched copy of the baseline replaces the file through SQLite's transactional backup. Bulk edits (shifting times, deleting a range) are applied natively to a fresh copy of the baseline under a token no file has, which becomes the open baseline while earlier baselines are kept for undo and redo. Disclosed at commit [`007091c`](https://github.com/openchronology/timeline-app/tree/007091ce62fdb402346c0712b0c420eac0a29dff); first public disclosure: see [below](#first-public-disclosure).

## Field and problem

A desktop editor for timelines of hundreds of thousands of moments has to open, browse, edit and save them in a webview with a bounded memory budget.

- **Loading the whole file does not scale.** Parsing and indexing a 200,000-moment document in the page takes tens of seconds and holds the whole document in JavaScript memory (see [Benchmarks](#benchmarks)). Sending it across the native bridge as JSON doubles the cost.
- **Querying the user's file directly is unsafe and fragile.** The file may be changed by another program mid-session, may be a crafted SQLite database whose "tables" are views or triggers that run arbitrary SQL, and must not be modified until the user saves.
- **Rewriting the whole file per save is slow.** Copying the file and rebuilding its indexes on every save costs time proportional to the file, not to the edit.
- **Writing changes in place is only correct if the file still is what the editor thinks it is.** Comparing modification times is not enough to know that the file's indexes are byte-for-byte the state the patch was computed against (another program, a Save As, or a file from an older version may have changed or rebuilt them).
- **Bulk edits overflow an in-page undo stack.** A shift of 100,000 moments as 100,000 overlay edits must be drawn and checked against every summary; recording them as one edit in the page does not avoid holding them all.

## Summary of the mechanism

1. **File format.** A `.och` file is a SQLite database marked `application_id = 1329812556` ("OCTL") and `user_version = 1`, with moments in `events` (canonical `n/d` text under a rational collation), a weighted rational overview index `points` (one row per distinct time), duration and relationship-arc interval tables with persistent AVL trees (`duration_nodes`, `edge_nodes`, roots in `interval_roots`), one-row settings tables, and `index_layout(version, token)`.
2. **Opening = checked private copy.** Inside one read transaction the source is validated (identity, real tables only, no triggers) and copied with SQLite's online backup API into a fresh owner-only temporary directory. The copy is checked again (its `points` must be exactly the `rational_index` module), gets a private `(time, id)` index, and, if its index layout is older, has its trees rebuilt and is given a `rebuilt-…` token no file can match. Only the header (settings, and count and bounds read from the overview index's root) crosses to the page.
3. **Browsing** queries the baseline with bounded windowed reads; the page never holds the document.
4. **Save token.** Every save writes a fresh token (`<nanoseconds>-<pid>-<counter>`, hex) to both the file and the baseline. Equal tokens mean equal saved state.
5. **Token-matched in-place save.** If the destination file passes all checks, has the current layout and carries the baseline's token, the sparse patch is applied to the file, then to the baseline, each in one `BEGIN IMMEDIATE` transaction that updates only the moment-index buckets and tree paths the changes touch, and both get the same new token. Otherwise the patch is applied to a fresh copy of the baseline, which is backed up over the destination in one transaction.
6. **Staged bulk patches with baseline undo.** A bulk patch is applied (with progress reports) to a new copy of the baseline under a fresh token; the copy becomes the open baseline, the previous one joins a list of up to eight kept baselines, and undo and redo switch between them. Because the staged token matches no file, the next save writes the whole file.
7. **Guards.** A generation number rejects commands meant for an older baseline; a stamp of the file and its `-wal` (size and modification time) detects changes by other programs, which then require Save As.

## Detailed description

### File layout

| Table                                                                                  | Contents                                                                                                                                                          |
| -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `timeline_meta`, `timeline_settings`, `timeline_plugins`, `timeline_extras`            | One row each (`singleton = 1`): title and description; presentation JSON; plugin list JSON; `{tags, assets}` JSON.                                                |
| `events(id, time, metadata)`                                                           | One row per moment; `time` is canonical `n/d` TEXT with `COLLATE RATIONAL_V1` and `CHECK(q_is_canonical(time))`.                                                  |
| `points` (`rational_index` virtual table; shadow tables `points_nodes`, `points_meta`) | One row per distinct time, weighted by how many moments share it; its augmented tree answers grouped overviews and stores the total count and bounds at its root. |
| `durations`                                                                            | Each endpoint either a fixed time or the moment it follows (`CHECK` exactly one of the two per end).                                                              |
| `duration_intervals` + `duration_nodes`                                                | Durations with endpoints resolved to times, and a persistent AVL interval tree over them with stable node IDs.                                                    |
| `relationships`                                                                        | Undirected links between moments and durations, stored once.                                                                                                      |
| `edge_intervals` + `edge_nodes`                                                        | Links as arcs between their endpoints' times, in the same kind of tree.                                                                                           |
| `interval_roots`, `index_layout`                                                       | Each tree's root; the layout version (`"2"`) and save token.                                                                                                      |

Every connection runs with `trusted_schema=OFF` and parameterised statements; readers check that the tables they read are real tables (`check_file`), because with untrusted schema a view still runs its own SQL.

### Data structures (desktop process)

```
Snapshot {                    # one baseline
  directory: Arc<TempDir>     # 0700; removed when the last snapshot sharing it is dropped
  path: <dir>/baseline.och    # the private copy
  query_gate: Mutex<()>       # serialises queries, full reads and in-place saves on it
  views: [(filter key, Arc<Snapshot>)]   # derived snapshots for tag separations (two kept)
}
Files {                       # Tauri-managed state behind a Mutex
  current: Option<Path>       # the user's file
  baseline: Option<Arc<Snapshot>>
  stamp: Option<Stamp>        # (size, mtime) of the file and of its -wal
  generation: u64             # bumped by every open, save, stage and restore
  pending: Option<(Path, Arc<Snapshot>, Stamp)>   # opened but not yet accepted by the editor
  baseline_id: u64; next_id: u64
  kept: [(u64, Arc<Snapshot>)]                    # earlier baselines for undo/redo, at most 8
}
```

A `Snapshot` is immutable while it is a baseline, except for an in-place save, which writes it under its `query_gate`. Queries clone the `Arc` and release the `Files` lock, so a slow query never blocks other commands.

### Opening

```
Snapshot::open(source):
  dir := new temp dir "och-workspace-<pid>-<ns>-<n>" with mode 0700
  db := open source read-only; BEGIN
    check_file(db)                                  # application_id, user_version, real tables
    refuse if any trigger exists, or points_nodes/points_meta are not tables
    db.backup_to(dir/baseline.och)                  # online backup, includes committed WAL
  COMMIT                                            # the copy is exactly the checked state
  copy := open dir/baseline.och
  refuse unless points' schema is exactly "create virtual table points using rational_index"
  CREATE INDEX events_time_id ON events(time COLLATE RATIONAL_V1, id)    # keyset pages
  if index_layout ≠ current layout or an interval table is missing:
    rebuild duration and arc trees; set_layout(copy, "rebuilt-" + token())
  create start index; header()                      # validates settings and the index root
```

Opening is two-step: `desktop_open` leaves the new baseline _pending_ and returns its header with a provisional generation; the editor validates the header and calls `desktop_accept_open(path)`, which installs it only if `path` still names the pending file (a reply to an older open cannot accept a newer one), sets the stamp, bumps the generation and forgets kept baselines. A file is stamped before and after copying; a change in between refuses the open.

**Header without enumeration.** `header()` reads the settings tables and one row: `points_meta.root` joined to that node in `points_nodes`, whose `first`, `last` and `count` (total weight) cover every moment. Opening a file therefore costs one copy plus O(1) reads, not a scan.

Large documents that arrive whole (a JSON import parsed natively, or a document of more than 2,048 moments first opened in the page, such as a programmatic or demo import) are written to a new 0600 temporary file and opened the same way (`Snapshot::from_document`, `desktop_stage`).

### Save tokens

```
token() := hex(nanoseconds since epoch) "-" hex(process id) "-" hex(per-process counter)
set_layout(db, token): INSERT OR REPLACE INTO index_layout VALUES(1, LAYOUT, token)
```

Tokens are unique without coordination. Invariant: **a file and a baseline carry the same token only while they hold the same saved data.** It is maintained because every write path ends by setting a token, and only the in-place save path sets the _same_ token on both:

| Write                        | File token | Baseline token                  |
| ---------------------------- | ---------- | ------------------------------- |
| Whole-document `save`        | new T      | baseline re-opened from file: T |
| In-place sparse save         | new T      | same T                          |
| Copying sparse save          | T (copied) | T (it is the copy)              |
| Staged bulk patch            | unchanged  | new T′ (no file has it)         |
| Opening an older-layout file | unchanged  | `rebuilt-…` (never matches)     |

The baseline is not byte-identical to the file (it has an extra `(time, id)` index); the token asserts equality of the data and of the persistent tree node IDs that in-place updates depend on.

### Saving

```
save_patch(baseline, target, patch):
  lock baseline.query_gate
  validate patch.settings; refuse whole-document content or > 200000 changes
  T := token()
  if dest := matching_file(target, baseline.token):
    apply(dest, patch, T)                            # one transaction on the user's file
    if apply(baseline, patch, T) fails:              # the file is saved; resynchronise
      return Snapshot::open(target)
    return a Snapshot sharing baseline's directory
  staged := Snapshot::open(baseline.path); apply(staged, patch, T)
  refuse unless target is an OpenChronology timeline or an empty database
  staged.backup_to(target)                           # one transaction
  return staged

matching_file(target, token):
  none if token starts with "rebuilt-" or target is not a file
  open target read-write
  none unless application_id matches, check_file passes, no triggers,
       points shadow tables are tables, layout is current, and target.token == token
```

`apply` runs `apply_changes` inside `BEGIN IMMEDIATE … COMMIT` (rollback on any error), in order:

1. rebuild a legacy `events` table whose `CHECK` uses `json_valid` (rejected by some system SQLite builds under untrusted schema);
2. apply duration changes, then moment changes, validating each entity alone against the new settings;
3. re-place in the duration tree every changed duration and every duration anchored to a moved or deleted moment (anchors to deleted moments become fixed at the moment's last time);
4. drop links of deleted entities, apply link changes, and re-place every arc whose link changed or whose endpoint moved;
5. for every time a moment left or reached, delete that `points` row and insert it again weighted by `count(*)` of moments now at that time (or not at all);
6. replace the settings tables and `set_layout(token)`.

The persistent AVL trees have stable node IDs, so step 3 and 4 rewrite only the nodes on the changed intervals' paths; step 5 touches one bucket per affected time. The cost is therefore proportional to the change (times a logarithm of the timeline), applied twice (file and baseline).

The Tauri command `desktop_save` wraps this: the destination must still be the file the editor believes is open (`expected_path`), the generation must be current, and the file's stamp must equal the one recorded at the last open or save; otherwise it refuses and asks for Save As. The dialog for Save As runs without the lock; all checks are repeated under it, and the lock is held for the whole save. Afterwards the new baseline, path, stamp and generation are installed and kept baselines are forgotten.

### Staged bulk patches and undo

```
desktop_stage_patch(generation, patch, progress_channel):
  current := baseline(generation)                   # stale generation: refuse
  staged := current.with_patch(patch, progress)     # off the UI thread, without the Files lock
      # with_patch: lock current.query_gate; validate; Snapshot::open(current.path);
      #             apply_with(staged, patch, token(), progress every 2000 changes)
  lock Files; refuse if generation changed meanwhile
  before := baseline_id
  after := replace_baseline(staged)                 # pushes (before, current) onto kept (≤ 8)
  return {header, generation, before, after}

desktop_restore_baseline(generation, id):          # undo (id = before) or redo (id = after)
  lock Files; refuse if generation changed
  snapshot := kept[id] or refuse ("can no longer be undone")
  replace_baseline(snapshot, id)                    # the current one is kept in its place

replace_baseline(b, id?):
  kept := kept without baseline_id, plus (baseline_id, current baseline); drop oldest beyond 8
  baseline_id := id or ++next_id;  remove id from kept
  baseline := b; generation += 1
```

The editor records each staged change in its own undo history as `{baseline: {before, after}}`; undo and redo of that entry call `desktop_restore_baseline`. Both refuse while the page holds other unsaved edits, since switching baselines would silently drop them. Saving (or opening another file) forgets the kept baselines. The editor tracks whether the open baseline is the one last saved (`desktopSavedBaseline`), so undoing back to it clears the "unsaved" state.

### Edge cases

- **External change.** The stamp covers the main file and its `-wal`; any difference in size or modification time refuses an ordinary save (Save As keeps both versions).
- **Crash during save.** Both write paths are single SQLite transactions on the destination; an interrupted save leaves the file as it was. If the file was saved but the baseline update failed, the baseline is re-copied from the saved file.
- **Mistaken destination.** Save As over an existing non-timeline database with any schema object is refused.
- **Abnormal exit.** Baseline directories are removed on normal release; an abnormal exit can leave them in the system temporary directory.
- **Older files.** Open normally; their first save takes the copy path and writes the current layout.

### Complexity

| Operation                   | Time                               | Space / I/O                               |
| --------------------------- | ---------------------------------- | ----------------------------------------- |
| Open                        | O(file size) copy + O(1) header    | one disk copy                             |
| Viewport query              | bounded by window and group limits | ≤ 8 MiB result budget                     |
| In-place save of k changes  | O(k log n) on file and on baseline | no copy                                   |
| Copying save                | O(file size) + O(k log n)          | one disk copy                             |
| Staged bulk patch           | O(file size) copy + O(k log n)     | one disk copy per kept baseline (≤ 8 + 1) |
| Undo/redo of a staged patch | O(1) (switches an `Arc`)           | none                                      |

### Variations

- The token may be any value unique per write (a random 128-bit number, a counter in a shared store, a content hash of the written pages); the scheme needs only that two holders of equal tokens hold equal data.
- The token may live in a SQLite pragma field (`user_version` cannot, being part of the format identity), a header page, or a sidecar, provided it is written in the same transaction as the data.
- The private baseline may be a copy-on-write clone (reflink) of the file instead of a backup copy, with the same token semantics.
- The number of kept baselines is a memory/disk trade-off; any bound, or a bound by total disk use, works the same way.
- The same staging applies to any bulk operation expressible as a sparse patch (time mapping, range deletion, retagging).

## Implementation references

- `native-store/src/lib.rs` — [file format](https://github.com/openchronology/timeline-app/blob/007091ce62fdb402346c0712b0c420eac0a29dff/native-store/src/lib.rs#L1-L32); [`check_file`](https://github.com/openchronology/timeline-app/blob/007091ce62fdb402346c0712b0c420eac0a29dff/native-store/src/lib.rs#L183-L202) — identity and real-table checks; [`save`](https://github.com/openchronology/timeline-app/blob/007091ce62fdb402346c0712b0c420eac0a29dff/native-store/src/lib.rs#L335-L362) — whole-document save with a new token.
- `native-store/src/intervals.rs` — [`token`, `layout`, `set_layout`](https://github.com/openchronology/timeline-app/blob/007091ce62fdb402346c0712b0c420eac0a29dff/native-store/src/intervals.rs#L441-L488).
- `native-store/src/sqlite.rs` — [`backup_to`](https://github.com/openchronology/timeline-app/blob/007091ce62fdb402346c0712b0c420eac0a29dff/native-store/src/sqlite.rs#L203-L232) — online backup in steps of 128 pages with a 10 s busy deadline.
- `native-store/src/workspace.rs` — [module overview](https://github.com/openchronology/timeline-app/blob/007091ce62fdb402346c0712b0c420eac0a29dff/native-store/src/workspace.rs#L1-L18); [`Snapshot`, `Snapshot::open`](https://github.com/openchronology/timeline-app/blob/007091ce62fdb402346c0712b0c420eac0a29dff/native-store/src/workspace.rs#L149-L244); [`header`](https://github.com/openchronology/timeline-app/blob/007091ce62fdb402346c0712b0c420eac0a29dff/native-store/src/workspace.rs#L287-L313); [`with_patch`, `save_patch`](https://github.com/openchronology/timeline-app/blob/007091ce62fdb402346c0712b0c420eac0a29dff/native-store/src/workspace.rs#L634-L716); [`current_layout`, `matching_file`, `apply`, `apply_with`](https://github.com/openchronology/timeline-app/blob/007091ce62fdb402346c0712b0c420eac0a29dff/native-store/src/workspace.rs#L718-L769); [`apply_changes`](https://github.com/openchronology/timeline-app/blob/007091ce62fdb402346c0712b0c420eac0a29dff/native-store/src/workspace.rs#L770-L1098).
- `src-tauri/src/main.rs` — [`stamp`, `Files`, `replace_baseline`, `forget_kept`](https://github.com/openchronology/timeline-app/blob/007091ce62fdb402346c0712b0c420eac0a29dff/src-tauri/src/main.rs#L130-L213); [`desktop_stage_patch`, `desktop_restore_baseline`](https://github.com/openchronology/timeline-app/blob/007091ce62fdb402346c0712b0c420eac0a29dff/src-tauri/src/main.rs#L229-L297); [`desktop_open`](https://github.com/openchronology/timeline-app/blob/007091ce62fdb402346c0712b0c420eac0a29dff/src-tauri/src/main.rs#L298-L334); [`desktop_accept_open`, `baseline`](https://github.com/openchronology/timeline-app/blob/007091ce62fdb402346c0712b0c420eac0a29dff/src-tauri/src/main.rs#L401-L439); [`desktop_save`](https://github.com/openchronology/timeline-app/blob/007091ce62fdb402346c0712b0c420eac0a29dff/src-tauri/src/main.rs#L462-L553).
- `src/app.ts` — [moving a large document to a native baseline](https://github.com/openchronology/timeline-app/blob/007091ce62fdb402346c0712b0c420eac0a29dff/src/app.ts#L3027-L3050); [`stageOnDesktop`, `restoreBaseline`](https://github.com/openchronology/timeline-app/blob/007091ce62fdb402346c0712b0c420eac0a29dff/src/app.ts#L5912-L5979).
- [docs/architecture.md, "Desktop SQLite viewport storage"](https://github.com/openchronology/timeline-app/blob/007091ce62fdb402346c0712b0c420eac0a29dff/docs/architecture.md#desktop-sqlite-viewport-storage) — the user-level description.

## Benchmarks

From [docs/benchmarks.md, "Findings"](https://github.com/openchronology/timeline-app/blob/007091ce62fdb402346c0712b0c420eac0a29dff/docs/benchmarks.md#findings) (a local run on 16 cores; SQLite operations timed in-process with criterion):

- **Open.** The desktop app copies a 200,000-moment file into a private baseline in 1.1 s; the in-memory editor parses and indexes the same file in 34 s in Node (21 s in Chromium).
- **Save.** Creating, updating or deleting one moment, saved to the opened file and its baseline in place: 2.1 ms at 1,000 moments, 2.3 ms at 10,000 and 2.6 ms at 100,000. Before in-place saves, every save copied the whole file twice and rebuilt the duration and arc indexes: 13 ms at 1,000 moments, 105 ms at 10,000 and 1.2 s at 100,000.
- **Interactive open** ([docs/benchmarks.md, "Results"](https://github.com/openchronology/timeline-app/blob/007091ce62fdb402346c0712b0c420eac0a29dff/docs/benchmarks.md#results), AMD Ryzen 7 7730U laptop, desktop app under Xvfb): 1.61 s at 1,000 moments and 1.16 s at 10,000 from opening to the first drawn view.
- No benchmark measures staged bulk patches; `test/desktop-bulk.mjs` checks shifting and deleting in a large file with Undo and Redo in the real app, and the native tests `staged_patches_leave_the_baseline_and_file_until_saved_whole` and `random_sparse_saves_match_a_model_and_a_rebuild` (in `workspace.rs`) check that staging leaves the file untouched and that in-place saves match a rebuild.

## First public disclosure

| Component                                                                                       | First commit       | First release |
| ----------------------------------------------------------------------------------------------- | ------------------ | ------------- |
| `.och` SQLite format (`application_id` 1329812556)                                              | 88aea8c 2026-10-05 | v0.1.0        |
| Disk-backed baseline (`Snapshot::open`, backup copy, file and WAL stamps)                       | 6530edf 2026-10-07 | v0.1.0        |
| Save tokens and token-matched in-place saves (`intervals::token`, `matching_file`)              | 41769f1 2026-10-08 | v0.1.0        |
| Staged bulk patches with kept baselines (`with_patch`, `desktop_stage_patch`, `KEPT_BASELINES`) | bd8d487 2026-10-15 | v0.1.0        |

The repository has been public on GitHub since 2026-10-05, so these commit dates on `main` are public dates.
