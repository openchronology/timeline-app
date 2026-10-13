# Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
# Builds the Windows server installer (#116), openchronology-server-windows-amd64-setup.exe:
# the platform (server-artifacts\openchronology-server-platform.tar.gz, deploy/platform), with
# its own PostgreSQL 17 (EDB's Windows binaries), pgmp built for it with MSVC, och-convert,
# Node.js 24 and WinSW for the server's Windows service, in an NSIS installer.
# Needs MSVC, Rust, Python 3, NSIS, and GMP and SQLite from vcpkg (OCH_NATIVE_PREFIX, as
# scripts/desktop/windows-dependencies.ps1 sets it).
# Usage, from the repository: pwsh deploy/windows-server/build.ps1 -Version 1.2.3
param([Parameter(Mandatory = $true)][string]$Version)
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$repo = (Resolve-Path "$PSScriptRoot\..\..").Path
$here = $PSScriptRoot
$work = Join-Path $env:RUNNER_TEMP 'och-windows-server'
if (-not $env:RUNNER_TEMP) { $work = Join-Path ([IO.Path]::GetTempPath()) 'och-windows-server' }
$stage = Join-Path $work 'stage'
$downloads = Join-Path $work 'downloads'
Remove-Item -Recurse -Force $stage -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force -Path $stage, $downloads | Out-Null
if (-not $env:OCH_NATIVE_PREFIX) { throw 'Run scripts/desktop/windows-dependencies.ps1 first (OCH_NATIVE_PREFIX).' }

# Pinned downloads, checked.
function Get-Pinned([string]$Url, [string]$Sha256, [string]$Name) {
  $file = Join-Path $downloads $Name
  if (-not (Test-Path $file)) { Invoke-WebRequest -Uri $Url -OutFile $file }
  $actual = (Get-FileHash -Algorithm SHA256 $file).Hash.ToLower()
  if ($actual -ne $Sha256) { throw "$Name has SHA-256 $actual, not $Sha256" }
  return $file
}
$node = Get-Pinned 'https://nodejs.org/dist/v24.21.0/node-v24.21.0-win-x64.zip' `
  '158f7685b44de51f6c0df1d153526cbcd3e1bc739a8dfc607721cef75de9e541' 'node.zip'
$postgres = Get-Pinned 'https://get.enterprisedb.com/postgresql/postgresql-17.11-1-windows-x64-binaries.zip' `
  '6eabdf00d2893713b75db4336a23c3fdf505f056e217ec6e2e95d901750cfea3' 'postgresql.zip'
$winsw = Get-Pinned 'https://github.com/winsw/winsw/releases/download/v2.12.0/WinSW-x64.exe' `
  '05b82d46ad331cc16bdc00de5c6332c1ef818df8ceefcd49c726553209b3a0da' 'WinSW-x64.exe'
$pgmpSource = Get-Pinned 'https://codeload.github.com/dvarrazzo/pgmp/tar.gz/1849585416f2bc3d070bf8cef6a659907687ec7f' `
  (Get-Content "$here\pgmp.sha256").Trim() 'pgmp.tar.gz'

# The platform, as the other packages lay it out.
tar -xzf "$repo\server-artifacts\openchronology-server-platform.tar.gz" -C $work lib doc
if ($LASTEXITCODE -ne 0) { throw 'Unpacking the platform failed' }
Move-Item "$work\lib\openchronology" "$stage\app"
Move-Item "$work\doc" "$stage\doc"
Copy-Item "$repo\deploy\debian-server\openchronology-server.mjs" "$stage\app\openchronology-server.mjs" -Force

# Node.js: node.exe and its license.
Expand-Archive $node -DestinationPath $work -Force
New-Item -ItemType Directory -Force -Path "$stage\node" | Out-Null
Copy-Item "$work\node-v24.21.0-win-x64\node.exe", "$work\node-v24.21.0-win-x64\LICENSE" "$stage\node\"

# PostgreSQL 17, without pgAdmin, Stack Builder, documentation or debug symbols; its headers
# and libraries stay in the work directory for building pgmp.
Expand-Archive $postgres -DestinationPath $work -Force
$pgsql = "$work\pgsql"
New-Item -ItemType Directory -Force -Path "$stage\pgsql" | Out-Null
foreach ($part in 'bin', 'lib', 'share') {
  Copy-Item -Recurse "$pgsql\$part" "$stage\pgsql\$part"
}
Copy-Item "$pgsql\*.txt" "$stage\pgsql\" -ErrorAction SilentlyContinue
Remove-Item -Force "$stage\pgsql\bin\stackbuilder.exe", "$stage\pgsql\pgAdmin*" -ErrorAction SilentlyContinue
Get-ChildItem -Recurse "$stage\pgsql" -Include *.pdb, *.lib | Remove-Item -Force
Remove-Item -Recurse -Force "$stage\pgsql\share\doc" -ErrorAction SilentlyContinue

