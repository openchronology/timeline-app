# platform/app/api/live

Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only

`GET /api/live?timelines=<id>,…`: a stream of notices when any of up to eight timelines changes, so open editors can catch up. It answers itself, from `server/live.mjs`, instead of going through the HTTP service.

## Contents

| File                   | What it is for                                                            |
| ---------------------- | ------------------------------------------------------------------------- |
| [`route.js`](route.js) | Starts the platform and answers with the live stream (`server/live.mjs`). |
