# platform/app/api/files/[...path]

Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only

`POST /api/files/import` and `POST /api/files/export`: converting timelines to and from OpenChronology's SQLite `.och` files with the native `och-convert`, answered by the platform's HTTP service (`server/http.mjs`) through `server/next-handler.mjs` (`server/files.mjs`).

## Contents

| File                   | What it is for                                                        |
| ---------------------- | --------------------------------------------------------------------- |
| [`route.js`](route.js) | Hands every request to `/api/files/…` to the platform's HTTP service. |
