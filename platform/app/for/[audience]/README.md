# platform/app/for/[audience]

Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only

One audience's page at `/for/<audience>` (#379): `educators`, `researchers`, `investigators`, `operations`, `writers` or `developers` (`AUDIENCES` in [`server/landing.mjs`](../../../../server/landing.mjs)); any other is not found, as is every one with the landing page off.

## Contents

| File                   | What it is for                                                                                                                               |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| [`page.jsx`](page.jsx) | The page: its promise, example timelines (`LANDING_EXAMPLES_<AUDIENCE>`), video (`LANDING_VIDEO_<AUDIENCE>`), copy, and the other audiences. |
