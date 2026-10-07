# Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
$ErrorActionPreference = 'Stop'
$root = Join-Path $env:RUNNER_TEMP 'och-vcpkg'
git clone https://github.com/microsoft/vcpkg.git $root
if ($LASTEXITCODE -ne 0) { throw 'vcpkg clone failed' }
git -C $root checkout 9e593bb18ea69cc5095e012465dcd675a822ed0d
if ($LASTEXITCODE -ne 0) { throw 'vcpkg checkout failed' }
& "$root\bootstrap-vcpkg.bat" -disableMetrics
if ($LASTEXITCODE -ne 0) { throw 'vcpkg bootstrap failed' }
& "$root\vcpkg.exe" install gmp:x64-windows-static-md sqlite3:x64-windows-static-md
if ($LASTEXITCODE -ne 0) { throw 'Native library build failed' }
"OCH_NATIVE_PREFIX=$root\installed\x64-windows-static-md" | Out-File -FilePath $env:GITHUB_ENV -Encoding utf8 -Append
"OCH_NATIVE_STATIC=1" | Out-File -FilePath $env:GITHUB_ENV -Encoding utf8 -Append
"OCH_VCPKG_ROOT=$root" | Out-File -FilePath $env:GITHUB_ENV -Encoding utf8 -Append
