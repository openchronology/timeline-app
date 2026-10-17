# platform/app/[owner]

Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only

A profile at `/<username>` (#148): the account's public timelines, shown by [`profile.jsx`](../../components/profile.jsx). Names the site's own pages use (`RESERVED_NAMES` in `src/addresses.ts`) are not profiles, and a capitalized name redirects to its lowercase address. A timeline's own address, `/<owner>/<slug>`, is rewritten by `proxy.js` to [`timelines/[id]`](../timelines/[id]/README.md) before it reaches here.

## Contents

| File                   | What it is for                                                     |
| ---------------------- | ------------------------------------------------------------------ |
| [`page.jsx`](page.jsx) | The profile page at `/<username>`, with its link-preview metadata. |
