# platform/app/api/timelines/[...path]

Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only

`/api/timelines/…`: searching timelines and storage usage, and one timeline's contents, saves, saved history, forks and copies, stars, members, settings, pull requests and comments, answered by the platform's HTTP service (`server/http.mjs`) through `server/next-handler.mjs` (`server/store.mjs`, `server/versioning.mjs`, `server/collaboration.mjs`).

## Contents

| File                   | What it is for                                                            |
| ---------------------- | ------------------------------------------------------------------------- |
| [`route.js`](route.js) | Hands every request to `/api/timelines/…` to the platform's HTTP service. |
