# OpenChronology

A timeline editor for point events. Time is an arbitrary-precision rational coordinate; metadata is JSON. The same interface runs in a browser and in a Linux Tauri desktop application.

## Try the browser editor

Use Node.js 22 or 24:

```sh
npm ci
npm run dev
```

Open <http://localhost:5173> to the dashboard. Guests see the public timeline browser; signed-in users also see their own timelines above it. Without `DATABASE_URL`, the dashboard explains that server storage is unavailable; choose **New timeline** for in-memory local editing and .ochx import/export. No account is needed for local editing. Guest and standalone drafts live only in memory; export .ochx to retain them. Signed-in browser drafts can use IndexedDB. `npm run build && npm start` serves a production build. The hosted platform uses **Next.js App Router** for the dashboard, full-text search, account and OAuth pages, collaboration, sharing settings, and API routing. The timeline editor is an independent TypeScript application embedded on its own route. `npm run build:editor` creates `dist/` for static-only hosting, offline HTML, and Tauri; static hosting has local editing but no platform accounts or search. `npm run build` builds both the editor and the Next.js platform. Production requires `APP_ORIGIN` to match the external URL.

Drag an empty part of the chart to pan, scroll to zoom around the mouse position, or use one finger to pan and two fingers to pinch. A side-by-side pinch zooms time; a vertical pinch, with one finger above the other, resizes the timeline contents. Tap a point to inspect it. Tap empty space or use **＋ Event** to create an event. **＋ Duration** creates a [duration](docs/durations.md): a period with its own fixed start and end times, or ends that follow moments. Groups can be inspected, paginated, and zoomed into. Left/right bounds use the timeline's configured printer and parser. Expand **Exact rational bounds** for underlying integers, fractions, exact decimals, or Unix-seconds fixed-offset ISO timestamps. Arrow keys pan; `+` and `-` zoom. Undo and Redo (Ctrl+Z, Ctrl+Shift+Z or Ctrl+Y; ⌘ on macOS) handle moment and duration edits and deletions.

The sample includes a button that adds 20,000 closely spaced moments. Grouping distance is adjustable in pixels. Events at identical coordinates remain a bucket with individual metadata; zoom cannot separate them.

## Package managers

The application supports npm, pnpm 11, and Yarn 4. CI pins pnpm 11.26.0 and Yarn 4.10.3 and checks each manager on Node 22 and 24. pnpm requires Node 22.13 or newer. Yarn uses the repository's `node-modules` configuration. Install instructions are in the [pnpm documentation](https://pnpm.io/installation) and [Yarn documentation](https://yarnpkg.com/getting-started/install).

Run these commands from `timeline-app`, choosing one manager per checkout:

If you use Corepack, `corepack pnpm@11.26.0` and `corepack yarn@4.10.3` can replace `pnpm` and `yarn` in the commands below to select the CI versions. The project deliberately leaves `packageManager` unset so neither manager excludes the others.

| Operation                   | npm                     | pnpm                             | Yarn 4                     |
| --------------------------- | ----------------------- | -------------------------------- | -------------------------- |
| Install locked dependencies | `npm ci`                | `pnpm install --frozen-lockfile` | `yarn install --immutable` |
| Development server          | `npm run dev`           | `pnpm run dev`                   | `yarn run dev`             |
| Production build            | `npm run build`         | `pnpm run build`                 | `yarn run build`           |
| Standalone HTML             | `npm run build:offline` | `pnpm run build:offline`         | `yarn run build:offline`   |
| TypeScript checks           | `npm run typecheck`     | `pnpm run typecheck`             | `yarn run typecheck`       |
| Tests                       | `npm test`              | `pnpm test`                      | `yarn test`                |
| Desktop development         | `npm run desktop:dev`   | `pnpm run desktop:dev`           | `yarn run desktop:dev`     |
| Desktop package             | `npm run desktop:build` | `pnpm run desktop:build`         | `yarn run desktop:build`   |

Other scripts follow the same `run <script>` convention, including `start`, `migrate`, and the browser tests. For Playwright's browser installation, replace `npx playwright install --with-deps chromium` with `pnpm exec playwright install --with-deps chromium` or `yarn exec playwright install --with-deps chromium`.

