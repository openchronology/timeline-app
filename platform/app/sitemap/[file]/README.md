# platform/app/sitemap/[file]

Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only

`GET /sitemap/<file>`: one page of the sitemap, built by [`lib/sitemap.js`](../../../lib/sitemap.js). `pages.xml` lists the site's own pages and the help; `timelines-<id>.xml` and `profiles-<id>.xml` list up to 45,000 public timelines, or profiles that own one, from that ID on; `entities-<id>.xml` lists the moment and duration pages of a few small public timelines from that timeline's ID on (#335).

## Contents

| File                   | What it is for                  |
| ---------------------- | ------------------------------- |
| [`route.js`](route.js) | Serves one page of the sitemap. |
