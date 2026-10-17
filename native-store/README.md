# native-store

Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only

The native store (Rust crate `openchronology-store`): timelines saved as SQLite files (`.och`) with exact rational times, through the vendored sqlite-rational extension ([`vendor/sqlite-rational`](../vendor/README.md)), which `build.rs` compiles with CMake and links with SQLite and GMP. The desktop app ([`src-tauri/`](../src-tauri/README.md)) opens, browses and saves files with it, and the server converts uploaded and downloaded files with its `och-convert` binary (`server/files.mjs`). Building it needs CMake and the SQLite and GMP development libraries; test it with `cargo test --manifest-path native-store/Cargo.toml --locked`. See the [architecture](../docs/architecture.md) for the file format and the [benchmarks](../docs/benchmarks.md) for its latency.

## Contents

| File                            | What it is for                                                                             |
| ------------------------------- | ------------------------------------------------------------------------------------------ |
| [`benches/`](benches/README.md) | Latency benchmarks of the SQLite store.                                                    |
| [`src/`](src/README.md)         | The store's Rust code, and its command-line tools.                                         |
| [`build.rs`](build.rs)          | Builds the vendored sqlite-rational extension with CMake and links it with SQLite and GMP. |
| [`Cargo.lock`](Cargo.lock)      | The store's locked dependency versions.                                                    |
| [`Cargo.toml`](Cargo.toml)      | The store's crate: its dependencies and its benchmark.                                     |
