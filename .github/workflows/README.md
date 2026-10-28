# .github/workflows

Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only

The GitHub Actions workflows: continuous integration, releases, benchmarks and the published offline editor. Most steps run the repository's own scripts ([`scripts/`](../../scripts/README.md), `test/`, [`bench/`](../../bench/README.md)), so a workflow failure can usually be reproduced locally with the same command. Third-party actions are pinned to full commit hashes, and installs go through `scripts/npm-ci.mjs`. `desktop.yml` and `server-packages.yml` are reusable workflows that `ci.yml` and `release.yml` call. The server packages' long steps (building, and installing in a fresh container or virtual machine) each have their own `timeout-minutes`, a few times their usual length, so a stalled mirror fails the step in minutes and a rerun can follow, instead of holding the runner for the whole job's limit (#367).

## Contents

| File                                         | What it is for                                                                                                                           |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| [`bench.yml`](bench.yml)                     | Runs the benchmark suite on demand and uploads its report ([benchmarks](../../docs/benchmarks.md)).                                      |
| [`ci.yml`](ci.yml)                           | Every push and pull request: the Compose stack, the tests with each package manager, browsers, PostgreSQL, UI budgets, and the packages. |
| [`desktop.yml`](desktop.yml)                 | Builds, tests and uploads the desktop app for Linux, Rocky Linux, macOS and Windows.                                                     |
| [`pages.yml`](pages.yml)                     | Publishes the offline editor to openchronology.github.io on each push to main, after checking it works without a network.                |
| [`release.yml`](release.yml)                 | On a version tag or release: builds every asset, checks them, attaches them to the release and publishes the Homebrew formula.           |
| [`server-packages.yml`](server-packages.yml) | Builds and tests the server packages: .deb, .rpm, the platform archive, FreeBSD, Homebrew and Windows.                                   |
