# platform/app/api/plugins

Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only

`GET /api/plugins`: searching the plugin library, answered by the platform's HTTP service (`server/http.mjs`) through `server/next-handler.mjs` (`server/plugins.mjs`). See [plugins](../../../../docs/plugins.md).

## Contents

| File                                | What it is for                                                        |
| ----------------------------------- | --------------------------------------------------------------------- |
| [`[...path]/`]([...path]/README.md) | `/api/plugins/…`: plugin and suite versions, searches and publishing. |
| [`route.js`](route.js)              | Hands requests to `/api/plugins` to the platform's HTTP service.      |
