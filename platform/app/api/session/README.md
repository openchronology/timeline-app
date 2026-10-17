# platform/app/api/session

Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only

`GET /api/session`: who is signed in, the CSRF token, sign-in providers and what this server offers (server storage, file exchange, comparison and size limits), answered by the platform's HTTP service (`server/http.mjs`) through `server/next-handler.mjs`.

## Contents

| File                   | What it is for                                                   |
| ---------------------- | ---------------------------------------------------------------- |
| [`route.js`](route.js) | Hands requests to `/api/session` to the platform's HTTP service. |
