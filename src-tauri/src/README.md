# src-tauri/src

Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only

The desktop app's Rust code. The editor (`src/app.ts`, and `src/transport.ts` for server requests) calls these commands through `window.__TAURI__`; files are read and written by the native store ([`native-store/`](../../native-store/README.md)), and only through paths the user chose in a dialog.

## Contents

| File                     | What it is for                                                                                                                                 |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| [`main.rs`](main.rs)     | Starts the app and defines the commands the editor calls to open, import, browse, stage and save timeline files, and to reach servers.         |
| [`server.rs`](server.rs) | The connections to up to eight servers: signing in by device login, sending the editor's API requests, and opening image links in the browser. |
