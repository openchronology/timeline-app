# platform/app/embed/[id]

Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only

`GET /embed/<id>`: a public timeline as the editor, read-only and anonymous, for other sites to frame (see `embedded` in `src/app.ts`); private timelines are never embedded. `EMBED_FRAME_ANCESTORS` limits which sites may frame it. Share dialogs and `/api/oembed` give out its embed code. See [sharing](../../../../docs/sharing.md).

## Contents

| File                   | What it is for                                                                             |
| ---------------------- | ------------------------------------------------------------------------------------------ |
| [`route.js`](route.js) | Serves the editor's page titled for the timeline, or a short notice when it is not public. |
