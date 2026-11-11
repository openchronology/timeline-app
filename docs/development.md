# Building and testing

<!-- description: Run OpenChronology from source: the development server, package managers, the offline file and its editions, the desktop app, tests, CI and releases. -->

How to build every edition from this repository and test it. [Contributing](../CONTRIBUTING.md) says where everything is and how to make a change; [architecture](architecture.md) explains how the parts fit.

## The development server

Use Node.js 22 or 24:

```sh
npm ci
npm run dev
```

Open <http://localhost:5173> to the dashboard. Without `DATABASE_URL`, the dashboard explains that server storage is unavailable; choose **New timeline** for in-memory local editing and `.ochx` import/export. To develop against PostgreSQL, run a database as in [installing a server](install.md#from-source) and set `DATABASE_URL`.

`npm run build && npm start` serves a production build. The hosted platform uses **Next.js App Router** for the dashboard, full-text search, account and OAuth pages, collaboration, sharing settings, and API routing. The timeline editor is an independent TypeScript application embedded on its own route. `npm run build:editor` creates `dist/` for static-only hosting, offline HTML, and Tauri; static hosting has local editing but no platform accounts or search. `npm run build` builds both the editor and the Next.js platform. Production requires `APP_ORIGIN` to match the external URL.

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

Double-click `dist/openchronology-offline.html` to open it in a modern browser. You can copy that file into an otherwise empty folder or share it without any adjacent files. JavaScript, CSS, the rational library, the icon, and license notices are embedded. The normal `npm run build` also generates it, and GitHub CI retains it as the `openchronology-offline-html` artifact. Each stable release also publishes it, built at the release's tag, as the index page of <https://openchronology.github.io/> through `.github/workflows/pages.yml`, after the offline browser test passes; pushes to `main` are not published (#510). The downloaded file is the recommended way to use it: the hosted copy shares its origin with the organization's other Pages sites ([guest editing](guest-editing.md#the-hosted-copy)). The workflow pushes to the `openchronology/openchronology.github.io` repository with a write deploy key stored as the `PAGES_DEPLOY_KEY` secret.

Each opening starts with one empty timeline. Add and edit moments, pan and zoom, inspect groups, and import or export the same `.ochx` format used by the other editions. Changes live in memory: **export JSON to save your work**. Reopening or reloading the HTML starts fresh; it neither rewrites itself nor stores browser drafts. The New button replaces the current timeline.

The offline bundle excludes the HTTP transport and does not initialize accounts, server sharing, IndexedDB, or SQLite. Its content policy permits only the embedded script and local styles/icon, and blocks network connections and external resources. Metadata containing URLs remains plain text. Calendar conversion uses local code. Use the Tauri edition for SQLite timeline files.

`npm run test:offline:browser` copies only the generated HTML into an empty temporary directory, opens it through `file://` with networking disabled, tests exact editing and JSON exchange and the CFAM edition's defaults, and checks for attempted network calls and external resource requests. GitHub CI runs this test in Chromium, Firefox, and WebKit.

### Editions

The build also makes an offline file for each edition in `src/editions.ts`, as `dist/openchronology-offline-<edition>.html`. An edition is the same editor with different defaults for its new timelines; files you open or import keep their own settings. Pages publishes each at `https://openchronology.github.io/<edition>/`, releases attach each file, and the website's download page lists them all.

- **CFAM** (<https://openchronology.github.io/cfam/>), for causal factor analysis: new timelines have the [Causal factor analysis suite](plugins.md#plugin-suites) (Moment stacks, Moment shapes and Moment colors) installed and enabled, show [Gregorian dates](time-presentation.md) in the computer's UTC offset, and open on the fortnight around today instead of around 0. The chip beside the brand reads **Offline · CFAM**.

To add an edition, add an entry to `EDITIONS` with its ID (its file name and address), name, description, suites and time display.

## The desktop app

On Linux, install Rust, CMake, a C compiler, pkg-config, GMP/SQLite development packages, GTK 3, WebKitGTK 4.1, and the Tauri Linux dependencies. On Ubuntu 24.04:

```sh
sudo apt-get install build-essential cmake pkg-config libgmp-dev libsqlite3-dev \
  libwebkit2gtk-4.1-dev libgtk-3-dev libayatana-appindicator3-dev librsvg2-dev
npm ci
npm run desktop:dev
# Or build the Debian package:
npm run desktop:build
```

`src-tauri/target/release/bundle/deb/` contains the package. The desktop embeds sqlite-rational and registers it on each SQLite connection. It opens and saves `.och` files through native dialogs, works without a server, and uses rational-map for the active editable document. SQLite and GMP remain system shared libraries.

Local `.och` timelines use SQLite viewport queries and persisted proximity summaries, with a bounded nearby cache in the interface. Opening and ordinary local saving do not transfer all moments into JavaScript; only inspected moments and unsaved changes are retained. Desktop JSON imports are parsed natively and staged on disk, while full exports remain explicit operations.

The desktop's **Server connection** defaults to `https://timescale.info`, accepts other HTTPS servers and supports explicit disconnect. It can be signed in to several servers at once, listing their timelines together, each marked with its server ([details](authentication.md#several-servers-on-the-desktop)). It opens provider sign-in in your system browser and asks you to approve a matching desktop code. Password and social sign-in both complete in that browser, including email confirmation and authenticator codes. Connected users can open shared timelines and save editable rational-map documents to PostgreSQL. **Save** and **Save to server** track changes separately, so either save does not mark the other copy as current.

`.ochx` is the JSON exchange format in all editions; legacy `.json` imports are still accepted. `.och` is an actual SQLite timeline with sqlite-rational indices, not JSON with a different suffix. The web edition's **Import .och** and **Export .och** send conversion requests to the server; uploads require an account and do not automatically publish the imported timeline. Public/readable server snapshots can be downloaded as `.och`. Browsers continue editing in rational-map and never open SQLite directly. The standalone offline HTML supports `.ochx` only. See [file and HTTP contracts](architecture.md).

JSON exchange files use `.ochx`. SQLite timelines are actual SQLite databases, have application ID `0x4f43544c` (`OCTL`) and schema version 1, and include persistent rational indexes. They are deliberately different formats. Export/import JSON moves a timeline between a desktop file, a browser draft, and a server timeline. SQLite saves run in a transaction and reject unrelated databases. Guest browser drafts live only in memory; signed-in browser storage is a convenience. Export files you want to keep.

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

The [GitHub workflow](../.github/workflows/ci.yml) runs Node 22/24 tests, Chromium/Firefox/WebKit interactions for both the served app and standalone HTML, native PostgreSQL tests including accounts and sharing, SQLite persistence tests, and a Linux desktop package build. Chromium tests include touch pan, pinch, and tap. Browser screenshots, the offline HTML, and the Debian package are retained as artifacts. pgmp compilation and installation both set `with_llvm=no`, avoiding a dependency on the runner's configured Clang version.

[Benchmarks](benchmarks.md) compare PostgreSQL, SQLite and in-memory latency as timelines grow: `npm run bench:seed`, then `npm run bench` writes an HTML report to `bench/results/`. The manually triggered Benchmarks workflow runs them in CI. [Timeline size and platforms](capacity.md) explains which platform suits which timeline size.

This directory is self-contained and can be the root of its own GitHub repository. The two independent rational libraries are pinned under `vendor/`; no build depends on adjacent checkouts. [vendor/versions.json](../vendor/versions.json) records their source commits. Their independent upstream CI and the separate `rational-conformance` project remain responsible for library-level conformance. This app adds timeline-level tests.

### The project's own runner

The browser jobs (Chromium, Firefox and WebKit) run on the project's own machine, a self-hosted runner labelled `och-heavy`, rather than on GitHub's. Pull requests from forks still run them on GitHub's runners, so code from outside the project never runs there.

- **Isolation:** the runner runs as its own user, `gh-runner`, which has no sudo, SSH keys or tokens. Jobs run in containers on that user's rootless Docker (`DOCKER_HOST` in each runner's `.env`), so a job is root only inside its container.
- **Downloads:** its Docker downloads one layer at a time (`"max-concurrent-downloads": 1` in `~gh-runner/.config/docker/daemon.json`). Jobs pulling a new image together otherwise deadlocked on the same layer.
- **Instances:** three runner services, `actions-runner`, `actions-runner-2` and `actions-runner-3` in `/home/gh-runner`, so a matrix runs in parallel. Each is a systemd unit named `actions.runner.openchronology-timeline-app.<name>.service`.
- **Other jobs:** a job that needs `sudo` on its host, such as the PostgreSQL job, which installs packages and follows the system journal, stays on GitHub's runners. So do benchmarks whose budgets are calibrated there.
- **Adding one:** register it with `config.sh --labels och-heavy`, using a token from `POST /repos/openchronology/timeline-app/actions/runners/registration-token`, then install it with `svc.sh install gh-runner`.

## Build identity

Every platform, desktop and standalone HTML footer displays the exact version tag at the built commit, or its full Git hash when no version tag points at it. Local modifications are marked `modified`. The identity is baked into the assets, not taken from the server's runtime environment. Matching source archives include `build-info.json`, so rebuilding an archive without `.git` preserves its identity. Builds from unrelated source directories display `unversioned source` rather than inventing a version. `OCH_BUILD_COMMIT` and `OCH_BUILD_VERSION` can supply an explicit identity for external build systems.

## Downloads and releases

The website's **Download** page (`/download`) offers the latest stable GitHub release of `openchronology/timeline-app`.

- **Layout:** it puts the visitor's system first, detected from their browser, with a large download button. It then lists every desktop file by operating system, the offline file, and the server packages.
- **Server packages:** each package (Debian 13, Ubuntu 24.04, Rocky Linux and RHEL 10, Fedora 44, FreeBSD 14 and 15) has a one-line `curl … && sudo apt install ./…deb` (or `dnf install ./…rpm`, or FreeBSD's `fetch … && pkg install -y ./…pkg && openchronology-setup`) command to copy, and Docker Compose is offered for other systems.
- **Release data:** the page reads the release's version, sizes and asset addresses from GitHub's API on the server, at most every ten minutes. `RELEASES_API_URL` overrides the address, for mirrors and tests.
- **Fallback:** while there is no release, or GitHub cannot be reached, it links to GitHub's fixed `releases/latest/download/<asset-name>` addresses instead.
- **Adding platforms:** asset names follow the release workflow (`platform/lib/releases.js`; a test keeps them in step), so a new server platform is added to its `SERVERS` list.

The editor's own **Download** menu, in the offline file and the desktop app, uses the fixed addresses. Prereleases remain available through the release listing.

Pushing a semantic version tag such as `v1.2.3` runs `.github/workflows/release.yml`. The desktop reusable workflow builds on GitHub runners for Ubuntu 24.04 (.deb and AppImage), Windows 2025, macOS 15 (Apple silicon), macOS 15 Intel, and a Rocky Linux 10 container on Ubuntu. It publishes `.deb`, portable `.AppImage`, `.rpm`, `.dmg` (both architectures), and Windows NSIS `.exe` installers alongside the standalone offline HTML. Each package records the same tagged commit; publication waits for every target and verifies their identities before generating checksums. Stable releases update the download links; prereleases appear in the release listing.

The RPM baseline is **Rocky Linux 10 / RHEL 10**, with EPEL and CRB enabled for WebKitGTK 4.1. Stock Rocky 9 supplies WebKitGTK 4.0, which cannot build this Tauri 2 application. The workflow installs the RPM and checks shared-library resolution on its baseline. It does not claim compatibility with RHEL 9.

Windows and macOS use GMP and SQLite static libraries built from a pinned vcpkg revision. Their matching native source archives accompany releases, along with application source and vendored Rust dependencies. Linux uses distribution libraries. Windows installers and macOS applications are currently unsigned (macOS is not notarized); configuring release signing requires the publisher's certificates. Every release asset has a build provenance attestation instead, which `gh attestation verify <file> --repo openchronology/timeline-app` checks ([verifying a download](licensing.md#verifying-a-download)).

For local packaged builds, run `node scripts/desktop/build.mjs TARGET` with one of `linux-deb`, `linux-appimage`, `rocky-rpm`, `macos-arm64`, `macos-amd64`, or `windows-amd64` on the corresponding native OS. The workflow dependency scripts set `OCH_NATIVE_PREFIX` and `OCH_NATIVE_STATIC` for pinned native libraries. macOS and Windows configuration files choose the platform's installer and icon automatically.
