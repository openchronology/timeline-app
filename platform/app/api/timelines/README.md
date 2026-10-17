# platform/app/api/timelines

Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only

`GET /api/timelines` lists the account's timelines and `POST /api/timelines` creates one, answered by the platform's HTTP service (`server/http.mjs`) through `server/next-handler.mjs` (`server/store.mjs`). API keys reach only these endpoints and those below them.

## Contents

| File                                | What it is for                                                                |
| ----------------------------------- | ----------------------------------------------------------------------------- |
| [`[...path]/`]([...path]/README.md) | `/api/timelines/…`: one timeline and its contents, history and collaboration. |
| [`route.js`](route.js)              | Hands requests to `/api/timelines` to the platform's HTTP service.            |
