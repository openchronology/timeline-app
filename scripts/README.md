# scripts

Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only

The build, development and release scripts, run with Node from the repository root (most through `npm run`, see `package.json`). `build.mjs` builds the editor into `dist/`, which the platform, the server, the tests and the benchmarks import, so run it (or `npm run build`) before anything that reads `dist/`. The server packages these scripts build are laid out in [`deploy/`](../deploy/README.md); the CI and release workflows that run them are in [`.github/workflows/`](../.github/workflows/README.md).

## Contents

| File                                           | What it is for                                                                                                                                                                                |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`desktop/`](desktop/README.md)                | Building and staging the Tauri desktop packages, and the static native libraries they link.                                                                                                   |
| [`build-info.mjs`](build-info.mjs)             | Works out the build's identity (commit, release tag, whether modified) and writes `dist/build-info.json`.                                                                                     |
| [`build-offline.mjs`](build-offline.mjs)       | `npm run build:offline`: builds only the standalone offline editor.                                                                                                                           |
| [`build-platform.mjs`](build-platform.mjs)     | `npm run build`: builds the editor, then the Next.js platform as the standalone server `npm start` and the Docker image run.                                                                  |
| [`build.mjs`](build.mjs)                       | Builds the editor into `dist/`: bundles, the shared core, the page and legal notices, licenses, the offline HTML and the web source archive.                                                  |
| [`dev-editor.mjs`](dev-editor.mjs)             | Serves the editor on 127.0.0.1:5173 for `tauri dev`, without Next.js.                                                                                                                         |
| [`dev.mjs`](dev.mjs)                           | `npm run dev`: rebuilds the editor as its sources change and runs the Next.js platform in development mode.                                                                                   |
| [`homebrew-formula.mjs`](homebrew-formula.mjs) | Renders the Homebrew formula from `deploy/homebrew/openchronology-server.rb.in` for a platform archive.                                                                                       |
| [`html.mjs`](html.mjs)                         | Writes `dist/index.html`, the editor's page with its legal footer, and `dist/legal.html`.                                                                                                     |
| [`icons.mjs`](icons.mjs)                       | Draws every icon from `logo/`: the favicons, the phone and web-app icons, and the desktop app's icons.                                                                                        |
| [`legal.mjs`](legal.mjs)                       | The legal notices in built pages: the bundles' copyright banner, the footer with the build identity, and the legal page.                                                                      |
| [`licenses.mjs`](licenses.mjs)                 | Collects the license texts of the bundled browser dependencies (rational-ordered-map and fraction.js).                                                                                        |
| [`npm-ci.mjs`](npm-ci.mjs)                     | Runs `npm ci` with Yarn's lockfile set aside, so npm does not rewrite it; CI installs with this.                                                                                              |
| [`offline.mjs`](offline.mjs)                   | Builds `dist/openchronology-offline.html`: one self-contained file with no network transport and a hash-pinned content security policy.                                                       |
| [`platform-assets.mjs`](platform-assets.mjs)   | Copies the editor's built assets and notices, and the web-app icons, into `platform/public/` for the Next.js platform.                                                                        |
| [`release-assets.mjs`](release-assets.mjs)     | Checks that a release's assets are all present and built from the tag's commit, then writes `SHA256SUMS.txt`.                                                                                 |
| [`server-package.mjs`](server-package.mjs)     | Builds the server packages with Docker into `server-artifacts/`: .deb, .rpm, and the platform archive FreeBSD and Homebrew build from. Docker's log shows each step.                          |
| [`server-targets.mjs`](server-targets.mjs)     | The server package targets (format, base image, PostgreSQL version) and their file names and version numbering.                                                                               |
| [`source.mjs`](source.mjs)                     | Builds the matching web or desktop source archive from an explicit allowlist of the repository's files.                                                                                       |
| [`start-platform.mjs`](start-platform.mjs)     | `npm start`: runs the built standalone Next.js platform in production, with settings from `.env`.                                                                                             |
| [`ubuntu-archive.sh`](ubuntu-archive.sh)       | Puts Ubuntu's own archive ahead of Azure's mirror in a CI runner's apt mirror list (Azure's now and then stalls installs, #351), with retries; each job that installs packages runs it first. |
