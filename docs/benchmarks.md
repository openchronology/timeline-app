# Benchmarks

The benchmark suite measures how operation latency grows with timeline size on each storage backend:

- **PostgreSQL**: the server's store (`server/store.mjs`), as the HTTP API calls it: viewport and page queries, and sparse saves.
- **SQLite (desktop)**: the native store (`native-store`), through the same API the desktop app calls. Tauri IPC is not included.
- **In-memory (browser)**: the editor's `TimelineIndex`, which serves offline HTML files and opened `.ochx` documents.

The report draws one chart per operation, with timeline size on the x axis, latency on a shared y axis, and one line per backend. User-interface benchmarks (rendering and interaction) are not included yet.

## Running

```sh
npm run bench:seed     # build the editor, generate seeds (once per size)
npm run bench          # measure, then write bench/results/report.html
npm run bench:report   # rebuild the report from existing results
```

| Variable             | Default                    | Meaning                                                           |
| -------------------- | -------------------------- | ----------------------------------------------------------------- |
| `BENCH_SIZES`        | `1000,10000,100000,200000` | Timeline sizes, in moments                                        |
| `BENCH_TIME`         | `1000`                     | Measurement time per operation and size, in milliseconds          |
| `BENCH_DATABASE_URL` | unset                      | PostgreSQL database with `pgmp`; without it PostgreSQL is skipped |
| `BENCH_DATA_DIR`     | `bench/data`               | Seeds; relative paths resolve from the repository root            |
| `BENCH_RESULTS_DIR`  | `bench/results`            | `node.json`, `results.json` and `report.html`                     |

Use a dedicated database. Seeding creates a `bench` user (with quota bypass) and replaces that user's timelines; nothing else is touched. Saving at large sizes is slow on PostgreSQL (see the findings below), so a run at the default sizes takes more than an hour. `BENCH_SIZES=1000,10000` finishes in a few minutes.

The [Benchmarks workflow](../.github/workflows/bench.yml) runs the suite on demand (**Actions → Benchmarks → Run workflow**) at 1,000, 10,000 and 50,000 moments by default, against a fresh PostgreSQL 16 with native `pgmp`, and uploads `bench/results/` as the `benchmark-report` artifact. Hosted runners share hardware, so compare backends and sizes within one run rather than absolute numbers across runs.

## Seeds

`bench/generate.mjs` generates deterministic timelines: the same size always produces the same document. Coordinates span 0 to 10⁹ with exact 1/8 fractions. Two thirds of moments fall in dense clusters, with coincident times, and the rest are spread uniformly. Each moment has a title and notes, and about half of the entities carry tags. There is one duration per ten moments (a third anchored to moments; most short, some long) and one relationship per ten moments.

`bench/seed.mjs` writes each timeline as `timeline-<size>.ochx`, converts it to `timeline-<size>.och` with `och-seed` (the native store's own `save`), and, with `BENCH_DATABASE_URL`, creates it in PostgreSQL through the server's store. It also writes `workload-<size>.json`: the viewports, page window and target moment (the middle of the document's moments) the operations use, with summary thresholds computed for a 1,000-pixel-wide view. Seeds are reused unless `--force` is passed.

## Operations

| Operation                    | What is measured                                                                |
| ---------------------------- | ------------------------------------------------------------------------------- |
| Viewport: whole timeline     | The overview frame for the whole timeline: summaries, bands and arcs            |
| Viewport: 1% of the timeline | The frame for a window of 1% of the span, centred on the middle                 |
| Read a page of 100 moments   | The first 100 moments from the middle to the end, as the moment list loads them |
| Read one moment              | One moment by ID and time                                                       |
| Create a moment              | Saving one new moment (removed again between samples)                           |
| Update a moment              | Saving one changed moment (restored between samples)                            |
| Delete a moment              | Deleting one moment (re-created between samples)                                |

Every backend performs the same operations with the same inputs. Writes are sparse patches, as the editor sends them. The cleanup between samples is excluded from the measurement. SQLite writes use `save_patch`, which copies the unchanged seed file and applies the patch, so each sample starts from the same file.

## Method

- **In-memory and PostgreSQL** use [tinybench](https://github.com/tinylibs/tinybench) in Node. Each task runs at least 10 iterations and for at least `BENCH_TIME`, after 2 warm-up iterations. The report shows the mean and standard deviation of individual calls, plus the median, p99, sample count and relative margin of error.
- **SQLite** uses [criterion](https://github.com/bheisler/criterion.rs) in-process, with 10 samples after a 500 ms warm-up. Criterion times batches of calls and reports the mean per call and the standard deviation across samples. Its spread is therefore narrower than tinybench's per-call spread, and the p99 is the slowest sample's mean per call.
- Both axes are logarithmic, so equal slopes mean equal growth rates: a line with slope 1 grows linearly with size. Whiskers show ±1 standard deviation. When the deviation exceeds the mean, typically because of garbage-collection pauses, the lower whisker stops at a tenth of the mean and is dashed. Hover or focus a point to see the median and p99; a table under the charts lists every measurement.

## Findings

A local run (16 cores, Node 26, PostgreSQL 16 in Docker, `BENCH_TIME=1000`) measured these means:

| Operation                         |    Size |          In-memory | SQLite | PostgreSQL |
| --------------------------------- | ------: | -----------------: | -----: | ---------: |
| Viewport: whole timeline          |   1,000 |             3.5 ms |  16 ms |      61 ms |
|                                   |  10,000 |              14 ms | 105 ms |      95 ms |
|                                   | 100,000 | 283 ms (p50 47 ms) | 922 ms |     331 ms |
| Viewport: 1% of the timeline      | 100,000 |              30 ms | 427 ms |     252 ms |
| Read a page of 100 moments        | 100,000 |              87 µs | 616 µs |     7.6 ms |
| Read one moment                   | 100,000 |              14 µs | 150 µs |     5.4 ms |
| Create, update or delete a moment |   1,000 |             0.1 ms |  12 ms |     180 ms |
|                                   |  10,000 |             0.1 ms |  97 ms |      1.6 s |
|                                   | 100,000 |             0.2 ms |  1.2 s |     18.5 s |

- **Reads scale well.** Pages and single moments stay flat from 1,000 to 100,000 moments on every backend; PostgreSQL's few milliseconds are mostly round trips.
- **Saves grow linearly on both persistent backends.** A one-moment save costs about 0.18 ms per thousand moments on PostgreSQL and 0.012 ms per thousand on SQLite, so the slope is 1 on the log-log charts. PostgreSQL rebuilds the timeline's derived data (index, snapshot, search and arcs) on every save. SQLite stages a full copy of the file before applying the patch. Saves that touch only the changed rows would make both flat. Until then, timelines of 100,000 moments save too slowly for interactive editing on the server.
- **Viewports grow too, even in a 1% window.** SQLite is the slowest at 100,000 moments, and the in-memory index has large outliers there, likely garbage collection (mean 283 ms, median 47 ms).
