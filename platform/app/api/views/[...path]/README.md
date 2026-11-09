# platform/app/api/views/[...path]

Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only

`/api/views/…`: one saved view (`/<id>`): reading, changing and deleting it, its members (`/<id>/members`), and forking or duplicating it (`/<id>/fork`, `/<id>/duplicate`), answered by the platform's HTTP service (`server/http.mjs`) through `server/next-handler.mjs` (`server/saved-views.mjs`).

## Contents

| File                   | What it is for                                                        |
| ---------------------- | --------------------------------------------------------------------- |
| [`route.js`](route.js) | Hands every request to `/api/views/…` to the platform's HTTP service. |
