# platform/app/timelines/[id]/durations/[duration]

Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only

`/<owner>/<slug>/durations/<duration>`: the timeline open at one duration, with the duration's title, extent and description in its link previews, and the duration as text and schema.org structured data for search engines. See [durations](../../../../../../docs/durations.md).

## Contents

| File                                         | What it is for                                                        |
| -------------------------------------------- | --------------------------------------------------------------------- |
| [`opengraph-image.jsx`](opengraph-image.jsx) | The duration's link-preview image.                                    |
| [`page.jsx`](page.jsx)                       | The duration's page: the editor open at it, and the timeline as text. |
