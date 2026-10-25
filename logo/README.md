# logo

Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only

OpenChronology's logo: a clock whose face is a "C", with its last hours set apart in gold, like a span of time marked on a timeline. [`scripts/icons.mjs`](../scripts/icons.mjs) draws every icon from these drawings: the site's favicons and phone icons ([`platform/app/`](../platform/app/README.md), [`platform/icons/`](../platform/icons/README.md)), the editor's tab icon and header, and the desktop app's icons ([`src-tauri/icons/`](../src-tauri/icons/README.md)). After changing one, run `node scripts/icons.mjs` and commit what it writes.

The colors are the site's: the header's dark green `#192d25`, the light green `#c4db98` and the gold `#f2c879`.

## Contents

| File                     | What it is for                                                                                              |
| ------------------------ | ----------------------------------------------------------------------------------------------------------- |
| [`logo.svg`](logo.svg)   | The logo on its dark green tile, as an app icon shows it (written by `scripts/icons.mjs`).                  |
| [`mark.svg`](mark.svg)   | The mark alone, on no background: the drawing the tiles are made from, and the headers' logo.               |
| [`small.svg`](small.svg) | A bolder, flat drawing for 16 to 32 pixels, where the full one's gaps and shading would blur: the tab icon. |
