; Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
; The OpenChronology server installer for Windows (#116), built by build.ps1:
;   makensis /DVERSION=<version> /DSTAGE=<staged files> /DOUT=<installer.exe> installer.nsi
; It installs into Program Files and runs setup.ps1, which sets up the bundled PostgreSQL, the
; database and the services; the configuration and database live in ProgramData. Silent
; installs (/S) exit with 2 when setup does not finish.
Unicode true
!include "MUI2.nsh"
!include "x64.nsh"

Name "OpenChronology Server"
OutFile "${OUT}"
InstallDir "$PROGRAMFILES64\OpenChronology Server"
InstallDirRegKey HKLM "Software\OpenChronology Server" "InstallDir"
RequestExecutionLevel admin
SetCompressor /SOLID lzma
VIProductVersion "0.0.0.0"
VIAddVersionKey "ProductName" "OpenChronology Server"
VIAddVersionKey "ProductVersion" "${VERSION}"
VIAddVersionKey "FileDescription" "OpenChronology Server installer"
VIAddVersionKey "LegalCopyright" "Copyright (c) 2026 Athan Clark. GPL-3.0-only"
VIAddVersionKey "FileVersion" "${VERSION}"

!define MUI_FINISHPAGE_SHOWREADME "$INSTDIR\README.Windows.txt"
!define MUI_FINISHPAGE_SHOWREADME_TEXT "Read the setup notes"
!insertmacro MUI_PAGE_LICENSE "${STAGE}\LICENSE.txt"
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "English"

!define UNINSTALL "Software\Microsoft\Windows\CurrentVersion\Uninstall\OpenChronologyServer"

Function .onInit
  ${IfNot} ${RunningX64}
    MessageBox MB_ICONSTOP|MB_OK "OpenChronology Server needs 64-bit Windows." /SD IDOK
    Abort
  ${EndIf}
  SetRegView 64
FunctionEnd

Section "OpenChronology Server"
  ; An upgrade stops the services before replacing the files they run.
  nsExec::ExecToLog 'powershell -NoProfile -Command "Stop-Service OpenChronology, OpenChronologyPostgreSQL -Force -ErrorAction SilentlyContinue"'
  Pop $0
  SetOutPath "$INSTDIR"
  File /r "${STAGE}\*.*"
  WriteUninstaller "$INSTDIR\uninstall.exe"
  WriteRegStr HKLM "Software\OpenChronology Server" "InstallDir" "$INSTDIR"
  WriteRegStr HKLM "${UNINSTALL}" "DisplayName" "OpenChronology Server"
  WriteRegStr HKLM "${UNINSTALL}" "DisplayVersion" "${VERSION}"
  WriteRegStr HKLM "${UNINSTALL}" "Publisher" "OpenChronology"
  WriteRegStr HKLM "${UNINSTALL}" "URLInfoAbout" "https://github.com/openchronology/timeline-app"
  WriteRegStr HKLM "${UNINSTALL}" "InstallLocation" "$INSTDIR"
  WriteRegStr HKLM "${UNINSTALL}" "UninstallString" '"$INSTDIR\uninstall.exe"'
  WriteRegStr HKLM "${UNINSTALL}" "QuietUninstallString" '"$INSTDIR\uninstall.exe" /S'
  WriteRegDWORD HKLM "${UNINSTALL}" "NoModify" 1
  WriteRegDWORD HKLM "${UNINSTALL}" "NoRepair" 1
  DetailPrint "Setting up PostgreSQL, the database and the services..."
  nsExec::ExecToLog 'powershell -NoProfile -ExecutionPolicy Bypass -File "$INSTDIR\setup.ps1" -InstallDir "$INSTDIR"'
  Pop $0
  ${If} $0 != 0
    SetErrorLevel 2
    MessageBox MB_ICONEXCLAMATION|MB_OK "Setup did not finish. See C:\ProgramData\OpenChronology\setup.log, then run setup.ps1 in $INSTDIR as an administrator." /SD IDOK
  ${EndIf}
SectionEnd

Section "Uninstall"
  SetRegView 64
  nsExec::ExecToLog 'powershell -NoProfile -ExecutionPolicy Bypass -File "$INSTDIR\remove.ps1" -InstallDir "$INSTDIR"'
  Pop $0
  RMDir /r "$INSTDIR"
  DeleteRegKey HKLM "${UNINSTALL}"
  DeleteRegKey HKLM "Software\OpenChronology Server"
SectionEnd
