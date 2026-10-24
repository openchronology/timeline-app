#!/bin/sh
# Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
# Renders a video's frames/NNNNN.jpg (1920x1080) from its page.html, in the Playwright image.
# Usage: common/render.sh <video folder> [from_seconds to_seconds [outdir]]   (default: all of it)
# Mounts the repository so render.mjs finds the repository's own playwright package.
set -e
video="$(cd "$1" && pwd)"
shift
repo="$(git -C "$video" rev-parse --show-toplevel)"
here="${video#"$repo"/}"
# --ipc=host: several 1080p pages exhaust Docker's small default shared memory.
docker run --rm --ipc=host --user "$(id -u):$(id -g)" -e HOME=/tmp -v "$repo:/work" -w "/work/$here" \
  mcr.microsoft.com/playwright:v1.58.2-noble node ../common/render.mjs 30 "${WORKERS:-8}" "$@"
