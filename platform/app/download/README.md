# platform/app/download

Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only

The download page at `/download` (#111): the desktop app for the visitor's operating system first, the other systems, the offline file and the server for each distribution. What it offers is listed in [`lib/releases.js`](../../lib/releases.js), and sizes come from the latest GitHub release ([`lib/latest-release.js`](../../lib/latest-release.js)).

## Contents

| File                   | What it is for                                                                                    |
| ---------------------- | ------------------------------------------------------------------------------------------------- |
| [`page.jsx`](page.jsx) | The page at `/download`: picks the visitor's system and lists every download and install command. |
