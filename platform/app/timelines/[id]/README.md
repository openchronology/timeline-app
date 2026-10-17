# platform/app/timelines/[id]

Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only

One timeline's pages, at `/<owner>/<slug>` or `/timelines/<id>` (`proxy.js` rewrites the first to the second). Each loads the timeline with [`lib/timeline.js`](../../../lib/timeline.js), which checks the visitor may open it and redirects other addresses of it to its own; link previews come from [`lib/sharing.js`](../../../lib/sharing.js) and [`lib/preview-image.jsx`](../../../lib/preview-image.jsx).

## Contents

| File                                         | What it is for                                                                                                                                  |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| [`durations/`](durations/README.md)          | A duration's own page, at `…/durations/<duration>`.                                                                                             |
| [`history/`](history/README.md)              | The timeline's saved history, at `…/history`.                                                                                                   |
| [`moments/`](moments/README.md)              | A moment's own page, at `…/moments/<moment>`.                                                                                                   |
| [`pulls/`](pulls/README.md)                  | The timeline's pull requests, at `…/pulls`.                                                                                                     |
| [`settings/`](settings/README.md)            | The timeline's sharing and settings, at `…/settings`.                                                                                           |
| [`sync/`](sync/README.md)                    | Syncing a fork with its upstream, at `…/sync`.                                                                                                  |
| [`opengraph-image.jsx`](opengraph-image.jsx) | The timeline's link-preview image.                                                                                                              |
| [`page.jsx`](page.jsx)                       | The timeline's page: the editor open at it, its first moments as text, and its link-preview metadata; a copy still being prepared waits for it. |
