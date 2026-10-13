# Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
# Removes the OpenChronology and OpenChronologyPostgreSQL services before the uninstaller
# deletes the installation (#116). The configuration and the database, in
# %ProgramData%\OpenChronology, remain.
param([string]$InstallDir = $PSScriptRoot)
$ErrorActionPreference = 'Continue'
$wrapper = Join-Path $InstallDir 'service\openchronology-service.exe'
if (Get-Service OpenChronology -ErrorAction SilentlyContinue) {
  Stop-Service OpenChronology -Force -ErrorAction SilentlyContinue
  & $wrapper uninstall | Out-Host
}
if (Get-Service OpenChronologyPostgreSQL -ErrorAction SilentlyContinue) {
  Stop-Service OpenChronologyPostgreSQL -Force -ErrorAction SilentlyContinue
  & (Join-Path $InstallDir 'pgsql\bin\pg_ctl.exe') unregister -N OpenChronologyPostgreSQL | Out-Host
}
$data = Join-Path $env:ProgramData 'OpenChronology'
Write-Host @"

OpenChronology was removed. Its configuration (including AUTH_ENCRYPTION_KEY) and its
database remain in $data; delete that folder to remove them as well.
"@
