# platform/app/connect/desktop/[code]

Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only

`/connect/desktop/<code>`: the signed-in account approves the desktop app's sign-in code ([`device-approval.jsx`](../../../../components/device-approval.jsx), which shows the request's time, address and User-Agent from `GET /api/auth/device/request`, asks for the code to be typed from the desktop app, and calls `POST /api/auth/device/approve`; the codes are kept by `server/device-auth.mjs`). Visitors who are signed out sign in first and come back.

## Contents

| File                   | What it is for                                                               |
| ---------------------- | ---------------------------------------------------------------------------- |
| [`page.jsx`](page.jsx) | The approval page: checks the code's form and that the visitor is signed in. |