All three lockfiles are included. When changing dependencies, update all three: `npm install`, `pnpm install --no-frozen-lockfile`, and `yarn install --no-immutable`. Remove `node_modules` before switching managers. pnpm explicitly allows esbuild's install script; build scripts resolve transitive dependency licenses through their owning package instead of assuming a flat installation. The test and Tauri build hooks invoke Node directly.

## Standalone offline HTML

Build the browser edition as a single file:

```sh
npm ci
npm run build:offline
```

Double-click `dist/openchronology-offline.html` to open it in a modern browser. You can copy that file into an otherwise empty folder or share it without any adjacent files. JavaScript, CSS, the rational library, the icon, and license notices are embedded. The normal `npm run build` also generates it, and GitHub CI retains it as the `openchronology-offline-html` artifact. Every push to `main` also publishes it as the index page of <https://openchronology.github.io/> through `.github/workflows/pages.yml`, after the offline browser test passes. The workflow pushes to the `openchronology/openchronology.github.io` repository with a write deploy key stored as the `PAGES_DEPLOY_KEY` secret.

Each opening starts with one empty timeline. Add and edit point events, pan and zoom, inspect groups, and import or export the same `.ochx` format used by the other editions. Changes live in memory: **export JSON to save your work**. Reopening or reloading the HTML starts fresh; it neither rewrites itself nor stores browser drafts. The New button replaces the current timeline.

The offline bundle excludes the HTTP transport and does not initialize accounts, server sharing, IndexedDB, or SQLite. Its content policy permits only the embedded script and local styles/icon, and blocks network connections and external resources. Metadata containing URLs remains plain text. Calendar conversion uses local code. Use the Tauri edition for SQLite timeline files.

`npm run test:offline:browser` copies only the generated HTML into an empty temporary directory, opens it through `file://` with networking disabled, tests exact editing and JSON exchange, and checks for attempted network calls and external resource requests. GitHub CI runs this test in Chromium, Firefox, and WebKit.

## PostgreSQL deployment

The server uses PostgreSQL with the real pgmp extension. Accounts own private timelines by default. Owners control visibility, access and deletion. They can add viewers, contributors and writers. Public access grants viewing to everyone; signed-in users can propose changes, while only owners/writers update upstream. Sharing links use `/timelines/<uuid>`. Old `#timeline/<uuid>` bookmarks redirect to their canonical Next.js routes.

For a local container deployment:

```sh
cp .env.example .env
# Set a strong POSTGRES_PASSWORD in .env.
docker compose up --build --wait
docker compose logs -f app
```

Open http://localhost:5173 after startup. See [the deployment guide](docs/docker.md) for upgrades, backups, and production configuration. Compose passes PostgreSQL connection variables directly, so special characters in passwords do not need URL encoding.

The database has a persistent volume and no published database port. A migration service creates the extension and schema before the application starts. The app binds to `127.0.0.1:5173` on the host. For public hosting, put an HTTPS reverse proxy in front of that port and set `APP_ORIGIN` to the exact external origin, `https://timescale.info`. Secure session cookies are selected from that origin. `APP_ORIGIN` has no trailing slash or path.

Compose also builds and installs the isolated SQLite file converter. For an existing PostgreSQL installation with pgmp available:

```sh
npm ci
npm run build
export DATABASE_URL='postgresql://user:password@localhost/openchronology'
export APP_ORIGIN='http://localhost:5173'
npm run migrate
# Optional web .och exchange (install Rust, CMake, SQLite/GMP development packages):
cargo build --manifest-path native-store/Cargo.toml --release --locked --bin och-convert
npm start
```

The migration account needs permission to install pgmp and create objects. A production runtime account needs CRUD access to the `oc_*` tables and sequence-free IDs; it does not need to install extensions. The supplied Compose configuration uses one database account for a straightforward initial deployment.

Saving uses an atomic snapshot replacement with revision checks. Conflicting saves return HTTP 409 instead of silently overwriting another editor. This version permits 200,000 events per document and 16 MiB per HTTP request. Viewer queries only fetch the visible summaries and bounded event pages. An editor currently downloads the full document and rebuilds its browser map; saves rebuild the balanced database index. Incremental editing and streaming very large imports are future work.

