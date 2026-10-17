# native-store/benches

Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only

Criterion benchmarks of the native store, run by `npm run bench` with the other benchmarks ([`bench/`](../../bench/README.md)) and described in the [benchmarks](../../docs/benchmarks.md). Seed their data first with `node bench/seed.mjs`.

## Contents

| File                         | What it is for                                                                                           |
| ---------------------------- | -------------------------------------------------------------------------------------------------------- |
| [`backends.rs`](backends.rs) | Latency of the SQLite store's operations through the API the desktop app calls, for each benchmark size. |
