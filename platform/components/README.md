# platform/components

Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only

The React components the platform's pages ([`../app`](../app/README.md)) are built from. Files starting with `'use client'` run in the browser and call the HTTP API through [`../lib/api.js`](../lib/api.js); the rest render on the server. The editor itself is not here: [`editor.jsx`](editor.jsx) frames the built editor and adds the platform's actions around it.

## Contents

| File                                                   | What it is for                                                                                                                                                      |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`account-access.jsx`](account-access.jsx)             | The account page's access settings: profile picture, sensitive content, linked sign-in methods, API keys, and deleting the account.                                 |
| [`account.jsx`](account.jsx)                           | Signing in and the account page: registration, password and provider sign-in, two-factor and email checks, password and email changes, sessions and recovery codes. |
| [`admin-reports.jsx`](admin-reports.jsx)               | One case in the administrators' report queue (#115): what was reported and why, and the decisions to take on it.                                                    |
| [`admin.jsx`](admin.jsx)                               | Site administration: accounts and their standing, timelines, site settings and the report queue, with changes confirmed first.                                      |
| [`analytics.jsx`](analytics.jsx)                       | Google Analytics when the site enables it, loaded only after the visitor consents, and the footer's control to change that choice.                                  |
| [`api-filter.jsx`](api-filter.jsx)                     | Finding operations in the API reference by their path, method or summary.                                                                                           |
| [`api-schema.jsx`](api-schema.jsx)                     | A schema from the API's description, shown as a list of its fields.                                                                                                 |
| [`api-text.jsx`](api-text.jsx)                         | The API description's text, with its paragraphs, lists, code, bold and links.                                                                                       |
| [`api-try.jsx`](api-try.jsx)                           | Trying an API operation from its reference, as the signed-in account or with an API key.                                                                            |
| [`browser-drafts.jsx`](browser-drafts.jsx)             | The dashboard's list of timelines started in this browser and not yet saved to the server (#188).                                                                   |
| [`compare-selection.jsx`](compare-selection.jsx)       | Choosing timelines to compare: a checkbox on each listed timeline and a tray that opens `/compare`.                                                                 |
| [`copy-command.jsx`](copy-command.jsx)                 | A shell command with a button that copies it.                                                                                                                       |
| [`device-approval.jsx`](device-approval.jsx)           | Approving the desktop app's sign-in code with the signed-in account.                                                                                                |
| [`editor.jsx`](editor.jsx)                             | The editor on a platform page: frames `/editor/frame` and adds stars, forks, sharing and reports around it.                                                         |
| [`fork-operation.jsx`](fork-operation.jsx)             | Syncing a fork with its upstream, or proposing its saved changes as a pull request.                                                                                 |
| [`help-results.jsx`](help-results.jsx)                 | The help's search results: the sections that mention what was asked, best first.                                                                                    |
| [`help-shell.jsx`](help-shell.jsx)                     | The help area's frame: its sections and pages beside the page that is open, and its search.                                                                         |
| [`help-tip.jsx`](help-tip.jsx)                         | A "?" beside a setting that shows its tip and links to the help about it.                                                                                           |
| [`legacy-links.jsx`](legacy-links.jsx)                 | Sends old dashboard links (`#timeline/<id>`, `#desktop/<code>`) to their pages.                                                                                     |
| [`moderation-decisions.jsx`](moderation-decisions.jsx) | The account's moderation decisions, and asking for a review of one.                                                                                                 |
| [`preparing-copy.jsx`](preparing-copy.jsx)             | Waits for a large fork or duplicate to finish copying, then opens it.                                                                                               |
| [`profile.jsx`](profile.jsx)                           | A profile page: the account's public timelines and its favorites, with link-preview metadata.                                                                       |
| [`pull-review.jsx`](pull-review.jsx)                   | Reviewing a pull request: its changes and discussion, and merging, closing or rebasing it.                                                                          |
| [`report-dialog.jsx`](report-dialog.jsx)               | The dialog for reporting something to the site's administrators, signed in or not.                                                                                  |
| [`report-link.jsx`](report-link.jsx)                   | A Report button that opens the report dialog.                                                                                                                       |
| [`revision-download.jsx`](revision-download.jsx)       | A link that downloads a saved checkpoint as `.ochx`, streamed by the server.                                                                                        |
| [`share-dialog.jsx`](share-dialog.jsx)                 | The share dialog: a link, social sites' share pages, and embed code for public timelines.                                                                           |
| [`star-button.jsx`](star-button.jsx)                   | A timeline's star button and count.                                                                                                                                 |
| [`timeline-list.jsx`](timeline-list.jsx)               | A page of timelines as cards with their owners, tags, labels and stars, compare checkboxes and paging.                                                              |
| [`timeline-search.jsx`](timeline-search.jsx)           | The dashboard's search form for public timelines: words, tag and sort order.                                                                                        |
| [`timeline-settings.jsx`](timeline-settings.jsx)       | A timeline's sharing and settings: visibility, address, collaborators, content labels, saved history and deletion.                                                  |
| [`timeline-summary.jsx`](timeline-summary.jsx)         | The timeline as text beside the editor, for screen readers and search engines.                                                                                      |
| [`version-actions.jsx`](version-actions.jsx)           | Copying a timeline: forking or duplicating it on the server, or forking it in the browser.                                                                          |
