#!/usr/bin/env bash
# Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
set -euo pipefail
brew install autoconf autoconf-archive automake libtool pkg-config cmake ninja
vcpkg_root="$RUNNER_TEMP/och-vcpkg"
git clone https://github.com/microsoft/vcpkg.git "$vcpkg_root"
git -C "$vcpkg_root" checkout 2cfff9c458d9dcf642e9fa09ba624f9931bb5358
"$vcpkg_root/bootstrap-vcpkg.sh" -disableMetrics
if [[ "$(uname -m)" == arm64 ]]; then triplet=arm64-osx; else triplet=x64-osx; fi
"$vcpkg_root/vcpkg" install "gmp:$triplet" "sqlite3:$triplet"
{
  echo "OCH_NATIVE_PREFIX=$vcpkg_root/installed/$triplet"
  echo 'OCH_NATIVE_STATIC=1'
  echo "OCH_VCPKG_ROOT=$vcpkg_root"
} >> "$GITHUB_ENV"
