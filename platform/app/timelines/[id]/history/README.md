# platform/app/timelines/[id]/history

Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only

A timeline's saved history at `…/history`: its checkpoints, one for each server save, sync and merge, a page at a time (`server/versioning.mjs`). See [saved history](../../../../../docs/architecture.md#saved-history).

## Contents

| File                            | What it is for                                     |
| ------------------------------- | -------------------------------------------------- |
| [`[saved]/`]([saved]/README.md) | One saved checkpoint, at `…/history/<checkpoint>`. |
| [`page.jsx`](page.jsx)          | The list of checkpoints, linking those still kept. |
