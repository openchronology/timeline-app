# scripts/desktop

Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only

Builds the desktop app's packages with Tauri (`src-tauri/`) and stages them in `desktop-artifacts/`, as the [desktop workflow](../../.github/workflows/desktop.yml) does for each target. The macOS and Windows builds link GMP and SQLite statically, built by the dependency scripts here with a pinned vcpkg revision; their sources are archived beside the package so it can ship them.

## Contents

| File                                                   | What it is for                                                                                                                               |
| ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| [`triplets/`](triplets/README.md)                      | The vcpkg triplet the Windows build uses for its static libraries.                                                                           |
| [`build.mjs`](build.mjs)                               | Builds one desktop target with Tauri (`node scripts/desktop/build.mjs <target>`), checking the release tag when there is one, and stages it. |
| [`macos-dependencies.sh`](macos-dependencies.sh)       | CI: builds static GMP and SQLite with vcpkg for the macOS build and passes their location to later steps.                                    |
| [`packages.mjs`](packages.mjs)                         | The desktop targets and their release asset names, and staging a built package with its build identity and native sources.                   |
| [`windows-dependencies.ps1`](windows-dependencies.ps1) | CI: builds static GMP and SQLite with vcpkg for the Windows build and passes their location to later steps.                                  |
