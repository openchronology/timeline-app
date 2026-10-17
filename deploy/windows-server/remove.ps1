# Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
# Removes the OpenChronology services (the server, the syslog receiver, email delivery and
# PostgreSQL) before the uninstaller deletes the installation (#116, #125). The configuration
# and the database, in %ProgramData%\OpenChronology, remain.
param([string]$InstallDir = $PSScriptRoot)
$ErrorActionPreference = 'Continue'
# Each WinSW service, and the copy of the wrapper that installed it.
$services = [ordered]@{
  OpenChronologySyslog = 'openchronology-syslog-service.exe'
  OpenChronologyMail   = 'openchronology-mail-service.exe'
  OpenChronology       = 'openchronology-service.exe'
}
foreach ($name in $services.Keys) {
  if (Get-Service $name -ErrorAction SilentlyContinue) {
    Stop-Service $name -Force -ErrorAction SilentlyContinue
    & (Join-Path $InstallDir "service\$($services[$name])") uninstall | Out-Host
  }
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
