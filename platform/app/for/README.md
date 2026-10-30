# platform/app/for

Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only

The audience pages (#379), with `LANDING_PAGE` on: `/for`, a card for each audience, and `/for/<audience>`, the page for one. Their copy is the Markdown of [`content/landing`](../../content/landing/README.md), or the operator's (`LANDING_CONTENT_DIR`); with the landing page off, they are not found. See [administration](../../../docs/administration.md#landing-page).

## Contents

| File                                  | What it is for                                                    |
| ------------------------------------- | ----------------------------------------------------------------- |
| [`[audience]/`]([audience]/README.md) | One audience's page at `/for/<audience>`.                         |
| [`page.jsx`](page.jsx)                | The index at `/for`: a card for each audience, then its own copy. |
