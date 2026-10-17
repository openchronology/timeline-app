# deploy/platform

Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only

The server's platform-independent part (#116), `openchronology-server-platform.tar.gz`: the editor and the Next.js platform built on Linux, the documentation, och-convert's sources with its Rust crates vendored (so it builds offline), and the Homebrew commands and configuration templates. Build it with `node scripts/server-package.mjs platform`. The [FreeBSD package](../freebsd-server/README.md), the [Homebrew formula](../homebrew/README.md) and the [Windows installer](../windows-server/README.md) build och-convert and pgmp for their systems from it; releases attach it.

## Contents

| File                       | What it is for                              |
| -------------------------- | ------------------------------------------- |
| [`Dockerfile`](Dockerfile) | Builds the platform archive and exports it. |
