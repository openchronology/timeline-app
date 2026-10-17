# platform/app/api/plugins/[...path]

Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only

`/api/plugins/…`: a plugin's or plugin suite's version (`/<name>/<version>`, `suites/<name>/<version>`), searches (`search`, `suites`, `suites/search`) and publishing (`publish`, `suites/publish`), answered by the platform's HTTP service (`server/http.mjs`) through `server/next-handler.mjs` (`server/plugins.mjs`).

## Contents

| File                   | What it is for                                                          |
| ---------------------- | ----------------------------------------------------------------------- |
| [`route.js`](route.js) | Hands every request to `/api/plugins/…` to the platform's HTTP service. |
