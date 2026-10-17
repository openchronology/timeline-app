# platform/app/editor

Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only

The editor at `/editor`: a platform page ([`editor.jsx`](../../components/editor.jsx)) that frames the editor's own page, which `frame/` serves from the built `dist/index.html`.

## Contents

| File                        | What it is for                                                                                    |
| --------------------------- | ------------------------------------------------------------------------------------------------- |
| [`frame/`](frame/README.md) | `GET /editor/frame`: the editor's own page, for the platform's pages to frame.                    |
| [`page.jsx`](page.jsx)      | The page at `/editor`: a new, sample, forked or browser-draft timeline, with the tour on request. |
