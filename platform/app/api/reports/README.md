# platform/app/api/reports

Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only

`POST /api/reports`: reporting a timeline, moment, duration, comment, plugin or account to the site's administrators (#115), signed in or not, answered by the platform's HTTP service (`server/http.mjs`) through `server/next-handler.mjs` (`server/moderation.mjs`).

## Contents

| File                   | What it is for                                                   |
| ---------------------- | ---------------------------------------------------------------- |
| [`route.js`](route.js) | Hands requests to `/api/reports` to the platform's HTTP service. |
