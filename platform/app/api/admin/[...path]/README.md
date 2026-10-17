# platform/app/api/admin/[...path]

Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only

`/api/admin/…` (`users`, `timelines`, `settings`, `reports` and one of each by id): the administrators' lists and changes to accounts, timelines, site settings and reports, answered by the platform's HTTP service (`server/http.mjs`) through `server/next-handler.mjs` (`server/administration.mjs`, `server/moderation.mjs`). Every method is passed on; the service refuses those it does not take.

## Contents

| File                   | What it is for                                                        |
| ---------------------- | --------------------------------------------------------------------- |
| [`route.js`](route.js) | Hands every request to `/api/admin/…` to the platform's HTTP service. |
