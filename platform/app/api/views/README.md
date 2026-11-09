# platform/app/api/views

Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only

`/api/views`: the account's saved views, and saving one (#550), answered by the platform's HTTP service (`server/http.mjs`) through `server/next-handler.mjs` (`server/saved-views.mjs`). See [views](../../../../docs/views.md).

## Contents

| File                                | What it is for                                                                        |
| ----------------------------------- | ------------------------------------------------------------------------------------- |
| [`[...path]/`]([...path]/README.md) | `/api/views/…`: one view, changing or deleting it, its members, forks and duplicates. |
| [`route.js`](route.js)              | Hands requests to `/api/views` to the platform's HTTP service.                        |
