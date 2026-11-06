# platform/app/previews/[name]

Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only

`GET /previews/<name>.png`: the site's card (`site`) or an audience page's (`educators`, …), 1200 × 630, from [`lib/site-preview.jsx`](../../../lib/site-preview.jsx). Any other name is not found.

## Contents

| File                   | What it is for         |
| ---------------------- | ---------------------- |
| [`route.js`](route.js) | Serves the card image. |
