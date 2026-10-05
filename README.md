# OpenChronology

A timeline editor for point events. Time is an arbitrary-precision rational coordinate; metadata is JSON. The same interface runs in a browser and in a Linux Tauri desktop application.

## Try the browser editor

Use Node.js 22 or 24:

```sh
npm ci
npm run dev
```

Open <http://localhost:5173>. Without `DATABASE_URL`, this is a local editor with an IndexedDB draft and JSON import/export. No account is needed for local editing. `npm run build && npm start` serves a production build. The contents of `dist/` can also be hosted as a static website; server sharing requires the Node server.

Drag an empty part of the chart to pan, scroll to zoom around the mouse position, or use one finger to pan and two fingers to pinch. Tap a point to inspect it. Tap empty space or use **＋ Event** to create an event. Groups can be inspected, paginated, and zoomed into. Left/right bounds use the timeline's configured printer and parser. Expand **Exact rational bounds** for underlying integers, fractions, exact decimals, or Unix-seconds fixed-offset ISO timestamps. Arrow keys pan; `+` and `-` zoom. Undo handles event edits and deletions.

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

Double-click `dist/openchronology-offline.html` to open it in a modern browser. You can copy that file into an otherwise empty folder or share it without any adjacent files. JavaScript, CSS, the rational library, the icon, and license notices are embedded. The normal `npm run build` also generates it, and GitHub CI retains it as the `openchronology-offline-html` artifact.

Each opening starts with one empty timeline. Add and edit point events, pan and zoom, inspect groups, and import or export the same `.ochx` format used by the other editions. Changes live in memory: **export JSON to save your work**. Reopening or reloading the HTML starts fresh; it neither rewrites itself nor stores browser drafts. The New button replaces the current timeline.

The offline bundle excludes the HTTP transport and does not initialize accounts, server sharing, IndexedDB, or SQLite. Its content policy permits only the embedded script and local styles/icon, and blocks network connections and external resources. Metadata containing URLs remains plain text. Calendar conversion uses local code. Use the Tauri edition for SQLite timeline files.

`npm run test:offline:browser` copies only the generated HTML into an empty temporary directory, opens it through `file://` with networking disabled, tests exact editing and JSON exchange, and checks for attempted network calls and external resource requests. GitHub CI runs this test in Chromium, Firefox, and WebKit.

## PostgreSQL deployment

The server uses PostgreSQL with the real pgmp extension. Accounts own private timelines by default. Owners can make a timeline public and add registered accounts as viewers or editors. Public access grants viewing; editing always requires an account with editor or owner access. Sharing links use `#timeline/<uuid>`.

For a local container deployment:

```sh
cp .env.example .env
# Edit the database password and the matching DATABASE_URL.
docker compose up --build
```

The database has a persistent volume and no published database port. A migration service creates the extension and schema before the application starts. The app binds to `127.0.0.1:5173` on the host. For public hosting, put an HTTPS reverse proxy in front of that port and set `APP_ORIGIN` to the exact external origin, for example `https://chronology.example`. Secure session cookies are selected from that origin. `APP_ORIGIN` has no trailing slash or path.

For an existing PostgreSQL installation with pgmp available:

