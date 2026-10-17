# platform/app/api/openapi.json

Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only

`GET /api/openapi.json`: the HTTP API's OpenAPI description (#178), built by `server/openapi` and readable by anyone. The reference page at `/docs/api` is made from the same description.

## Contents

| File                   | What it is for                                                |
| ---------------------- | ------------------------------------------------------------- |
| [`route.js`](route.js) | Serves the API's OpenAPI description, built once per process. |
