# platform/app/api/oembed

Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only

`GET /api/oembed?url=…`: [oEmbed](https://oembed.com) for public timelines, so services that discover it turn a pasted link to a timeline, moment or duration into the embedded timeline (`/embed/<id>`). It answers itself, using [`lib/sharing.js`](../../../lib/sharing.js). See [sharing](../../../../docs/sharing.md).

## Contents

| File                   | What it is for                                                        |
| ---------------------- | --------------------------------------------------------------------- |
| [`route.js`](route.js) | Answers oEmbed requests for public timelines' addresses on this site. |