```sh
npm ci
npm run build
export DATABASE_URL='postgresql://user:password@localhost/openchronology'
export APP_ORIGIN='http://localhost:5173'
npm run migrate
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

The locally verified debug build is at `src-tauri/target/debug/openchronology-desktop`; its package is `src-tauri/target/debug/bundle/deb/OpenChronology_0.1.0_amd64.deb`. These generated files are excluded from Git. The hosted workflow builds the release package.

JSON exchange files use `.ochx`. SQLite timelines are actual SQLite databases, have application ID `0x4f43544c` (`OCTL`) and schema version 1, and include persistent rational indexes. They are deliberately different formats. Export/import JSON moves a timeline between a desktop file, a browser draft, and a server timeline. SQLite saves run in a transaction and reject unrelated databases. Treat a browser draft as a convenience and export files you want to keep.

## Exact time and presentation

Use **Time display** for timeline-specific rational, floating point/decimal, scientific, SI-prefix, Gregorian, or custom displays. Configure exact unit scales and origins, labels, significant digits, and fixed timezone offsets. Presets include minutes, Julian years, millions of years, Unix seconds, and the legacy Modified Julian Date convention. Settings travel with JSON, PostgreSQL, browser drafts, and SQLite files. **Run `npm run migrate` (or its pnpm/Yarn equivalent) when upgrading an existing server.**

Custom printers/parsers use a restricted interpreted JavaScript/TypeScript subset with a fixed exact-arithmetic and text API, without browser globals, network, imports, loops, or dynamic execution. Output is plain text and resource budgets are enforced. The event editor preserves its exact time unless you explicitly use its parsed display value. See [time presentation and the custom API](docs/time-presentation.md) for examples, restrictions, and security guidance.

Every persisted event time is canonical `numerator/denominator`, with a positive denominator and no fixed precision. Query comparisons and grouping use exact rational arithmetic. No absolute time is converted to a JavaScript `Number`.

Interactive pan and zoom round the camera's bounds to a binary grid finer than one millionth of a CSS pixel. This keeps their precision proportional to the visible scale instead of accumulating digits with each gesture. Zooming further automatically retains more precision. Opposite wheel movements use reciprocal factors to reduce drift. Manually entered bounds are accepted exactly; camera rounding begins on the next gesture. Event coordinates, metadata, and exported timelines remain exact. Only relative screen positions become JavaScript numbers for drawing.

Calendar conversion is an optional display adapter with Unix epoch seconds as its convention. It uses a proleptic Gregorian calendar, arbitrary integer years, and explicit fixed timezone offsets. Ordinary fractional seconds print as exact decimals when finite. A nonterminating fraction has an explicit extension, for example `1970-01-01T00:00:00{+1/3}Z`. This extension preserves the parser/printer round trip; it is not standard ISO 8601 syntax. Named timezone/DST databases and leap-second semantics are not included. These conventions never change stored coordinates. See [the format and query contract](docs/architecture.md).

Gregorian chart labels automatically adapt to the current exact span and drawable pixel width, with separate ruler/event precision and a shared date/zone caption. Full timestamps remain in tooltips and editing fields. Turn off **Abbreviate chart labels** to retain full chart labels. Every printer/parser receives optional viewport context; custom source can use `api.viewSpan()`, `api.viewWidth()`, `api.unitsPerPixel()` and `api.purpose()` without exposing browser globals. See [viewport context and helper examples](docs/time-presentation.md#viewport-context).

Ruler marks are anchored to exact values: they move when panning and reveal finer subdivisions when zooming. Numeric rulers divide by ten; Gregorian rulers use actual clock/calendar boundaries, Monday weeks, variable months and leap years. **Time display → Ruler graduation** also accepts a saved list of custom exact steps. Planning enumerates only visible marks, with a bounded tick count at arbitrary rational scales. See [graduations and breakpoints](docs/time-presentation.md#ruler-graduations-and-breakpoints).

## Tests and GitHub CI

```sh
npm run typecheck
npm test
npx playwright install --with-deps chromium
npm run test:browser
npm run test:offline:browser
cargo test --manifest-path native-store/Cargo.toml --locked
# Dedicated PostgreSQL test database with real pgmp installed:
DATABASE_URL='postgresql://...' node test/sql-oracle.mjs
DATABASE_URL='postgresql://...' npm run test:postgres
```

The [GitHub workflow](.github/workflows/ci.yml) runs Node 22/24 tests, Chromium/Firefox/WebKit interactions for both the served app and standalone HTML, native PostgreSQL tests including accounts and sharing, SQLite persistence tests, and a Linux desktop package build. Chromium tests include touch pan, pinch, and tap. Browser screenshots, the offline HTML, and the Debian package are retained as artifacts. pgmp compilation and installation both set `with_llvm=no`, avoiding a dependency on the runner's configured Clang version.

This directory is self-contained and can be the root of its own GitHub repository. The two independent rational libraries are pinned under `vendor/`; no build depends on adjacent checkouts. [vendor/versions.json](vendor/versions.json) records their source commits. Their independent upstream CI and the separate `rational-conformance` project remain responsible for library-level conformance. This app adds timeline-level tests.

Local verification during implementation passed the core and HTTP tests, 85 PostgreSQL oracle cases against native pgmp, SQLite persistence tests, TypeScript checking, and a built Linux desktop Debian package (debug profile). The restricted development sandbox prevented browser launch and network listeners, so browser interactions and the complete PostgreSQL HTTP integration suite still need their first hosted CI run. Docker recipes have been prepared, but container image builds have not been run in that sandbox.

Passwords use salted scrypt, sessions use hashed random tokens and HTTP-only cookies, authenticated writes require CSRF tokens, and ACLs are enforced on the server. This initial account system has no password recovery, email verification, or MFA. Registration is open. Put public deployments behind HTTPS and configure deployment-specific signup/rate policies before inviting a wider audience. Sign-in throttling currently keys on the direct peer address, so a reverse proxy shares that limit across clients unless adapted for your trusted proxy configuration.

Licensed under MIT. See [third-party notices](THIRD_PARTY.md).
