# packages/timeline/src

Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only

The source of the `<och-timeline>` element. [`scripts/timeline-package.mjs`](../../../scripts/timeline-package.mjs)
puts the built offline editor inside it and writes `../dist/timeline.js`.

## Contents

| File                       | What it is for                                                                                                            |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| [`element.js`](element.js) | The element: opens the timeline given inline, by `src` or by script in the offline editor, in a sandboxed `srcdoc` frame. |