## Offline desktop and SQLite files

On Linux, install Rust, CMake, a C compiler, pkg-config, GMP/SQLite development packages, GTK 3, WebKitGTK 4.1, and the Tauri Linux dependencies. On Ubuntu 24.04:

```sh
sudo apt-get install build-essential cmake pkg-config libgmp-dev libsqlite3-dev \
  libwebkit2gtk-4.1-dev libgtk-3-dev libayatana-appindicator3-dev librsvg2-dev
npm ci
npm run desktop:dev
# Or build the Debian package:
npm run desktop:build
```

`src-tauri/target/release/bundle/deb/` contains the package. The desktop embeds sqlite-rational and registers it on each SQLite connection. It opens and saves `.och` files through native dialogs, works without a server, and uses rational-map for the active editable document. SQLite and GMP remain system shared libraries. The first packaged target is Linux; macOS and Windows packaging have not been implemented or validated.

Local `.och` timelines use SQLite viewport queries and persisted proximity summaries, with a bounded nearby cache in the interface. Opening and ordinary local saving do not transfer all moments into JavaScript; only inspected moments and unsaved changes are retained. Desktop JSON imports are parsed natively and staged on disk, while full exports remain explicit operations.

The desktop's **Server connection** defaults to `https://timescale.info`, accepts other HTTPS servers and supports explicit disconnect. It opens provider sign-in in your system browser and asks you to approve a matching desktop code. Password and social sign-in both complete in that browser, including email confirmation and authenticator codes. Connected users can open shared timelines and save editable rational-map documents to PostgreSQL. **Save** and **Save to server** track changes separately, so either save does not mark the other copy as current.

`.ochx` is the JSON exchange format in all editions; legacy `.json` imports are still accepted. `.och` is an actual SQLite timeline with sqlite-rational indices, not JSON with a different suffix. The web edition's **Import .och** and **Export .och** send conversion requests to the server; uploads require an account and do not automatically publish the imported timeline. Public/readable server snapshots can be downloaded as `.och`. Browsers continue editing in rational-map and never open SQLite directly. The standalone offline HTML supports `.ochx` only. See [file and HTTP contracts](docs/architecture.md).

The locally verified debug build is at `src-tauri/target/debug/openchronology-desktop`; its package is `src-tauri/target/debug/bundle/deb/OpenChronology_0.1.0_amd64.deb`. These generated files are excluded from Git. The hosted workflow builds the release package.

JSON exchange files use `.ochx`. SQLite timelines are actual SQLite databases, have application ID `0x4f43544c` (`OCTL`) and schema version 1, and include persistent rational indexes. They are deliberately different formats. Export/import JSON moves a timeline between a desktop file, a browser draft, and a server timeline. SQLite saves run in a transaction and reject unrelated databases. Guest browser drafts live only in memory; signed-in browser storage is a convenience. Export files you want to keep.

## Timeline plugins

Open **Plugins** beside **Time display** to manage the current timeline's installed plugins. **Add plugin** searches the main server's paginated catalogue. Plugin order, enabled state and version-pinned definitions are saved in `.ochx`, `.och`, browser drafts and PostgreSQL. Changes take effect immediately; later plugins override matching fields and valid marker effects. Removing a plugin preserves moment metadata.

**Moment icons** adds the `iconUrl` metadata field, circular image markers that enlarge on hover/focus, and a larger linked image with a URL editor in the moment details. Use public HTTPS image hosts that allow anonymous cross-origin access. Tauri discovers plugins through its configured server and opens image sources in the system browser. The standalone HTML runs saved official and custom plugins and embedded icon copies without network traffic.

The plugin API combines validated host UI components with bounded JavaScript/TypeScript-like scripts. **Moment shapes** provides geometric and flowchart symbols. Use **Create / import plugin** to author scripts and fields, install them immediately, or publish immutable versions to the public server library when signed in. Operators can also supply definitions with `PLUGIN_LIBRARY`. See [the plugin API and publishing guide](docs/plugins.md). **Run the server migration when upgrading** to add plugin settings, dashboard search, tags and collaboration tables.

## Exact time and presentation

