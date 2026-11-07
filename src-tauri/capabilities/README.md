# src-tauri/capabilities

Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only

Tauri capabilities: which permissions each of the desktop app's windows has. The app has one window, `main`, which may call the app's own commands (in [`../src/`](../src/README.md), declared in [`../build.rs`](../build.rs)) and nothing of Tauri's or its plugins': the editor uses none of their APIs, and Rust opens every dialog itself. See [what the desktop page may ask of Rust](../../docs/architecture.md#what-the-desktop-page-may-ask-of-rust).

## Contents

| File                           | What it is for                                                        |
| ------------------------------ | --------------------------------------------------------------------- |
| [`default.json`](default.json) | Grants the main editor window the app's own commands, and only those. |
