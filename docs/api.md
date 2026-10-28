# HTTP API

Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only

The server's HTTP API, which the web app, the desktop app and the command-line tools use, is described in [OpenAPI 3.1](https://spec.openapis.org/oas/v3.1.0) ([#178](https://github.com/openchronology/timeline-app/issues/178)).

| Where               | What                                                                                                                           |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `/docs/api`         | The reference: every operation, who may call it, its parameters, body and responses, and **Try it** to send one from the page. |
| `/api/openapi.json` | The description itself, for Swagger UI, Redoc, Postman, Insomnia or code generators such as openapi-generator.                 |

The footer of every page links to the reference, and so does **Account → API keys**.

## Calling it

- **From a browser** the session cookie signs requests in. Changes also send the session's CSRF token, the `csrf` of `GET /api/session`, as `X-CSRF-Token`.
- **For automation**, make an API key in **Account → API keys** and send it as `Authorization: Bearer och_key_…`. Keys reach the timeline endpoints only (`/api/timelines…`): `timelines:read` for reads (GET, and POST searches and queries) and `timelines:write` for changes. They need no CSRF token.

```sh
curl -H "Authorization: Bearer $OCH_KEY" https://timescale.info/api/timelines
```

- **Try it** in the reference sends requests as the account signed in to the page, or with an API key typed into it. The key stays in the page while it is open and is sent to this server only.

## Warnings

A request that succeeds may still have something to say: its answer then carries `warnings`, a list of `{"code", "message", …}`, which clients may show and otherwise ignore. Today the only one is `long-background`, given when creating or saving a timeline, or reading a file, whose durations have background image addresses too long to show ([images](images.md#image-addresses)); it adds `count` and `durations`, the IDs of up to 100 of them. Without anything to warn of, there is no `warnings`.

## Keeping it right

The description is code: `server/openapi/`, one module for each area of the API (`timelines.mjs`, `collaboration.mjs`, `accounts.mjs`, `community.mjs`) sharing `common.mjs`. A route added to the server without a description fails the tests:

- `test/openapi.test.mjs` checks the description is well formed and complete (every reference resolves; every operation has an ID, a summary, tags, security and a success response; path parameters match their paths), and that every route `server/http.mjs` names is described.
- `test/openapi-postgres.mjs` sends every described operation to a running server and checks each reaches a route rather than "Unknown endpoint." or "Method not allowed.".
