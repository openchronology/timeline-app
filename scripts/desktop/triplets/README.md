# scripts/desktop/triplets

Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only

vcpkg overlay triplets for the desktop builds. [`windows-dependencies.ps1`](../windows-dependencies.ps1) passes this folder to vcpkg with `--overlay-triplets`, and [`packages.mjs`](../packages.mjs) copies it into the Windows native source archive so the libraries can be rebuilt the same way.

## Contents

| File                                                         | What it is for                                                                                              |
| ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| [`x64-windows-static-md.cmake`](x64-windows-static-md.cmake) | Static release-only GMP and SQLite for 64-bit Windows, linked against the dynamic C runtime that Rust uses. |
