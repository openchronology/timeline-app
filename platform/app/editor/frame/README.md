# platform/app/editor/frame

Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only

`GET /editor/frame`: the built editor (`dist/index.html`, adjusted by [`lib/editor-html.js`](../../../lib/editor-html.js)) with its own content security policy, which only this site may frame. The platform's pages show it in an `<iframe>` and talk to it with messages. With `?timeline=<id>` it arrives with that timeline's heading in place for a reader who may open it ([#428](https://github.com/openchronology/timeline-app/issues/428)); search engines may read it, but index it only as part of the page that frames it.

## Contents

| File                   | What it is for                                                                        |
| ---------------------- | ------------------------------------------------------------------------------------- |
| [`route.js`](route.js) | Serves the editor's page, headed by a timeline when asked, with its security headers. |
