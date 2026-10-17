# platform/app/admin

Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only

Site administration at `/admin`, for administrators only: accounts, timelines, settings and the report queue, in [`admin.jsx`](../../components/admin.jsx), which calls `/api/admin/…`. See [administration](../../../docs/administration.md).

## Contents

| File                   | What it is for                                                                                                        |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------- |
| [`page.jsx`](page.jsx) | The page at `/admin`: sends visitors who are signed out to sign in, and refuses accounts that are not administrators. |
