# platform/icons

Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only

Images the site serves from its root, which `scripts/platform-assets.mjs` copies into `platform/public/`. [`scripts/icons.mjs`](../../scripts/icons.mjs) draws them from [`logo/`](../../logo/README.md). The tab icons and the home-screen icon are in [`../app/`](../app/README.md), where Next.js links them from every page.

## Contents

| File                                             | What it is for                                                                                 |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| [`icon-192.png`](icon-192.png)                   | The web app manifest's small icon, for Android's home screen.                                  |
| [`icon-512.png`](icon-512.png)                   | The manifest's large icon, for the splash screen and installed app lists.                      |
| [`icon-maskable-512.png`](icon-maskable-512.png) | The manifest's maskable icon: the mark kept inside the circle or shape Android may crop it to. |
| [`logo-mark.svg`](logo-mark.svg)                 | The logo in the site's header.                                                                 |
