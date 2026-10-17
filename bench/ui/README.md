# bench/ui

Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only

Support files for the UI benchmarks in [`bench/ui.mjs`](../ui.mjs), which time real interactions in the editor in the browser, on the platform and in the desktop app. See [Benchmarks](../../docs/benchmarks.md#interactions) for how to run them.

## Contents

| File                                       | What it is for                                                                                                                                |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- |
| [`desktop.Dockerfile`](desktop.Dockerfile) | An Ubuntu 24.04 image with WebKitWebDriver, for running the desktop UI benchmarks on systems that do not package it.                          |
| [`probe.js`](probe.js)                     | Injected into the editor to time each interaction from its triggering input to the frame that shows the result, in Chromium and WebKit alike. |
| [`webdriver.mjs`](webdriver.mjs)           | The desktop driver: drives the Tauri app through tauri-driver with real W3C pointer, key and wheel actions.                                   |