Moment time text crossfades over 200 ms when formatting changes, and description rows ease into their new positions over 220 ms. Horizontal positions remain attached to the current view while panning. Both effects respect reduced-motion preferences. There are four description rows (two above and two below), reused cyclically; there is no separate visible-description cap or collision avoidance, so descriptions can overlap. Only visible labels are retained, and interrupted fades keep at most two text layers.

Click or tap empty space to select a time: a yellow vertical cursor follows that exact coordinate as you pan and zoom, and the event editor opens with the time populated. **+Event** also reuses the selected coordinate. Right-click or hold a touch for 550 ms to open timeline actions. Single events offer **Delete**; grouped markers offer **View events**, where each event has its own context menu. Every event deletion requires a confirmation dialog, and can be undone. Cancel or Escape leaves the timeline unchanged.

Server-backed views on the online platform offer **Follow latest events**, off by default and remembered per timeline for the browser tab. External additions trigger an animated view of the eight latest distinct time coordinates, with padding. Edits and deletions alone do not trigger it. Navigation postpones following until 15 seconds after the last interaction; open dialogs, background tabs and unsaved edits also defer it. Starting navigation cancels an automatic camera movement. Comparisons frame the latest coordinates after applying each source's scale and offset. The server returns only these bounded coordinates, and the existing viewport cache fetches their visible moments. Desktop, offline HTML and browser-only drafts do not offer this setting.

Use **Time display** for timeline-specific rational, floating point/decimal, scientific, SI-prefix, Gregorian, or custom displays. Configure exact unit scales and origins, labels, significant digits, and fixed timezone offsets. Presets include minutes, Julian years, millions of years, Unix seconds, and the legacy Modified Julian Date convention. Settings travel with JSON, PostgreSQL, browser drafts, and SQLite files. **Run `npm run migrate` (or its pnpm/Yarn equivalent) when upgrading an existing server.**

Custom printers/parsers use a restricted interpreted JavaScript/TypeScript subset with a fixed exact-arithmetic and text API, without browser globals, network, imports, loops, or dynamic execution. Output is plain text and resource budgets are enforced. The event editor prints and parses its time using the timeline display. Unchanged text preserves the exact coordinate even when it is rounded; editing the text chooses the parsed value. Custom source and graduation settings are embedded in both `.ochx` and `.och` saves. See [time presentation and the custom API](docs/time-presentation.md) for examples, restrictions, and security guidance.

Every persisted event time is canonical `numerator/denominator`, with a positive denominator and no fixed precision. Query comparisons and grouping use exact rational arithmetic. No absolute time is converted to a JavaScript `Number`.

Interactive pan and zoom round the camera's bounds to a binary grid finer than one millionth of a CSS pixel. This keeps their precision proportional to the visible scale instead of accumulating digits with each gesture. Zooming further automatically retains more precision. Opposite wheel movements use reciprocal factors to reduce drift. Manually entered bounds are accepted exactly; camera rounding begins on the next gesture. Event coordinates, metadata, and exported timelines remain exact. Only relative screen positions become JavaScript numbers for drawing.

Calendar conversion is an optional display adapter with Unix epoch seconds as its convention. It uses a proleptic Gregorian calendar, arbitrary integer years, and explicit fixed timezone offsets. Ordinary fractional seconds print as exact decimals when finite. A nonterminating fraction has an explicit extension, for example `1970-01-01T00:00:00{+1/3}Z`. This extension preserves the parser/printer round trip; it is not standard ISO 8601 syntax. Named timezone/DST databases and leap-second semantics are not included. These conventions never change stored coordinates. See [the format and query contract](docs/architecture.md).

