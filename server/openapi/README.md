# server/openapi

Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only

The HTTP API's description (#178) in OpenAPI 3.1, written as JavaScript modules: the server serves it at /api/openapi.json and the reference at /docs/api reads it. Each area of the API exports `{ tags, paths, schemas }` from its own module, built with the helpers in `common.mjs`, and `index.mjs` puts them together. When a route in [`../http.mjs`](../http.mjs) changes, change its description here too. See [the API](../../docs/api.md).

## Contents

| File                                     | What it is for                                                                                                                               |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| [`accounts.mjs`](accounts.mjs)           | Describes the session, signing in and out, registration, account security, API keys, device sign-in, sign-in providers and account deletion. |
| [`collaboration.mjs`](collaboration.mjs) | Describes finding and starring timelines, forks, copies and syncs, saved history, and pull requests with their comments.                     |
| [`common.mjs`](common.mjs)               | What every area shares: how requests are authorized, errors, and helpers for writing operations briefly.                                     |
| [`community.mjs`](community.mjs)         | Describes the plugin and suite library, reports and moderation, site administration and the health check.                                    |
| [`index.mjs`](index.mjs)                 | Assembles the whole OpenAPI document from the areas, with this build's version.                                                              |
| [`timelines.mjs`](timelines.mjs)         | Describes creating, reading, querying, saving, sharing and deleting timelines, file exchange, live updates and oEmbed.                       |
