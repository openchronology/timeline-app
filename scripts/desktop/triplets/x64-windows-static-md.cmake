# Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
set(VCPKG_TARGET_ARCHITECTURE x64)
set(VCPKG_CRT_LINKAGE dynamic)
set(VCPKG_LIBRARY_LINKAGE static)
# native-store links the Release archives for both Cargo test and installer builds.
set(VCPKG_BUILD_TYPE release)
