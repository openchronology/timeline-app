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

## Save time against timeline size

`node bench/save-size.mjs [sizes] [runs]` (with `BENCH_DATABASE_URL`; sizes comma-separated, default `100000,1000000`) creates a timeline of each size and times appending 10, 1,000 and 5,000 moments after its last (as log ingestion does) and changing 1,000 moments spread through it, each the median of three saves. The server stops any statement after 30 s, so the largest saves must stay well under it as timelines grow (#135).

Measured on an 8-core virtual machine with PostgreSQL 17:

| Moments   | Create | Append 10 | Append 1,000 | Append 5,000 | Change 1,000 spread |
| --------- | -----: | --------: | -----------: | -----------: | ------------------: |
| 200,000   |  126 s |    0.11 s |       0.91 s |       2.49 s |              0.56 s |
| 1,000,000 |  636 s |    0.24 s |       1.35 s |       5.22 s |              0.75 s |

Before #135, a 200,000-moment timeline took 283 s to create and 4.0 s to append 5,000 moments to (1.7 s for 1,000), and a million-moment one about 96 minutes to create and 21–25 s to append 5,000: a save walked the tree once per key, and starting a new timeline's saved history looked each duration up again by an expression the planner did not yet know to use.

## Saves after large writes

`node bench/fork-save.mjs [moments]` (with `BENCH_DATABASE_URL`) creates a timeline, forks it, and times a 10-moment save to the fork straight away and again after an `ANALYZE`. A timeline written in one go (created, imported, forked, or rebuilt by a large save or merge) leaves PostgreSQL's statistics counting its rows as none until they are refreshed, and the planner can then read a key through any index that starts with the timeline, filtering every row. The server refreshes the index tables' statistics after such a write of 20,000 moments and durations or more, before answering, and the save path's lookups by key are written to stay one lookup per key whatever the statistics say (#139).

Measured at 200,000 moments on an 8-core virtual machine with PostgreSQL 17:

| Saving 10 moments       | Before |         Now |
| ----------------------- | -----: | ----------: |
| Right after forking     | 5.29 s |      0.16 s |
| With current statistics | 0.28 s | 0.18–0.54 s |

Before, the catalogue text refresh after a large save to a new fork could also exceed the 30 s statement limit; it now takes about 5 s at this size.

## Catalogue text on forks

`node bench/fork-text.mjs [moments] [source saves] [moments per save]` (with `BENCH_DATABASE_URL`; default 5,000, 100 and 20) creates a timeline, copies it (the copy reads through to it), saves the source that many times, saves the copy once, and times rebuilding each one's catalogue text (`oc_event_text`, as the refresh after a save runs it), the median of five runs. It also checks the copy's text against that of a timeline created from the copy's document.

Walking the moment tree takes a statement per step, and on a fork several: one per level it looks through, a live and then a retired version at each. A timeline of at most 50,000 moments now sorts all their IDs in one query and reads the moments by ID a page at a time instead, still stopping once the text is full; larger ones still walk, as sorting every moment would then cost more than reading 1 MiB of text (#285). Compiling the rebuild's plans (JIT) is turned off too: it took longer than running them. Measured on a 16-core virtual machine with PostgreSQL 16:

| Moments (source saves) | Source, before | Source, now | Fork, before | Fork, now |
| ---------------------- | -------------: | ----------: | -----------: | --------: |
| 5,000 (100)            |    0.29–0.35 s | 0.15–0.18 s |       1.95 s |    0.25 s |
| 20,000 (200)           |         1.13 s |      0.72 s |       5.71 s |    0.60 s |
| 50,000 (200)           |         1.10 s |      1.18 s |       7.58 s |    0.78 s |
| 200,000 (20, walked)   |         0.72 s |      0.72 s |        3.2 s |     3.2 s |

The first rebuild on a connection, which compiled its plans, took about 2.2 s before at 5,000 moments and 0.3 s now (3.0 s and 1.7 s at 200,000, where the rebuild walks as before). The 5,000 and 200,000 rows are interleaved runs on the same data, the others single runs of the benchmark.

## Cached downloads

`node bench/export-cache.mjs [moments]` (with `BENCH_DATABASE_URL`; default 100,000; `OCH_CONVERTER` adds the `.och` file) creates a timeline and times downloading its `.ochx` file through the HTTP server to the last byte: without the [export cache](administration.md#cached-downloads) (the median of five), the first download with it (made from the database and written to the cache as it is sent), and the next ones (the median of five, read from the cache). Measured on a 16-core virtual machine with PostgreSQL 16, the cache on local disk:

| Moments | `.ochx` size | Without the cache | First download | From the cache |
| ------: | -----------: | ----------------: | -------------: | -------------: |
|   5,000 |       0.9 MB |            0.15 s |         0.22 s |         0.04 s |
|  20,000 |       3.5 MB |            0.32 s |         0.39 s |         0.08 s |
| 100,000 |        18 MB |             1.4 s |          1.7 s |         0.26 s |
| 200,000 |        36 MB |             2.6 s |          2.6 s |         0.46 s |

A cached file is read from disk, so its time follows its size and the connection, not the database. At 5,000 moments the `.och` file (1.7 MB) took 2.3 s to convert and 0.06 s from the cache.

## Interactions

`bench/ui.mjs` drives the editor with real input and times each interaction. In Chromium the input comes from Playwright's mouse, keyboard and touch. In the desktop app it comes from W3C WebDriver actions, through `tauri-driver` and WebKitWebDriver. Timing runs from the input event that triggers the result (a click on release, a key on its press, each wheel step) to the frame in which the result is painted. For zooming and panning, that is the frame showing the moments at the new view, which the editor records on `#markers` as it draws them; the axis and the bounds fields can move a frame earlier. The editor's capacity advice times navigation the same way. This is how Event Timing measures interactions, so the time a button is held down is not counted. For continuous gestures it records the longest frame while the gesture runs. An injected probe (`bench/ui/probe.js`) does the timing in the page, with no browser-specific APIs and no `eval`, so it works the same in both engines and under the editor's content security policy.

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

The budgets follow the advice thresholds (`response` is `THRESHOLDS.edit`, `view` and `frame` are `THRESHOLDS.navigation`, `open` is `THRESHOLDS.open`), and `results` is the 1 s line in the capacity charts.

The runs cover:

- the in-memory browser editor, at full speed and with the CPU throttled 4×, whose comfortable sizes are 10,000 and 1,000 moments;
- the platform: the production Next.js server with PostgreSQL, signed in as a `bench_ui` user, whose comfortable size is the 200,000-moment limit;
- the desktop app (WebKitGTK on Linux), whose comfortable size is also the limit. Timelines over 2,048 moments move into the native SQLite store after opening, as for desktop users; smaller ones stay in memory. Pinch gestures are measured in Chromium only, through its DevTools touch input; the desktop driver sends mouse, keyboard and wheel input.

Each interaction is measured `UI_SAMPLES` times (default 5) and judged by its median.

| Variable                               | Default                                            | Meaning                                                                                        |
| -------------------------------------- | -------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `UI_PLATFORMS`                         | `browser,platform` with a database, else `browser` | Which editors to drive                                                                         |
| `UI_SIZES`                             | `1000,4000,10000`                                  | Timeline sizes in moments                                                                      |
| `UI_THROTTLES`                         | `1,4`                                              | CPU slowdowns for the browser runs                                                             |
| `UI_SAMPLES`                           | `5`                                                | Samples per interaction                                                                        |
| `UI_SCENARIOS`                         | all                                                | Only these interactions, e.g. `open-moment,search`                                             |
| `UI_KNOWN`                             | none                                               | Known misses (interactions or groups such as `navigation`): reported, but not failing `--gate` |
| `UI_DESKTOP_APP`                       | the debug build                                    | The desktop app to drive (`npx tauri build --debug --no-bundle` builds it)                     |
| `UI_DEBUG`                             | unset                                              | Print the page's state, recent inputs and messages when an interaction fails                   |
| `DATABASE_URL` or `BENCH_DATABASE_URL` | unset                                              | PostgreSQL for the platform runs; the platform also needs `npm run build`                      |

`node bench/ui.mjs --gate` exits with an error on any budget missed within a comfortable size, and on any advice gap, apart from the known misses. In CI, the gate allows 1.5× the budgets (`UI_TOLERANCE`) for slower shared runners:

- the browser and the platform at 1,000 and 10,000 moments;
- the browser throttled 4× at 1,000 moments, its comfortable size there. A scenario can set its own `gateTolerance` for an exception; none does now;
- the browser past its comfortable sizes, at 20,000 moments and at 2,000 throttled 4×: wherever an interaction misses its budget, the advice must be showing;
- the desktop app at 1,000 moments (in memory) and 10,000 moments (SQLite), under Xvfb, allowing 3×: software rendering on shared runners is slow and varies widely (opening search took 96 ms on a laptop and 140–173 ms in CI). This gate guards against breakage, such as an interaction that fails or never finishes, and gross regressions. Navigation and new durations are reported there, not gated: in software they vary severalfold between runners, and the WebDriver path now and then loses a wheel or key input.

The Benchmarks workflow runs the browser and platform at the full set of sizes and adds an **Interactions** table to the report.

**Keyboard zoom and the first animation frame ([#319](https://github.com/openchronology/timeline-app/issues/319)).** In late October 2026 keyboard zoom measured 246–262 ms in CI on a 4× slowed CPU, against about 150 ms for wheel zoom, and the gate briefly allowed it 2×. Profiling found the cause. Zoom animations took their progress from the frame timestamp, and input is handled at the start of a frame, after that timestamp, so the first frame often saw no time pass and redrew the unchanged view at full cost. With the CPU slowed, the next frame came after the whole 220 ms animation, so keyboard zoom paid two full renders before anything moved, while wheel zoom, which doesn't animate, pays one. The first frame now advances at least one frame interval. CI then measured keyboard zoom at 157 and 105 ms, against 94 and 115 ms for wheel zoom, and the exception was removed. `test/zoom-help-browser.mjs` keeps the first frame moving.

#### Desktop

The desktop runs need `tauri-driver`, WebKitWebDriver (Ubuntu's `webkit2gtk-driver`) and a display. On systems that don't package WebKitWebDriver, such as Arch or macOS, use the container in `bench/ui/desktop.Dockerfile`:

```sh
docker build -t och-desktop-ui -f bench/ui/desktop.Dockerfile bench/ui
docker run --rm -v "$PWD":/repo -v och-desktop-target:/home/ubuntu/target och-desktop-ui \
  bash -c 'node scripts/build.mjs && npx tauri build --debug --no-bundle &&
           UI_PLATFORMS=desktop UI_SIZES=1000,10000 xvfb-run -a node bench/ui.mjs'
```

Xvfb renders in software, so drawing is slower than on a desktop with a GPU; compare desktop results with each other rather than with the Chromium runs.

### Results

Medians from one run on an AMD Ryzen 7 7730U laptop (16 threads): headless Chromium, PostgreSQL in Docker, and the desktop app under Xvfb in Ubuntu 24.04. "×4" throttles the CPU 4×. Budgets: open 1.5 s, view and frame 150 ms, response 100 ms, results 1 s. **Bold** marks a miss.

| Interaction                 | Browser 1,000 | Browser 4,000 | Browser 10,000 |   ×4 1,000 |   ×4 4,000 | Platform 1,000 | Platform 10,000 | Platform 100,000 | Desktop 1,000 | Desktop 10,000 |
| --------------------------- | ------------: | ------------: | -------------: | ---------: | ---------: | -------------: | --------------: | ---------------: | ------------: | -------------: |
| Open                        |        154 ms |        481 ms |         817 ms |     693 ms |     1.26 s |         392 ms |          266 ms |           278 ms |    **1.61 s** |         1.16 s |
| Wheel zoom                  |        114 ms |    **228 ms** |     **285 ms** | **380 ms** | **722 ms** |         109 ms |      **228 ms** |       **274 ms** |        111 ms |     **368 ms** |
| Drag to pan (longest frame) |         83 ms |    **167 ms** |     **217 ms** | **333 ms** | **600 ms** |          50 ms |      **183 ms** |       **217 ms** |        144 ms |     **393 ms** |
| Pinch zoom (longest frame)  |         83 ms |    **250 ms** |     **300 ms** | **400 ms** | **900 ms** |          50 ms |      **200 ms** |       **217 ms** |               |                |
| Fit all                     |         62 ms |        102 ms |         129 ms | **226 ms** | **343 ms** |          30 ms |           48 ms |           139 ms |         87 ms |          23 ms |
| Open a moment               |         12 ms |         11 ms |          20 ms |      46 ms |      36 ms |          28 ms |           28 ms |            93 ms |         29 ms |          29 ms |
| Typing (per key)            |         43 ms |         44 ms |          58 ms |      51 ms |      53 ms |          45 ms |           38 ms |            44 ms |         19 ms |          18 ms |
| New duration                |         54 ms |         94 ms |     **136 ms** | **264 ms** | **381 ms** |          48 ms |           79 ms |       **104 ms** |         72 ms |     **278 ms** |
| Delete (ask, then remove)   |         85 ms |        100 ms |          48 ms |      55 ms |      84 ms |          15 ms |           15 ms |            52 ms |         27 ms |          28 ms |
| Search results              |         22 ms |         38 ms |         111 ms |      54 ms |     117 ms |          61 ms |           65 ms |           110 ms |        106 ms |          86 ms |
| Separate by tags and rejoin |        146 ms |        278 ms |         386 ms |     601 ms |     930 ms |         185 ms |          324 ms |           464 ms |        223 ms |         413 ms |
| Save to server              |               |               |                |            |            |          34 ms |           99 ms |           151 ms |               |                |
| Live update arriving        |               |               |                |            |            |          30 ms |           29 ms |            31 ms |               |                |

What this shows:

- **Navigation was the bottleneck on every platform.** Discrete actions (opening a moment, typing, saving, deleting, searching) stayed within budget almost everywhere. Zooming, panning and pinching missed it once a few thousand moments were in view, and opening a new duration missed at 10,000 moments. Drawing has since become several times faster (#68, [below](#comfortable-sizes)).
- **The comfortable sizes were optimistic for gestures.** Navigation missed its budget in the browser at 4,000 moments, then the documented comfortable size, and on a throttled CPU already at 1,000. The platform and the desktop app, documented as comfortable up to the 200,000 limit, miss it from 10,000.
- **The advice showed too late.** Beyond the comfortable sizes, the browser missed its budgets without the advice showing ("advice gaps"): the advice compared the editor's own drawing time with 150 ms, while users wait longer, from input to paint. The advice now times those waits (#69), and the comfortable sizes come from the runs below.

This run predates #68's faster drawing, and timed zooming until the bounds fields changed, a frame before the moments were drawn.

#### Comfortable sizes

The comfortable sizes in `src/capacity.ts` come from the browser runs on GitHub's hosted runners (`ubuntu-24.04`), about 1.3× slower than the laptop above. Medians in ms; **bold** misses its budget (150 ms for views and frames, 100 ms for Cancel and Delete, 1.5 s for opening):

| Interaction           | 1,000 | 2,000 | 4,000 | 10,000 |    20,000 | ×4 250 | ×4 500 | ×4 1,000 | ×4 2,000 |
| --------------------- | ----: | ----: | ----: | -----: | --------: | -----: | -----: | -------: | -------: |
| Wheel zoom            |    52 |    58 |    64 |     73 |        78 |     78 |     94 |      106 |      137 |
| Drag (longest frame)  |    17 |    33 |    34 |     50 |        50 |     50 |     50 |      100 |      150 |
| Pinch (longest frame) |    33 |    33 |    50 |     67 |        67 |     50 |     83 |      100 |      117 |
| Keyboard zoom         |    35 |    40 |    44 |     55 |        56 |     59 |     61 |      135 |  **173** |
| Cancel a moment edit  |    50 |    53 |    40 |     98 |   **216** |     47 |     50 |       63 |       89 |
| Delete (ask, remove)  |    83 |    81 |    45 |     82 |   **248** |     34 |     71 |       73 |       41 |
| Undo and redo         |    21 |    29 |    35 |    105 |   **231** |     26 |     31 |       48 |       63 |
| Open                  |   201 |   213 |   360 |    854 | **1,600** |    252 |    302 |      431 |      710 |

At full speed every interaction meets its budget up to 10,000 moments; at 20,000 opening, edits and undo miss it, and the advice shows from the timeline's size. Throttled 4×, every interaction meets it up to 1,000 moments, and zooming misses it from 2,000.

Before #68, navigation was the bottleneck: on the same runners wheel zoom took 136 ms at 1,000 moments and 270 ms at 4,000, and throttled 4× it missed even at 250 moments (257 ms), so the comfortable sizes were 1,000 and 500. Drawing each frame read the stage's width once per marker, and asked for every label's animations and style; each read after drawing changed the page made the browser lay it out or restyle it again. The editor now keeps the stage's size from a ResizeObserver and tracks the animations it starts; duration bands and relationship arcs reshape rather than rebuild, and an edit rebuilds the duration and arc trees only when a moment they name moves.

CI checks the browser and the platform at 1,000 and 10,000 moments, the browser throttled 4× at 1,000, the advice just past the comfortable sizes (20,000, and 2,000 throttled), and the desktop app at 1,000 and 10,000 moments. Every interaction meets its budget there (on the desktop app, apart from navigation and new durations, which are only reported), and past the comfortable sizes the advice shows wherever one misses.

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
- **PostgreSQL saves are flat.** A sparse save updates only the changed rows and the tree paths they touch ([incremental saves](architecture.md#incremental-saves)), so a one-moment save costs the same at 1,000 and 100,000 moments. Before that change, every save rebuilt the timeline's derived data: 180 ms at 1,000 moments, 1.6 s at 10,000 and 18.5 s at 100,000. History is kept as rows, so a save also writes only the versions it changes ([saved history](architecture.md#saved-history)); until that change, every 1,000th save wrote a full snapshot, about 2 s at 100,000 moments.
- **SQLite saves are flat too.** They apply in place to the open file and its baseline (2.1 ms at 1,000 moments, 2.6 ms at 100,000). Previously, every save copied the whole file twice and rebuilt the duration and arc indexes: 13 ms at 1,000 moments, 105 ms at 10,000 and 1.2 s at 100,000. The benchmark saves to the opened file, as the desktop app does, and undoes each sample unmeasured.
- **Viewports grow slowly.** Summaries of collapsed durations used to dominate. The tree walk visited nearly every duration, because long durations blocked its shortcuts and pruning used durations' ends. SQLite and PostgreSQL now compute summaries set-based over an index on starts, and the browser prunes by start. At 100,000 moments this took SQLite from 945 ms to 31 ms for the whole timeline and from 430 ms to 14 ms for a 1% window. It took PostgreSQL from 99 ms to 27 ms and from 49 ms to 11 ms. The in-memory 1% window went from 34 ms to 8.4 ms. SQLite also returns bands and arcs in start order and stops at the 257th, instead of finding every match first. With few durations, PostgreSQL's per-cluster queries cost a little more than the old walk (10 ms against 7 ms at 1,000 moments). The in-memory index has large outliers at 100,000 moments, likely garbage collection (mean 292 ms, median 50 ms).
