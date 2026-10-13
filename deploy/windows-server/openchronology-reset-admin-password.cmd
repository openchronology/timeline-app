@echo off
rem Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
rem Sets the administrator's password back to ADMIN_INITIAL_PASSWORD from the configuration
rem (#118): the ADMIN_USERNAME account. Its sessions are signed out. Edit ADMIN_INITIAL_PASSWORD
rem first to choose a new password. Run as an administrator.
setlocal
set "HERE=%~dp0"
set "OCH_CONFIG=%ProgramData%\OpenChronology\openchronology.env"
if not exist "%OCH_CONFIG%" (
  echo %OCH_CONFIG% is missing, or this is not an administrator. 1>&2
  exit /b 1
)
"%HERE%node\node.exe" "%HERE%app\server\reset-admin-password.mjs"
