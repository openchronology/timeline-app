# platform/app/api/moderation

Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only

`GET /api/moderation`: the moderation decisions about the signed-in account's timelines, comments, plugins and account (#115), answered by the platform's HTTP service (`server/http.mjs`) through `server/next-handler.mjs` (`server/moderation.mjs`). See [moderation](../../../../docs/moderation.md).

## Contents

| File                                | What it is for                                                         |
| ----------------------------------- | ---------------------------------------------------------------------- |
| [`[...path]/`]([...path]/README.md) | `POST /api/moderation/<id>/appeal`: asking for a review of a decision. |
| [`route.js`](route.js)              | Hands requests to `/api/moderation` to the platform's HTTP service.    |
