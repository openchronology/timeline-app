# platform/app/api

Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only

The HTTP API at `/api/…`. Most of its routes hand the request, as it is, to the platform's HTTP service (`server/http.mjs`) through `server/next-handler.mjs`, so the API is described and handled in [`server/`](../../../server/README.md) rather than here; a few (`live`, `oembed`, `openapi.json`) answer themselves. A `[...path]` folder catches every address below its parent. The API is documented in [docs/api.md](../../../docs/api.md) and at `/docs/api`.

## Contents

| File                                      | What it is for                                                   |
| ----------------------------------------- | ---------------------------------------------------------------- |
| [`admin/`](admin/README.md)               | `/api/admin/…`: site administration.                             |
| [`auth/`](auth/README.md)                 | `/api/auth/…`: accounts, signing in and API keys.                |
| [`files/`](files/README.md)               | `/api/files/…`: importing and exporting `.och` files.            |
| [`live/`](live/README.md)                 | `GET /api/live`: notices of changes to open timelines.           |
| [`moderation/`](moderation/README.md)     | `/api/moderation`: moderation decisions and appeals.             |
| [`oembed/`](oembed/README.md)             | `GET /api/oembed`: oEmbed for public timelines.                  |
| [`openapi.json/`](openapi.json/README.md) | `GET /api/openapi.json`: the API's OpenAPI description.          |
| [`plugins/`](plugins/README.md)           | `/api/plugins`: the plugin library.                              |
| [`reports/`](reports/README.md)           | `POST /api/reports`: reporting something to the administrators.  |
| [`session/`](session/README.md)           | `GET /api/session`: who is signed in and what the server offers. |
| [`timelines/`](timelines/README.md)       | `/api/timelines`: timelines, their contents and collaboration.   |
