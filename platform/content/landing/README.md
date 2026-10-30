# platform/content/landing

Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only

The copy of the landing page and the audience pages (#379), shown with `LANDING_PAGE` on. [`server/landing.mjs`](../../../server/landing.mjs) reads each file as a page is asked for. An operator's directory, `LANDING_CONTENT_DIR`, can hold files of the same names in their place; a file it lacks is read from here ([administration](../../../docs/administration.md#landing-page)).

Each file starts with front matter, `key: value` lines between `---` lines, then Markdown: paragraphs, lists, `##` headings, emphasis, code and links to `/…`, `https:` or `mailto:` addresses. HTML is shown as text.

| Key           | What it is                                                                 |
| ------------- | -------------------------------------------------------------------------- |
| `title`       | The page's heading and title.                                              |
| `promise`     | The line under the heading.                                                |
| `description` | The description for search engines and link previews.                      |
| `label`       | An audience's name on its card, such as `Educators`.                       |
| `card`        | What an audience's card says under its name.                               |
| `examples`    | The heading over the example timelines (`Example timelines` unless given). |
| `video`       | What the video is, on its poster and player.                               |
| `audiences`   | On `home.md`, the heading over the audiences' cards.                       |

## Contents

| File                                   | What it is for                                                                                   |
| -------------------------------------- | ------------------------------------------------------------------------------------------------ |
| [`audiences.md`](audiences.md)         | The index of audiences at `/for`.                                                                |
| [`developers.md`](developers.md)       | `/for/developers`: the API, keys, plugins and self-hosting.                                      |
| [`educators.md`](educators.md)         | `/for/educators`: class timelines, sources, no account to read, accounts 13 and older.           |
| [`home.md`](home.md)                   | The landing page at `/`: "Any span of time, on one exact line".                                  |
| [`investigators.md`](investigators.md) | `/for/investigators`: events and causal factors, sources, exact times and history.               |
| [`operations.md`](operations.md)       | `/for/operations`: syslog, journald and log files in timelines, live, and incidents beside them. |
| [`researchers.md`](researchers.md)     | `/for/researchers`: exact times, sources, date precision and export.                             |
| [`writers.md`](writers.md)             | `/for/writers`: story timelines and canons, storylines by tags, your world's own calendar.       |
