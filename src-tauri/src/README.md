# src-tauri/src

Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only

The desktop app's Rust code. The editor (`src/app.ts`, and `src/transport.ts` for server requests) calls these commands through `window.__TAURI__`; files are read and written by the native store ([`native-store/`](../../native-store/README.md)), and only through paths the user chose in a dialog: the file populator, too, scans only the folders and files picked in its dialog.

## Contents

| File                                           | What it is for                                                                                                                                                                                                                                                                          |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`main.rs`](main.rs)                           | Starts the app and defines the commands the editor calls to open, import, browse, stage and save timeline files, and to reach servers.                                                                                                                                                  |
| [`populate.rs`](populate.rs)                   | The file populator (#433): a new timeline of the files in folders the user picked, dated by the file system or by their recorded metadata; and opening a moment's `file:///` source in its own app, or in its folder, refusing programs and scripts.                                    |
| [`server.rs`](server.rs)                       | The connections to up to eight servers: signing in by device login, sending the editor's API requests, and opening image links in the browser.                                                                                                                                          |
| [`system_thumbnails.rs`](system_thumbnails.rs) | Thumbnails the system makes (#442), for videos and for photos the app can't decode: the freedesktop cache or an installed thumbnailer on Linux, Quick Look on macOS, the Shell on Windows.                                                                                              |
| [`thumbnails.rs`](thumbnails.rs)               | Thumbnails of photos and videos on this computer (#440, #442) for moments whose source is one: a photo's own EXIF thumbnail or the photo scaled down, turned upright, or a video's cover picture, else the system's; kept in the app's cache folder, given to the page as `data:` URLs. |
