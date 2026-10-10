# Benchmarks

The benchmark suite measures how operation latency grows with timeline size on each storage backend:

- **PostgreSQL**: the server's store (`server/store.mjs`), as the HTTP API calls it: viewport and page queries, and sparse saves.
- **SQLite (desktop)**: the native store (`native-store`), through the same API the desktop app calls. Tauri IPC is not included.
- **In-memory (browser)**: the editor's `TimelineIndex`, which serves offline HTML files and opened `.ochx` documents.

The report draws one chart per operation, with timeline size on the x axis, latency on a shared y axis, and one line per backend. [Interaction benchmarks](#interactions) time real input in the editor against the responsiveness budgets these measurements define.

## Running

```sh
npm run bench:seed     # build the editor, generate seeds (once per size)
npm run bench          # measure, then write bench/results/report.html
npm run bench:capacity # only the in-browser capacity measurements
npm run bench:ui       # only the interaction benchmarks
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

## Realtime updates

`npm run bench:realtime` (or `test/syslog-live-postgres.mjs` with `SOAK_RATE` and `SOAK_SECONDS`) streams syslog messages at a steady rate through the [syslog receiver](syslog.md), the API, PostgreSQL and the live event stream to an editor open in Chromium. For each message it measures the time from sending it until the open editor's moment count includes it. Afterwards it checks that every message is stored exactly once. Messages alternate between UDP and TCP; the receiver saves every 200 ms (the default `SYSLOG_FLUSH_MS` of 1 s adds up to a second).

Measured on an AMD Ryzen 7 7730U laptop (16 threads), with PostgreSQL in Docker and the production Next.js server:

| Rate      | Messages | Viewer latency p50 |    p95 |    Max | Stored         |
| --------- | -------: | -----------------: | -----: | -----: | -------------- |
| 20/s (CI) |      200 |             125 ms | 225 ms | 234 ms | all, once each |
| 100/s     |    6,000 |             128 ms | 220 ms | 254 ms | all, once each |
| 500/s     |   15,000 |             151 ms | 242 ms | 360 ms | all, once each |
| 1,000/s   |   20,000 |             177 ms | 482 ms | 801 ms | all, once each |

Latency stays near the save interval up to 500 messages a second; at 1,000 a second the slowest messages wait longer (p95 482 ms, max 801 ms), with each save carrying about 200 moments. Nothing was lost or duplicated at any rate. Each save is one API request, so a single timeline needs about 300 requests a minute at a 200 ms interval and 60 at the default. `API_KEY_REQUESTS_PER_MINUTE` (default 120) must allow this.

## Interactions

`bench/ui.mjs` drives the editor with real input, Playwright mouse, keyboard and touch in Chromium, and times each interaction. Timing runs from the input event's own timestamp to the frame in which the result is painted. For continuous gestures it records the longest frame while the gesture runs. An injected probe (`bench/ui/probe.js`) does the timing in the page without browser-specific APIs, so the desktop app's WebKit can be measured the same way.

It checks the results against two rules, both from `src/capacity.ts`:

1. **Within a platform's comfortable size** (`COMFORTABLE`, from the capacity data above), every interaction meets its budget.
2. **Wherever an interaction misses its budget,** the editor is already advising another platform. A miss without that advice is reported as an _advice gap_.

| Budget     |  Limit | Applies to                                                                                                                                                              |
| ---------- | -----: | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `response` | 100 ms | A click, key or tap until its result shows: opening a moment, typing, Save and Cancel, the delete confirmation, a new duration, opening search, the pause after an edit |
| `view`     | 150 ms | Zooming, panning, Fit all, undo and redo, until the new view is drawn                                                                                                   |
| `frame`    | 150 ms | The longest frame during a drag, wheel zooming or a pinch: frames may drop while the view redraws, but it never stalls longer than one redraw may take                  |
| `results`  |    1 s | Search results, group summaries, the endpoint picker, separations, export, saving to the server, a live update arriving                                                 |
| `open`     |  1.5 s | Opening a timeline                                                                                                                                                      |

The budgets follow the advice thresholds (`response` is `THRESHOLDS.edit`, `view` and `frame` are `THRESHOLDS.redraw`, `open` is `THRESHOLDS.open`), and `results` is the 1 s line in the capacity charts.

The runs cover:

- the in-memory browser editor, at full speed and with the CPU throttled 4×, whose comfortable sizes are 4,000 and 1,000 moments;
- the platform: the production Next.js server with PostgreSQL, signed in as a `bench_ui` user, whose comfortable size is the 200,000-moment limit.

Each interaction is measured `UI_SAMPLES` times (default 5) and judged by its median.

| Variable                               | Default                                            | Meaning                                                                   |
| -------------------------------------- | -------------------------------------------------- | ------------------------------------------------------------------------- |
| `UI_PLATFORMS`                         | `browser,platform` with a database, else `browser` | Which editors to drive                                                    |
| `UI_SIZES`                             | `1000,4000,10000`                                  | Timeline sizes in moments                                                 |
| `UI_THROTTLES`                         | `1,4`                                              | CPU slowdowns for the browser runs                                        |
| `UI_SAMPLES`                           | `5`                                                | Samples per interaction                                                   |
| `UI_SCENARIOS`                         | all                                                | Only these interactions, e.g. `open-moment,search`                        |
| `DATABASE_URL` or `BENCH_DATABASE_URL` | unset                                              | PostgreSQL for the platform runs; the platform also needs `npm run build` |

`node bench/ui.mjs --gate` exits with an error on any budget missed within a comfortable size, and on any advice gap. CI runs it at 1,000 moments for the browser and the platform, allowing 1.5× the budgets (`UI_TOLERANCE`) for slower shared runners. The Benchmarks workflow runs the full set of sizes and adds an **Interactions** table to the report.

### Results

Medians from one run on an AMD Ryzen 7 7730U laptop (16 threads), headless Chromium, PostgreSQL in Docker. "×4" throttles the CPU 4×. Budgets: open 1.5 s, view and frame 150 ms, response 100 ms, results 1 s. **Bold** marks a miss.

| Interaction                 | Browser 1,000 | Browser 4,000 | Browser 10,000 |   ×4 1,000 |   ×4 4,000 | Platform 1,000 | Platform 10,000 | Platform 100,000 |
| --------------------------- | ------------: | ------------: | -------------: | ---------: | ---------: | -------------: | --------------: | ---------------: |
| Open                        |        208 ms |        436 ms |         838 ms |     699 ms | **1.70 s** |         482 ms |          272 ms |           276 ms |
| Wheel zoom                  |        135 ms |    **215 ms** |     **279 ms** | **350 ms** | **766 ms** |         141 ms |      **316 ms** |            44 ms |
| Drag to pan (longest frame) |         83 ms |        150 ms |     **217 ms** | **350 ms** | **617 ms** |          67 ms |      **183 ms** |            17 ms |
| Pinch zoom (longest frame)  |         83 ms |    **233 ms** |     **300 ms** | **367 ms** | **900 ms** |          50 ms |      **233 ms** |            17 ms |
| Fit all                     |         63 ms |        100 ms |         129 ms | **217 ms** | **363 ms** |          33 ms |           35 ms |            53 ms |
| Open a moment               |         14 ms |         11 ms |          19 ms |      29 ms |      30 ms |          27 ms |           30 ms |       **103 ms** |
| Typing (per key)            |         38 ms |         46 ms |          46 ms |      41 ms |      40 ms |          45 ms |           39 ms |            46 ms |
| New duration                |         52 ms |         93 ms |     **135 ms** | **193 ms** | **387 ms** |          55 ms |           82 ms |            89 ms |
| Delete (ask, then remove)   |         81 ms |         98 ms |     **152 ms** | **104 ms** | **146 ms** |          15 ms |           77 ms |       **132 ms** |
| Search results              |         24 ms |         31 ms |          91 ms |      49 ms |     132 ms |          70 ms |           65 ms |           112 ms |
| Separate by tags and rejoin |        115 ms |        233 ms |         341 ms |     478 ms |     955 ms |          39 ms |           36 ms |            84 ms |
| Save to server              |               |               |                |            |            |          33 ms |          100 ms |           151 ms |
| Live update arriving        |               |               |                |            |            |          31 ms |           30 ms |           837 ms |

What this shows:

- **Navigation is the bottleneck.** Discrete actions (opening a moment, typing, saving, searching) stay well within budget almost everywhere. Zooming, panning and pinching miss it as soon as many moments are drawn individually. Each zoom step redraws the labels, which costs 70–80 ms at 1,000 moments; a 50 ms frame budget is out of reach until that drawing is cheaper (#68).
- **The comfortable sizes are optimistic for gestures.** Navigation misses its budget in the browser at 4,000 moments (the documented comfortable size), and on a throttled CPU already at 1,000. The platform misses it at 10,000 moments but not at 100,000, where the view collapses into summaries. So the cost follows how many moments are drawn, not how many are stored.
- **The advice shows too late.** Beyond the comfortable sizes, most misses happen without the advice showing ("advice gaps"). The advice compares the editor's own drawing time with 150 ms; users wait longer than that, from input to paint (#69).

CI checks 1,000 moments, where every interaction meets its budget on both the browser and the platform.

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
