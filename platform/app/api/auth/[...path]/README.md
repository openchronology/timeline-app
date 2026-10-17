# platform/app/api/auth/[...path]

Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only

`/api/auth/…`: signing in, registering and signing out, providers' sign-in, email, two-factor and password changes, sessions, API keys, the desktop app's sign-in (`device/…`) and deleting the account, answered by the platform's HTTP service (`server/http.mjs`) through `server/next-handler.mjs` (`server/auth.mjs` and its neighbours). See [authentication](../../../../../docs/authentication.md).

## Contents

| File                   | What it is for                                                       |
| ---------------------- | -------------------------------------------------------------------- |
| [`route.js`](route.js) | Hands every request to `/api/auth/…` to the platform's HTTP service. |
