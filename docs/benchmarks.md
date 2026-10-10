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
npm run bench:capacity # only the in-browser capacity measurements
npm run bench:report   # rebuild the report from existing results
```

| Variable             | Default                    | Meaning                                                           |
| -------------------- | -------------------------- | ----------------------------------------------------------------- |
| `BENCH_SIZES`        | `1000,10000,100000,200000` | Sizes in moments (up to 200,000), separated by commas or spaces   |
| `BENCH_TIME`         | `1000`                     | Measurement time per operation and size, in milliseconds          |
| `BENCH_DATABASE_URL` | unset                      | PostgreSQL database with `pgmp`; without it PostgreSQL is skipped |
| `BENCH_DATA_DIR`     | `bench/data`               | Seeds; relative paths resolve from the repository root            |
| `BENCH_RESULTS_DIR`  | `bench/results`            | `node.json`, `capacity.json`, `results.json` and `report.html`    |
| `BENCH_THROTTLES`    | `1,4`                      | CPU slowdowns for the in-browser measurements                     |

Use a dedicated database. Seeding creates a `bench` user (with quota bypass) and replaces that user's timelines; nothing else is touched. Opening 200,000-moment timelines in a throttled browser takes minutes per sample, so a run at the default sizes takes about an hour. `BENCH_SIZES=1000,10000` finishes in a few minutes. The capacity measurements need Chromium (`npx playwright install chromium`); without it they are skipped.

The [Benchmarks workflow](../.github/workflows/bench.yml) runs the suite on demand (**Actions → Benchmarks → Run workflow**) at 1,000, 10,000, 50,000, 100,000 and 200,000 moments by default, against a fresh PostgreSQL 16 with native `pgmp`, and uploads `bench/results/` as the `benchmark-report` artifact. Hosted runners share hardware, so compare backends and sizes within one run rather than absolute numbers across runs.

## Seeds

`bench/generate.mjs` generates deterministic timelines: the same size always produces the same document. Coordinates span 0 to 10⁹ with exact 1/8 fractions. Two thirds of moments fall in dense clusters, with coincident times, and the rest are spread uniformly. Each moment has a title and notes, and about half of the entities carry tags. There is one duration per ten moments (a third anchored to moments; most short, some long) and one relationship per ten moments.

`bench/seed.mjs` writes each timeline as `timeline-<size>.ochx`, converts it to `timeline-<size>.och` with `och-seed` (the native store's own `save`), and, with `BENCH_DATABASE_URL`, creates it in PostgreSQL through the server's store. It also writes `workload-<size>.json`: the viewports, page window and target moment (the middle of the document's moments) the operations use, with summary thresholds computed for a 1,000-pixel-wide view. Seeds are reused unless `--force` is passed.

## Operations

| Operation                    | What is measured                                                                |
| ---------------------------- | ------------------------------------------------------------------------------- |
| Open a timeline              | What each platform does before it can draw (see below)                          |
| Viewport: whole timeline     | The overview frame for the whole timeline: summaries, bands and arcs            |
| Viewport: 1% of the timeline | The frame for a window of 1% of the span, centred on the middle                 |
| Read a page of 100 moments   | The first 100 moments from the middle to the end, as the moment list loads them |
| Read one moment              | One moment by ID and time                                                       |
| Create a moment              | Saving one new moment (removed again between samples)                           |
| Update a moment              | Saving one changed moment (restored between samples)                            |
| Delete a moment              | Deleting one moment (re-created between samples)                                |

Every backend performs the same operations with the same inputs. Writes are sparse patches, as the editor sends them. The cleanup between samples is excluded from the measurement. SQLite writes save to a working copy of the seed file with `save_patch`, as the desktop app saves the open file; each sample is undone by another save, unmeasured.

Opening differs by platform:

- **Browser:** parses and validates the whole file, builds the in-memory index and draws the first frame.
- **Desktop:** copies and checks the file into a private baseline, then queries the first view.
- **Platform:** reads the timeline's metadata and the first view.

## Capacity

`bench/capacity.mjs` measures the in-browser editor itself, in Chromium through Playwright. Each measurement runs at full speed and with the CPU throttled 4× through the DevTools protocol; the throttled run roughly approximates a mid-range phone. For each size it records:

- **Open:** from importing the file until the editor has drawn the fitted view (the median of three fresh pages, two at 100,000 moments and more).
- **Redraw:** from applying new bounds until the view is drawn (the median of five).
- **Pause after an edit:** the longest gap between animation frames in the three seconds after renaming the timeline. It is measured while signed in with a timeline kept only in the browser, so it includes the redraw and the draft saved 0.7 s later. Guests keep no draft, so for them only the redraw remains.
- **Draft save:** the time the editor spends on the main thread storing each change to the draft, from its `openchronology:draft-changes` performance measures.
- **Memory:** the JavaScript heap held after opening, after garbage collection.

It also records the SQLite file size and the PostgreSQL rows a timeline occupies (its moments, indexes, search and links, excluding B-tree indexes and history). The report's capacity charts place these beside the equivalent desktop and platform measurements, with reference lines at 100 ms (responses feel instant) and 1 s (users keep their attention). Where a line crosses them shows where that platform stops feeling responsive.

## Method

- **In-memory and PostgreSQL** use [tinybench](https://github.com/tinylibs/tinybench) in Node. Each task runs at least 10 iterations and for at least `BENCH_TIME`, after 2 warm-up iterations. The report shows the mean and standard deviation of individual calls, plus the median, p99, sample count and relative margin of error.
- **SQLite** uses [criterion](https://github.com/bheisler/criterion.rs) in-process, with 10 samples after a 500 ms warm-up. Criterion times batches of calls and reports the mean per call and the standard deviation across samples. Its spread is therefore narrower than tinybench's per-call spread, and the p99 is the slowest sample's mean per call.
- Both axes are logarithmic, so equal slopes mean equal growth rates: a line with slope 1 grows linearly with size. Whiskers show ±1 standard deviation. When the deviation exceeds the mean, typically because of garbage-collection pauses, the lower whisker stops at a tenth of the mean and is dashed. Hover or focus a point to see the median and p99; a table under the charts lists every measurement.

## Findings

A local run (16 cores, Node 26, PostgreSQL 16 in Docker, `BENCH_TIME=1000`) measured these means:

| Operation                         |    Size |          In-memory | SQLite | PostgreSQL |
| --------------------------------- | ------: | -----------------: | -----: | ---------: |
| Open a timeline                   |  10,000 |              0.7 s |  0.1 s |      18 ms |
|                                   | 200,000 |               34 s |  1.1 s |      35 ms |
| Viewport: whole timeline          |   1,000 |             3.3 ms | 7.1 ms |      10 ms |
|                                   |  10,000 |              13 ms |  16 ms |      14 ms |
|                                   | 100,000 | 292 ms (p50 50 ms) |  31 ms |      27 ms |
| Viewport: 1% of the timeline      |   1,000 |             0.7 ms | 1.9 ms |     3.0 ms |
|                                   |  10,000 |             6.3 ms | 8.5 ms |     7.5 ms |
|                                   | 100,000 |             8.4 ms |  14 ms |      11 ms |
| Read a page of 100 moments        | 100,000 |              91 µs | 619 µs |     3.6 ms |
| Read one moment                   | 100,000 |              23 µs | 148 µs |     0.7 ms |
| Create, update or delete a moment |   1,000 |             0.1 ms | 2.1 ms |     4.4 ms |
|                                   |  10,000 |             0.1 ms | 2.3 ms |     5.0 ms |
|                                   | 100,000 |             0.2 ms | 2.6 ms |     4.6 ms |

- **Opening is where the in-memory editor runs out.** It parses and indexes the whole file, which takes 0.7 s at 10,000 moments and 34 s at 200,000 in Node (21 s in Chromium). The desktop app copies the file into a private baseline (1.1 s at 200,000), and the platform reads only metadata and the first view. The capacity charts and [Timeline size and platforms](capacity.md) turn this into guidance per platform.
- **Reads scale well.** Pages and single moments stay flat from 1,000 to 100,000 moments on every backend. PostgreSQL's few milliseconds are mostly round trips.
- **PostgreSQL saves are flat.** A sparse save updates only the changed rows and the tree paths they touch ([incremental saves](architecture.md#incremental-saves)), so a one-moment save costs the same at 1,000 and 100,000 moments. Before that change, every save rebuilt the timeline's derived data: 180 ms at 1,000 moments, 1.6 s at 10,000 and 18.5 s at 100,000. Once per 1,000 saves (or when patches outweigh the document), a save also writes a full snapshot for history, which takes about 2 s at 100,000 moments.
- **SQLite saves are flat too.** They apply in place to the open file and its baseline (2.1 ms at 1,000 moments, 2.6 ms at 100,000). Previously, every save copied the whole file twice and rebuilt the duration and arc indexes: 13 ms at 1,000 moments, 105 ms at 10,000 and 1.2 s at 100,000. The benchmark saves to the opened file, as the desktop app does, and undoes each sample unmeasured.
- **Viewports grow slowly.** Summaries of collapsed durations used to dominate. The tree walk visited nearly every duration, because long durations blocked its shortcuts and pruning used durations' ends. SQLite and PostgreSQL now compute summaries set-based over an index on starts, and the browser prunes by start. At 100,000 moments this took SQLite from 945 ms to 31 ms for the whole timeline and from 430 ms to 14 ms for a 1% window. It took PostgreSQL from 99 ms to 27 ms and from 49 ms to 11 ms. The in-memory 1% window went from 34 ms to 8.4 ms. SQLite also returns bands and arcs in start order and stops at the 257th, instead of finding every match first. With few durations, PostgreSQL's per-cluster queries cost a little more than the old walk (10 ms against 7 ms at 1,000 moments). The in-memory index has large outliers at 100,000 moments, likely garbage collection (mean 292 ms, median 50 ms).
