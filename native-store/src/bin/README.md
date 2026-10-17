# native-store/src/bin

Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only

Command-line tools built from the native store (`cargo build --manifest-path native-store/Cargo.toml --release --locked --bin <name>`). The server runs `och-convert` from `native-store/target/release/` unless `OCH_CONVERTER` names another; `och-seed` is for the benchmarks ([`bench/`](../../../bench/README.md)).

## Contents

| File                               | What it is for                                                                                                         |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| [`och-convert.rs`](och-convert.rs) | Converts between SQLite timeline files and JSON for the server, one file per process, within size and resource limits. |
| [`och-seed.rs`](och-seed.rs)       | Writes benchmark timelines as SQLite files, without the converter's size limits.                                       |
