# platform/lib

Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only

Helpers the platform's pages and components share. Files that import `server-only` run only on the server (they read the session, the database or the built editor); [`api.js`](api.js), [`navigation.js`](navigation.js), [`releases.js`](releases.js) and [`api-reference.js`](api-reference.js) work anywhere. Storage and the API's logic are in [`server/`](../../server/README.md).

## Contents

| File                                     | What it is for                                                                                                                                 |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| [`api-reference.js`](api-reference.js)   | Reads the API's OpenAPI description for its reference page: operations by tag, who may call them, schema types and example bodies.             |
| [`api.js`](api.js)                       | Calls the platform's HTTP API from the browser, with the CSRF token and any human-verification challenge.                                      |
| [`editor-html.js`](editor-html.js)       | The built editor's page (`dist/index.html`) as the platform serves it, and its content security policy.                                        |
| [`latest-release.js`](latest-release.js) | The latest GitHub release, for the download page, asked for at most every ten minutes.                                                         |
| [`navigation.js`](navigation.js)         | Where signing in may return to: only the site's own pages.                                                                                     |
| [`preview-image.jsx`](preview-image.jsx) | Draws the link-preview image of a shared timeline, moment or duration (public timelines only).                                                 |
| [`releases.js`](releases.js)             | What the download page offers: desktop apps, the offline file and server packages, with their release asset names.                             |
| [`session.js`](session.js)               | The visitor's session on a server-rendered page, and how many timelines they may compare.                                                      |
| [`sharing.js`](sharing.js)               | What shared links show: titles, descriptions, preview facts, embed code and addresses, for public timelines only where a guest would see them. |
| [`timeline.js`](timeline.js)             | Loads the timeline a page names as its visitor may see it, redirecting its other addresses, and the facts pages give their components.         |
