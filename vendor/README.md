# vendor

Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only

The two independent rational-number libraries the app is built on, pinned here so that no build depends on a neighbouring checkout. They are MIT-licensed and maintained upstream: change them there and update the copies here; [`versions.json`](versions.json) records the upstream commits. `package.json` installs the browser library from the archive, and `native-store` (the desktop app and `och-convert`) compiles the SQLite extension. Their notices are in [`THIRD_PARTY.md`](../THIRD_PARTY.md).

## Contents

| File                                                               | What it is for                                                                                                                             |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| [`rational-map-build-support/`](rational-map-build-support/)       | rational-map's TypeScript configuration, build script and license, shipped in the source archives so its recovered sources can be rebuilt. |
| [`sqlite-rational/`](sqlite-rational/README.md)                    | sqlite-rational: the GMP-backed SQLite extension for exact rationals and indexed range queries, with its own README and tests.             |
| [`rational-ordered-map-0.1.0.tgz`](rational-ordered-map-0.1.0.tgz) | The packed rational-ordered-map npm package: the exact rational map that holds a timeline's moments in the editor's core.                  |
| [`versions.json`](versions.json)                                   | The upstream repositories and commits the vendored libraries were taken from.                                                              |
