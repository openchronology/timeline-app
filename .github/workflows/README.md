# .github/workflows

Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only

The GitHub Actions workflows: continuous integration, releases, benchmarks and the published offline editor. Most steps run the repository's own scripts ([`scripts/`](../../scripts/README.md), `test/`, [`bench/`](../../bench/README.md)), so a workflow failure can usually be reproduced locally with the same command. Third-party actions are pinned to full commit hashes, and installs go through `scripts/npm-ci.mjs`. `desktop.yml`, `server-packages.yml`, `nix.yml` and `pages.yml` are reusable workflows that `ci.yml` and `release.yml` call. The server packages' long steps (building, and installing in a fresh container or virtual machine) each have their own `timeout-minutes`, a few times their usual length, so a stalled mirror fails the step in minutes and a rerun can follow, instead of holding the runner for the whole job's limit (#367). The .deb and .rpm jobs restore the Node.js tarball their package bundles from `actions/cache`, keyed on the version and architecture the Dockerfiles pin, or download and check it with `scripts/node-tarball.mjs` on a miss, and give it to the build in `OCH_NODE_TARBALL`, so the Docker build no longer downloads it from nodejs.org, which stalled from GitHub's runners (#369).

## Contents

| File                                         | What it is for                                                                                                                                                                  |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`bench.yml`](bench.yml)                     | Runs the benchmark suite on demand and uploads its report ([benchmarks](../../docs/benchmarks.md)).                                                                             |
| [`build-images.yml`](build-images.yml)       | Builds, pushes and attests the server packages' tools images (#605) when their Dockerfiles change on main, weekly and by hand.                                                  |
| [`ci.yml`](ci.yml)                           | Every push and pull request: the Compose stack, the tests with each package manager, browsers, PostgreSQL, UI budgets, and the packages.                                        |
| [`desktop.yml`](desktop.yml)                 | Builds, tests and uploads the desktop app for Linux, Rocky Linux, macOS and Windows.                                                                                            |
| [`nix.yml`](nix.yml)                         | Builds the Nix flake's packages on x86_64 and aarch64 Linux and runs the NixOS test of its module; releases push to Cachix when configured.                                     |
| [`pages.yml`](pages.yml)                     | Publishes the offline editor to openchronology.github.io for each stable release (#510), after checking it works without a network.                                             |
| [`release.yml`](release.yml)                 | On a version tag or release: builds every asset, checks them, attests their build provenance, attaches them to the release and publishes the Homebrew formula and AUR packages. |
| [`server-packages.yml`](server-packages.yml) | Builds and tests the server packages: .deb, .rpm, the platform archive, FreeBSD, Homebrew and Windows.                                                                          |
