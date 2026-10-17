#!/usr/bin/env bash
# Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
# CI: builds GMP and SQLite as static libraries with a pinned vcpkg for the macOS desktop build,
# and passes their location to later steps (GITHUB_ENV).
set -euo pipefail
brew install autoconf autoconf-archive automake libtool pkg-config cmake ninja
vcpkg_root="$RUNNER_TEMP/och-vcpkg"
# Source archives and built packages live outside the clone so CI can cache them: builds then
# survive GNU mirror outages, and the archives are still there to ship as native sources.
export VCPKG_DOWNLOADS="$RUNNER_TEMP/och-vcpkg-cache/downloads"
export VCPKG_DEFAULT_BINARY_CACHE="$RUNNER_TEMP/och-vcpkg-cache/binary"
mkdir -p "$VCPKG_DOWNLOADS" "$VCPKG_DEFAULT_BINARY_CACHE"
git clone https://github.com/microsoft/vcpkg.git "$vcpkg_root"
git -C "$vcpkg_root" checkout 2cfff9c458d9dcf642e9fa09ba624f9931bb5358
"$vcpkg_root/bootstrap-vcpkg.sh" -disableMetrics
if [[ "$(uname -m)" == arm64 ]]; then triplet=arm64-osx; else triplet=x64-osx; fi
"$vcpkg_root/vcpkg" install "gmp:$triplet" "sqlite3:$triplet"
{
  echo "OCH_NATIVE_PREFIX=$vcpkg_root/installed/$triplet"
  echo 'OCH_NATIVE_STATIC=1'
  echo "OCH_VCPKG_ROOT=$vcpkg_root"
  echo "OCH_VCPKG_DOWNLOADS=$VCPKG_DOWNLOADS"
} >> "$GITHUB_ENV"