Gregorian chart labels automatically adapt to the current exact span and drawable pixel width, with separate ruler/event precision and a shared date/zone caption. Full timestamps remain in tooltips and editing fields. Turn off **Abbreviate chart labels** to retain full chart labels. Every printer/parser receives optional viewport context; custom source can use `api.viewSpan()`, `api.viewWidth()`, `api.unitsPerPixel()` and `api.purpose()` without exposing browser globals. See [viewport context and helper examples](docs/time-presentation.md#viewport-context).

Ruler marks are anchored to exact values: they move when panning and reveal finer subdivisions when zooming. Graduations fade with zoom depth instead of switching abruptly; labels and guide lines smoothly become subdivisions. Visibility freezes when zooming stops and reverses when zooming reverses. Numeric rulers divide by ten; Gregorian rulers use actual clock/calendar boundaries, Monday weeks, variable months and leap years. **Time display → Ruler graduation** also accepts a saved list of custom exact steps. Planning enumerates only visible marks, with a bounded tick count at arbitrary rational scales. See [graduations and breakpoints](docs/time-presentation.md#ruler-graduations-and-breakpoints).

## Tests and GitHub CI

```sh
npm run typecheck
npm test
npm run build
npm run test:platform
npx playwright install --with-deps chromium
npm run test:browser
npm run test:offline:browser
cargo test --manifest-path native-store/Cargo.toml --locked
# Dedicated PostgreSQL test database with real pgmp installed:
DATABASE_URL='postgresql://...' node test/sql-oracle.mjs
cargo build --manifest-path native-store/Cargo.toml --release --locked --bin och-convert
node test/files.mjs
cargo test --manifest-path src-tauri/Cargo.toml --locked
DATABASE_URL='postgresql://...' npm run test:postgres
DATABASE_URL='postgresql://...' npm run test:platform:postgres
```

The [GitHub workflow](.github/workflows/ci.yml) runs Node 22/24 tests, Chromium/Firefox/WebKit interactions for both the served app and standalone HTML, native PostgreSQL tests including accounts and sharing, SQLite persistence tests, and a Linux desktop package build. Chromium tests include touch pan, pinch, and tap. Browser screenshots, the offline HTML, and the Debian package are retained as artifacts. pgmp compilation and installation both set `with_llvm=no`, avoiding a dependency on the runner's configured Clang version.

This directory is self-contained and can be the root of its own GitHub repository. The two independent rational libraries are pinned under `vendor/`; no build depends on adjacent checkouts. [vendor/versions.json](vendor/versions.json) records their source commits. Their independent upstream CI and the separate `rational-conformance` project remain responsible for library-level conformance. This app adds timeline-level tests.

Local verification passed 48 JavaScript cases on Node 22 and 24, nine native tests, real SQLite converter/HTTP-boundary checks, 85 PostgreSQL oracle cases against native pgmp, TypeScript checking, workflow linting, and an updated Linux desktop Debian package (debug profile). The restricted development sandbox prevented browser launch and network listeners, so browser interactions and the complete PostgreSQL HTTP integration suite still need their first hosted CI run. Docker recipes have been prepared, but container image builds have not been run in that sandbox.

Username/password and Google, GitHub and Facebook accounts require verified email and support authenticator-app MFA with single-use recovery codes. Password registration requires confirmation; email recovery preserves MFA. Accounts use server-enforced permissions, expiring/revocable sessions and CSRF protection. Provider secrets stay on the server, desktop credentials stay in native memory, and provider identities are linked explicitly. Configure `APP_ORIGIN=https://timescale.info` and the provider app registrations/environment variables before enabling public sign-in. Configure Resend, a verified sender, and a persistent authentication encryption key; run Compose with `--profile mail` for durable delivery. See [authentication and deployment](docs/authentication.md) for callback URLs, session policies and trusted-proxy settings.

Licensed under GPLv3, copyright Athan Clark. Third-party dependencies retain their original licenses; see [third-party notices](THIRD_PARTY.md).

## Dashboard and collaboration

The server landing page is the dashboard for everyone, including guests. Signed-in users see their owned timelines above a featured-first, paginated public browser; guests see only the public browser. Tags and PostgreSQL full-text search cover timeline descriptions and moment notes. Owners retain sole custody; contributors submit changes through discussed pull requests, while writers can update upstream and merge/reject/close proposals. Stale merges require an explicit rebase. See [dashboard, permissions and API details](docs/collaboration.md). Set `FEATURED_TIMELINES` to public timeline UUIDs for the featured list.

## License and hosted policies

Copyright (c) 2026 Athan Clark, an individual. OpenChronology software, official
plugins, and first-party documentation use [GPLv3 only](LICENSE). See [NOTICE](NOTICE)
for scope and [third-party attribution](THIRD_PARTY.md) for dependency licenses.
User timelines and original user scripts retain their owners' rights.

The [licensing and source distribution guide](docs/licensing.md) explains release
source bundles. [Service terms](legal/TERMS.md), [privacy](legal/PRIVACY.md), and
[copyright/abuse reporting](legal/COPYRIGHT.md) for timescale.info are drafts; complete
[operator details](legal/LAUNCH.md) before public adoption. Notices are embedded in
the web, desktop, and standalone HTML interfaces; the server also serves `/legal.html`.

Public historical examples can be installed with `docker compose run --rm seed`
after the stack starts, or `npm run seed` / `pnpm seed` / `yarn seed` with a migrated
PostgreSQL database. See [seeding instructions](docs/seeding.md) for the six
featured timelines, source/date conventions, and secure management access.

The dashboard and editor support [read-only comparison and live viewing](docs/comparison.md):
compare up to eight timelines with exact per-source alignment, shared time display,
stacked/combined modes, and bounded database caches. Live updates use PostgreSQL
notifications on the web and metadata polling on desktop.

Guest users can **Fork in browser** from a public timeline or its dashboard card.
This loads a complete in-memory copy without creating a database timeline.
Copies are limited to 5,000 entries (moments and stack entries) and 4 MiB; oversized timelines remain viewable
through the bounded server cache. See [guest editing and copy limits](docs/guest-editing.md).

Site operators can bootstrap an administrator from `.env`, configure default and per-user data quotas, and manage users/timelines at `/admin`. Accounts support scoped API keys for unattended ingestion, avatar settings, and social-account unlinking. See [administration, quotas and automation](docs/administration.md) for setup and security details.

Build identity and downloads

Every platform, desktop and standalone HTML footer displays the exact version tag at the built commit, or its full Git hash when no version tag points at it. Local modifications are marked `modified`. The identity is baked into the assets, not taken from the server's runtime environment. Matching source archives include `build-info.json`, so rebuilding an archive without `.git` preserves its identity. Builds from unrelated source directories display `unversioned source` rather than inventing a version. `OCH_BUILD_COMMIT` and `OCH_BUILD_VERSION` can supply an explicit identity for external build systems.

The **Download** menu links to the latest stable GitHub release of `openchronology/timeline-app`. GitHub's fixed `releases/latest/download/<asset-name>` URLs resolve to the current release without application updates or background API requests. Prereleases remain available through the release listing.

Pushing a semantic version tag such as `v1.2.3` runs `.github/workflows/release.yml`. The desktop reusable workflow builds on GitHub runners for Ubuntu 24.04 (.deb and AppImage), Windows 2025, macOS 15 (Apple silicon), macOS 15 Intel, and a Rocky Linux 10 container on Ubuntu. It publishes `.deb`, portable `.AppImage`, `.rpm`, `.dmg` (both architectures), and Windows NSIS `.exe` installers alongside the standalone offline HTML. Each package records the same tagged commit; publication waits for every target and verifies their identities before generating checksums. Stable releases update the download links; prereleases appear in the release listing.

The RPM baseline is **Rocky Linux 10 / RHEL 10**, with EPEL and CRB enabled for WebKitGTK 4.1. Stock Rocky 9 supplies WebKitGTK 4.0, which cannot build this Tauri 2 application. The workflow installs the RPM and checks shared-library resolution on its baseline. It does not claim compatibility with RHEL 9.

Windows and macOS use GMP and SQLite static libraries built from a pinned vcpkg revision. Their matching native source archives accompany releases, along with application source and vendored Rust dependencies. Linux uses distribution libraries. Windows installers and macOS applications are currently unsigned (macOS is not notarized); configuring release signing requires the publisher's certificates.

For local packaged builds, run `node scripts/desktop/build.mjs TARGET` with one of `linux-deb`, `linux-appimage`, `rocky-rpm`, `macos-arm64`, `macos-amd64`, or `windows-amd64` on the corresponding native OS. The workflow dependency scripts set `OCH_NATIVE_PREFIX` and `OCH_NATIVE_STATIC` for pinned native libraries. macOS and Windows configuration files choose the platform's installer and icon automatically.
