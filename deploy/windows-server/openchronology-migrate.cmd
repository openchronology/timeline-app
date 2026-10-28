@echo off
rem Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
rem Brings the OpenChronology database up to this version's schema, then restarts the server,
rem and the mail worker when it starts with Windows (#371). --no-restart restarts nothing.
rem Run as an administrator. Usage: openchronology-migrate [--no-restart]
setlocal
set "HERE=%~dp0"
set "OCH_CONFIG=%ProgramData%\OpenChronology\openchronology.env"
if not exist "%OCH_CONFIG%" (
  echo %OCH_CONFIG% is missing, or this is not an administrator: reinstall, or run as an administrator. 1>&2
  exit /b 1
)
"%HERE%node\node.exe" "%HERE%app\server\migrate.mjs" || exit /b 1
if /i "%~1"=="--no-restart" exit /b 0
powershell -NoProfile -Command "Restart-Service OpenChronology -Force" || exit /b 1
echo OpenChronology restarted.
powershell -NoProfile -Command "$s = Get-Service OpenChronologyMail -ErrorAction SilentlyContinue; if ($s -and $s.StartType -eq 'Automatic') { Restart-Service OpenChronologyMail -Force; Write-Host 'OpenChronology mail worker restarted.' }"
