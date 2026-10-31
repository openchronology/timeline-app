# platform/lib

Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only

Helpers the platform's pages and components share. Files that import `server-only` run only on the server (they read the session, the database or the built editor); [`api.js`](api.js), [`navigation.js`](navigation.js), [`releases.js`](releases.js), [`second-factor.js`](second-factor.js), [`timeline-lists.js`](timeline-lists.js) and [`api-reference.js`](api-reference.js) work anywhere. Storage and the API's logic are in [`server/`](../../server/README.md).

## Contents

| File                                     | What it is for                                                                                                                                                                              |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`api-reference.js`](api-reference.js)   | Reads the API's OpenAPI description for its reference page: operations by tag, who may call them, schema types and example bodies.                                                          |
| [`api.js`](api.js)                       | Calls the platform's HTTP API from the browser, with the CSRF token and any human-verification challenge.                                                                                   |
| [`editor-html.js`](editor-html.js)       | The built editor's page (`dist/index.html`) as the platform serves it, and its content security policy.                                                                                     |
| [`landing.js`](landing.js)               | What the landing and audience pages show around their copy (#379): the visitor, sign-up, example timelines and the video; their metadata.                                                   |
| [`latest-release.js`](latest-release.js) | The latest GitHub release, for the download page, asked for at most every ten minutes.                                                                                                      |
| [`navigation.js`](navigation.js)         | Where signing in may return to: only the site's own pages.                                                                                                                                  |
| [`passkeys.js`](passkeys.js)             | Passkeys in the browser: making and using one with the server's options, in base64url JSON, and confirming a change with one.                                                               |
| [`preview-image.jsx`](preview-image.jsx) | Draws the link-preview image of a shared timeline, moment or duration (public timelines only).                                                                                              |
| [`releases.js`](releases.js)             | What the download page offers: desktop apps, the offline file and server packages, with their release asset names.                                                                          |
| [`second-factor.js`](second-factor.js)   | Whether two-factor authentication is answered by recovery codes alone, so the account page asks for a passkey or an authenticator app.                                                      |
| [`session.js`](session.js)               | The visitor's session on a server-rendered page, and how many timelines they may compare.                                                                                                   |
| [`sharing.js`](sharing.js)               | What shared links show: titles, descriptions, preview facts, entity facts and structured data, embed code and addresses, for public timelines only where a guest would see them.            |
| [`sitemap.js`](sitemap.js)               | The sitemap (`/sitemap.xml` and its pages): the site's pages, then every public timeline, every profile that owns one, and small public timelines' moments and durations, 45,000 to a page. |
| [`timeline.js`](timeline.js)             | Loads the timeline a page names as its visitor may see it, redirecting its other addresses, and the facts pages give their components.                                                      |
| [`timeline-lists.js`](timeline-lists.js) | Each timeline list's own search, tag, sort, visibility and page parameters on the dashboard and profiles (#337), and searching browser drafts.                                              |
