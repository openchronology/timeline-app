# bench

Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only

Benchmarks: how latency, saves and interactions grow with timeline size on each storage backend and platform. The scripts import the built core (`dist/core.mjs`), so build first (`node scripts/build.mjs`, or `npm run bench:seed`, which also seeds). Seeded timelines go to `bench/data/` and results to `bench/results/`, both untracked. The scripts that need PostgreSQL take `BENCH_DATABASE_URL`. [Benchmarks](../docs/benchmarks.md) explains how to run each one, what it measures and what was found; the [benchmark workflow](../.github/workflows/bench.yml) runs the whole suite on demand.

## Contents

| File                                   | What it is for                                                                                                                             |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| [`ui/`](ui/README.md)                  | Helpers for the UI benchmarks: the in-page probe, the desktop WebDriver driver and the desktop image.                                      |
| [`capacity.mjs`](capacity.mjs)         | Measures how the in-browser editor copes with large timelines in Chromium, at full speed and throttled, and what each platform stores.     |
| [`export-cache.mjs`](export-cache.mjs) | Times downloading a large timeline’s .ochx and .och files with the export cache (#204), first and cached.                                  |
| [`fork-reads.mjs`](fork-reads.mjs)     | Times reads and saves on a fork that reads through to its source's index (#145), against the same on the source.                           |
| [`fork-text.mjs`](fork-text.mjs)       | Times rebuilding a fork's catalogue text after its source has been saved many times (#285), against the same on the source.                |
| [`fork-save.mjs`](fork-save.mjs)       | Times forking a large timeline and saving to the fork, including forks of forks past the index's read-through levels.                      |
| [`generate.mjs`](generate.mjs)         | Generates deterministic benchmark timelines and workloads: the same size and seed always give the same document.                           |
| [`report.mjs`](report.mjs)             | Combines the tinybench and criterion results into one self-contained HTML report, a chart per operation.                                   |
| [`run.mjs`](run.mjs)                   | Latency benchmarks for the in-memory index and PostgreSQL, measured with tinybench.                                                        |
| [`save-size.mjs`](save-size.mjs)       | Times appending and changing moments in saves against timeline size (#135), to keep large saves under the server's statement timeout.      |
| [`seed.mjs`](seed.mjs)                 | Seeds the benchmark timelines as `.ochx`, `.och` (SQLite) and, with `BENCH_DATABASE_URL`, PostgreSQL.                                      |
| [`ui.mjs`](ui.mjs)                     | UI benchmarks: real interactions timed from input to the frame that shows them, checked against the budgets and the platform advice (#51). |
