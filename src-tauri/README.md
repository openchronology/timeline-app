# src-tauri

Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only

The desktop app's shell, built with [Tauri](https://tauri.app/): a native window around the same editor as every other edition (`src/`, built into `dist/` by `scripts/build.mjs` before Tauri runs), with commands for opening and saving SQLite timeline files through the native store ([`native-store/`](../native-store/README.md)) and for connecting to servers. Run it with `npm run desktop:dev`, and package it with `npm run desktop:build` (on CI, `scripts/desktop/` builds the static native libraries and the packages for each platform). The webview has no network access of its own: requests to servers go through `src/server.rs`. See the [architecture](../docs/architecture.md) for how the desktop store works.

## Contents

| File                                                 | What it is for                                                                                                                                     |
| ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`capabilities/`](capabilities/README.md)            | The permissions the app's window has.                                                                                                              |
| [`icons/`](icons/README.md)                          | The app's icons for Linux, macOS and Windows.                                                                                                      |
| [`src/`](src/README.md)                              | The app's Rust code: its commands and its server connections.                                                                                      |
| [`build.rs`](build.rs)                               | Tauri's build step, which generates the app's context from its configuration.                                                                      |
| [`Cargo.lock`](Cargo.lock)                           | The desktop crate's locked dependency versions.                                                                                                    |
| [`Cargo.toml`](Cargo.toml)                           | The desktop crate: Tauri, its dialog plugin, the native store and an HTTP client.                                                                  |
| [`tauri.conf.json`](tauri.conf.json)                 | Tauri's configuration: the window, its content security policy, how the editor is built and loaded, and the Linux packages with their legal files. |
| [`tauri.macos.conf.json`](tauri.macos.conf.json)     | What changes on macOS: a disk image, its icon and the oldest macOS supported.                                                                      |
| [`tauri.windows.conf.json`](tauri.windows.conf.json) | What changes on Windows: an installer for the current user, and its icon.                                                                          |
