# native-store/src

Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only

The native store's Rust code. `lib.rs` is the crate the desktop app (`src-tauri/`) and the binaries in `bin/` use; it reads and writes timeline documents in the same shape as the editor's (`src/core.ts`), and keeps times as exact rationals in SQLite through sqlite-rational.

## Contents

| File                           | What it is for                                                                                                                                 |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| [`bin/`](bin/README.md)        | Command-line tools: file conversion for the server, and writing benchmark files.                                                               |
| [`intervals.rs`](intervals.rs) | Persistent AVL interval trees of durations and relationship arcs in the file, updated along one path per change.                               |
| [`lib.rs`](lib.rs)             | The store: timeline documents, saving, opening and checking SQLite timeline files, and the summary and filter queries.                         |
| [`sqlite.rs`](sqlite.rs)       | A small binding to the system SQLite that sqlite-rational links.                                                                               |
| [`workspace.rs`](workspace.rs) | The desktop app's disk-backed copy of an open file: windowed queries, so browsing never reads every moment, and staged edits saved as patches. |
