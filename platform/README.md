# platform

Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only

The hosted platform: the Next.js application that serves the dashboard, accounts, timelines' pages, the plugin library, help and the HTTP API, with the editor (built from `src/` into `dist/`) framed in its pages. Most of its logic lives in [`server/`](../server/README.md); these files are the pages and routes around it. `npm run build` builds the editor and then this as a standalone server (`scripts/build-platform.mjs`), `npm run dev` runs it for development, and `npm start` runs the build. `public/` is filled at build time with the editor's assets and is not tracked; `.next/` is Next's build output. See [Hosted platform (Next.js)](../docs/architecture.md#hosted-platform-nextjs).

## Contents

| File                                  | What it is for                                                                                                                                                         |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`app/`](app/README.md)               | The site's pages and routes (Next.js App Router), one folder per address.                                                                                              |
| [`components/`](components/README.md) | React components the pages are built from: the framed editor, account, administration, sharing, reports and lists of timelines.                                        |
| [`lib/`](lib/README.md)               | Helpers the pages share: the visitor's session, loading timelines, link previews, the API reference and the download page's releases.                                  |
| [`next.config.mjs`](next.config.mjs)  | The Next.js configuration: a standalone server build, with the files it reads as it runs (`dist/`, `docs/`, the legal texts) traced into it.                           |
| [`proxy.js`](proxy.js)                | Runs before the site's pages: gives them their content security policy, and rewrites a timeline's address `/<owner>/<slug>/…` to its `/timelines/<id>/…` pages (#148). |
