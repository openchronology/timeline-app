# platform/app/healthz

Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only

`GET /healthz`: whether the server and its database are up, for monitoring and containers' health checks, answered by the platform's HTTP service (`server/http.mjs`) through `server/next-handler.mjs`.

## Contents

| File                   | What it is for                                               |
| ---------------------- | ------------------------------------------------------------ |
| [`route.js`](route.js) | Hands requests to `/healthz` to the platform's HTTP service. |
