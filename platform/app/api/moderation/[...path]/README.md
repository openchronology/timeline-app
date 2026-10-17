# platform/app/api/moderation/[...path]

Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only

`POST /api/moderation/<id>/appeal`: asking for a review of a moderation decision (#115), answered by the platform's HTTP service (`server/http.mjs`) through `server/next-handler.mjs` (`server/moderation.mjs`).

## Contents

| File                   | What it is for                                                             |
| ---------------------- | -------------------------------------------------------------------------- |
| [`route.js`](route.js) | Hands every request to `/api/moderation/…` to the platform's HTTP service. |
