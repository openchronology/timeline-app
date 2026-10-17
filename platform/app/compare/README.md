# platform/app/compare

Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only

Comparing timelines at `/compare?timelines=<id>,<id>…`: two or more timelines, up to the account's limit, open together in one editor ([`editor.jsx`](../../components/editor.jsx)); timelines are chosen on the dashboard. See [comparison](../../../docs/comparison.md).

## Contents

| File                   | What it is for                                                                      |
| ---------------------- | ----------------------------------------------------------------------------------- |
| [`page.jsx`](page.jsx) | The page at `/compare`: checks the chosen timelines, then opens them in the editor. |