# MSVC, for pgmp.
$vswhere = "${env:ProgramFiles(x86)}\Microsoft Visual Studio\Installer\vswhere.exe"
$vs = & $vswhere -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
$vcvars = "$vs\VC\Auxiliary\Build\vcvars64.bat"
if (-not (Test-Path $vcvars)) { throw 'MSVC (vcvars64.bat) not found' }

# pgmp, built for this PostgreSQL with MSVC against vcpkg's static GMP.
$pgmp = "$work\pgmp"
New-Item -ItemType Directory -Force -Path $pgmp | Out-Null
tar -xzf $pgmpSource -C $pgmp --strip-components=1
if ($LASTEXITCODE -ne 0) { throw 'Unpacking pgmp failed' }
Push-Location $pgmp
cmd /c "python tools\unmix.py < sql\pgmp.pysql > sql\pgmp--1.1.sql"
if ($LASTEXITCODE -ne 0) { throw 'Generating pgmp--1.1.sql failed' }
cmd /c "python tools\sql2extension.py --extname pgmp sql\pgmp--1.1.sql > sql\pgmp--unpackaged--1.1.sql"
if ($LASTEXITCODE -ne 0) { throw 'Generating pgmp--unpackaged--1.1.sql failed' }
$gmp = $env:OCH_NATIVE_PREFIX
$includes = @("$pgsql\include\server\port\win32_msvc", "$pgsql\include\server\port\win32",
  "$pgsql\include\server", "$pgsql\include", "$gmp\include") | ForEach-Object { "/I`"$_`"" }
$compile = "cl /nologo /O2 /MD /LD /W1 /DWIN32 /D_WINDOWS /D_CRT_SECURE_NO_WARNINGS " +
  ($includes -join ' ') + " src\*.c /Fe:pgmp.dll /link /DLL `"$pgsql\lib\postgres.lib`" `"$gmp\lib\gmp.lib`""
cmd /c "call `"$vcvars`" >nul && $compile"
if ($LASTEXITCODE -ne 0) { throw 'Building pgmp failed' }
Copy-Item pgmp.dll "$stage\pgsql\lib\"
Copy-Item pgmp.control, sql\pgmp--1.1.sql, sql\pgmp--unpackaged--1.1.sql "$stage\pgsql\share\extension\"
New-Item -ItemType Directory -Force -Path "$stage\doc\pgmp" | Out-Null
Copy-Item COPYING "$stage\doc\pgmp\"
Pop-Location

# och-convert, as the desktop's Windows build makes the native store.
$env:OCH_NATIVE_STATIC = '1'
cargo build --manifest-path "$repo\native-store\Cargo.toml" --release --locked --bin och-convert
if ($LASTEXITCODE -ne 0) { throw 'Building och-convert failed' }
New-Item -ItemType Directory -Force -Path "$stage\app\bin" | Out-Null
Copy-Item "$repo\native-store\target\release\och-convert.exe" "$stage\app\bin\"

# The server's Windows service (WinSW), the commands, templates and documentation.
New-Item -ItemType Directory -Force -Path "$stage\service" | Out-Null
Copy-Item $winsw "$stage\service\openchronology-service.exe"
Copy-Item "$here\openchronology-service.xml" "$stage\service\"
Copy-Item "$here\setup.ps1", "$here\remove.ps1", "$here\*.cmd" "$stage\"
New-Item -ItemType Directory -Force -Path "$stage\templates" | Out-Null
foreach ($name in 'openchronology.env', 'syslog.env') {
  # Windows paths for the Linux packages' templates.
  (Get-Content "$repo\deploy\debian-server\$name" -Raw) `
    -replace '/etc/openchronology', 'C:\ProgramData\OpenChronology' `
    -replace 'sudo systemctl restart openchronology', 'Restart-Service OpenChronology' `
    -replace 'sudo openchronology-', 'openchronology-' |
    Set-Content -Encoding utf8NoBOM "$stage\templates\$name.example"
}
Copy-Item "$here\README.Windows.txt" "$stage\"
Copy-Item "$repo\LICENSE" "$stage\LICENSE.txt"

# The installer.
$makensis = (Get-Command makensis -ErrorAction SilentlyContinue).Source
if (-not $makensis) { $makensis = "${env:ProgramFiles(x86)}\NSIS\makensis.exe" }
& $makensis /V2 "/DVERSION=$Version" "/DSTAGE=$stage" "/DOUT=$repo\server-artifacts\openchronology-server-windows-amd64-setup.exe" "$here\installer.nsi"
if ($LASTEXITCODE -ne 0) { throw 'Building the installer failed' }
Write-Host "Wrote server-artifacts\openchronology-server-windows-amd64-setup.exe ($Version)"
